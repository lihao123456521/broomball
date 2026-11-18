/* Core match coordinator. Input, possession selection, passing, roster and gear
 * are separate modules; the active game contains no ability or shop engine. */
(() => {
'use strict';
if(!window.THREE){document.getElementById('fatal').style.display='grid';return;}
const canvas=document.getElementById('world'), $=id=>document.getElementById(id);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x66738e,.00125);
const camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.15,1000);
const riderFill=new THREE.DirectionalLight(0xe7efff,.68);riderFill.name='RiderSoftFill';scene.add(riderFill,riderFill.target);
function installReflectionEnvironment(){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,512);
 gradient.addColorStop(0,'#7898bb');gradient.addColorStop(.42,'#d5d6c8');gradient.addColorStop(.55,'#f2c89e');gradient.addColorStop(1,'#263b32');ctx.fillStyle=gradient;ctx.fillRect(0,0,1024,512);
 const glow=ctx.createRadialGradient(730,205,4,730,205,150);glow.addColorStop(0,'rgba(255,244,214,.95)');glow.addColorStop(.18,'rgba(255,221,172,.48)');glow.addColorStop(1,'rgba(255,205,150,0)');ctx.fillStyle=glow;ctx.fillRect(560,35,340,340);
 const texture=new THREE.CanvasTexture(canvas);texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.SRGBColorSpace;
 const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromEquirectangular(texture);scene.environment=target.texture;scene.userData.reflectionTarget=target;texture.dispose();pmrem.dispose();
}
installReflectionEnvironment();
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z), UP=V(0,1,0), TAU=Math.PI*2;
// Use the rendered dimensions for scoring, including the raised ball seams.
const hoopRadius=3.52,hoopTubeRadius=.19,quaffleRadius=.62,quaffleSeamRadius=.615,quaffleSeamTube=.045;
const goalRadius=hoopRadius-hoopTubeRadius-Math.max(quaffleRadius,quaffleSeamRadius+quaffleSeamTube);
const clamp=THREE.MathUtils.clamp, lerp=THREE.MathUtils.lerp;
const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const moveToward=(a,b,d)=>a<b?Math.min(a+d,b):Math.max(a-d,b);
const moveVec=(a,b,d)=>{const diff=b.clone().sub(a),len=diff.length();return len<=d?b.clone():a.addScaledVector(diff,d/len);};
const materialCache=new Map();
function mat(color,metal=0,emission=0){const key=color+'/'+metal+'/'+emission;if(materialCache.has(key))return materialCache.get(key);const m=new THREE.MeshStandardMaterial({color,roughness:metal>.5?.3:.74,metalness:metal,envMapIntensity:metal>.5?.85:.42});if(emission){m.emissive=new THREE.Color(color);m.emissiveIntensity=emission;}materialCache.set(key,m);return m;}
function addMesh(parent,geo,color,pos,metal=0,emission=0){const m=new THREE.Mesh(geo,typeof color==='object'?color:mat(color,metal,emission));m.position.copy(pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(p,s,pos,c){return addMesh(p,new THREE.BoxGeometry(s.x,s.y,s.z),c,pos);}
function cyl(p,r,h,pos,c,top=r,seg=20,metal=0,emission=0){return addMesh(p,new THREE.CylinderGeometry(top,r,h,seg),c,pos,metal,emission);}
function sph(p,r,pos,c,metal=0,emission=0){return addMesh(p,new THREE.SphereGeometry(r,20,12),c,pos,metal,emission);}
function torus(p,r,t,pos,c,metal=0,emission=0){return addMesh(p,new THREE.TorusGeometry(r,t,8,40),c,pos,metal,emission);}
function beam(p,a,b,r,c){const d=b.clone().sub(a),m=cyl(p,r,d.length(),a.clone().add(b).multiplyScalar(.5),c,r,8);m.quaternion.setFromUnitVectors(UP,d.normalize());return m;}
function lineEllipse(rx,rz,y,color,segments=96){const pts=[];for(let i=0;i<=segments;i++){const a=i/segments*TAU;pts.push(V(Math.sin(a)*rx,y,Math.cos(a)*rz));}const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color,transparent:true,opacity:.75}));scene.add(line);return line;}
const homeGoals=[],awayGoals=[],flags=[];
function makePitchMaterials(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d'),image=ctx.createImageData(256,256);let seed=918273;
 for(let i=0;i<image.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const value=208+(seed%47);image.data[i]=value;image.data[i+1]=value;image.data[i+2]=value;image.data[i+3]=255;}ctx.putImageData(image,0,0);
 ctx.globalAlpha=.13;ctx.strokeStyle='#ffffff';ctx.lineWidth=.55;for(let i=0;i<850;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed%256;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const y=seed%256;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+((seed>>>8)%3)-1,y-2-(seed%4));ctx.stroke();}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(9,12);texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 return [0x37815f,0x2c6a4d].map(color=>new THREE.MeshStandardMaterial({color,map:texture,roughness:.94,metalness:0,envMapIntensity:.28}));
}
function buildWorld(){
 const skyGeo=new THREE.SphereGeometry(520,32,16),skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color(0x142443)},horizon:{value:new THREE.Color(0xd6907b)},bottom:{value:new THREE.Color(0x27314a)}},vertexShader:'varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vPos;uniform vec3 top;uniform vec3 horizon;uniform vec3 bottom;void main(){float h=normalize(vPos).y;vec3 c=h>0.0?mix(horizon,top,smoothstep(0.0,.75,h)):mix(horizon,bottom,smoothstep(0.0,.3,-h));gl_FragColor=vec4(c,1.0);}'});scene.add(new THREE.Mesh(skyGeo,skyMat));
 scene.add(new THREE.HemisphereLight(0xd6c8b4,0x2a3524,1.05));const sun=new THREE.DirectionalLight(0xffd2a0,2.35);sun.position.set(-95,78,60);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-100;sun.shadow.camera.right=100;sun.shadow.camera.top=100;sun.shadow.camera.bottom=-100;sun.shadow.camera.far=350;sun.shadow.bias=-.0004;scene.add(sun);const fill=new THREE.DirectionalLight(0x718fd0,.48);fill.position.set(90,45,-80);scene.add(fill);
 const base=cyl(scene,1,1.2,V(0,-.62,0),0x173e32,1,96);base.scale.set(59,1,80);const skirt=cyl(scene,1,2,V(0,-1.7,0),0xb28a45,1,96);skirt.scale.set(60,1,81);
 const pitchMaterials=makePitchMaterials();
 for(let i=0;i<11;i++){const z=-60+i*12,w=53*Math.sqrt(Math.max(0,1-(z/77)**2));box(scene,V(w*2,.055,12.05),V(0,.025,z),pitchMaterials[i%2]);}
 lineEllipse(55.5,76.5,.14,0xe7c779);lineEllipse(52.8,73.8,.13,0xdce8d5);const center=torus(scene,10,.1,V(0,.14,0),0xe9ddae);center.rotation.x=Math.PI/2;center.scale.y=1.25;box(scene,V(45,.06,.16),V(0,.13,0),0xe9ddae);const crest=torus(scene,2.8,.14,V(0,.15,0),0xe7c779,.4);crest.rotation.x=Math.PI/2;crest.scale.y=1.25;
 // Scoring arcs at each end give the rider a visible attacking reference.
 for(const side of[-1,1]){const pts=[];for(let i=0;i<=40;i++){const a=Math.PI*(i/40);pts.push(V(Math.cos(a)*16,.14,side*61-Math.sin(a)*side*14));}scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xe9ddae,transparent:true,opacity:.6})));}
 buildStands();buildGoals();buildAirwall();buildHorizon();
 sph(scene,9,V(-115,92,-205),0xffe6b0,0,2);
}
function buildStands(){const crimson=0x732d3d,navy=0x233c61,stone=0x303849,gold=0xcda85c;for(let s=0;s<28;s++){const a=s/28*TAU,team=s%2?navy:crimson;for(let t=0;t<3;t++){const g=new THREE.Group();g.position.set(Math.sin(a)*(72+t*3),1+t*2.35,Math.cos(a)*(91+t*3));g.rotation.y=a;scene.add(g);box(g,V(17.2,1.55,5.2),V(),stone);box(g,V(16.8,.18,4.6),V(0,.86,0),team);beam(g,V(-8.3,1.25,-2.15),V(8.3,1.25,-2.15),.075,gold);}if(s%2===0){const root=new THREE.Group();root.position.set(Math.sin(a)*70,7.5,Math.cos(a)*89);root.rotation.y=a;scene.add(root);makeFlag(root,V(),team,5.5,2.6);}}
 for(const x of[-68,68])for(const z of[-76,76]){const g=new THREE.Group();g.position.set(x,0,z);scene.add(g);cyl(g,3,22,V(0,10.5,0),0x3b4052,2.35,12);cyl(g,3.6,.65,V(0,20.8,0),0xd0aa60,3.6,16,.5);cyl(g,4.2,6.5,V(0,25,0),x*z>0?crimson:navy,0,12);cyl(g,.12,6,V(0,30.5,0),0xd6b76f,.12,8,.6);sph(g,.38,V(0,33.6,0),0xffe39a,.4,2);makeFlag(g,V(2.3,30.4,0),x*z>0?crimson:navy,4.6,2.2);}}
function makeFlag(parent,pos,color,w,h){const m=addMesh(parent,new THREE.PlaneGeometry(w,h,8,2),new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:.8}),pos);m.rotation.y=Math.PI/2;flags.push(m);return m;}
function buildGoals(){for(const side of[-1,1])for(let i=0;i<3;i++){const pos=V((i-1)*12,i===1?15:10,side*61),color=side<0?0x75b9ed:0xf3ce71,glow=side<0?0xb9e5ff:0xfff0ac;(side>0?homeGoals:awayGoals).push(pos);cyl(scene,.24,pos.y,V(pos.x,pos.y/2,pos.z),side<0?0x647f9c:0xcaa354,.24,12,.65);cyl(scene,.72,.35,V(pos.x,.18,pos.z),color,.72,16,.65);torus(scene,hoopRadius,hoopTubeRadius,pos,color,.65,.65);torus(scene,3.77,.045,pos,glow,.4,1.5);}}
function buildAirwall(){
 // The ground line marks the playable boundary without a cage across the view.
 lineEllipse(55.2,74.5,.3,0x79a5b6,64);
}
function buildHorizon(){
 for(let i=0;i<16;i++){const a=i/16*TAU,d=310+(i%4)*20,h=34+(i%5)*8;cyl(scene,32,h,V(Math.sin(a)*d,h/2-15,Math.cos(a)*d),0x425468,0,5);}
}
function createWizard(id='harry',rival=false){
 const root=new THREE.Group(),broom=new THREE.Group(),body=new THREE.Group();root.name='WizardRig';broom.name='BroomModel';body.name='CharacterModel';root.add(broom,body);
 const profile=window.BroomRoster?.byId(id),cfg=[0x87374c,0xe9c573,profile?.hair??0x292939],skin=profile?.skin??0xe5b696,leather=0x302a2b;root.userData.characterId=id;
 // A curved handle, wrapped grip and layered bristles keep the broom readable in flight.
 const handle=new THREE.CatmullRomCurve3([V(0,.38,1.9),V(0,.38,.4),V(0,.48,-1.5),V(0,.64,-2.3)]);
 addMesh(broom,new THREE.TubeGeometry(handle,12,.065,7,false),0x95643c,V());
 for(let i=0;i<5;i++){const wrap=torus(broom,.08,.018,V(0,.48+i*.014,-1.25+i*.09),cfg[1],.35);wrap.rotation.x=Math.PI/2;}
 const tail=cyl(broom,.32,1.3,V(0,.36,2.05),0x96643b,.09,10);tail.rotation.x=-Math.PI/2;
 for(let i=0;i<10;i++){const a=i/10*TAU;beam(broom,V(Math.cos(a)*.08,.36+Math.sin(a)*.08,1.35),V(Math.cos(a)*.39,.36+Math.sin(a)*.26,2.75+(i%3)*.08),.027,i%2?0xc59454:0xad7c42);}
 for(const z of[1.42,1.58]){const tie=torus(broom,.16,.035,V(0,.36,z),cfg[1],.5);tie.rotation.x=Math.PI/2;}
 const coat=cyl(body,.34,.9,V(0,1.12,.1),cfg[0],.44,10);coat.scale.z=.67;coat.rotation.x=-.12;
 const collar=cyl(body,.25,.14,V(0,1.58,.02),0xe9e1cf,.23,10);collar.scale.z=.72;
 const waist=cyl(body,.3,.18,V(0,.76,.15),leather,.33,10);waist.scale.z=.72;
 const chest=box(body,V(.16,.56,.035),V(0,1.22,-.2),0xe7d8b7);chest.rotation.x=-.12;
 const badge=addMesh(body,new THREE.CircleGeometry(.095,5),cfg[1],V(-.24,1.38,-.22));badge.rotation.y=-.13;
 for(const side of[-1,1]){
  const hip=V(side*.24,.78,.13),knee=V(side*.46,.38,-.4),ankle=V(side*.44,-.05,.05);
  beam(body,hip,knee,.145,0x343240);sph(body,.15,knee,0x353440);beam(body,knee,ankle,.105,leather);
  const boot=box(body,V(.23,.21,.47),V(side*.44,-.07,-.08),leather);boot.rotation.x=.1;
  beam(broom,V(side*.15,.22,.15),V(side*.52,.05,.15),.025,0x9d8a61);
 }
 const shoulder=V(-.36,1.45,.01),elbow=V(-.56,1.03,-.25),hand=V(-.08,.48,-.84);
 beam(body,shoulder,elbow,.125,cfg[0]);sph(body,.13,elbow,cfg[0]);beam(body,elbow,hand,.105,cfg[0]);sph(body,.115,hand,skin);
 const arm=new THREE.Group();arm.name='CastingArm';arm.position.set(.36,1.45,.01);body.add(arm);
 beam(arm,V(),V(.19,-.35,-.22),.125,cfg[0]);sph(arm,.13,V(.19,-.35,-.22),cfg[0]);beam(arm,V(.19,-.35,-.22),V(.24,-.38,-.72),.095,cfg[0]);sph(arm,.115,V(.24,-.38,-.72),skin);
 beam(arm,V(.24,-.38,-.65),V(.24,-.32,-1.48),.028,0x6d4330);sph(arm,.035,V(.24,-.32,-1.48),cfg[1],.3,.3);
 const spellSocket=new THREE.Object3D();spellSocket.name='SpellSocket';spellSocket.position.set(.24,-.32,-1.5);arm.add(spellSocket);
 const head=new THREE.Group();head.position.set(0,1.87,-.06);head.name='Head';body.add(head);const face=sph(head,.31,V(),skin);face.scale.set(.9,1.12,.92);
 for(const side of[-1,1]){sph(head,.065,V(side*.275,-.015,0),skin);const eye=sph(head,.027,V(side*.105,.035,-.275),0x202c34);eye.scale.y=.8;}
 const nose=sph(head,.045,V(0,-.015,-.291),skin);nose.scale.set(.65,.85,1.4);beam(head,V(-.06,-.125,-.269),V(.06,-.125,-.269),.009,0x9b6659);
 const hair=sph(head,.32,V(0,.14,.04),cfg[2]);hair.scale.set(.98,.72,1.03);
 for(let i=0;i<5;i++){const lock=sph(head,.11,V((i-2)*.095,.21,-.18+(i%2)*.035),cfg[2]);lock.scale.set(.8,1.1+(i%2)*.3,1.1);}
 if(id==='harry'){for(const side of[-1,1])torus(head,.11,.017,V(side*.12,.04,-.29),0x272837,.4);beam(head,V(-.025,.04,-.3),V(.025,.04,-.3),.014,0x272837);beam(head,V(.05,.22,-.245),V(.085,.16,-.278),.01,0xa06353);}
 if(profile?.longHair){for(const side of[-1,1])for(let i=0;i<3;i++){const curl=sph(head,.145,V(side*(.24+(i%2)*.03),.06-i*.15,.08),cfg[2]);curl.scale.set(.8,1.25,.95);}}
 if(profile?.bob){for(const side of[-1,1])box(head,V(.13,.34,.32),V(side*.26,.03,.045),cfg[2]);}
 if(id==='ron'){for(const side of[-1,1])for(let i=0;i<3;i++)sph(head,.009,V(side*(.11+i*.033),-.045,-.269+i*.01),0xa96443);}
 const scarf=torus(body,.29,.065,V(0,1.59,0),cfg[1]);scarf.rotation.x=Math.PI/2;scarf.scale.y=.7;
 const scarfTail=new THREE.Group();scarfTail.name='ScarfTail';scarfTail.position.set(-.19,1.57,.25);body.add(scarfTail);const fabric=box(scarfTail,V(.17,.055,.92),V(0,-.04,.45),cfg[1]);fabric.rotation.x=.12;
 const cape=new THREE.Group();cape.name='Cape';cape.position.set(0,1.48,.3);body.add(cape);
 const vertices=new Float32Array([-.37,0,0,.37,0,0,-.5,-.63,.42,.5,-.63,.42,-.62,-1.03,.9,.62,-1.03,.9]);
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(vertices,3));geo.setIndex([0,2,1,1,2,3,2,4,3,3,4,5]);geo.computeVertexNormals();const capeMat=mat(cfg[0]).clone();capeMat.side=THREE.DoubleSide;capeMat.userData.owned=true;addMesh(cape,geo,capeMat,V());
 body.scale.setScalar(1.12);
 root.userData.replaceable={broom,body,spellSocket};root.userData.rig={cape,scarfTail,arm,body};root.userData.castTime=0;window.BroomCharacterArt?.decorate(root,{id});window.BroomModels?.mountWizard(root,{characterId:id});return root;
}
function disposeObject(object){object.userData.disposed=true;object.traverse(child=>{for(const fallback of child.userData?.fallback||[])fallback.traverse(p=>{if(p.geometry&&!p.geometry.userData.sharedModel)p.geometry.dispose();});if(child.geometry&&!child.geometry.userData.sharedModel)child.geometry.dispose();const materials=Array.isArray(child.material)?child.material:[child.material];for(const material of materials)if(material?.userData.owned&&!material.userData.sharedModel)material.dispose();});object.removeFromParent();}
function animateWizard(mesh,dt,speed,time){
 const previous=mesh.userData.visualSpeed??speed,flow=clamp(speed/48,0,1),acceleration=clamp((speed-previous)/Math.max(dt,1/240),-60,60),reduced=settings.reducedMotion,response=1-Math.exp(-dt*7);
 mesh.userData.visualSpeed=speed;mesh.userData.castTime=Math.max(0,(mesh.userData.castTime||0)-dt);
 const swipe=mesh.userData.swipeTime=Math.max(0,(mesh.userData.swipeTime||0)-dt),stumble=mesh.userData.stumbleTime=Math.max(0,(mesh.userData.stumbleTime||0)-dt);
 const lean=reduced?0:clamp(flow*.055+acceleration*.0018,-.04,.12),recoil=mesh.userData.castTime>0?.045:0,wave=reduced?0:1;
 const rig=mesh.userData.rig;
 if(rig){
  rig.body.rotation.x=lerp(rig.body.rotation.x,-lean+recoil,response);if(rig.head)rig.head.rotation.x=lerp(rig.head.rotation.x,lean*.4-recoil*.3,response);
  rig.cape.rotation.x=.1+flow*.28+Math.sin(time*5)*.025*wave;rig.scarfTail.rotation.y=Math.sin(time*6)*(.05+flow*.1)*wave;rig.scarfTail.rotation.x=-flow*.18;rig.arm.rotation.x=lerp(rig.arm.rotation.x,mesh.userData.castTime>0?-.35:0,1-Math.exp(-dt*16));
  if(swipe>0&&!reduced){const p=1-swipe/.45,s=Math.sin(p*Math.PI);rig.arm.rotation.x=-s*1.5;rig.arm.rotation.z=-s*.55;rig.body.rotation.y=s*.3;}
  if(stumble>0&&!reduced){const k=stumble/.6,w=(1-k)*16;rig.body.rotation.z=Math.sin(w)*.15*k;rig.head.rotation.z=Math.sin(w*.8)*.1*k;}else{rig.body.rotation.z=lerp(rig.body.rotation.z||0,0,response);rig.head.rotation.z=lerp(rig.head.rotation.z||0,0,response);}
 }
 const root=mesh.userData.modelRoot;
 if(root&&root!=='procedural'){
  const restX=root.userData.restRotationX??root.rotation.x,restY=root.userData.restPositionY??root.position.y;
  root.rotation.x=lerp(root.rotation.x,restX-lean+recoil,response);root.position.y=lerp(root.position.y,restY+Math.sin(time*4)*.015*flow*wave,response);
  if(stumble>0&&!reduced){const k=stumble/.6;root.rotation.z=(root.userData.restRotationZ??0)+Math.sin((1-k)*14)*.12*k;}
 }
}
function createQuaffle(){
 const g=new THREE.Group();g.name='Quaffle';
 const leather=new THREE.MeshStandardMaterial({color:0xd85c1d,roughness:.67,metalness:0,envMapIntensity:.5,emissive:0x4f1404,emissiveIntensity:.16});
 sph(g,quaffleRadius,V(),leather);
 for(const angle of [0,Math.PI/2]){const seam=torus(g,quaffleSeamRadius,quaffleSeamTube,V(),0xffe8bd,0,.08);seam.rotation.x=angle;}
 scene.add(g);return g;
}


