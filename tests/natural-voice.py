#!/usr/bin/env python3
"""Verify shipped speech, unchanged sources and repeatable offline re-import."""
import array
import hashlib
import json
import math
import pathlib
import shutil
import subprocess
import sys
import tempfile
import wave

ROOT = pathlib.Path(__file__).resolve().parents[1]
ORIGINALS_DIGEST = 'dfecb968934f2c2a52e6b28d6767d39f415998f515f6d34b3d749fad974b3d1d'
BASE = ROOT / 'assets/voice'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def originals_digest(folder):
    lines = [f'{path.name}:{sha(path)}' for path in sorted(folder.glob('*.wav'))]
    assert len(lines) == 81
    return hashlib.sha256('\n'.join(lines).encode()).hexdigest()


def pcm(path):
    with wave.open(str(path), 'rb') as audio:
        params = audio.getparams()
        assert (params.nchannels, params.sampwidth, params.framerate) == (1, 2, 44100)
        data = array.array('h', audio.readframes(params.nframes))
    if sys.byteorder != 'little':
        data.byteswap()
    return params, data


def active_dbfs(data):
    energy = frames = 0
    for start in range(0, len(data), 441):
        window = data[start:start + 441]
        squared = sum(sample * sample for sample in window)
        if squared / len(window) > (32768 * 10 ** (-45 / 20)) ** 2:
            energy += squared
            frames += len(window)
    return 20 * math.log10(math.sqrt(energy / frames) / 32768)


assert originals_digest(BASE / 'natural/originals') == ORIGINALS_DIGEST, 'Original recordings changed'
manifest = json.loads((BASE / 'natural/manifest.json').read_text())
plan = json.loads((BASE / 'natural/plan.json').read_text())
generation = json.loads((BASE / 'natural/generation.json').read_text())
assert len(manifest) == len(plan) == 81
by_id = {cue['id']: cue for cue in plan}
assert len(by_id) == len(manifest) == len({cue['id'] for cue in manifest})
source_levels, output_levels = [], []
for cue in manifest:
    original = BASE / cue['source']
    played = ROOT / cue['src']
    source_params, source = pcm(original)
    output_params, output = pcm(played)
    assert output_params == source_params, cue['id'] + ': format or duration changed'
    assert cue['sourceSha256'] == sha(original), cue['id'] + ': source provenance'
    assert cue['text'] == by_id[cue['id']]['text']
    assert cue['kind'] == by_id[cue['id']]['kind']
    assert cue['src'] == './' + by_id[cue['id']]['file']
    assert cue['voice'] == generation['voiceName']
    assert cue['voiceId'] == generation['voiceId']
    assert cue['language'] == generation['locale']
    assert cue['gender'] == generation['gender']
    assert cue['provider'] == generation['provider']
    assert cue['duration'] == len(output) / 44100
    assert cue['sampleRate'] == 44100 and cue['channels'] == 1
    processing = cue['processing']
    assert processing['method'] == 'constant-gain-with-linear-edge-fades'
    assert processing['measurementWindowMs'] == 10 and processing['measurementGateDbfs'] == -45
    assert processing['targetActiveRmsDbfs'] == -20 and processing['peakCeilingDbfs'] == -1.5
    assert processing['trimmedFrames'] == 0 and processing['playbackRate'] == 1
    assert processing['pitchShiftApplied'] is False
    gain = processing['gain']
    assert math.isfinite(gain) and 0 < gain <= 1
    assert math.isclose(processing['gainDb'], 20 * math.log10(gain), abs_tol=1e-10)
    fade = processing['edgeFadeFrames']
    assert fade == 176 and fade / 44100 <= .004
    assert output[0] == output[-1] == 0
    # Full sample comparison proves that no words were trimmed, time-stretched,
    # filtered, compressed or substituted while preparing the playable files.
    for index, (before, after) in enumerate(zip(source, output)):
        edge = min(1, index / (fade - 1), (len(output) - 1 - index) / (fade - 1))
        assert after == round(before * gain * edge), (cue['id'], index)
        assert abs(after) <= abs(before)
    peak = max(abs(sample) for sample in output)
    rms = math.sqrt(sum(sample * sample for sample in output) / len(output))
    assert peak <= 32768 * 10 ** (-1.5 / 20), cue['id'] + ': missing peak headroom'
    assert cue['peak'] == peak and math.isclose(cue['rms'], rms, abs_tol=1e-9)
    assert processing['sourcePeak'] == max(abs(sample) for sample in source)
    assert math.isclose(processing['sourceRms'], math.sqrt(sum(x*x for x in source)/len(source)), abs_tol=1e-9)
    before_db, after_db = active_dbfs(source), active_dbfs(output)
    assert math.isclose(processing['sourceActiveRmsDbfs'], before_db, abs_tol=1e-9)
    assert math.isclose(processing['activeRmsDbfs'], after_db, abs_tol=1e-9)
    assert after_db <= -19.999, cue['id'] + ': unexpectedly loud speech'
    source_levels.append(before_db)
    output_levels.append(after_db)

commentary = [cue for cue in manifest if cue['kind'] == 'commentary']
assert len(commentary) == 65
assert json.loads((BASE / 'commentary/manifest.json').read_text()) == commentary
catalog_text = (BASE / 'natural/catalog.js').read_text()
catalog = json.loads(catalog_text.split('Object.freeze(', 1)[1].rsplit(');', 1)[0])
assert catalog['commentaryTexts'] == {cue['id']: cue['text'] for cue in commentary}
assert catalog['voiceName'] == generation['voiceName'] and catalog['locale'] == generation['locale']
assert catalog['voiceId'] == generation['voiceId'] and catalog['clips'] == 81
assert max(output_levels) - min(output_levels) < .35
print('PASS 81 original WAV hashes, voice identity, copy, duration and pitch/speed are preserved')
print('PASS 81 playable WAV files contain only constant attenuation and 4 ms edge fades; no clipping')
print('PASS all manifests and the runtime catalog match the shipped recordings')
print('Active speech RMS spread: %.2f dB -> %.2f dB' % (
    max(source_levels) - min(source_levels), max(output_levels) - min(output_levels)))

# Run the actual importer twice in an isolated fixture to prove re-importing
# does not compound the gain or alter the accepted source recordings.
with tempfile.TemporaryDirectory(prefix='broomball-voice-') as directory:
    isolated = pathlib.Path(directory)
    (isolated / 'tools').mkdir()
    shutil.copy2(ROOT / 'tools/import-natural-voice.py', isolated / 'tools/import-natural-voice.py')
    shutil.copytree(BASE / 'natural/originals', isolated / 'assets/voice/natural/originals')
    for name in ['plan.json', 'generation.json']:
        shutil.copy2(BASE / 'natural' / name, isolated / 'assets/voice/natural' / name)
    outputs = [pathlib.Path(cue['src']) for cue in manifest]
    outputs += [pathlib.Path('assets/voice') / name for name in [
        'natural/manifest.json', 'commentary/manifest.json', 'natural/catalog.js']]
    expected = {str(path): sha(ROOT / path) for path in outputs}
    for _ in range(2):
        subprocess.run([sys.executable, 'tools/import-natural-voice.py',
                        'assets/voice/natural/plan.json', 'assets/voice/natural/generation.json'],
                       cwd=isolated, check=True, capture_output=True, text=True)
        assert {str(path): sha(isolated / path) for path in outputs} == expected
        assert originals_digest(isolated / 'assets/voice/natural/originals') == ORIGINALS_DIGEST
print('PASS two offline re-imports are byte-identical and leave original recordings unchanged')
