#!/usr/bin/env python3
"""Import already generated recordings; never calls or retries a speech service."""
import argparse, array, json, math, pathlib, shutil, sys, wave
root=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('plan');p.add_argument('generation');args=p.parse_args()
plan=json.loads(pathlib.Path(args.plan).read_text());generation=json.loads(pathlib.Path(args.generation).read_text())
records={r['id']:r for r in generation['records']}
missing=[c['id'] for c in plan if c['id'] not in records]
if missing:raise SystemExit('Missing accepted recordings: '+', '.join(missing))
names=['Gryffindor','Slytherin','Ravenclaw','Hufflepuff','Harry Potter','Hermione Granger','Ron Weasley','Draco Malfoy','Pansy Parkinson','Blaise Zabini','Luna Lovegood','Cho Chang','Padma Patil','Cedric Diggory','Hannah Abbott','Ernie Macmillan']
manifest=[]
for cue in plan:
 source=root/'assets/voice/natural/originals'/(cue['id']+'.wav');target=(root/cue['file']).resolve()
 if root not in target.parents:raise SystemExit('Invalid destination')
 with wave.open(str(source),'rb') as w:
  rate=w.getframerate();duration=w.getnframes()/rate;channels=w.getnchannels();width=w.getsampwidth();samples=array.array('h',w.readframes(w.getnframes()))
 if sys.byteorder!='little':samples.byteswap()
 if width!=2 or not samples or not .25<duration<25:raise SystemExit('Invalid WAV '+str(source))
 peak=max(abs(x) for x in samples);rms=math.sqrt(sum(x*x for x in samples)/len(samples))
 if peak<1000 or rms<50:raise SystemExit('Silent WAV '+str(source))
 target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
 manifest.append({'id':cue['id'],'text':cue['text'],'src':'./'+cue['file'],'kind':cue['kind'],'voice':generation['voiceName'],'voiceId':generation['voiceId'],'language':generation['locale'],'gender':'female','provider':generation['provider'],'duration':duration,'sampleRate':rate,'channels':channels,'peak':peak,'rms':rms,'emphasis':[n for n in names if n in cue['text']],'source':'natural/originals/'+source.name})
base=root/'assets/voice/natural';base.mkdir(parents=True,exist_ok=True)
(base/'manifest.json').write_text(json.dumps(manifest,indent=2))
(root/'assets/voice/commentary/manifest.json').write_text(json.dumps([m for m in manifest if m['kind']=='commentary'],indent=2))
texts={m['id']:m['text'] for m in manifest if m['kind']=='commentary'}
config={'voiceName':generation['voiceName'],'locale':generation['locale'],'provider':generation['provider'],'gender':'female','voiceId':generation['voiceId'],'clips':len(manifest),'commentaryTexts':texts}
(base/'catalog.js').write_text('/* Accepted natural female-English recordings, generated once and played locally. */\nwindow.BroomNaturalVoice=Object.freeze('+json.dumps(config,separators=(',',':'))+');\n')
print('Imported',len(manifest),'recordings; commentary:',len(texts))