buildWorld();
const environment=window.BroomEnvironment?.build({THREE,scene,renderer});
const crowd=window.BroomCrowd?.build({THREE,scene});
const configs=[];
const houses=window.BroomHouses.houses;
const houseById=id=>houses.find(h=>h.id===id)||houses[0];
const houseDecor=window.BroomHouses.decorate({THREE,scene});
const settings={reducedMotion:false,house:'gryffindor',opponent:'slytherin',commentary:true,commentaryVolume:.85,crowdVolume:.65};
try{const saved=JSON.parse(localStorage.getItem('broomball-comfort')||'{}');settings.reducedMotion=saved.reducedMotion===true;settings.commentary=saved.commentary!==false;if(Number.isFinite(saved.crowdVolume))settings.crowdVolume=clamp(saved.crowdVolume,0,1);if(Number.isFinite(saved.commentaryVolume))settings.commentaryVolume=clamp(saved.commentaryVolume,0,1);if(houses.some(h=>h.id===saved.house))settings.house=saved.house;if(houses.some(h=>h.id===saved.opponent)&&saved.opponent!==settings.house)settings.opponent=saved.opponent;if(settings.opponent===settings.house)settings.opponent=houses.find(h=>h.id!==settings.house).id;}catch{}
function configureAcademy(house){configs.splice(0,configs.length,...window.BroomRoster.rosters[house].map(profile=>({...profile,...window.BroomCharacterPreview.roleFor(profile.id)})));}
configureAcademy(settings.house);
function saveSettings(){try{localStorage.setItem('broomball-comfort',JSON.stringify(settings));}catch{}}
const modes={
 rookie:{label:'新手赛',duration:180,rivalSpeed:.58,rivalStealRadius:1.85,rivalShotSpeed:17,keeperSaveRadius:1.45,aimAssistRadius:5.4,shotAssistRange:48},
 standard:{label:'标准赛',duration:180,rivalSpeed:.72,rivalStealRadius:2.05,rivalShotSpeed:20,keeperSaveRadius:1.65,aimAssistRadius:4.6,shotAssistRange:42},
 challenge:{label:'挑战赛',duration:180,rivalSpeed:.92,rivalStealRadius:2.3,rivalShotSpeed:28,keeperSaveRadius:2.05,aimAssistRadius:4.25,shotAssistRange:38}
};
const modeBriefs={rookie:'对手速度较慢，射门辅助更强，适合第一次上场。',standard:'速度与逼抢适中，适合熟悉配合后挑战。',challenge:'更快对手与高压逼抢，适合熟练玩家。'};
const freshStats=()=>({shots:0,goals:0,steals:0,passes:0,completedPasses:0,oneTouchPasses:0,oneTouchShots:0,touches:0,homePossession:0,awayPossession:0});
let selectedMode='rookie',startingCharacter=0;
const match={cameraMode:'broadcast',autoSwitch:true,shotCharge:0,charging:false,primaryAction:null,pendingRestart:null,homeHouse:settings.house,awayHouse:settings.opponent,mode:'rookie',rules:modes.rookie,stats:freshStats(),state:'menu',paused:false,countdown:3,elapsed:0,timeLeft:180,playerScore:0,rivalScore:0,message:'',messageTime:0,kickoff:0,stealCooldown:1.5,selected:0,lastControlSwitchAt:-Infinity,entrance:null,tutorial:null};
let lastQuietCommentary=-Infinity;
const matchAudio=window.createMatchAudio();
matchAudio.setCrowdVolume(settings.crowdVolume);
const commentary=window.createMatchCommentary({enabled:settings.commentary,volume:settings.commentaryVolume,canSpeak:()=>match.state!=='menu'&&!match.paused&&!document.hidden,onCaption:text=>{$('commentaryCaption').textContent=text;$('commentaryCaption').hidden=!text;}});
function announceClip(key,clip,priority=1,cooldown=8){if(priority<3&&match.elapsed-lastQuietCommentary<12)return false;const line=window.BroomCommentaryClips[clip];if(!line)return false;const spoken=commentary.announce(key,line.text,{priority,cooldown,clip});if(spoken&&priority<3)lastQuietCommentary=match.elapsed;return spoken;}
const player={mesh:null,pos:V(0,10,38),vel:V(),baseSpeed:22,stamina:100,boosting:false,exhausted:false,previousPos:V(0,10,38),speed:0,boundaryNotice:0,role:'chaser',number:10,stun:0};
const rivals=[],allies=[];let quaffle,carrier=null,quaffleVel=V(),shot=null,passTarget=null,passSender=null,passAge=0,passFlight=null,passDestination=null,passReceivePosition=null,ballGather=null,passMode='short',pickupDelay=0,cameraYaw=0,cameraPitch=0,targetYaw=0,targetPitch=0,lastTime=performance.now(),actionBuffer=null;
const keys={},passRange=46;
// Contact radii include the ball and a small visual margin around the rider.
const contactRules=Object.freeze({bodyRadius:2.05,handRadius:1.9,broomFrontRadius:1.2,broomRearRadius:1.35,pressRadius:3.4,sprintRadius:3.0,protection:.85});
const previousBallPosition=V();
function replacePlayerModel(){const pos=player.pos.clone(),rot=player.mesh?.rotation.clone();if(player.mesh)disposeObject(player.mesh);player.mesh=createWizard(configs[startingCharacter].id);window.BroomHouses.applyUniform(player.mesh,match.homeHouse);scene.add(player.mesh);player.mesh.position.copy(pos);if(rot)player.mesh.rotation.copy(rot);player.pos=player.mesh.position;window.BroomGarage.mount(player.mesh,'uploaded-broom',0);}
replacePlayerModel();
function addRival(role,pos,index){const mesh=createWizard('rival',true);mesh.position.copy(pos);scene.add(mesh);rivals.push({role,index,mesh,speed:role==='keeper'?24:role==='seeker'?23:22,stun:0,phase:index});}
addRival('chaser',V(-16,12,-12),0);addRival('chaser',V(18,9,20),1);addRival('keeper',V(0,12,-53),2);addRival('chaser',V(25,14,-10),3);
function addAlly(role,position,index){
 const mesh=createWizard(role==='keeper'?'ron':'hermione');
 mesh.position.copy(position);
 const pennant=torus(mesh,.58,.065,V(0,2.65,0),0xe9aa6d,.1,.75);
 pennant.castShadow=false;
 scene.add(mesh);
 allies.push({role,index,slot:index,mesh,speed:role==='keeper'?22:24,stun:0,initialPosition:position.clone(),velocity:V(),number:index===0?8:index===1?1:11});
}
addAlly('chaser',V(14,11,25),0);
addAlly('keeper',V(0,11,52),1);
addAlly('chaser',V(-18,14,20),2);
quaffle=createQuaffle();
const trailPointCount=20,trailPositions=new Float32Array(trailPointCount*3),trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute('position',new THREE.BufferAttribute(trailPositions,3).setUsage(THREE.DynamicDrawUsage));
const ballTrail=new THREE.Line(trailGeometry,new THREE.LineBasicMaterial({color:0xffc06a,transparent:true,opacity:.5,depthWrite:false}));ballTrail.name='QuaffleMotionTrail';ballTrail.frustumCulled=false;ballTrail.visible=false;scene.add(ballTrail);
const contactHalo=new THREE.Mesh(new THREE.TorusGeometry(.86,.028,6,48),new THREE.MeshBasicMaterial({color:0xffc56e,transparent:true,opacity:.48,depthWrite:false}));contactHalo.name='QuaffleContactHalo';contactHalo.visible=false;scene.add(contactHalo);
// A ground shadow under the ball makes its height readable from the broadcast camera.
const ballGroundShadow=new THREE.Mesh(new THREE.CircleGeometry(.85,24),new THREE.MeshBasicMaterial({color:0x04140c,transparent:true,opacity:.32,depthWrite:false}));ballGroundShadow.rotation.x=-Math.PI/2;ballGroundShadow.position.y=.09;ballGroundShadow.name='QuaffleGroundShadow';scene.add(ballGroundShadow);
// A billboard ring marks the rival carrier so the defender always knows the press target.
const pressRing=new THREE.Mesh(new THREE.TorusGeometry(1.7,.045,6,48),new THREE.MeshBasicMaterial({color:0x9fc3dd,transparent:true,opacity:.4,depthWrite:false}));pressRing.name='PressTargetRing';pressRing.visible=false;scene.add(pressRing);
let trailReset=true,ballFeedbackPulse=0;
function kickBallFeedback(duration=.2){ballFeedbackPulse=Math.max(ballFeedbackPulse,duration);}
function updateBallFeedback(dt){
 const active=match.state==='playing'&&!match.paused,moving=active&&!carrier&&quaffleVel.lengthSq()>16;
 ballTrail.visible=moving;
 if(moving){
  if(trailReset){for(let i=0;i<trailPointCount;i++){trailPositions[i*3]=quaffle.position.x;trailPositions[i*3+1]=quaffle.position.y;trailPositions[i*3+2]=quaffle.position.z;}trailReset=false;}
  else{trailPositions.copyWithin(0,3);trailPositions[trailPositions.length-3]=quaffle.position.x;trailPositions[trailPositions.length-2]=quaffle.position.y;trailPositions[trailPositions.length-1]=quaffle.position.z;}
  trailGeometry.attributes.position.needsUpdate=true;trailGeometry.computeBoundingSphere();
 }else trailReset=true;
 ballFeedbackPulse=Math.max(0,ballFeedbackPulse-dt);contactHalo.visible=active&&carrier!=='player';
 if(contactHalo.visible){
  const catchable=!carrier&&quaffle.position.distanceTo(player.pos)<4.2;contactHalo.material.color.set(catchable?0xc6ff58:0xffc56e);contactHalo.material.opacity=.34+Math.min(.34,ballFeedbackPulse*1.7);contactHalo.position.copy(quaffle.position);contactHalo.quaternion.copy(camera.quaternion);contactHalo.scale.setScalar(1+ballFeedbackPulse*1.8+(catchable?.1:0));
 }
 ballGroundShadow.visible=active&&quaffle.visible;
 if(ballGroundShadow.visible){ballGroundShadow.position.set(quaffle.position.x,.09,quaffle.position.z);const h=clamp(quaffle.position.y,0,30);ballGroundShadow.material.opacity=clamp(.42-h*.012,.08,.42);ballGroundShadow.scale.setScalar(1+h*.03);}
 pressRing.visible=active&&rivals.includes(carrier);
 if(pressRing.visible){pressRing.position.copy(carrier.mesh.position).add(V(0,.9,0));pressRing.quaternion.copy(camera.quaternion);const on=match.primaryAction==='defend'&&keys.KeyF;pressRing.material.color.set(on?0xffd76a:0x9fc3dd);pressRing.material.opacity=on?.75:.4;pressRing.scale.setScalar(on?1.15:1);}
}
const modelScenery=window.BroomModels?.mountScene({THREE,scene});
$('startBtn').disabled=true;$('startBtn').textContent='正在准备球场…';
Promise.all([modelScenery,window.BroomModels?.ready]).then(()=>{$('startBtn').disabled=false;if(match.state==='menu')selectMode(selectedMode);});
function renderAcademyChoices(){const box=document.querySelector('.characters');box.replaceChildren();for(const [i,cfg] of configs.entries()){const button=document.createElement('button');button.type='button';button.className='character'+(i===startingCharacter?' selected':'');button.dataset.id=cfg.id;button.setAttribute('aria-pressed',String(i===startingCharacter));button.innerHTML='<strong>'+cfg.en+'</strong><div class="cn">'+cfg.name+'</div><span class="player-role">'+cfg.role+'</span>';button.onclick=()=>switchCharacter(i);box.append(button);}}
function refreshSquadAppearance(){
 for(const [i,unit] of [...allies,...rivals].entries()){
  const friendly=allies.includes(unit),roster=window.BroomRoster.rosters[friendly?match.homeHouse:match.awayHouse];
  const profile=roster[friendly?(unit.role==='keeper'?2:unit.index===0?1:0):unit.index%3];
  if(unit.mesh.userData.characterId===profile.id)continue;
  const old=unit.mesh,mesh=createWizard(profile.id,!friendly);mesh.position.copy(old.position);mesh.rotation.copy(old.rotation);mesh.visible=old.visible;disposeObject(old);unit.mesh=mesh;scene.add(mesh);resetAIFlight(unit);
 }
}
function mountMatchBrooms(){for(const unit of[player,...allies,...rivals])window.BroomGarage.mount(unit.mesh,'uploaded-broom',0);}
function syncVoiceSettings(){$('commentaryEnabled').checked=settings.commentary;$('commentaryVolume').value=Math.round(settings.commentaryVolume*100);$('commentaryVolumeValue').textContent=Math.round(settings.commentaryVolume*100)+'%';$('crowdVolume').value=Math.round(settings.crowdVolume*100);$('crowdVolumeValue').textContent=Math.round(settings.crowdVolume*100)+'%';}
function setCommentaryVolume(value){if(!Number.isFinite(value))return;settings.commentaryVolume=clamp(value,0,1);commentary.setVolume(settings.commentaryVolume);syncVoiceSettings();saveSettings();}
function setCrowdVolume(value){if(!Number.isFinite(value))return;settings.crowdVolume=clamp(value,0,1);matchAudio.setCrowdVolume(settings.crowdVolume);syncVoiceSettings();saveSettings();}
function setCommentaryEnabled(enabled){settings.commentary=enabled!==false;commentary.setEnabled(settings.commentary);if(!settings.commentary){commentary.stop();window.BroomVoice?.stop();}syncVoiceSettings();saveSettings();}

