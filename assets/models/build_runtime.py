"""Rebuild the seven offline GLB runtime derivatives from preserved uploads.
Uses the MIT meshoptimizer attribute-aware edge-collapse simplifier, preserving
source vertex UVs and silhouettes. Downsized textures remain embedded in GLB.
"""
from pathlib import Path
from array import array
import base64,hashlib,json,math,struct,subprocess,tempfile
ROOT=Path(__file__).resolve().parent
NAMES=['textured.glb','textured (1).glb','textured (2).glb','textured (3).glb','textured(1).glb','textured (1)(1).glb','textured (2)(1).glb']
IDS=['academy-hall','academy-tower','gatehouse','rampart','broom','snitch','harry-rider']
TARGET=[60000,50000,60000,50000,28000,30000,65000]

def read_glb(path):
 data=path.read_bytes();n,t=struct.unpack_from('<II',data,12);doc=json.loads(data[20:20+n]);return data,doc,data[28+n:]

def accessor(doc,bin,idx):
 a=doc['accessors'][idx];v=doc['bufferViews'][a['bufferView']];start=v.get('byteOffset',0)+a.get('byteOffset',0);count=a['count']*{'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']];fmt={5125:'I',5126:'f'}[a['componentType']];out=array(fmt);out.frombytes(bin[start:start+count*4]);return out

(ROOT/'runtime').mkdir(exist_ok=True);(ROOT/'originals').mkdir(exist_ok=True)
manifest=[]
for index,(name,id,target)in enumerate(zip(NAMES,IDS,TARGET)):
 source=ROOT/'originals'/name
 if not source.exists():(ROOT/name).rename(source)
 raw,doc,bin=read_glb(source);pr=doc['meshes'][0]['primitives'][0]
 pos=accessor(doc,bin,pr['attributes']['POSITION']);norm=accessor(doc,bin,pr['attributes']['NORMAL']);uv=accessor(doc,bin,pr['attributes']['TEXCOORD_0']);ind=accessor(doc,bin,pr['indices'])
 with tempfile.TemporaryDirectory()as td:
  out=Path(td)/'simplified.bin'
  node='/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node'
  if not Path(node).exists():node='node'
  result=subprocess.run([node,str(ROOT/'tools'/'simplify_geometry.cjs'),str(source),str(out),str(target)],check=True,capture_output=True,text=True)
  print(id,result.stdout.strip(),flush=True)
  optimized=out.read_bytes();counts=struct.unpack_from('<IIII',optimized);offset=16;arrays=[]
  for fmt,count in zip(['f','f','f','I'],counts):
   values=array(fmt);values.frombytes(optimized[offset:offset+count*4]);arrays.append(values);offset+=count*4
  pp,nn,uu,ii=arrays
 texindex=doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index'];image=doc['images'][doc['textures'][texindex]['source']];view=doc['bufferViews'][image['bufferView']];im=bin[view['byteOffset']:view['byteOffset']+view['byteLength']]
 with tempfile.TemporaryDirectory()as td:
  png=Path(td)/'base.png';jpg=Path(td)/'base.jpg';png.write_bytes(im)
  subprocess.run(['sips','-Z','2048'if id=='harry-rider'else'1024','-s','format','jpeg','-s','formatOptions','85',str(png),'--out',str(jpg)],check=True,stdout=subprocess.DEVNULL)
  imagebytes=jpg.read_bytes()
 chunks=[];views=[]
 def part(data):
  offset=sum(len(c)for c in chunks);views.append({'buffer':0,'byteOffset':offset,'byteLength':len(data)});chunks.append(data+b'\0'*((-len(data))%4));return len(views)-1
 iv,pv,nv,uvv=[part(x.tobytes())for x in [ii,pp,nn,uu]];tv=part(imagebytes)
 def ac(v,typ,count):return {'bufferView':v,'byteOffset':0,'componentType':5125 if typ=='SCALAR'else 5126,'count':count,'type':typ}
 accessors=[ac(iv,'SCALAR',len(ii)),ac(pv,'VEC3',len(pp)//3),ac(nv,'VEC3',len(nn)//3),ac(uvv,'VEC2',len(uu)//2)]
 accessors[1]['min']=[min(pp[a::3])for a in range(3)];accessors[1]['max']=[max(pp[a::3])for a in range(3)]
 binary=b''.join(chunks)
 output={'asset':{'version':'2.0','generator':'Broomball offline runtime vertex clustering'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0,'name':id}],'meshes':[{'name':id,'primitives':[{'attributes':{'POSITION':1,'NORMAL':2,'TEXCOORD_0':3},'indices':0,'material':0}]}],'buffers':[{'byteLength':len(binary)}],'bufferViews':views,'accessors':accessors,'images':[{'bufferView':tv,'mimeType':'image/jpeg'}],'textures':[{'source':0,'sampler':0}],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],'materials':[{'name':'Uploaded textured '+id,'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':.4 if id=='snitch'else .08,'roughnessFactor':.48 if id=='snitch'else .9}}]}
 jd=json.dumps(output,separators=(',',':')).encode();jd+=b' '*((-len(jd))%4);glb=struct.pack('<III',0x46546c67,2,28+len(jd)+len(binary))+struct.pack('<II',len(jd),0x4e4f534a)+jd+struct.pack('<II',len(binary),0x004e4942)+binary
 (ROOT/'runtime'/(id+'.glb')).write_bytes(glb)
 packed='window.BroomModelData=window.BroomModelData||{};window.BroomModelData['+json.dumps(id)+']='+json.dumps(base64.b64encode(glb).decode())+';'
 if id=='broom':packed+='window.BroomBinaries=window.BroomBinaries||{};window.BroomBinaries["uploaded-broom"]=window.BroomModelData["broom"];'
 (ROOT/'runtime'/(id+'.js')).write_text(packed+'\n')
 manifest.append({'id':id,'source':name,'sha256':hashlib.sha256(raw).hexdigest(),'sourceBytes':len(raw),'sourceTriangles':len(ind)//3,'runtimeBytes':len(glb),'runtimeTriangles':len(ii)//3,'vertices':len(pp)//3,'texture':2048 if id=='harry-rider'else 1024,'bounds':{'min':accessors[1]['min'],'max':accessors[1]['max']}})
 (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2))
 print('SAVED',id,len(glb),flush=True)
