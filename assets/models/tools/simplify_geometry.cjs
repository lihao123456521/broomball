/* Build helper; source textures and vertex attributes remain attached to source vertices. */
const fs=require('node:fs');
(async()=>{
 const {MeshoptSimplifier:simplifier}=await import('./meshopt_simplifier.mjs');await simplifier.ready;
 const [input,output,target,region,maxError='.01']=process.argv.slice(2),data=fs.readFileSync(input),length=data.readUInt32LE(12);
 const doc=JSON.parse(data.subarray(20,20+length).toString()),bin=data.subarray(28+length),prim=doc.meshes[0].primitives[0];
 const attr=i=>{const a=doc.accessors[i],v=doc.bufferViews[a.bufferView],start=(v.byteOffset||0)+(a.byteOffset||0),count=a.count*({SCALAR:1,VEC2:2,VEC3:3}[a.type]);const Type=a.componentType===5125?Uint32Array:Float32Array;return new Type(bin.buffer.slice(bin.byteOffset+start,bin.byteOffset+start+count*4));};
 const pos=attr(prim.attributes.POSITION),norm=attr(prim.attributes.NORMAL),uv=attr(prim.attributes.TEXCOORD_0),ind=attr(prim.indices);
 // The face occupies a small part of the full rider bounds. Its many tiny UV
 // islands must stay attached to their original triangles for the entrance camera.
 let vertexLock=null;
 if(region==='rider'){
  vertexLock=new Uint8Array(pos.length/3);
  const bounds=doc.accessors[prim.attributes.POSITION],height=bounds.max[1]-bounds.min[1];
  const hairline=bounds.min[1]+height*.76;
  for(let i=0;i<vertexLock.length;i++)if(pos[3*i+1]>=hairline)vertexLock[i]=1;
 }
 const [simplified,error]=simplifier.simplifyWithAttributes(ind,pos,3,uv,2,[1,1],vertexLock,Math.min(ind.length,Number(target)*3),Number(maxError),['Permissive']);
 const active=[...new Set(simplified)].sort((a,b)=>a-b),map=new Map(active.map((v,i)=>[v,i]));
 const pp=new Float32Array(active.length*3),nn=new Float32Array(active.length*3),uu=new Float32Array(active.length*2),ii=Uint32Array.from(simplified,v=>map.get(v));
 active.forEach((src,dst)=>{pp.set(pos.subarray(src*3,src*3+3),dst*3);nn.set(norm.subarray(src*3,src*3+3),dst*3);uu.set(uv.subarray(src*2,src*2+2),dst*2);});
 const header=Buffer.alloc(16);[pp.length,nn.length,uu.length,ii.length].forEach((n,i)=>header.writeUInt32LE(n,i*4));
 fs.writeFileSync(output,Buffer.concat([header,...[pp,nn,uu,ii].map(a=>Buffer.from(a.buffer))]));
 console.log(JSON.stringify({triangles:ii.length/3,vertices:active.length,error}));
})().catch(error=>{console.error(error);process.exitCode=1;});