function selectMode(mode){if(!Object.hasOwn(modes,mode))return;selectedMode=mode;for(const button of document.querySelectorAll('.mode-option'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));$('modeBrief').textContent=modeBriefs[mode];$('startBtn').textContent='球队入场';}
function syncHouseTheme(){
 const home=houseById(match.homeHouse),away=houseById(match.awayHouse);
 const accent=h=>h.id==='hufflepuff'?h.color:h.secondary;
 $('homeTeamName').textContent=home.name;
 $('awayTeamName').textContent=away.name;
 $('homeTeamName').style.color=accent(home);
 $('awayTeamName').style.color=accent(away);
 document.documentElement.style.setProperty('--menu-accent',accent(home));
 for(const button of document.querySelectorAll('.house-option'))button.setAttribute('aria-pressed',String(button.dataset.house===home.id));
 $('opponentHouse').innerHTML=houses.filter(h=>h.id!==home.id).map(h=>'<option value="'+h.id+'">'+h.name+'</option>').join('');
 $('opponentHouse').value=away.id;
 window.BroomHouses.applyUniform(player.mesh,home.id);
 for(const ally of allies)window.BroomHouses.applyUniform(ally.mesh,home.id);
 for(const rival of rivals)window.BroomHouses.applyUniform(rival.mesh,away.id);

 window.BroomHouses.setTeams(home.id,away.id);
}
function selectHouse(id){
 if(match.state!=='menu'||!houses.some(h=>h.id===id))return false;
 settings.house=match.homeHouse=id;configureAcademy(id);startingCharacter=match.selected=0;replacePlayerModel();renderAcademyChoices();
 if(match.awayHouse===id)settings.opponent=match.awayHouse=houses.find(h=>h.id!==id).id;
 refreshSquadAppearance();syncHouseTheme();mountMatchBrooms();saveSettings();return true;
}
function selectOpponent(id){
 if(match.state!=='menu'||id===match.homeHouse||!houses.some(h=>h.id===id))return false;
 settings.opponent=match.awayHouse=id;
 refreshSquadAppearance();syncHouseTheme();mountMatchBrooms();saveSettings();return true;
}
function resetMatch(mode=selectedMode){
 matchAudio.stop();
 commentary.reset();matchAudio.update({paused:false,active:true});lastQuietCommentary=-Infinity;selectMode(mode);clearInput();clearGoalCelebration();crowd?.reset();lastTime=performance.now();
 Object.assign(match,{mode:selectedMode,selected:startingCharacter,rules:modes[selectedMode],stats:freshStats(),state:'countdown',paused:false,countdown:3,cameraMode:'broadcast',shotCharge:0,charging:false,primaryAction:null,pendingRestart:null,elapsed:0,timeLeft:modes[selectedMode].duration,playerScore:0,rivalScore:0,message:'',messageTime:0,kickoff:0,stealCooldown:1.5,lastControlSwitchAt:-Infinity,entrance:null,tutorial:null});
 player.role='chaser';player.number=10;player.stun=0;
 for(const a of allies){a.role=a.slot===1?'keeper':'chaser';a.index=a.slot;a.number=a.slot===0?8:a.slot===1?1:11;a.initialPosition.copy(a.slot===0?V(16,10,25):a.slot===1?V(0,10,53):V(-18,10,20));a.mesh.visible=true;a.stun=0;a.mesh.position.copy(a.initialPosition);a.velocity.set(0,0,0);resetAIFlight(a);}
 if(player.mesh.userData.characterId!==configs[startingCharacter].id)replacePlayerModel();refreshSquadAppearance();syncHouseTheme();mountMatchBrooms();
 player.pos.set(0,10,38);player.previousPos.copy(player.pos);player.mesh.rotation.set(0,0,0);player.mesh.visible=true;player.vel.set(0,0,0);
 Object.assign(player,{baseSpeed:match.mode==='challenge'?24:match.mode==='rookie'?19:20,speed:0,stamina:100,boosting:false,exhausted:false,boundaryNotice:0});
 const starts=[V(-16,10,-34),V(18,10,-31),V(0,10,-53),V(25,10,2)];for(const r of rivals){r.mesh.visible=true;r.mesh.position.copy(starts[r.index]);r.stun=0;resetAIFlight(r);}
 resetQuaffle();quaffle.visible=true;setAim(0,0);broadcastFocus.copy(player.pos).add(V(0,1.2,0));cameraFraming.distance=30;updateCamera(1);
 for(const id of ['pause','ending','matchEntrance','tutorialCoach'])$(id).classList.add('hidden');renderAcademyChoices();updateHUD();
}
function beginMatchEntrance(){
 if(settings.reducedMotion){match.state='countdown';return false;}
 const actors=[player,...allies,...rivals].map((unit,index)=>{
  const friendly=unit===player||allies.includes(unit),side=friendly?1:-1,target=unit.mesh.position.clone();
  return{unit,side,target,start:V((index%4-1.5)*3.2,6+(index%2)*1.4,side*69),delay:(index%4)*.12};
 });
 match.state='entrance';match.entrance={elapsed:0,duration:6.4,actors};
 $('entranceHome').textContent=houseById(match.homeHouse).name;$('entranceAway').textContent=houseById(match.awayHouse).name;$('entranceMode').textContent=match.rules.label;
 $('entrancePhase').textContent='双方球员从球员通道起飞';$('entranceProgress').style.width='0%';$('matchEntrance').classList.remove('hidden');playCrowdCheer(.35);return true;
}
function finishMatchEntrance(){
 const entrance=match.entrance;if(!entrance)return false;
 for(const actor of entrance.actors){actor.unit.mesh.position.copy(actor.target);actor.unit.mesh.rotation.x=0;actor.unit.mesh.rotation.z=0;if(actor.unit===player){player.previousPos.copy(player.pos);player.vel.set(0,0,0);}else{actor.unit.previousPos=actor.target.clone();actor.unit.velocity?.set(0,0,0);resetAIFlight(actor.unit);}}
 match.entrance=null;match.state='countdown';match.countdown=3;match.stealCooldown=1.5;setAim(0,0);camera.fov=50;camera.updateProjectionMatrix();$('matchEntrance').classList.add('hidden');notify('双方入场完毕 · 准备开球',1.5);return true;
}
function updateMatchEntrance(dt){
 const entrance=match.entrance;if(!entrance)return;entrance.elapsed=Math.min(entrance.duration,entrance.elapsed+dt);const elapsed=entrance.elapsed;
 for(const [index,actor]of entrance.actors.entries()){
  const raw=clamp((elapsed-.15-actor.delay)/3.4,0,1),t=raw*raw*(3-2*raw);actor.unit.mesh.position.lerpVectors(actor.start,actor.target,t);actor.unit.mesh.rotation.y=actor.side>0?0:Math.PI;
  if(actor.unit===player)player.previousPos.copy(player.pos);else actor.unit.previousPos=actor.unit.mesh.position.clone();actor.unit.velocity?.set(0,0,0);animateWizard(actor.unit.mesh,dt,raw>0&&raw<1?10:0,elapsed+index);
 }
 $('entrancePhase').textContent=elapsed<1.8?'双方球员从球员通道起飞':elapsed<4.2?'队长带领球队进入比赛位置':'赛前准备完成 · 即将开球';$('entranceProgress').style.width=(elapsed/entrance.duration*100)+'%';
 if(elapsed>=entrance.duration)finishMatchEntrance();
}
function startMatch(mode=selectedMode,{entrance=false}={}){initAudio();window.BroomVoice?.warmup();resetMatch(mode);$('menu').classList.add('hidden');commentary.unlock();if(entrance)beginMatchEntrance();canvas.focus();}
function restartMatch(){initAudio();commentary.unlock();resetMatch(match.mode);beginMatchEntrance();canvas.focus();}
function returnToMenu(){matchAudio.update({paused:true,active:false});commentary.stop();window.BroomVoice?.stop();clearInput();clearGoalCelebration();crowd?.reset();match.state='menu';match.paused=false;match.entrance=null;match.tutorial=null;match.selected=startingCharacter;player.role='chaser';if(player.mesh.userData.characterId!==configs[startingCharacter].id)replacePlayerModel();renderAcademyChoices();for(const id of ['ending','pause','matchEntrance','tutorialCoach'])$(id).classList.add('hidden');$('menu').classList.remove('hidden');}
const tutorialSteps=[
 {kind:'move',title:'先学会移动',description:'按 W 向前、S 向后、A / D 左右。向任意方向累计飞行 7 米，就会进入下一项。',keys:[['W A S D','移动']],tip:'先轻点，再长按；镜头会跟随当前控制球员。'},
 {kind:'sprint',title:'用冲刺追上节奏',description:'移动时按住 Shift，累计冲刺 1.1 秒。体力会消耗，松开按键后逐渐恢复。',keys:[['W','保持移动'],['Shift','按住冲刺']],tip:'新手赛体力消耗较慢，不必一直冲刺。'},
 {kind:'short',title:'完成一次短传',description:'持球时按 E，球传到接应队友脚下即完成。接球后会自动换控，不需要手动切人。',keys:[['E','短传']],tip:'留意绿色接球提示；传给附近队友最稳。'},
 {kind:'through',title:'用直塞打身后',description:'按 R 让球飞向队友前冲的空当，完成一次真实接球后进入射门训练。',keys:[['R','直塞']],tip:'直塞适合队友向前跑位，距离太近时短传更稳。'},
 {kind:'shot',title:'蓄力并射一次门',description:'面向对方球门，按住 F 蓄力，再松开射门。完成一次射门动作即可，不要求必须进球。',keys:[['F','按住蓄力 · 松开射门']],tip:'新手赛扩大了辅助范围，不必追求满蓄力。'},
 {kind:'defend',title:'按住 F 完成逼抢',description:'对方持球时按住 F，系统会预测路线并辅助冲刺。接近对手、完成一次抢断即可。',keys:[['F','按住逼抢']],tip:'不需要同时控制方向，先熟悉防守时机。'}
];
function updateTutorialCoach(){
 const tutorial=match.tutorial;if(!tutorial)return;const complete=tutorial.complete,step=tutorialSteps[tutorial.step];
 $('tutorialStepCount').textContent=complete?'06 / 06':String(tutorial.step+1).padStart(2,'0')+' / 06';
 $('tutorialTitle').textContent=complete?'训练完成，可以开赛':step.title;
 $('tutorialDescription').textContent=complete?'你已实际完成移动、冲刺、短传、直塞、射门和抢断。正式比赛中仍可按 Esc 查看按键。':step.description;
 $('tutorialKeys').innerHTML=complete?'':step.keys.map(([key,label])=>'<kbd>'+key+'</kbd><span>'+label+'</span>').join('');
 $('tutorialTip').textContent=complete?'建议先打一场新手赛，再逐步尝试标准赛。':step.tip;
 $('tutorialCoach').dataset.complete=String(complete);$('tutorialDone').classList.toggle('hidden',!complete);$('tutorialSkip').classList.toggle('hidden',complete);$('tutorialRepeat').textContent=complete?'再练一次':'重练本步';
 $('tutorialProgressFill').style.width=(complete?100:(tutorial.step+tutorial.progress)/tutorialSteps.length*100)+'%';
}
function setupTutorialStep(index){
 const tutorial=match.tutorial;if(!tutorial)return;const step=tutorialSteps[index];tutorial.step=index;tutorial.progress=0;tutorial.travel=0;tutorial.complete=false;tutorial.baseline={passes:match.stats.completedPasses,shots:match.stats.shots,steals:match.stats.steals};
 clearInput();resetQuaffle();Object.assign(match,{state:'playing',kickoff:0,pendingRestart:null,stealCooldown:0,charging:false,shotCharge:0});Object.assign(player,{stamina:100,exhausted:false,boosting:false,speed:0});player.vel.set(0,0,0);
 for(const [i,a]of allies.entries()){a.mesh.position.set(i%2?34:-34,24+i*2,36);a.previousPos=a.mesh.position.clone();a.stun=999;a.velocity?.set(0,0,0);resetAIFlight(a);}
 for(const [i,r]of rivals.entries()){r.mesh.position.set(i%2?-34:34,28+i,36);r.previousPos=r.mesh.position.clone();r.stun=999;r.velocity?.set(0,0,0);resetAIFlight(r);}
 player.pos.set(0,10,26);player.previousPos.copy(player.pos);player.mesh.rotation.set(0,0,0);setAim(0,0);setCarrier('player');
 const field=allies.filter(a=>a.role==='chaser');
 if(step.kind==='short'||step.kind==='through'){
  player.pos.set(0,10,step.kind==='short'?20:22);player.previousPos.copy(player.pos);const receiver=field[step.kind==='short'?0:1]||field[0];
  if(receiver){receiver.mesh.position.set(step.kind==='short'?12:-12,10,step.kind==='short'?2:-2);receiver.previousPos=receiver.mesh.position.clone();receiver.stun=0;resetAIFlight(receiver);}
 }else if(step.kind==='shot'){
  player.pos.set(0,10,-25);player.previousPos.copy(player.pos);
 }else if(step.kind==='defend'){
  player.pos.set(0,10,15);player.previousPos.copy(player.pos);const rival=rivals[0];rival.mesh.position.set(0,10,8);rival.previousPos=rival.mesh.position.clone();rival.stun=0;resetAIFlight(rival);setCarrier(rival);
 }
 updateTutorialCoach();
}
function startTutorial(){
 initAudio();resetMatch('rookie');$('menu').classList.add('hidden');match.state='playing';match.tutorial={step:0,progress:0,complete:false,baseline:null};$('tutorialCoach').classList.remove('hidden');commentary.unlock();setupTutorialStep(0);notify('新手训练 · 比赛计时已冻结',2);canvas.focus();
}
function repeatTutorialStep(){if(!match.tutorial)return;if(match.tutorial.complete)startTutorial();else setupTutorialStep(match.tutorial.step);canvas.focus();}
function completeTutorialStep(){
 const tutorial=match.tutorial;if(!tutorial||tutorial.complete)return;const finished=tutorialSteps[tutorial.step].title;
 if(tutorial.step<tutorialSteps.length-1){setupTutorialStep(tutorial.step+1);notify(finished+' · 下一项',1.4);return;}
 tutorial.progress=1;tutorial.complete=true;clearInput();updateTutorialCoach();notify('六项训练全部完成',2);playCrowdCheer(.25);try{localStorage.setItem('broomball-tutorial-complete','1');}catch{}
}
function updateTutorial(dt){
 const tutorial=match.tutorial;if(!tutorial)return;if(tutorial.complete){player.vel.set(0,0,0);player.speed=0;return;}
 match.elapsed+=dt;if(actionBuffer&&match.elapsed>actionBuffer.expires){actionBuffer=null;if(match.primaryAction==='bufferedShot')match.primaryAction=null;}match.stealCooldown=Math.max(0,match.stealCooldown-dt);pickupDelay=Math.max(0,pickupDelay-dt);
 if(match.charging&&carrier==='player'){match.shotCharge=Math.min(1,match.shotCharge+dt/1.05);player.mesh.userData.castTime=Math.max(player.mesh.userData.castTime||0,.08);}
 ensureTeamControl();updatePlayer(dt);tutorial.travel+=player.pos.distanceTo(player.previousPos);for(const r of rivals){r.stun=Math.max(0,r.stun-dt);flyAI(r,r.mesh.position,0,dt);}updateAllies(dt);updateQuaffle(dt);updateSteals(dt);ensureTeamControl();
 const step=tutorialSteps[tutorial.step];let progress=tutorial.progress;
 if(step.kind==='move')progress=clamp(tutorial.travel/7,0,1);
 else if(step.kind==='sprint'){if(player.boosting&&(keys.ShiftLeft||keys.ShiftRight))progress=clamp(progress+dt/1.1,0,1);}
 else if(step.kind==='short'||step.kind==='through')progress=clamp(match.stats.completedPasses-tutorial.baseline.passes,0,1);
 else if(step.kind==='shot')progress=clamp(match.stats.shots-tutorial.baseline.shots,0,1);
 else if(step.kind==='defend')progress=clamp(match.stats.steals-tutorial.baseline.steals,0,1);
 tutorial.progress=progress;$('tutorialProgressFill').style.width=((tutorial.step+progress)/tutorialSteps.length*100)+'%';if(progress>=1)completeTutorialStep();
}
function lockPointer(){canvas.focus();}
function clearInput(){match.charging=false;match.shotCharge=0;match.primaryAction=null;actionBuffer=null;for(const key of Object.keys(keys))delete keys[key];player.vel.set(0,0,0);player.speed=0;targetYaw=cameraYaw;targetPitch=0;}
function pauseMatch(){if(!['playing','countdown','entrance'].includes(match.state)||match.paused)return;matchAudio.update({paused:true});commentary.stop();clearInput();match.paused=true;$('pause').classList.remove('hidden');$('resumeBtn').focus();}
function resumeMatch(){initAudio();matchAudio.update({paused:false,active:['playing','countdown','entrance'].includes(match.state)});commentary.unlock();clearInput();lastTime=performance.now();match.paused=false;$('pause').classList.add('hidden');canvas.focus();}


