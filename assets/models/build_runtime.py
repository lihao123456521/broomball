"""Rebuild the offline GLB derivatives used in the arena.
Uses the MIT meshoptimizer attribute-aware edge-collapse simplifier, preserving
source vertex UVs and silhouettes. Downsized textures remain embedded in GLB.
"""
from pathlib import Path
from array import array
import argparse,base64,hashlib,io,json,os,struct,subprocess,tempfile
ROOT=Path(__file__).resolve().parent
NAMES=['textured.glb','textured (1).glb','textured (2).glb','textured (3).glb','textured(1).glb','textured (1)(1).glb','textured (2)(1).glb']
IDS=['academy-hall','academy-tower','gatehouse','rampart','broom','snitch','harry-rider']
TARGET=[60000,50000,60000,50000,28000,30000,65000]

def read_glb(path):
 data=path.read_bytes();n,t=struct.unpack_from('<II',data,12);doc=json.loads(data[20:20+n]);return data,doc,data[28+n:]

# These filenames came from the second delivery. The other three uploads match
# the existing broom, snitch and Harry byte-for-byte (see README.md).
MATCHDAY = [
 ('stadium-ground', 'ground.glb', 10500, 2048),
 ('goal-pillar', 'pillar.glb', 4500, 512),
 ('draco-rider', 'textured(3).glb', 36000, 1536),
 ('cedric-rider', 'textured (4).glb', 36000, 1536),
 ('blaise-rider', 'textured (5).glb', 36000, 1536),
 ('pansy-rider', 'textured (6).glb', 36000, 1536),
 ('hannah-rider', 'textured(7).glb', 36000, 1536),
 ('cho-rider', 'textured (8).glb', 36000, 1536),
 ('luna-rider', 'textured (9).glb', 36000, 1536),
]
COMPLETION = [
 ('ron-rider', 'Ron.glb', 36000, 1536),
 ('hermione-rider', 'hermine.glb', 36000, 1536),
 ('ernie-rider', 'eni.glb', 36000, 1536),
 ('padma-rider', 'padema.glb', 36000, 1536),
]

