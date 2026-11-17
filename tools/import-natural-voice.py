#!/usr/bin/env python3
"""Import saved speech with gentle, reproducible leveling; never calls a service."""
import argparse
import array
import hashlib
import json
import math
import pathlib
import sys
import wave

ROOT = pathlib.Path(__file__).resolve().parents[1]
TARGET_ACTIVE_DBFS = -20.0
ACTIVE_GATE_DBFS = -45.0
WINDOW_MS = 10
PEAK_CEILING_DBFS = -1.5
EDGE_FADE_MS = 4
NAMES = [
    'Gryffindor', 'Slytherin', 'Ravenclaw', 'Hufflepuff', 'Harry Potter',
    'Hermione Granger', 'Ron Weasley', 'Draco Malfoy', 'Pansy Parkinson',
    'Blaise Zabini', 'Luna Lovegood', 'Cho Chang', 'Padma Patil',
    'Cedric Diggory', 'Hannah Abbott', 'Ernie Macmillan',
]


def read_pcm(source):
    with wave.open(str(source), 'rb') as recording:
        params = recording.getparams()
        if params.sampwidth != 2 or params.nchannels != 1 or params.framerate != 44100:
            raise ValueError('Expected mono 44.1 kHz 16-bit PCM: ' + str(source))
        samples = array.array('h', recording.readframes(params.nframes))
    if sys.byteorder != 'little':
        samples.byteswap()
    if not samples or not .25 < params.nframes / params.framerate < 25:
        raise ValueError('Invalid WAV duration: ' + str(source))
    return params, samples


def statistics(samples, rate):
    # Gate is for measurement only: all samples, including weak consonants,
    # breaths and pauses, remain in the output and receive the same gain.
    window = max(1, round(rate * WINDOW_MS / 1000))
    threshold_squared = (32768 * 10 ** (ACTIVE_GATE_DBFS / 20)) ** 2
    active_energy = active_count = 0
    total_energy = 0
    for start in range(0, len(samples), window):
        block = samples[start:start + window]
        energy = sum(sample * sample for sample in block)
        total_energy += energy
        if energy / len(block) > threshold_squared:
            active_energy += energy
            active_count += len(block)
    if not active_count:
        raise ValueError('Recording has no audible speech')
    return {
        'peak': max(abs(sample) for sample in samples),
        'rms': math.sqrt(total_energy / len(samples)),
        'activeRms': math.sqrt(active_energy / active_count),
    }


def dbfs(value):
    return 20 * math.log10(value / 32768) if value > 0 else None


def master(samples, rate):
    before = statistics(samples, rate)
    if before['peak'] < 1000 or before['rms'] < 50:
        raise ValueError('Silent recording')
    # Attenuation only. Never amplify a quiet line or flatten its expression.
    gain = min(1.0, 32768 * 10 ** (TARGET_ACTIVE_DBFS / 20) / before['activeRms'],
               32768 * 10 ** (PEAK_CEILING_DBFS / 20) / before['peak'])
    fade_frames = min(round(rate * EDGE_FADE_MS / 1000), len(samples) // 2)
    def render(level):
        output = array.array('h')
        for index, sample in enumerate(samples):
            edge = min(1.0, index / max(1, fade_frames - 1),
                       (len(samples) - 1 - index) / max(1, fade_frames - 1))
            output.append(round(sample * level * edge))
        return output

    output = render(gain)
    # Lowering the level may put a few quiet measurement windows below the
    # gate. Recheck the finished file, always rendering afresh from the source.
    target = 32768 * 10 ** (TARGET_ACTIVE_DBFS / 20)
    for _ in range(16):
        measured = statistics(output, rate)['activeRms']
        if measured <= target + .1:
            break
        gain *= target / measured
        output = render(gain)
    processing = {
        'method': 'constant-gain-with-linear-edge-fades',
        'version': 1,
        'measurementWindowMs': WINDOW_MS,
        'measurementGateDbfs': ACTIVE_GATE_DBFS,
        'targetActiveRmsDbfs': TARGET_ACTIVE_DBFS,
        'peakCeilingDbfs': PEAK_CEILING_DBFS,
        'gain': gain,
        'gainDb': 20 * math.log10(gain),
        'edgeFadeMs': EDGE_FADE_MS,
        'edgeFadeFrames': fade_frames,
        'sourcePeak': before['peak'],
        'sourceRms': before['rms'],
        'sourceActiveRmsDbfs': dbfs(before['activeRms']),
        'activeRmsDbfs': dbfs(statistics(output, rate)['activeRms']),
        'trimmedFrames': 0,
        'playbackRate': 1,
        'pitchShiftApplied': False,
    }
    return output, processing


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('plan')
    parser.add_argument('generation')
    args = parser.parse_args()
    plan = json.loads(pathlib.Path(args.plan).read_text())
    generation = json.loads(pathlib.Path(args.generation).read_text())
    records = {record['id']: record for record in generation['records']}
    missing = [cue['id'] for cue in plan if cue['id'] not in records]
    if missing:
        raise SystemExit('Missing accepted recordings: ' + ', '.join(missing))
    originals = (ROOT / 'assets/voice/natural/originals').resolve()
    manifest = []
    for cue in plan:
        source = originals / (cue['id'] + '.wav')
        target = (ROOT / cue['file']).resolve()
        if ROOT not in target.parents or originals in target.parents:
            raise SystemExit('Invalid destination')
        params, samples = read_pcm(source)
        output, processing = master(samples, params.framerate)
        after = statistics(output, params.framerate)
        target.parent.mkdir(parents=True, exist_ok=True)
        if sys.byteorder != 'little':
            output.byteswap()
        with wave.open(str(target), 'wb') as recording:
            recording.setparams(params)
            recording.writeframes(output.tobytes())
        manifest.append({
            'id': cue['id'], 'text': cue['text'], 'src': './' + cue['file'],
            'kind': cue['kind'], 'voice': generation['voiceName'],
            'voiceId': generation['voiceId'], 'language': generation['locale'],
            'gender': generation['gender'], 'provider': generation['provider'],
            'duration': params.nframes / params.framerate,
            'sampleRate': params.framerate, 'channels': params.nchannels,
            'peak': after['peak'], 'rms': after['rms'],
            'emphasis': [name for name in NAMES if name in cue['text']],
            'source': 'natural/originals/' + source.name,
            'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'processing': processing,
        })
    base = ROOT / 'assets/voice/natural'
    base.mkdir(parents=True, exist_ok=True)
    (base / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    (ROOT / 'assets/voice/commentary/manifest.json').write_text(json.dumps(
        [line for line in manifest if line['kind'] == 'commentary'], indent=2))
    texts = {line['id']: line['text'] for line in manifest if line['kind'] == 'commentary'}
    config = {
        'voiceName': generation['voiceName'], 'locale': generation['locale'],
        'provider': generation['provider'], 'gender': generation['gender'],
        'voiceId': generation['voiceId'], 'clips': len(manifest), 'commentaryTexts': texts,
    }
    (base / 'catalog.js').write_text(
        '/* Accepted natural female-English recordings, generated once and played locally. */\n'
        'window.BroomNaturalVoice=Object.freeze(' + json.dumps(config, separators=(',', ':')) + ');\n')
    print('Imported and gently leveled', len(manifest), 'recordings; commentary:', len(texts))


if __name__ == '__main__':
    main()