function teamText(text){return text.replaceAll('狮队',houseById(match.homeHouse).name).replaceAll('鹰队',houseById(match.awayHouse).name);}
function notify(text,time=2){match.message=teamText(text);match.messageTime=time;}
function setAim(yaw,pitch){cameraYaw=targetYaw=yaw;cameraPitch=targetPitch=clamp(pitch,-1.15,1.05);}

function updateAim(dt){const blend=1-Math.exp(-dt*18);cameraYaw+=angleDelta(cameraYaw,targetYaw)*blend;cameraPitch=lerp(cameraPitch,targetPitch,blend);}

function getAimState(){return {yaw:cameraYaw,pitch:cameraPitch,targetYaw,targetPitch};}
function getAimForward(){const cp=Math.cos(cameraPitch);return V(-Math.sin(cameraYaw)*cp,Math.sin(cameraPitch),-Math.cos(cameraYaw)*cp).normalize();}
function getHorizontalBasis(){const forward=getAimForward();forward.y=0;if(forward.lengthSq()<.001)forward.set(0,0,-1);forward.normalize();return{forward,right:forward.clone().cross(UP).normalize()};}
function initAudio(){matchAudio.unlock();}
function playCrowdCheer(intensity=1){matchAudio.cheer(intensity);}

function switchCharacter(index){if(match.state!=='menu'||index<0||index>=configs.length)return;startingCharacter=match.selected=index;replacePlayerModel();renderAcademyChoices();}
function getPlayDirection(){const movement=window.BroomControls.movement(keys),intent=V(movement.x,0,movement.z);return intent.lengthSq()>.01?intent.normalize():getAimForward();}
function getPressTarget(unit=carrier){
 if(!unit||unit==='player')return player.pos.clone();
 const velocity=unit.velocity||unit.flightDirection?.clone().multiplyScalar(unit.flightSpeed||0)||V();
 // Aim where the carrier is going, not where they were when the press started.
 return unit.mesh.position.clone().addScaledVector(velocity,.28);
}
function getMovementBasis(){return {forward:V(0,0,-1),right:V(1,0,0)};}

function switchControl(unit){
 if(!unit||!allies.includes(unit)||!['playing','countdown'].includes(match.state)||match.paused)return false;
 const oldMesh=player.mesh,oldVelocity=player.vel.clone(),oldRole=player.role,oldNumber=player.number;
 player.mesh=unit.mesh;unit.mesh=oldMesh;player.pos=player.mesh.position;player.previousPos.copy(player.pos);player.vel.copy(unit.velocity||V());player.speed=player.vel.length();
 player.role=unit.role;player.number=unit.number;unit.role=oldRole;unit.number=oldNumber;unit.velocity=oldVelocity;resetAIFlight(unit);if(oldVelocity.lengthSq()>.1){unit.flightDirection.copy(oldVelocity).normalize();unit.flightSpeed=oldVelocity.length();}
 if(carrier===unit)carrier='player';else if(carrier==='player')carrier=unit;
 if(passTarget===unit)passTarget='player';else if(passTarget==='player')passTarget=unit;
 if(passSender===unit)passSender='player';else if(passSender==='player')passSender=unit;
 match.charging=false;match.shotCharge=0;match.lastControlSwitchAt=match.elapsed;setAim(player.mesh.rotation.y,0);return true;
}
function homeKeeper(){return player.role==='keeper'?player:allies.find(unit=>unit.role==='keeper');}
function ensureTeamControl(possessionChanged=false){
 const desired=window.BroomTeamControl.getDesiredUnit({player,allies,rivals,carrier,ball:quaffle,passTarget,passSender,now:match.elapsed,lastSwitchAt:match.lastControlSwitchAt,possessionChanged,enabled:match.state==='playing',paused:match.paused});
 if(desired&&desired!==player)switchControl(desired);
}
function friendlyUnit(unit){return unit==='player'||allies.includes(unit);}
function canBufferTeamAction(){return match.state==='playing'&&!match.paused&&!carrier&&friendlyUnit(passTarget)&&friendlyUnit(passSender);}
function bufferTeamAction(type,kind='short'){
 if(!canBufferTeamAction())return false;
 const remaining=passFlight?Math.max(.25,passFlight.duration-passAge+.22):.5;
 actionBuffer={type,kind,created:match.elapsed,expires:match.elapsed+Math.min(2.6,remaining),released:false,charge:0};
 if(type==='shot'){match.primaryAction='bufferedShot';keys.KeyF=true;}
 else if(match.primaryAction==='bufferedShot')match.primaryAction=null;
 notify(type==='shot'?'已预输入射门 · 接球后继续蓄力':'已预输入'+(kind==='through'?'直塞':'短传')+' · 接球后一脚出球',1.2);return true;
}
function flushBufferedAction(){
 if(!actionBuffer||carrier!=='player'||match.state!=='playing'||match.paused)return;
 if(match.elapsed>actionBuffer.expires){actionBuffer=null;if(match.primaryAction==='bufferedShot')match.primaryAction=null;return;}
 const action=actionBuffer;actionBuffer=null;
 if(action.type==='pass'){
  if(passQuaffle(action.kind)){match.stats.oneTouchPasses++;notify(action.kind==='through'?'一脚直塞 · 连续进攻':'一脚短传 · 连续配合',1.35);kickBallFeedback(.16);}
  return;
 }
 match.primaryAction=null;match.charging=true;match.shotCharge=clamp(action.released?action.charge:(match.elapsed-action.created)/1.05,0,1);
 if(action.released){if(throwQuaffle(true))match.stats.oneTouchShots++;}
 else match.primaryAction='shoot';
}
function beginPrimaryAction(){
 if(match.state!=='playing'||match.paused||match.primaryAction)return;
 if(carrier!=='player'&&canBufferTeamAction()){bufferTeamAction('shot');return;}
 match.primaryAction=carrier==='player'?'shoot':'defend';keys.KeyF=true;if(match.primaryAction==='shoot'){match.charging=true;match.shotCharge=0;}
}
function endPrimaryAction(){
 const buffered=match.primaryAction==='bufferedShot',shoot=match.primaryAction==='shoot'&&match.charging&&carrier==='player';delete keys.KeyF;match.primaryAction=null;
 if(buffered){if(actionBuffer?.type==='shot'){actionBuffer.released=true;actionBuffer.charge=clamp((match.elapsed-actionBuffer.created)/1.05,0,1);}return;}
 if(shoot)throwQuaffle();match.charging=false;match.shotCharge=0;
}


function carryPosition(owner){
 return owner.position.clone().add(V(.95,1.15,-.35).applyQuaternion(owner.quaternion));
}
function setCarrier(value,receiveFrom=null){
 const previous=carrier,friendly=value==='player'||allies.includes(value),wasFriendly=previous==='player'||allies.includes(previous);
 if(!value||rivals.includes(value)){actionBuffer=null;if(match.primaryAction==='bufferedShot')match.primaryAction=null;}
 if(value&&match.state==='playing'&&(!previous||friendly!==wasFriendly))announceClip(friendly?'home-possession':'away-possession',value==='player'?'player-possession-'+(player.mesh.userData.characterId||configs[match.selected].id):'possession-'+(friendly?match.homeHouse:match.awayHouse),1,9);
 if(value!=='player'){match.charging=false;match.shotCharge=0;if(rivals.includes(value)&&keys.KeyF)match.primaryAction='defend';}
 carrier=value;
 shot=null;
 passTarget=null;
 passSender=null;
 passDestination=null;passReceivePosition=null;
 passFlight=null;ballGather=null;
 quaffleVel.set(0,0,0);
 pickupDelay=.18;
 if(value){const owner=value==='player'?player.mesh:value.mesh;if(receiveFrom){ballGather={owner,from:receiveFrom.clone(),age:0,duration:.14};quaffle.position.copy(receiveFrom);}else quaffle.position.copy(carryPosition(owner));}

 previousBallPosition.copy(quaffle.position);ensureTeamControl(previous!==value);
 if(carrier==='player'&&match.state==='playing'&&previous!==carrier){match.stats.touches++;kickBallFeedback(.22);matchAudio.play('catch');}
 flushBufferedAction();
}
function resetQuaffle(position=V(0,9,0)){
 setCarrier(null);
 quaffle.position.copy(position);
 pickupDelay=.25;
}
function dropQuaffle(){
 if(!carrier)return;
 setCarrier(null);
 quaffleVel.set((Math.random()-.5)*14,5,(Math.random()-.5)*14);
 pickupDelay=.25;
}
function closestGoal(goals,from){
 return goals.reduce((nearest,g)=>g.distanceToSquared(from)<nearest.distanceToSquared(from)?g:nearest);
}
function positionOnGoalPlane(from,direction,z){
 if(Math.abs(direction.z)<.001)return null;
 const t=(z-from.z)/direction.z;
 return t>=0?from.clone().addScaledVector(direction,t):null;
}
function goalCrossing(from,to){
 // Check the swept segment, and only count travel out through the front of a goal.
 for(const [side,goals] of [['player',awayGoals],['rival',homeGoals]]){
  const z=goals[0].z,sign=Math.sign(z);
  if(from.z*sign>=z*sign||to.z*sign<z*sign)continue;
  const t=(z-from.z)/(to.z-from.z),point=from.clone().lerp(to,t);
  return {side,point,t,scored:goals.some(goal=>point.distanceToSquared(goal)<=goalRadius**2)};
 }
 return null;
}
function getShotInfo(){
 const forward=getPlayDirection();
 if(match.cameraMode!=='chase'){
  const goal=closestGoal(awayGoals,player.pos),release=carryPosition(player.mesh),distance=player.pos.distanceTo(goal);
  const toGoal=goal.clone().sub(player.pos).normalize();
  const assisted=distance<=match.rules.shotAssistRange&&release.z>goal.z&&forward.dot(toGoal)>.12;
  return {goal,distance,assisted,direction:assisted?goal.clone().sub(release).normalize():forward};
 }
 const crossing=forward.z<0?positionOnGoalPlane(camera.position,forward,awayGoals[0].z):null;
 const goal=closestGoal(awayGoals,crossing||player.pos);
 const distance=player.pos.distanceTo(goal),release=carryPosition(player.mesh);
 const assisted=!!crossing&&distance<=match.rules.shotAssistRange&&crossing.distanceTo(goal)<=match.rules.aimAssistRadius&&release.z>goal.z;
 const direction=forward.clone();
 if(assisted){
  const intended=crossing.clone().sub(goal).clampLength(0,goalRadius*.62).add(goal);
  direction.copy(intended).sub(release).normalize();
 }
 return {goal,distance,assisted,direction};
}
function launchShot(owner,direction,side,speed,recordMiss=false,details={}){
 announceClip('shot-'+side,owner===player.mesh?'player-shot-'+(player.mesh.userData.characterId||configs[match.selected].id):'shot-'+(side==='player'?match.homeHouse:match.awayHouse),2,6);
 owner.userData.castTime=.3;kickBallFeedback(.24);
 const release=carryPosition(owner);
 carrier=null;
 passTarget=null;
 passSender=null;
 passDestination=null;passReceivePosition=null;ballGather=null;
 passFlight=null;
 quaffle.position.copy(release);
 shot={side,age:0,recordMiss,owner,charge:details.charge||0,distance:details.distance||0,assisted:!!details.assisted,oneTouch:!!details.oneTouch,celebrationEligible:side==='player'&&owner===player.mesh};
 quaffleVel.copy(direction).multiplyScalar(speed);
 pickupDelay=.18;
}
function throwQuaffle(oneTouch=false){
 if(carrier!=='player'||match.state!=='playing'||match.paused||match.celebration)return false;
 const info=getShotInfo(),charge=match.shotCharge;
 launchShot(player.mesh,info.direction,'player',(match.mode==='challenge'?32:24)+charge*16,true,{charge,distance:info.distance,assisted:info.assisted,oneTouch});
 match.charging=false;match.shotCharge=0;
 match.stats.shots++;
 matchAudio.play('shot');
 return true;
}
function teamThrow(unit,goals,side,speed){
 const goal=closestGoal(goals,unit.mesh.position);
 launchShot(unit.mesh,goal.clone().sub(carryPosition(unit.mesh)).normalize(),side,speed);
}
function planPass(sender,receiver,kind='short'){
 const source=sender==='player'?player.mesh:sender.mesh,body=receiver==='player'?player.mesh:receiver.mesh;
 const velocity=receiver==='player'?player.vel:receiver.velocity||V();
 const plan=window.BroomPassing.plan(THREE,{start:carryPosition(source),receiverPosition:body.position,receiverVelocity:velocity,
  receiverForward:receiver==='player'?getAimForward():receiver.flightDirection,kind,attackDirection:V(0,0,sender==='player'||allies.includes(sender)?-1:1),
  receiverSpeed:receiver==='player'?Math.max(player.speed,player.baseSpeed):receiver.speed*(match.mode==='challenge'?1:.88),receiverControlled:receiver==='player',receiverCarryOffset:carryPosition(body).sub(body.position)});
 constrainPitch(plan.receivePosition,4,36);plan.destination.copy(plan.receivePosition).add(plan.carryOffset);
 return plan;
}
function passBetween(sender,receiver,kind='short'){
 announceClip('pass',receiver==='player'?'return-pass':'pass',1,10);
 const source=sender==='player'?player.mesh:sender.mesh;source.userData.castTime=.22;kickBallFeedback(.14);
 if(sender==='player'||allies.includes(sender))match.stats.passes++;
 const release=carryPosition(sender==='player'?player.mesh:sender.mesh),plan=planPass(sender,receiver,kind);
 passDestination=plan.destination;passReceivePosition=plan.receivePosition;
 match.charging=false;match.shotCharge=0;
 carrier=null;shot=null;ballGather=null;passTarget=receiver;passSender=sender;passMode=kind;passAge=0;
 quaffle.position.copy(release);
 passFlight=window.BroomPassing.create(THREE,{start:release,end:passDestination,kind,duration:plan.duration});
 quaffleVel.copy(passFlight.velocityAt(0));pickupDelay=0;
}
function getPassReceiver(){
 const aim=getPlayDirection(),origin=player.pos;
 const score=a=>{const delta=a.mesh.position.clone().sub(origin),d=delta.length();
  const blocked=rivals.some(r=>r.stun<=0&&segmentDistanceSq(r.mesh.position,origin,a.mesh.position)<2.3**2);
  return delta.normalize().dot(aim)*42-d*.20+(a.role==='keeper'?-18:5)-(blocked?10:0);};
 return allies.filter(a=>a.mesh.visible&&a.stun<=0&&Math.abs(a.mesh.position.y-origin.y)<=12&&a.mesh.position.distanceTo(origin)<=passRange&&a.mesh.position.distanceTo(origin)>3)
  .sort((a,b)=>score(b)-score(a))[0]||null;
}
function passQuaffle(kind='short'){
 if(match.state!=='playing'||match.paused)return false;
 if(carrier!=='player')return canBufferTeamAction()?bufferTeamAction('pass',kind):false;
 const receiver=getPassReceiver();if(!receiver){notify('队友正在跑位 · 改变方向寻找接应',1.5);return false;}
 passBetween('player',receiver,kind);notify(kind==='through'?'直塞空当 · 接球后自动操控':'短传出球 · 接球后自动操控',1.3);matchAudio.play('pass');return true;
}