def build(source, id, target, texture_size):
 name=source.name
 raw,doc,bin=read_glb(source);pr=doc['meshes'][0]['primitives'][0]
 source_triangles=doc['accessors'][pr['indices']]['count']//3
 with tempfile.TemporaryDirectory()as td:
  out=Path(td)/'simplified.bin'
  node=os.environ.get('NODE', '/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node')
  if not Path(node).exists():node='node'
  geometry_args=[node,str(ROOT/'tools'/'simplify_geometry.cjs'),str(source),str(out),str(target)]
  if id.endswith('-rider'):geometry_args.append('rider')
  if id in {spec[0] for spec in COMPLETION}:geometry_args.append('.001')
  result=subprocess.run(geometry_args,check=True,capture_output=True,text=True)
  print(id,result.stdout.strip(),flush=True)
  optimized=out.read_bytes();counts=struct.unpack_from('<IIII',optimized);offset=16;arrays=[]
  for fmt,count in zip(['f','f','f','I'],counts):
   values=array(fmt);values.frombytes(optimized[offset:offset+count*4]);arrays.append(values);offset+=count*4
  pp,nn,uu,ii=arrays
 texindex=doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index'];image=doc['images'][doc['textures'][texindex]['source']];view=doc['bufferViews'][image['bufferView']];im=bin[view['byteOffset']:view['byteOffset']+view['byteLength']]
 from PIL import Image
 with Image.open(io.BytesIO(im)) as source_image:
  texture=source_image.convert('RGB')
  texture.thumbnail((texture_size,texture_size),Image.Resampling.LANCZOS)
  jpeg=io.BytesIO();texture.save(jpeg,format='JPEG',quality=85)
  imagebytes=jpeg.getvalue()
 chunks=[];views=[]
 def part(data):
  offset=sum(len(c)for c in chunks);views.append({'buffer':0,'byteOffset':offset,'byteLength':len(data)});chunks.append(data+b'\0'*((-len(data))%4));return len(views)-1
 iv,pv,nv,uvv=[part(x.tobytes())for x in [ii,pp,nn,uu]];tv=part(imagebytes)
 def ac(v,typ,count):return {'bufferView':v,'byteOffset':0,'componentType':5125 if typ=='SCALAR'else 5126,'count':count,'type':typ}
 accessors=[ac(iv,'SCALAR',len(ii)),ac(pv,'VEC3',len(pp)//3),ac(nv,'VEC3',len(nn)//3),ac(uvv,'VEC2',len(uu)//2)]
 accessors[1]['min']=[min(pp[a::3])for a in range(3)];accessors[1]['max']=[max(pp[a::3])for a in range(3)]
 binary=b''.join(chunks)
 output={'asset':{'version':'2.0','generator':'Broomball meshoptimizer runtime'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0,'name':id}],'meshes':[{'name':id,'primitives':[{'attributes':{'POSITION':1,'NORMAL':2,'TEXCOORD_0':3},'indices':0,'material':0}]}],'buffers':[{'byteLength':len(binary)}],'bufferViews':views,'accessors':accessors,'images':[{'bufferView':tv,'mimeType':'image/jpeg'}],'textures':[{'source':0,'sampler':0}],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],'materials':[{'name':'Uploaded textured '+id,'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':.4 if id=='snitch'else .08,'roughnessFactor':.48 if id=='snitch'else .9}}]}
 jd=json.dumps(output,separators=(',',':')).encode();jd+=b' '*((-len(jd))%4);glb=struct.pack('<III',0x46546c67,2,28+len(jd)+len(binary))+struct.pack('<II',len(jd),0x4e4f534a)+jd+struct.pack('<II',len(binary),0x004e4942)+binary
 (ROOT/'runtime'/(id+'.glb')).write_bytes(glb)
 packed='window.BroomModelData=window.BroomModelData||{};window.BroomModelData['+json.dumps(id)+']='+json.dumps(base64.b64encode(glb).decode())+';'
 if id=='broom':packed+='window.BroomBinaries=window.BroomBinaries||{};window.BroomBinaries["uploaded-broom"]=window.BroomModelData["broom"];'
 (ROOT/'runtime'/(id+'.js')).write_text(packed+'\n')
 return {'id':id,'source':name,'sha256':hashlib.sha256(raw).hexdigest(),'sourceBytes':len(raw),'sourceTriangles':source_triangles,'runtimeBytes':len(glb),'runtimeTriangles':len(ii)//3,'vertices':len(pp)//3,'texture':texture_size,'bounds':{'min':accessors[1]['min'],'max':accessors[1]['max']}}

if __name__ == '__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--matchday-sources',type=Path,help='Directory containing the second delivery of GLB uploads. Builds its nine distinct new models.')
 parser.add_argument('--completion-sources',type=Path,help='Directory containing Ron.glb, hermine.glb, eni.glb and padema.glb.')
 args=parser.parse_args()
 destination=ROOT/'manifest.json'
 manifest={entry['id']:entry for entry in json.loads(destination.read_text())} if destination.exists() else {}
 (ROOT/'runtime').mkdir(exist_ok=True)
 if args.completion_sources:
  source_dir=args.completion_sources
  specs=COMPLETION
 elif args.matchday_sources:
  source_dir=args.matchday_sources
  specs=MATCHDAY
 else:
  source_dir=ROOT/'originals'
  specs=[(id,name,budget,2048 if id=='harry-rider' else 1024) for id,name,budget in zip(IDS,NAMES,TARGET)] + MATCHDAY + COMPLETION
 for id,name,target,texture_size in specs:
  manifest[id]=build(source_dir/name,id,target,texture_size)
  print('SAVED',id,manifest[id]['runtimeBytes'],flush=True)
 destination.write_text(json.dumps(list(manifest.values()),indent=2)+'\n')