const celebrationLabels={fist:'挥拳庆祝',glide:'滑翔庆祝',team:'全队庆祝'};
function celebrationActor(mesh){
 const model=mesh.userData.modelRoot;
 return {mesh,position:mesh.position.clone(),rotation:mesh.rotation.clone(),model:model?{root:model,position:model.position.clone(),rotation:model.rotation.clone()}:null};
}
function restoreCelebrationActor(actor){
 actor.mesh.position.copy(actor.position);actor.mesh.rotation.copy(actor.rotation);
 if(actor.model){actor.model.root.position.copy(actor.model.position);actor.model.root.rotation.copy(actor.model.rotation);}
 const rig=actor.mesh.userData.rig;if(rig){rig.arm.rotation.set(0,0,0);rig.head.rotation.x=0;rig.head.rotation.z=0;rig.body.rotation.x=0;rig.body.rotation.z=0;}
}
function clearGoalCelebration(){
 if(match.celebration)for(const actor of match.celebration.actors)restoreCelebrationActor(actor);
 clearSparks();
 match.celebration=null;$('goalCelebration').classList.add('hidden');$('hud').classList.remove('celebrating');
}
function selectCelebration(style,restart=true){
 const celebration=match.celebration;if(!celebration||!celebrationLabels[style])return false;
 celebration.selected=style;if(restart){celebration.elapsed=0;celebration.duration=4.2;playCrowdCheer(.55);}
 for(const button of document.querySelectorAll('[data-celebration]'))button.setAttribute('aria-pressed',String(button.dataset.celebration===style));
 $('celebrationChoice').textContent=celebrationLabels[style]+' · 空格跳过';return true;
}
function beginGoalCelebration(scoredShot){
 if(!scoredShot?.owner)return;
 const scorer=scoredShot.owner,candidates=[scorer,player.mesh,...allies.filter(a=>a.role==='chaser').map(a=>a.mesh)],actors=[];
 for(const mesh of candidates)if(mesh&&!actors.some(actor=>actor.mesh===mesh)&&actors.length<3)actors.push(celebrationActor(mesh));
 const reason=scoredShot.oneTouch?'一脚破门':scoredShot.distance>=24?Math.round(scoredShot.distance)+' 米远射':'满蓄力劲射';
 match.celebration={selected:'fist',elapsed:0,duration:5.5,scorer,reason,actors};
 $('celebrationReason').textContent=reason+' · 精彩进球';$('goalCelebration').classList.remove('hidden');$('hud').classList.add('celebrating');selectCelebration('fist',false);
 notify('漂亮！选择庆祝动作，或按空格跳过',4);
}
function endGoalCelebration(){
 if(!match.celebration)return false;clearGoalCelebration();match.kickoff=2;match.pendingRestart='rival';notify('庆祝结束 · 对方开球',1.5);return true;
}
function updateGoalCelebration(dt){
 const celebration=match.celebration;if(!celebration)return;celebration.elapsed+=dt;
 const t=celebration.elapsed,reduced=settings.reducedMotion;
 celebration.actors.forEach((actor,index)=>{
  restoreCelebrationActor(actor);const mesh=actor.mesh,model=actor.model?.root,rig=mesh.userData.rig,main=index===0;
  if(main&&celebration.selected==='glide'){
   // Quidditch victory lap: a banked arc around the scoring end, facing the tangent.
   if(!reduced){
    const a=t*1.05,r=8.5;
    mesh.position.set(actor.position.x+Math.sin(a)*r,clamp(actor.position.y+Math.sin(t*.9)*1.6,7,24),actor.position.z+Math.cos(a)*r-r);
    mesh.rotation.y=Math.atan2(-Math.cos(a),Math.sin(a));mesh.rotation.z=.34;mesh.rotation.x=-.06;
    if(Math.random()<.55)spawnSparks(mesh.position.clone().add(V(0,.4,1.2)),2,.5);
   }
   if(model){model.rotation.x-=.28;model.rotation.z-=.1;}
   if(rig){rig.arm.rotation.x=-.5;rig.head.rotation.x=-.1;}
  }else if(celebration.selected==='team'){
   if(main){
    if(!reduced)mesh.position.y+=Math.sin(t*3)*.12;
    if(model){model.rotation.z-=.18;model.rotation.x-=.08;}
    if(rig){rig.arm.rotation.x=-1.9;rig.head.rotation.x=-.18;}
    if(!reduced&&t>1.45&&t<1.62)spawnSparks(mesh.position.clone().add(V(0,1.7,0)),26,1.4);
   }else{
    // Teammates sweep in on curved paths and form a broom-raised ring around the scorer.
    const angle=(index===1?-1:1)*2.2+Math.PI/2,target=celebration.actors[0].position.clone().add(V(Math.sin(angle)*2.6,0,Math.cos(angle)*2.6));
    if(!reduced){
     const p=clamp(t/1.4,0,1),ease=1-Math.pow(1-p,3),mid=actor.position.clone().lerp(target,.5).add(V((index===1?-1:1)*3.2,2.2,0));
     mesh.position.copy(actor.position.clone().lerp(mid,ease).lerp(mid.clone().lerp(target,ease),ease));
     mesh.rotation.y=Math.atan2(-(target.x-mesh.position.x),-(target.z-mesh.position.z));
     if(p>=1){mesh.position.y+=Math.sin(t*4+index)*.1;mesh.rotation.z=(index===1?1:-1)*.14;}
    }
    if(model){model.rotation.z+=(index===1?.2:-.2);model.rotation.x-=.1;}
    if(rig)rig.arm.rotation.x=-1.7+(reduced?0:Math.sin(t*5+index)*.12);
   }
  }else{
   if(main){
    // One hand on the broom, rhythmic fist pump, head up to the crowd.
    if(!reduced){mesh.position.y+=Math.abs(Math.sin(t*4.2))*.22;mesh.rotation.y+=Math.sin(t*1.6)*.12;if(Math.random()<.35)spawnSparks(mesh.position.clone().add(V(.5,1.7,0)),2,.6);}
    if(model){model.rotation.z-=.2;model.rotation.x-=.1;}
    if(rig){const pump=Math.max(0,Math.sin(t*6));rig.arm.rotation.x=-.7-pump*1.1;rig.arm.rotation.z=-.25;rig.head.rotation.x=-.22;}
   }else{
    if(!reduced){mesh.position.y+=Math.abs(Math.sin(t*4.2+index))*.14;mesh.rotation.y+=Math.sin(t*2+index)*.15;}
    if(rig)rig.arm.rotation.x=-.4+(reduced?0:Math.sin(t*7+index)*.3);
   }
  }
 });
 updateSparks(dt);
 $('celebrationTimer').textContent=Math.max(0,Math.ceil(celebration.duration-celebration.elapsed))+'s';
 if(celebration.elapsed>=celebration.duration)endGoalCelebration();
}
let sparkSystem=null;const sparkData=[];
function ensureSparks(){
 if(sparkSystem)return sparkSystem;
 const max=240,geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(max*3),3));
 const mat=new THREE.PointsMaterial({color:0xffd98a,size:.32,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
 sparkSystem=new THREE.Points(geo,mat);sparkSystem.frustumCulled=false;scene.add(sparkSystem);
 for(let i=0;i<max;i++)sparkData.push({life:0,vel:V(),pos:V(0,-999,0)});
 return sparkSystem;
}
function spawnSparks(origin,count,power=1){
 ensureSparks();let spawned=0;
 for(const s of sparkData){if(s.life>0)continue;s.life=.5+Math.random()*.5;s.pos.copy(origin).add(V((Math.random()-.5)*.6,(Math.random()-.5)*.6,(Math.random()-.5)*.6));s.vel.set((Math.random()-.5)*4*power,(Math.random()*3+1)*power,(Math.random()-.5)*4*power);if(++spawned>=count)break;}
}
function updateSparks(dt){
 if(!sparkSystem)return;const attr=sparkSystem.geometry.attributes.position;let any=false;
 sparkData.forEach((s,i)=>{if(s.life>0){s.life-=dt;s.vel.y-=4*dt;s.pos.addScaledVector(s.vel,dt);any=true;}attr.setXYZ(i,s.pos.x,s.pos.y,s.pos.z);});
 sparkSystem.material.opacity=any?.95:0;attr.needsUpdate=true;
}
function clearSparks(){for(const s of sparkData){s.life=0;s.pos.set(0,-999,0);}if(sparkSystem){sparkSystem.material.opacity=0;sparkSystem.geometry.attributes.position.needsUpdate=true;}}
function scoreGoal(side){
 if(match.state!=='playing')return;
 const scoredShot=shot,beautiful=side==='player'&&scoredShot?.celebrationEligible&&(scoredShot.oneTouch||scoredShot.distance>=24||scoredShot.charge>=.8);
 if(side==='player'){match.playerScore++;match.stats.goals++;}else match.rivalScore++;
 notify(beautiful?'精彩进球！':(side==='player'?'我方':'对方')+'进球',2);matchAudio.play('goal',side==='player'?1:.65);playCrowdCheer(side==='player'?1:.4);
 const house=Math.max(0,houses.findIndex(h=>h.id===(side==='player'?match.homeHouse:match.awayHouse)));crowd?.celebrate({house,duration:beautiful?7:3});
 resetQuaffle();match.kickoff=2;match.pendingRestart=side==='player'?'rival':'home';player.vel.set(0,0,0);announceClip('goal-'+side,'goal-'+(side==='player'?match.homeHouse:match.awayHouse),4,0);
 if(beautiful){match.kickoff=0;beginGoalCelebration(scoredShot);}
}
function constrainPitch(position,low,high){
 position.y=clamp(position.y,low,high);
 const boundary=(position.x/54)**2+(position.z/73)**2;
 if(boundary<=1)return null;
 const scale=1/Math.sqrt(boundary);
 position.x*=scale;
 position.z*=scale;
 return V(position.x/(54*54),0,position.z/(73*73)).normalize();
}
function keeperTarget(goals,side){
 const sign=Math.sign(goals[0].z),z=sign*53;
 const projected=shot?.side===side&&shot.age>.15?positionOnGoalPlane(quaffle.position,quaffleVel,z):null;
 const focus=projected||quaffle.position;
 return V(clamp(focus.x,projected?-14:-6,projected?14:6),clamp(focus.y,7,16),z);
}
function rivalTarget(r){
 if(r.role==='keeper')return keeperTarget(awayGoals,'player');if(match.kickoff>0||match.elapsed<2)return V(r.index*22-16,10,-32);if(carrier===r)return closestGoal(homeGoals,r.mesh.position);
 if(rivals.includes(carrier))return carrier.mesh.position.clone().add(V(r.index===0?-14:14,0,12));
 if(carrier==='player'||allies.includes(carrier)){
  const holder=carrier==='player'?player.pos:carrier.mesh.position;if(r.index===0)return holder;
  const marks=allies.filter(a=>a.role==='chaser'&&a.mesh.visible&&a.stun<=0);if(!marks.length)return holder.clone().add(V(r.index===1?-10:10,0,8));
  const mark=marks[(r.index-1)%marks.length];return mark.mesh.position.clone().lerp(holder,.28).add(V(r.index===1?-3:3,0,2));
 }
 return quaffle.position.clone().sub(V(0,1.15,0));
}
function updatePlayer(dt){
 const movement=window.BroomControls.movement(keys),input=V(movement.x,0,movement.z),pressing=match.primaryAction==='defend'&&keys.KeyF&&rivals.includes(carrier),pressTarget=pressing?getPressTarget(carrier):null;
 if(pressing){input.copy(pressTarget).sub(player.pos);input.y=0;}
 if(match.kickoff>0)input.set(0,0,0);const moving=input.lengthSq()>.001;if(moving)input.normalize();
 const manualSprint=!!(keys.ShiftLeft||keys.ShiftRight),autoPressSprint=pressing&&match.kickoff<=0&&!player.exhausted;
 player.boosting=moving&&!player.exhausted&&(manualSprint||autoPressSprint);player.stamina=clamp(player.stamina+(player.boosting?(autoPressSprint&&!manualSprint?-17:match.mode==='rookie'?-20:-25):21)*dt,0,100);if(player.stamina===0)player.exhausted=true;if(player.stamina>=22)player.exhausted=false;
 // Flight steering: accelerate along the heading, arc through turns and glide to a
 // stop instead of snapping velocity, so the rider feels flown rather than dragged.
 const cruise=player.boosting?(match.mode==='challenge'?42:match.mode==='rookie'?30:32):player.baseSpeed;
 const accel=match.mode==='challenge'?55:match.mode==='rookie'?50:46,coast=32,brake=78;
 const current=V(player.vel.x,0,player.vel.z),curSpeed=current.length();let next;
 if(!moving){const s=Math.max(0,curSpeed-coast*dt);next=curSpeed>.001?current.multiplyScalar(s/curSpeed):V();}
 else if(curSpeed<.6){next=input.clone().multiplyScalar(Math.min(cruise,curSpeed+accel*dt));}
 else{
  const dir=current.clone().divideScalar(curSpeed),alignment=clamp(dir.dot(input),-1,1);
  if(alignment<-.35){
   // A reversal brakes first and swings the heading around, never strafes backwards.
   const s=Math.max(0,curSpeed-brake*dt),axis=dir.clone().cross(input);if(axis.lengthSq()<1e-8)axis.set(0,1,0);
   dir.applyAxisAngle(axis.normalize(),Math.min(Math.acos(alignment),2.4*dt));next=dir.multiplyScalar(s);
  }else{
   const angle=Math.acos(alignment),rate=lerp(3.6,2.0,clamp(curSpeed/42,0,1)),axis=dir.clone().cross(input);
   if(axis.lengthSq()>1e-8)dir.applyAxisAngle(axis.normalize(),Math.min(angle,rate*dt));
   next=dir.multiplyScalar(moveToward(curSpeed,cruise*(alignment>.86?1:.94),accel*dt));
  }
 }
 player.vel.x=next.x;player.vel.z=next.z;
 const chasingOpponentPass=!carrier&&passTarget&&rivals.includes(passSender),trackingLoose=!carrier&&!shot&&(!passTarget||chasingOpponentPass),defending=!pressing&&rivals.includes(carrier);
 const altitudeTarget=pressing?pressTarget.y:trackingLoose?clamp(quaffle.position.y+quaffleVel.y*.16-1.15,.8,30):defending?clamp(carrier.mesh.position.y,.8,30):player.pos.y;
 const verticalLimit=trackingLoose?11.5:pressing?14:defending?9:6;
 const height=clamp((altitudeTarget-player.pos.y)*(trackingLoose?2.8:defending?2.2:2),-verticalLimit,verticalLimit);player.vel.y=moveToward(player.vel.y,height,(trackingLoose||pressing?70:defending?60:45)*dt);
 player.previousPos.copy(player.pos);player.pos.addScaledVector(player.vel,dt);const normal=constrainPitch(player.pos,.8,36);if(normal){const outward=player.vel.dot(normal);if(outward>0)player.vel.addScaledVector(normal,-outward);}
 if(moving){targetYaw=Math.atan2(-input.x,-input.z);targetPitch=0;}updateAim(dt);player.speed=Math.hypot(player.vel.x,player.vel.z);
 const modelYaw=player.speed>2?Math.atan2(-player.vel.x,-player.vel.z):moving?targetYaw:cameraYaw;player.mesh.rotation.y+=angleDelta(player.mesh.rotation.y,modelYaw)*Math.min(1,dt*12);player.mesh.rotation.z=lerp(player.mesh.rotation.z,settings.reducedMotion?0:clamp(-player.vel.x*.006,-.16,.16),1-Math.exp(-dt*8));player.mesh.rotation.x=lerp(player.mesh.rotation.x,0,1-Math.exp(-dt*6));animateWizard(player.mesh,dt,player.speed,match.elapsed);
}
const cameraFraming={distance:30,targets:[],mode:'broadcast',phase:'loose',subject:'ball',focus:[0,10,0],elevation:31};
const broadcastFocus=V(0,11.4,0);
function getBallFocus(){
 const owner=carrier==='player'?player:carrier;
 return {owner,position:(owner?(owner===player?player.pos:owner.mesh.position):quaffle.position).clone(),phase:carrier==='player'||allies.includes(carrier)?'attack':rivals.includes(carrier)?'defend':passTarget?'pass':shot?'shot':'loose'};
}
function getMatchFocus(){
 if(match.celebration)return {owner:null,position:match.celebration.scorer.position.clone(),velocity:V(),phase:'celebration',subject:match.celebration.scorer.uuid};
 return {owner:player,position:player.pos.clone(),velocity:player.vel,phase:getBallFocus().phase,subject:player.mesh.uuid};
}
function getTacticalTargets(){
 const out=[player.pos.clone().add(V(0,1.2,0))];
 for(const ally of allies)if(ally.role==='chaser'&&ally.mesh.visible&&ally.stun<=0&&ally.mesh.position.distanceTo(player.pos)<=passRange)out.push(ally.mesh.position.clone().add(V(0,1.4,0)));
 if(quaffle.position.distanceTo(player.pos)<26)out.push(quaffle.position.clone());
 return out;
}
function updateCamera(dt){
 if(match.state==='menu'){camera.position.lerp(V(63,31,86),1-Math.exp(-dt*2));camera.lookAt(0,11,-6);return;}if(match.paused)return;
 if(match.state==='entrance'&&match.entrance){
  const entrance=match.entrance,t=clamp(entrance.elapsed/entrance.duration,0,1),ease=t*t*(3-2*t),focus=V(0,11,lerp(36,0,ease)),desired=V(lerp(38,26,ease),lerp(18,29,ease),lerp(70,48,ease));
  camera.position.lerp(desired,1-Math.exp(-dt*3.2));broadcastFocus.lerp(focus,1-Math.exp(-dt*4));camera.lookAt(broadcastFocus);camera.fov=lerp(camera.fov,47,1-Math.exp(-dt*4));camera.updateProjectionMatrix();Object.assign(cameraFraming,{targets:entrance.actors.map(actor=>actor.unit.mesh.position.toArray()),mode:'entrance',phase:'entrance',subject:'teams',focus:broadcastFocus.toArray(),distance:camera.position.distanceTo(broadcastFocus)});return;
 }
 if(match.celebration){
  const celebration=match.celebration,focus=celebration.scorer.position.clone().add(V(0,1.1,0)),team=celebration.selected==='team',side=celebration.scorer.position.x>0?-1:1;
  const desired=focus.clone().add(V(side*(team?12:8.5),team?5.2:3.8,team?14:10.5));camera.position.lerp(desired,1-Math.exp(-dt*4.5));broadcastFocus.lerp(focus,1-Math.exp(-dt*7));camera.lookAt(broadcastFocus);camera.fov=lerp(camera.fov,team?46:42,1-Math.exp(-dt*5));camera.updateProjectionMatrix();
  Object.assign(cameraFraming,{targets:celebration.actors.map(actor=>actor.mesh.position.toArray()),mode:'celebration',phase:'celebration',subject:celebration.scorer.uuid,focus:broadcastFocus.toArray(),distance:camera.position.distanceTo(broadcastFocus)});return;
 }
 const activity=getMatchFocus(),points=getTacticalTargets(),desired=activity.position.clone().add(V(0,1.2,0)),lead=player.vel.clone().multiplyScalar(.07).clampLength(0,1.6);desired.add(lead);
 broadcastFocus.lerp(desired,1-Math.exp(-dt*7));const direction=V(0,.40,.917).normalize(),right=V(1,0,0),screenUp=direction.clone().cross(right),tan=Math.tan(THREE.MathUtils.degToRad(50)/2);let distance=24;
 for(const p of points){const d=p.clone().sub(desired);distance=Math.max(distance,d.dot(direction)+Math.max((Math.abs(d.x)+2.5)/(tan*camera.aspect*.84),(Math.abs(d.dot(screenUp))+2)/(tan*.72)));}distance=clamp(distance,24,46);
 cameraFraming.distance=lerp(cameraFraming.distance,distance,1-Math.exp(-dt*5));Object.assign(cameraFraming,{targets:points.map(p=>p.toArray()),mode:'broadcast',phase:activity.phase,subject:player.mesh.uuid,focus:broadcastFocus.toArray()});camera.position.copy(broadcastFocus).addScaledVector(direction,cameraFraming.distance);camera.lookAt(broadcastFocus);camera.fov=50;camera.updateProjectionMatrix();
}

function resetAIFlight(unit){
 unit.previousPos=unit.mesh.position.clone();unit.flightDirection=V(0,0,-1).applyEuler(unit.mesh.rotation).normalize();
 unit.flightSpeed=0;
}
function flyAI(unit,target,speed,dt){
 if(!unit.flightDirection)resetAIFlight(unit);
 const before=unit.mesh.position.clone();unit.previousPos=before.clone();
 speed*=unit.mesh.userData.broomMultiplier||1;
 const destination=target.clone();
 constrainPitch(destination,.8,36);
 const delta=destination.sub(unit.mesh.position),distance=delta.length();
 // A hit stops flight immediately, including any acceleration saved before the hit.
 if(unit.stun>0||speed<=0||distance<=.4){
  unit.flightSpeed=0;unit.velocity=V();
  unit.mesh.rotation.z=lerp(unit.mesh.rotation.z,0,1-Math.exp(-dt*5));
  animateWizard(unit.mesh,dt,0,match.elapsed+unit.index);
  return;
 }
 const desired=delta.divideScalar(distance),direction=unit.flightDirection;
 const dot=clamp(direction.dot(desired),-1,1),angle=Math.acos(dot);
 const turnRate=match.mode==='challenge'?1.5:match.mode==='rookie'?.95:1.15;
 if(angle>1e-6){
  const axis=direction.clone().cross(desired);
  // Opposite headings have no unique cross product; choose a stable turning side.
  if(axis.lengthSq()<1e-10){axis.copy(UP).addScaledVector(direction,-direction.y);if(axis.lengthSq()<1e-10)axis.set(1,0,0);}
  direction.applyAxisAngle(axis.normalize(),Math.min(angle,turnRate*dt)).normalize();
 }
 // Brake into a bend and on arrival. The actual path follows the same bounded
 // heading as the rider, instead of changing course instantly under a turning model.
 const desiredSpeed=Math.min(speed*Math.max(0,dot)**2,distance*2.5,Math.sqrt(36*distance));
 unit.flightSpeed=moveToward(unit.flightSpeed,desiredSpeed,(desiredSpeed<unit.flightSpeed?30:18)*dt);
 unit.mesh.position.addScaledVector(direction,Math.min(distance,unit.flightSpeed*dt));
 const boundary=constrainPitch(unit.mesh.position,.8,36);
 if(boundary||unit.mesh.position.y<=.8&&direction.y<0||unit.mesh.position.y>=38&&direction.y>0)unit.flightSpeed=0;
 const yaw=Math.atan2(-direction.x,-direction.z),targetYaw=Math.atan2(-desired.x,-desired.z);
 unit.mesh.rotation.y=yaw;
 unit.mesh.rotation.x=Math.atan2(direction.y,Math.hypot(direction.x,direction.z))*.45;
 const bank=settings.reducedMotion?0:clamp(angleDelta(yaw,targetYaw)*.3,-.35,.35);
 unit.mesh.rotation.z=lerp(unit.mesh.rotation.z,bank,1-Math.exp(-dt*5));
 unit.velocity=unit.mesh.position.clone().sub(before).divideScalar(Math.max(dt,.001));
 animateWizard(unit.mesh,dt,unit.flightSpeed,match.elapsed+unit.index);
}
function updateRivals(dt){
 for(const r of rivals){
  r.stun=Math.max(0,r.stun-dt);
  if(r.stun>0){flyAI(r,r.mesh.position,0,dt);continue;}
  const speed=(r.speed+(carrier===r?2:0))*match.rules.rivalSpeed;
  if(match.kickoff>0)continue;
  flyAI(r,passTarget===r&&passReceivePosition?passReceivePosition:rivalTarget(r),speed,dt);
  if(carrier===r&&match.stealCooldown<=0&&player.pos.distanceTo(r.mesh.position)<8){
   const teammate=rivals.find(a=>a!==r&&a.role==='chaser'&&a.stun<=0&&a.mesh.position.distanceTo(r.mesh.position)<35);
   if(teammate){passBetween(r,teammate);match.stealCooldown=.8;}
  }
  if(r.role==='chaser'&&carrier===r&&r.mesh.position.distanceTo(closestGoal(homeGoals,r.mesh.position))<25){
   teamThrow(r,homeGoals,'rival',match.rules.rivalShotSpeed);
  }
 }
}
function updateAllies(dt){
 if(match.kickoff>0)return;const keeper=allies.find(a=>a.role==='keeper'),field=allies.filter(a=>a.role!=='keeper'),presser=rivals.includes(carrier)&&field.length?field.reduce((best,a)=>a.mesh.position.distanceToSquared(carrier.mesh.position)<best.mesh.position.distanceToSquared(carrier.mesh.position)?a:best):null;
 for(const ally of field){ally.stun=Math.max(0,ally.stun-dt);if(ally.stun>0)continue;let target;const lane=ally.index===0?1:-1;
  if(carrier===ally)target=closestGoal(awayGoals,ally.mesh.position).clone().add(V(0,0,10));
  else if(passTarget===ally)target=passReceivePosition||quaffle.position;
  else if(rivals.includes(carrier)){
   if(ally===presser)target=getPressTarget(carrier).add(V(lane*.65,0,.35));
   else target=carrier.mesh.position.clone().lerp(closestGoal(homeGoals,carrier.mesh.position),.32).add(V(lane*10,0,0));
  }
  else if(!carrier&&!shot&&!passTarget)target=quaffle.position.clone().sub(V(0,1.15,0));
  else{
   const base=carrier==='player'?player.pos:allies.includes(carrier)?carrier.mesh.position:player.pos;
   target=V(clamp(base.x+lane*18,-38,38),clamp(base.y+(lane>0?1.2:-.8),5,28),clamp(base.z-(lane>0?15:10),-48,43));
   const marker=rivals.filter(r=>r.role==='chaser'&&r.stun<=0).sort((a,b)=>a.mesh.position.distanceToSquared(target)-b.mesh.position.distanceToSquared(target))[0];
   if(marker&&marker.mesh.position.distanceTo(target)<9){target.x=clamp(target.x+lane*5,-40,40);target.z=clamp(target.z+3,-48,43);}
   if(match.charging&&carrier==='player')target.z=Math.min(target.z,-34);
  }
  const pressingAlly=ally===presser&&rivals.includes(carrier);
  flyAI(ally,target,ally.speed*(pressingAlly?(match.mode==='challenge'?1.18:match.mode==='rookie'?1.08:1.02):(match.mode==='challenge'?1:.88)),dt);
 }
 if(keeper){keeper.stun=Math.max(0,keeper.stun-dt);if(keeper.stun<=0)flyAI(keeper,keeperTarget(homeGoals,'rival'),keeper.speed,dt);}
}

function segmentDistanceSq(point,from,to){
 const edge=to.clone().sub(from),length=edge.lengthSq();
 const t=length>0?clamp(point.clone().sub(from).dot(edge)/length,0,1):0;
 return point.distanceToSquared(from.clone().addScaledVector(edge,t));
}
function segmentSphereTime(point,from,to,radius){
 const offset=from.clone().sub(point),edge=to.clone().sub(from);
 const c=offset.lengthSq()-radius*radius;
 if(c<=0)return 0;
 const a=edge.lengthSq(),b=offset.dot(edge),discriminant=b*b-a*c;
 if(a===0||b>=0||discriminant<0)return null;
 const t=(-b-Math.sqrt(discriminant))/a;
 return t<=1?t:null;
}
function contactPreviousPosition(unit,dt){
 const current=unit===player?player.pos:unit.mesh.position,previous=unit.previousPos;
 const speed=unit===player?player.speed:Math.max(unit.flightSpeed||0,unit.velocity?.length()||0);
 return previous&&previous.distanceTo(current)<=Math.max(3,speed*dt+1)?previous:current;
}
function riderBallContactTime(target,from,to,dt){
 const unit=target==='player'?player:target,body=unit.mesh,current=unit===player?player.pos:body.position,previous=contactPreviousPosition(unit,dt);
 const start=from.clone().sub(previous),end=to.clone().sub(current);
 const probes=[{point:V(0,1,0),radius:contactRules.bodyRadius},{point:carryPosition(body).sub(current),radius:contactRules.handRadius},{point:V(0,.4,-1.6).applyQuaternion(body.quaternion),radius:contactRules.broomFrontRadius},{point:V(0,.4,1.9).applyQuaternion(body.quaternion),radius:contactRules.broomRearRadius}];
 let first=null;for(const probe of probes){const t=segmentSphereTime(probe.point,start,end,probe.radius);if(t!==null&&(first===null||t<first))first=t;}return first;
}
function riderChallengeContact(target,dt,radius){
 const start=contactPreviousPosition(player,dt).clone().sub(contactPreviousPosition(target,dt)),end=player.pos.clone().sub(target.mesh.position);
 return segmentSphereTime(V(),start,end,radius)!==null;
}
function catchLooseBall(from,crossing,dt){
 let first=null;
 const addContact=(target,type,t)=>{if(t!==null&&t<=(crossing?.scored?crossing.t:1)&&(!first||t<first.t))first={target,type,t};};
 const considerRider=(target,type)=>addContact(target,type,riderBallContactTime(target,from,quaffle.position,dt));
 const considerKeeper=(target,point,radius)=>{const unit=target==='player'?player:target,current=unit===player?player.pos:unit.mesh.position,previous=contactPreviousPosition(unit,dt);addContact(target,'keeper',segmentSphereTime(point.clone().sub(current),from.clone().sub(previous),quaffle.position.clone().sub(current),radius));};
 if(passTarget){
  if(passTarget==='player'||passTarget.stun<=0)considerRider(passTarget,'pass');
  for(const unit of ['player',...rivals,...allies]){if(unit===passSender||unit===passTarget)continue;if(unit==='player'||unit.stun<=0)considerRider(unit,'intercept');}
 }else if(pickupDelay<=0){
  considerRider('player','pickup');for(const unit of [...rivals,...allies])if(unit.role==='chaser'&&unit.stun<=0)considerRider(unit,'pickup');
 }
 if(Math.abs(quaffleVel.z)>.001){
  const attacking=quaffleVel.z<0,keeper=attacking?rivals[2]:homeKeeper();
  if(keeper&&keeper.stun<=0&&(keeper===player?'player':keeper)!==passSender&&(keeper===player?'player':keeper)!==passTarget)considerKeeper(keeper===player?'player':keeper,keeper.mesh.position.clone().add(V(0,.85,0)),attacking&&match.mode==='standard'?1.75:2.05);
 }
 if(!first)return false;
 const {target,type,t}=first;
 if(type==='keeper'&&target===rivals[2]){
  quaffle.position.lerpVectors(from,quaffle.position,t);
  passTarget=null;
  passSender=null;passDestination=null;passReceivePosition=null;passFlight=null;
  quaffleVel.set((Math.random()-.5)*15,5,18);
  pickupDelay=.18;
  notify('鹰队守门员扑出了鬼飞球',1.7);
 }else{
  const completed=type==='pass'&&(passSender==='player'||allies.includes(passSender));
  const reception=from.clone().lerp(quaffle.position,t);setCarrier(target,reception);const continued=!!passTarget||!!shot;
  if(completed)match.stats.completedPasses++;
  if(type==='pass'||carrier==='player'){
   const protection=match.mode==='challenge'?.65:contactRules.protection;
   match.stealCooldown=Math.max(match.stealCooldown,protection);
  }


  if(!continued)notify(type==='pass'?(target==='player'?'接到队友传球 · F 射门':'接应队友接球'):
   target==='player'?'拿到鬼飞球 · 瞄准蓝色门环':
   type==='keeper'?'狮队守门员接住了鬼飞球':target===allies[0]?'狮队接应手拿球':'鹰队拿到鬼飞球',1.7);
 }
 return true;
}
function endShot(){
 if(shot?.recordMiss){
  notify('射门偏出 · 争抢鬼飞球',1.7);

 }
 shot=null;
}
function updateShot(from,dt){
 shot.age+=dt;
 const attacking=quaffleVel.z<0,crossing=goalCrossing(from,quaffle.position);
 const endpoint=crossing?.point||quaffle.position;
 const keeper=attacking?rivals[2]:homeKeeper();
 const saveRadius=attacking?match.rules.keeperSaveRadius:2.05;
 if(shot.side==='rival'&&player.mesh!==shot.owner&&(segmentDistanceSq(player.pos.clone().add(V(0,.85,0)),from,endpoint)<=2.15**2||riderBallContactTime('player',from,endpoint,dt)!==null)){
  setCarrier('player');
  match.stealCooldown=Math.max(match.stealCooldown,1);
  notify('截住鹰队射门 · F 射门或 E 短传',1.7);
  return true;
 }
 if(keeper&&keeper.mesh!==shot.owner&&keeper.stun<=0&&segmentDistanceSq(keeper.mesh.position.clone().add(V(0,.85,0)),from,endpoint)<=saveRadius**2){
  if(attacking){
   shot=null;
   quaffleVel.set((Math.random()-.5)*15,5,18);
   pickupDelay=.18;
   notify('鹰队守门员扑出了射门',1.7);
  }else{
   setCarrier(keeper===player?'player':keeper);
   notify('狮队守门员接住了射门',1.7);
  }
  return true;
 }
 if(crossing?.scored){
  scoreGoal(crossing.side);
  return true;
 }
 // A slow or distant shot stays a shot until it crosses the end line, hits a
 // boundary or is saved; a fixed lifetime incorrectly expires before the goal.
 if(crossing)endShot();
}
function updatePass(dt){
 passAge+=dt;
 if(passAge>(passFlight?.duration??(passTarget==='player'?4:2.6))+.04){
  passTarget=null;
  passSender=null;
  passDestination=null;passReceivePosition=null;
  passFlight=null;
  actionBuffer=null;if(match.primaryAction==='bufferedShot')match.primaryAction=null;
  notify('传球落空 · 争抢鬼飞球',1.4);
 }
}
function updateQuaffle(dt){
 previousBallPosition.copy(quaffle.position);
 if(carrier){
  const owner=carrier==='player'?player.mesh:carrier.mesh;
  const hand=carryPosition(owner);if(ballGather&&ballGather.owner===owner){ballGather.age+=dt;const t=clamp(ballGather.age/ballGather.duration,0,1),ease=t*t*(3-2*t);quaffle.position.lerpVectors(ballGather.from,hand,ease);if(t>=1)ballGather=null;}else quaffle.position.lerp(hand,1-Math.exp(-dt*22));
  quaffle.rotation.y+=dt*2;
  return;
 }
 if(match.kickoff>0)return;

 if(!passTarget&&!shot&&quaffleVel.lengthSq()>.005){
  quaffleVel.y-=7.5*dt;
 }
 const from=quaffle.position.clone();
 if(passFlight&&passTarget){quaffle.position.copy(passFlight.positionAt(passAge+dt));quaffleVel.copy(passFlight.velocityAt(passAge+dt));}
 else quaffle.position.addScaledVector(quaffleVel,dt);
 quaffle.rotation.x+=quaffleVel.length()*dt*.12;
 if(shot){
  if(updateShot(from,dt))return;
 }else{
  const crossing=goalCrossing(from,quaffle.position);
  // Resolve the earliest catch or save before the ball reaches the scoring plane.
  if(catchLooseBall(from,crossing,dt))return;
  if(crossing?.scored){scoreGoal(crossing.side);return;}
  if(passTarget)updatePass(dt);
 }
 if(carrier)return;
 // A slow loose ball near the rider eases into the hand instead of requiring a
 // pixel-perfect intercept; distant balls are never pulled (no long-range magnet).
 if(!shot&&!passTarget&&pickupDelay<=0){
  const hand=carryPosition(player.mesh),gap=hand.distanceTo(quaffle.position),ballSpeed=quaffleVel.length();
  if(gap<3.1&&ballSpeed<12){const pull=clamp((3.1-gap)/3.1,0,1)*clamp((12-ballSpeed)/12,0,1),want=hand.clone().sub(quaffle.position).normalize().multiplyScalar(Math.max(ballSpeed,6));quaffleVel.lerp(want,clamp(pull*6*dt,0,1));}
 }
 const groundY=quaffleRadius+.06;
 const low=quaffle.position.y<=groundY+.001,high=quaffle.position.y>=39;
 const normal=constrainPitch(quaffle.position,groundY,39);
 if(normal){
  const outward=quaffleVel.dot(normal);
  if(outward>0)quaffleVel.addScaledVector(normal,-1.6*outward);
  quaffleVel.multiplyScalar(.97);
 }
 if(low&&quaffleVel.y<0){
  quaffleVel.y=Math.abs(quaffleVel.y)*.45;
  quaffleVel.x*=.82;
  quaffleVel.z*=.82;
  if(quaffleVel.y<1)quaffleVel.y=0;
 }
 if(low&&quaffleVel.y===0){
  // Rolling friction brings a grounded ball to rest on the grass, not hovering.
  const roll=Math.max(0,1-1.7*dt);quaffleVel.x*=roll;quaffleVel.z*=roll;
  if(quaffleVel.lengthSq()<.04)quaffleVel.set(0,0,0);
 }
 if(high&&quaffleVel.y>0)quaffleVel.y*=-.5;
 if((normal||low||high)&&shot)endShot();
}
function stealContact(winnerMesh,loser){
 winnerMesh.userData.swipeTime=.45;
 const loserMesh=loser==='player'?player.mesh:loser?.mesh;
 if(loserMesh)loserMesh.userData.stumbleTime=.6;
 if(loser==='player')player.vel.multiplyScalar(.6);else if(loser)loser.flightSpeed=(loser.flightSpeed||0)*.5;
}
function updateSteals(dt=1/60){
 if(match.stealCooldown>0||!carrier)return;
 if(carrier==='player'||allies.includes(carrier)){
  if((carrier==='player'?player:carrier).role==='keeper')return;
  const position=carrier==='player'?player.pos:carrier.mesh.position,stealRadius=match.rules.rivalStealRadius,defender=rivals.find(r=>r.role==='chaser'&&r.stun<=0&&r.mesh.position.distanceTo(position)<stealRadius);
  if(defender){setCarrier(defender,quaffle.position.clone());stealContact(defender.mesh,carrier);match.stealCooldown=match.mode==='rookie'?1.2:match.mode==='challenge'?.65:.9;notify('对方夺球 · 已自动切换防守队员',1.5);}return;
 }
 const touchingBall=riderBallContactTime('player',previousBallPosition,quaffle.position,dt)!==null;
 const pressing=match.primaryAction==='defend'&&keys.KeyF,sprinting=player.boosting;
 const challenging=(pressing||sprinting)&&riderChallengeContact(carrier,dt,pressing?contactRules.pressRadius:contactRules.sprintRadius);
 if(touchingBall||challenging){setCarrier('player',quaffle.position.clone());stealContact(player.mesh,carrier);match.stealCooldown=contactRules.protection;match.stats.steals++;kickBallFeedback(.3);matchAudio.play('catch');notify('抢断成功 · E 传球 / F 射门',1.5);return;}
 const defender=allies.find(a=>a.role==='chaser'&&a.stun<=0&&a.mesh.position.distanceTo(carrier.mesh.position)<2.05);
 if(defender){setCarrier(defender,quaffle.position.clone());stealContact(defender.mesh,carrier);match.stealCooldown=contactRules.protection;match.stats.steals++;kickBallFeedback(.22);ensureTeamControl();notify('队友协同抢断 · 已接管球权',1.5);}
}

function resultTitle(){
 return match.playerScore>match.rivalScore?houseById(match.homeHouse).name+'获胜':match.rivalScore>match.playerScore?houseById(match.awayHouse).name+'获胜':'双方平局';
}
function finishMatch(title,detail){if(match.state!=='playing')return;clearInput();match.state='ended';matchAudio.stop();announceClip('result',match.playerScore===match.rivalScore?'result-draw':'result-'+(match.playerScore>match.rivalScore?match.homeHouse:match.awayHouse),5,0);$('endTitle').textContent=teamText(title);$('endScore').textContent=match.playerScore+' — '+match.rivalScore;$('endDetail').textContent=detail;const stats=match.stats;$('endStats').textContent='射门 '+stats.shots+' · 进球 '+stats.goals+' · 抢断 '+stats.steals+' · 触球 '+stats.touches+' · 成功传球 '+stats.completedPasses+' / '+stats.passes+' · 一脚配合 '+(stats.oneTouchPasses+stats.oneTouchShots)+' · 控球率 '+Math.round(stats.homePossession/Math.max(1,stats.homePossession+stats.awayPossession)*100)+'%';$('ending').classList.remove('hidden');}
function finishByTime(){
 finishMatch(resultTitle(),'时间结束，按双方总分结算。');
}

function update(dt){
 if(match.state==='playing'&&match.celebration){updateGoalCelebration(dt);return;}
 if(match.state==='entrance'){updateMatchEntrance(dt);return;}
 match.messageTime=Math.max(0,match.messageTime-dt);if(match.state==='countdown'){match.countdown-=dt;if(match.countdown<=0){match.state='playing';announceClip('kickoff','kickoff-'+match.homeHouse+'-'+match.awayHouse,3,0);setCarrier('player');setAim(0,0);match.stealCooldown=2.5;notify('开球 · 我方持球，向对方球门推进',2.2);}return;}
 if(match.state!=='playing')return;if(match.tutorial){updateTutorial(dt);return;}match.elapsed+=dt;if(actionBuffer&&match.elapsed>actionBuffer.expires){actionBuffer=null;if(match.primaryAction==='bufferedShot')match.primaryAction=null;}const before=match.timeLeft;match.timeLeft=Math.max(0,before-dt);for(const sec of[60,30,10])if(before>sec&&match.timeLeft<=sec)announceClip('time-'+sec,'time-'+sec,3,0);if(match.timeLeft<=0){finishByTime();return;}
 match.kickoff=Math.max(0,match.kickoff-dt);match.stealCooldown=Math.max(0,match.stealCooldown-dt);pickupDelay=Math.max(0,pickupDelay-dt);if(match.charging&&carrier==='player'){match.shotCharge=Math.min(1,match.shotCharge+dt/1.05);player.mesh.userData.castTime=Math.max(player.mesh.userData.castTime||0,.08);}
 if(carrier==='player'||allies.includes(carrier))match.stats.homePossession+=dt;else if(carrier)match.stats.awayPossession+=dt;
 if(match.pendingRestart&&match.kickoff===0){const home=match.pendingRestart==='home';match.pendingRestart=null;player.pos.set(0,10,home?3:27);player.previousPos.copy(player.pos);player.vel.set(0,0,0);setAim(0,0);for(const a of allies){a.mesh.position.copy(a.role==='keeper'?V(0,10,53):a.index===0?V(18,10,12):V(-18,10,12));resetAIFlight(a);}for(const r of rivals){r.mesh.position.set(r.index===0?0:r.index===1?-18:18,10,r.role==='keeper'?-53:home?-24:-3);resetAIFlight(r);}setCarrier(home?'player':rivals[0]);match.stealCooldown=2;notify(home?'我方开球':'对方开球 · 自动选择最近防守队员',1.5);}
 ensureTeamControl();updatePlayer(dt);updateRivals(dt);updateAllies(dt);updateQuaffle(dt);if(match.celebration)return;updateSteals(dt);ensureTeamControl();for(let i=0;i<flags.length;i++)flags[i].rotation.z=Math.sin(match.elapsed*2+i)*.025;
}
function getObjectiveInfo(){
 if(match.celebration)return {target:match.celebration.scorer.position,text:'精彩进球 · E/R/F 选择庆祝，空格跳过',direction:''};
 if(match.tutorial)return{target:player.pos,text:match.tutorial.complete?'训练完成 · 可以开始新手赛':'新手训练 · '+tutorialSteps[match.tutorial.step].title,direction:match.tutorial.complete?'6 / 6':(match.tutorial.step+1)+' / 6'};
 const holding=carrier==='player',defending=rivals.includes(carrier),target=holding?closestGoal(awayGoals,player.pos):quaffle.position,delta=target.clone().sub(player.pos);
 let direction=Math.abs(delta.x)>Math.abs(delta.z)?delta.x>0?'→':'←':delta.z>0?'↓':'↑',text;
 if(actionBuffer)text=actionBuffer.type==='shot'?'射门已预输入 · 接球后自动执行':'一脚'+(actionBuffer.kind==='through'?'直塞':'短传')+'已预输入 · 等待接球';
 else text=holding?'进攻对方球门 · 按住 F 蓄力，松开射门':defending?'已选择最近防守队员 · 按住 F 逼抢':passTarget?'传球中 · 可提前按 E/R/F 安排下一脚':'靠近球 · 自动选择争球队员';
 return{target,text,direction:direction+' '+Math.round(delta.length())+'m'};
}

function updateBallMarker(){
 const element=$('ballMarker');
 const visible=match.state==='playing'&&!match.paused&&!match.celebration&&!match.tutorial&&quaffle.visible&&carrier!=='player';
 element.style.display=visible?'block':'none';
 element.dataset.location='hidden';
 if(!visible)return;
 camera.updateMatrixWorld(true);
 const local=quaffle.position.clone().applyMatrix4(camera.matrixWorldInverse);
 const projected=quaffle.position.clone().project(camera);
 const marginX=Math.min(100,innerWidth*.16),top=190,bottom=innerHeight-235;
 const minY=Math.min(top,innerHeight*.34),maxY=Math.max(minY+70,bottom);
 let x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;
 const onscreen=local.z<0&&x>=marginX&&x<=innerWidth-marginX&&y>=minY&&y<=maxY;
 if(!onscreen){
  let dx=local.x,dy=-local.y;
  if(Math.abs(dx)+Math.abs(dy)<.01){dx=1;dy=0;}
  const halfW=innerWidth/2-marginX,halfH=(maxY-minY)/2;
  const scale=Math.min(halfW/Math.max(.001,Math.abs(dx)),halfH/Math.max(.001,Math.abs(dy)));
  x=innerWidth/2+dx*scale;y=(minY+maxY)/2+dy*scale;
  $('ballMarkerArrow').style.transform='rotate('+Math.atan2(dy,dx)+'rad)';
 }
 element.dataset.location=onscreen?'onscreen':'offscreen';
 element.classList.toggle('offscreen',!onscreen);
 element.style.left=x+'px';element.style.top=y+'px';
 $('ballMarkerArrow').textContent=onscreen?'':'➜';
 const label=local.z>=0?'球在身后':allies.includes(carrier)?'队友持球 · 自动接管':rivals.includes(carrier)?'对手持球':'鬼飞球';
 $('ballMarkerText').textContent=label+' · '+Math.round(player.pos.distanceTo(quaffle.position))+'m';
}
function updateHUD(){
 const live=match.state==='playing'&&!match.paused&&!match.celebration&&!match.tutorial?.complete,holding=carrier==='player',defending=rivals.includes(carrier),hidden=match.state==='menu'||match.state==='entrance';
 $('hud').style.opacity=hidden?'0':'1';$('hud').inert=hidden||match.paused||match.state==='ended';$('playerScore').textContent=match.playerScore;$('rivalScore').textContent=match.rivalScore;$('modeLabel').textContent=match.tutorial?'新手训练':match.rules.label;const sec=Math.ceil(match.timeLeft);$('clock').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');$('staminaFill').style.width=player.stamina+'%';$('staminaValue').textContent=Math.round(player.stamina)+'%';$('possession').textContent=holding?'我方持球':defending?'防守 · 最近队员':'我方传球 / 争夺球权';$('message').textContent=match.message;$('message').style.opacity=live&&match.messageTime>0?1:0;$('countdown').style.display=match.state==='countdown'&&!match.paused?'block':'none';$('countdown').textContent=Math.max(1,Math.ceil(match.countdown));const info=getObjectiveInfo();$('objectiveText').textContent=info.text;$('objectiveArrow').textContent=info.direction;drawRadar();
}
const controlMarker=new THREE.Mesh(new THREE.ConeGeometry(.28,.52,3),new THREE.MeshBasicMaterial({color:0xc8ff69,depthTest:false}));controlMarker.rotation.z=Math.PI;controlMarker.renderOrder=8;scene.add(controlMarker);
const aimLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.65}));scene.add(aimLine);
const passLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:0xbbe5cf,dashSize:.65,gapSize:.95,transparent:true,opacity:.34,depthTest:false}));passLine.name='PassArcPreview';passLine.renderOrder=7;scene.add(passLine);
function updateTeamHUD(){
 const live=match.state==='playing'&&!match.paused&&!match.celebration&&!match.tutorial?.complete,holding=carrier==='player',defending=rivals.includes(carrier),buffering=canBufferTeamAction();controlMarker.visible=live;controlMarker.position.copy(player.pos).add(V(0,3.5,0));aimLine.visible=live&&holding;aimLine.geometry.dispose();aimLine.geometry=new THREE.BufferGeometry().setFromPoints([player.pos.clone(),player.pos.clone().addScaledVector(getAimForward(),6)]);
 const receiver=live&&holding?getPassReceiver():null;passLine.visible=!!receiver;if(receiver){const plan=planPass('player',receiver),path=window.BroomPassing.create(THREE,{start:carryPosition(player.mesh),end:plan.destination,kind:'short',duration:plan.duration}),points=[];for(let i=0;i<=24;i++)points.push(path.positionAt(path.duration*i/24));passLine.geometry.dispose();passLine.geometry=new THREE.BufferGeometry().setFromPoints(points);passLine.computeLineDistances();}
 $('teamStatus').textContent=match.kickoff>0?'准备开球':actionBuffer?'连续配合 · 预输入就绪':defending?'自动防守换控':holding?'自动操控持球人':'团队配合';
 let hint='';if(actionBuffer)hint='已预输入 · '+(actionBuffer.type==='shot'?'接球后射门':'接球后一脚'+(actionBuffer.kind==='through'?'直塞':'短传'));else if(receiver)hint='E → '+(window.BroomRoster.byId(receiver.mesh.userData.characterId)?.name.split(' · ')[0]||'队友')+' · '+Math.round(receiver.mesh.position.distanceTo(player.pos))+'m';else if(buffering)hint='现在可按 E/R/F · 接球自动执行';
 $('passHint').textContent=hint;$('passHint').classList.toggle('buffered',!!actionBuffer);const meter=$('chargeMeter'),charging=match.charging||actionBuffer?.type==='shot',charge=match.charging?match.shotCharge:actionBuffer?clamp(actionBuffer.released?actionBuffer.charge:(match.elapsed-actionBuffer.created)/1.05,0,1):0;meter.style.display=charging?'block':'none';meter.firstElementChild.style.width=charge*100+'%';
 $('shortPassBtn').innerHTML='<kbd>E</kbd><span>短传</span>';$('throughPassBtn').innerHTML='<kbd>R</kbd><span>直塞</span>';$('primaryBtn').innerHTML='<kbd>F</kbd><span>'+(defending?'逼抢':'射门')+'</span>';$('shortPassBtn').disabled=!live||(!receiver&&!buffering);$('throughPassBtn').disabled=!live||(!receiver&&!buffering);$('primaryBtn').disabled=!live||(!holding&&!defending&&!buffering);$('primaryBtn').classList.toggle('pressing',holding?match.charging:defending?match.primaryAction==='defend':match.primaryAction==='bufferedShot');$('shortPassBtn').classList.toggle('pressing',actionBuffer?.type==='pass'&&actionBuffer.kind==='short');$('throughPassBtn').classList.toggle('pressing',actionBuffer?.type==='pass'&&actionBuffer.kind==='through');
 const labels=$('playerLabels');labels.replaceChildren();if(live){camera.updateMatrixWorld();for(const a of allies){if(a.stun>0||!a.mesh.visible)continue;const p=a.mesh.position.clone().add(V(0,3.6,0)).project(camera);if(Math.abs(p.x)>.94||Math.abs(p.y)>.8||p.z>1)continue;const label=document.createElement('span');label.className='player-label'+(a===receiver?' selected':'');label.textContent=(a===receiver?'E ▸ ':'')+(window.BroomRoster.byId(a.mesh.userData.characterId)?.name.split(' · ')[0]||'队友');label.style.left=(p.x*.5+.5)*innerWidth+'px';label.style.top=(-p.y*.5+.5)*innerHeight+'px';labels.append(label);}}
}
function drawRadar(){
 const c=$('radar'),ctx=c.getContext('2d'),w=c.width,h=c.height;
 ctx.clearRect(0,0,w,h);
 ctx.fillStyle='rgba(5,12,24,.88)';
 ctx.fillRect(0,0,w,h);
 const center={x:w/2,y:h/2},map=p=>({x:center.x+p.x/60*w*.37,y:center.y+p.z/80*h*.36});
 ctx.strokeStyle='#8fa891';
 ctx.lineWidth=2;
 ctx.beginPath();
 ctx.ellipse(center.x,center.y,w*.37,h*.36,0,0,TAU);
 ctx.stroke();
 ctx.strokeStyle='#536a62';
 ctx.beginPath();
 ctx.moveTo(w*.13,center.y);
 ctx.lineTo(w*.87,center.y);
 ctx.stroke();
 ctx.beginPath();
 ctx.arc(center.x,center.y,20,0,TAU);
 ctx.stroke();
 const dot=(p,r,color)=>{const q=map(p);ctx.fillStyle=color;ctx.beginPath();ctx.arc(q.x,q.y,r,0,TAU);ctx.fill();};
 const mark=(unit,color)=>{
  const position=unit.mesh.position;
  if(carrier===unit)dot(position,9,'#f3955f');
  if(unit.role==='keeper'){
   const q=map(position);
   ctx.fillStyle=color;
   ctx.fillRect(q.x-5,q.y-5,10,10);
  }else dot(position,5,color);
 };
 for(const g of awayGoals)dot(g,3.4,'#81aee3');
 for(const g of homeGoals)dot(g,3.4,'#e5bd6a');
 {
  for(const r of rivals)mark(r,r.role==='seeker'?'#b18cdb':'#6f9fd4');
  for(const a of allies)mark(a,'#f1c17d');

 }
 if(!carrier&&quaffle.visible)dot(quaffle.position,5,'#df8059');

 const p=map(player.pos),f=getAimForward();
 ctx.strokeStyle='#fff';
 ctx.lineWidth=3;
 ctx.beginPath();
 ctx.moveTo(p.x,p.y);
 ctx.lineTo(p.x+f.x*16,p.y+f.z*16);
 ctx.stroke();
 if(carrier==='player')dot(player.pos,10,'#f3955f');
 dot(player.pos,7,'#fff');
 ctx.font='19px Microsoft YaHei, sans-serif';
 ctx.fillStyle='#e9bd80';
 ctx.fillText(houseById(match.homeHouse).name,15,28);
 ctx.fillStyle='#8ab2e0';
 ctx.fillText(houseById(match.awayHouse).name,w-105,28);
 ctx.fillStyle='#b9c3d4';
 ctx.fillText('方块 · 守门员',15,h-10);
}
function frame(now){
 requestAnimationFrame(frame);
 const elapsed=Math.max(0,(now-lastTime)/1000),dt=Math.min(elapsed,.05);
 lastTime=now;
 if(!match.paused){
  const active=match.state==='playing'||match.state==='countdown'||match.state==='entrance';
  if(active&&elapsed>.5){
   pauseMatch();
   notify('画面停顿过久 · 比赛已暂停，继续后再出发',3);
  }else if(active){
   // Consume the whole frame in small steps, keeping clocks and collisions consistent at low FPS.
   for(let remaining=elapsed;remaining>0&&!match.paused&&match.state!=='ended';){
    const step=Math.min(remaining,1/60);
    update(step);
    remaining-=step;
   }
  }else update(dt);
 }
 commentary.tick(Math.min(elapsed,.5));
 matchAudio.update({speaking:commentary.state.speaking,active:['playing','countdown','entrance'].includes(match.state),paused:match.paused||match.state==='menu'||document.hidden});
 updateCamera(dt);
 riderFill.position.copy(camera.position).add(V(0,6,0));riderFill.target.position.copy(getMatchFocus().position).add(V(0,1,0));
 updateHUD();
 updateBallMarker();
 updateTeamHUD();
 updateBallFeedback(dt);
 characterPreview?.update(dt,{active:match.state==='menu'&&!match.paused});
 playerPortraits?.update(dt,{active:(match.state==='playing'||match.state==='countdown')&&!match.paused,controlled:portraitIdentity('player'),carrier:carrier?portraitIdentity(carrier):null});
 window.BroomModels?.update(dt,match.elapsed);
 crowd?.update(dt,{elapsed:match.state==='entrance'?match.entrance?.elapsed||0:match.elapsed,active:(match.state==='playing'||match.state==='entrance')&&!match.paused,reducedMotion:settings.reducedMotion});
 environment?.update(dt,{player:player.pos,elapsed:match.state==='entrance'?match.entrance?.elapsed||0:match.elapsed,active:(match.state==='playing'||match.state==='entrance')&&!match.paused,reducedMotion:settings.reducedMotion,cameraMode:match.cameraMode});
 renderer.render(scene,camera);
}
requestAnimationFrame(frame);
$('housePicker').innerHTML=houses.map(h=>'<button type="button" class="house-option" data-house="'+h.id+'" style="--house-color:'+h.color+'" aria-pressed="false">'+window.BroomHouses.crestSVG(h.id)+'<span><strong>'+h.name+'</strong><small>'+h.animal+' · '+h.motto.split(' · ')[0]+'</small></span></button>').join('');
for(const button of document.querySelectorAll('.house-option'))button.addEventListener('click',()=>selectHouse(button.dataset.house));$('opponentHouse').addEventListener('change',e=>selectOpponent(e.target.value));for(const button of document.querySelectorAll('.mode-option'))button.addEventListener('click',()=>selectMode(button.dataset.mode));
$('shortPassBtn').addEventListener('click',()=>{passQuaffle();canvas.focus();});$('throughPassBtn').addEventListener('click',()=>{passQuaffle('through');canvas.focus();});
$('primaryBtn').addEventListener('pointerdown',e=>{if($('primaryBtn').disabled)return;e.preventDefault();beginPrimaryAction();try{$('primaryBtn').setPointerCapture(e.pointerId);}catch{}canvas.focus();});for(const event of['pointerup','pointercancel','lostpointercapture'])$('primaryBtn').addEventListener(event,endPrimaryAction);
$('startBtn').addEventListener('click',()=>startMatch(selectedMode,{entrance:true}));$('tutorialBtn').addEventListener('click',startTutorial);$('skipEntrance').addEventListener('click',()=>{finishMatchEntrance();canvas.focus();});$('tutorialExit').addEventListener('click',returnToMenu);$('tutorialRepeat').addEventListener('click',repeatTutorialStep);for(const id of['tutorialSkip','tutorialDone'])$(id).addEventListener('click',()=>startMatch('rookie',{entrance:true}));$('resumeBtn').addEventListener('click',resumeMatch);$('restartBtn').addEventListener('click',restartMatch);$('restartPauseBtn').addEventListener('click',restartMatch);$('menuPauseBtn').addEventListener('click',returnToMenu);$('menuEndBtn').addEventListener('click',returnToMenu);$('commentaryEnabled').addEventListener('change',e=>setCommentaryEnabled(e.target.checked));$('commentaryVolume').addEventListener('input',e=>setCommentaryVolume(Number(e.target.value)/100));$('crowdVolume').addEventListener('input',e=>setCrowdVolume(Number(e.target.value)/100));
for(const button of document.querySelectorAll('[data-celebration]'))button.addEventListener('click',()=>{selectCelebration(button.dataset.celebration);canvas.focus();});$('skipCelebration').addEventListener('click',()=>{endGoalCelebration();canvas.focus();});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
addEventListener('keydown',e=>{
 if(e.metaKey||e.ctrlKey||e.altKey)return;const editable=e.target instanceof HTMLElement&&(e.target.matches('input,textarea,select')||e.target.isContentEditable);if(editable&&e.code!=='Escape')return;
 if(e.code==='Escape'){if(e.repeat)return;e.preventDefault();if(match.paused)resumeMatch();else pauseMatch();return;}
 if(match.state==='entrance'){if(!match.paused&&['Space','Enter','NumpadEnter'].includes(e.code)){e.preventDefault();if(!e.repeat)finishMatchEntrance();}return;}
 if(match.state==='playing'&&!match.paused&&match.celebration){if(!['KeyE','KeyR','KeyF','Space'].includes(e.code))return;e.preventDefault();if(e.repeat)return;if(e.code==='Space')endGoalCelebration();else selectCelebration({KeyE:'fist',KeyR:'glide',KeyF:'team'}[e.code]);return;}
 const active=match.state==='playing'&&!match.paused&&!match.tutorial?.complete;if(!active||!window.BroomControls.isGameplayKey(e.code))return;e.preventDefault();if(e.repeat)return;keys[e.code]=true;if(e.code==='KeyE')passQuaffle();if(e.code==='KeyR')passQuaffle('through');if(e.code==='KeyF')beginPrimaryAction();
});
addEventListener('keyup',e=>{delete keys[e.code];if(e.code==='KeyF')endPrimaryAction();});addEventListener('blur',()=>{clearInput();pauseMatch();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pauseMatch();}});canvas.addEventListener('contextmenu',e=>e.preventDefault());
renderAcademyChoices();refreshSquadAppearance();syncHouseTheme();mountMatchBrooms();syncVoiceSettings();commentary.prepare();
function portraitIdentity(unit){
 const body=unit==='player'?player.mesh:unit.mesh,id=body.userData.characterId,profile=window.BroomRoster.byId(id);
 return {id,key:body.uuid,name:profile?.name||id,house:unit==='player'||allies.includes(unit)?match.homeHouse:match.awayHouse};
}
const playerPortraits=window.BroomPlayerPortraits?.init({THREE,element:$('playerPortraits'),createWizard,disposeObject});
const characterPreview=window.BroomCharacterPreview?.init({THREE,element:$('characterPreview'),createWizard,disposeObject,getSelection:()=>({id:configs[match.selected].id,name:configs[match.selected].name,en:configs[match.selected].en,house:match.homeHouse,houseName:houseById(match.homeHouse).name,houseColor:houseById(match.homeHouse).color,broomId:'uploaded-broom',broomLevel:0,broomName:'学院赛用扫帚',reducedMotion:settings.reducedMotion})});
window.__BROOMBALL__={matchAudio,match,modes,tutorialSteps,player,rivals,allies,contactRules,characterPreview,playerPortraits,cameraFraming,scene,camera,renderer,environment,crowd,homeGoals,awayGoals,modelScenery,commentary,configs,settings,houses,houseDecor,quaffle,quaffleVel,ballTrail,contactHalo,clearInput,startMatch,restartMatch,beginMatchEntrance,finishMatchEntrance,updateMatchEntrance,startTutorial,setupTutorialStep,updateTutorial,repeatTutorialStep,returnToMenu,pauseMatch,resumeMatch,selectHouse,selectOpponent,switchCharacter,switchControl,ensureTeamControl,homeKeeper,setCarrier,getPassReceiver,passQuaffle,throwQuaffle,getShotInfo,scoreGoal,getObjectiveInfo,setAim,getAimState,getAimForward,getPlayDirection,getPressTarget,getMatchFocus,getBallFocus,getTacticalTargets,getMovementBasis,update,updateCamera,updateHUD,updateTeamHUD,updateBallMarker,updatePlayer,updateQuaffle,updateSteals,flyAI,resetAIFlight,updateRivals,updateAllies,planPass,createWizard,disposeObject,setCommentaryEnabled,setCommentaryVolume,setCrowdVolume,beginPrimaryAction,endPrimaryAction,canBufferTeamAction,flushBufferedAction,updateBallFeedback,selectCelebration,endGoalCelebration,updateGoalCelebration,get carrier(){return carrier;},get passFlight(){return passFlight;},get passTarget(){return passTarget;},get passDestination(){return passDestination;},get passReceivePosition(){return passReceivePosition;},get passMode(){return passMode;},get ballGather(){return ballGather;},get actionBuffer(){return actionBuffer;}};
})();
