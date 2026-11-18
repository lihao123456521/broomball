/* Sculpted academy riders. Every selection uses this same in-game character rig. */
window.BroomCharacterArt=(()=>{
 'use strict';
 const profiles={
  harry:{hair:0x20202a,skin:0xe2b492,eyes:0x4b765b,style:'tousled',trait:'round glasses and lightning scar',brow:.02},
  hermione:{hair:0x563729,skin:0xe8b897,eyes:0x654533,style:'curls',trait:'layered chestnut curls',brow:.015},
  ron:{hair:0xb75c2d,skin:0xf0c2a0,eyes:0x477c9e,style:'ginger',trait:'copper fringe and freckles',brow:.01},
  draco:{hair:0xd6c58d,skin:0xe9c6ae,eyes:0x667c88,style:'sidepart',trait:'swept platinum hair',brow:-.025},
  pansy:{hair:0x222029,skin:0xe6b99f,eyes:0x48565a,style:'bob',trait:'sculpted dark bob',brow:-.012},
  blaise:{hair:0x211b1b,skin:0x98664d,eyes:0x342b24,style:'crop',trait:'textured close-cropped hair',brow:-.01},
  luna:{hair:0xd6ba76,skin:0xf1c9ac,eyes:0x79a7b3,style:'long',trait:'long golden waves and moon earrings',brow:.025},
  cho:{hair:0x24232b,skin:0xe1b492,eyes:0x3c302c,style:'ponytail',trait:'flowing black ponytail',brow:.015},
  padma:{hair:0x2b2020,skin:0xb77e59,eyes:0x3e302b,style:'braid',trait:'dark sculpted braid',brow:.005},
  cedric:{hair:0x654330,skin:0xe2b696,eyes:0x718075,style:'waves',trait:'swept brown waves',brow:0},
  hannah:{hair:0xcfaa5f,skin:0xebbf9f,eyes:0x769289,style:'braids',trait:'golden twin braids',brow:.02},
  ernie:{hair:0x795c3f,skin:0xe7b99a,eyes:0x566859,style:'neat',trait:'neat chestnut side part',brow:-.005}
 };
 function decorate(wizard,{id='harry'}={}){
  const T=window.THREE,body=wizard.userData.replaceable.body;
  const keeper=id.endsWith('-keeper')&&window.BroomRoster?.byId(id);
  const profile=keeper?{...keeper,style:'crop',eyes:0x4c4941,brow:0,trait:'padded keeper helmet'}:profiles[id]||profiles.harry;
  if(body.userData.artVersion===2&&body.userData.characterId===id)return wizard;
  for(const child of [...body.children]){child.traverse(o=>{o.geometry?.dispose();if(o.material?.userData.owned)o.material.dispose();});child.removeFromParent();}
  const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),up=V(0,1,0),materials=new Map();
  const primary=0x87374c,accent=0xe9c573,shirt=0xeee8d9,leather=0x302b30,pants=0x29313e,hair=profile.hair,skin=profile.skin;
  const earShade=new T.Color(skin).multiplyScalar(.77).getHex();
  function mat(c,metal=0){const key=c+':'+metal;if(!materials.has(key)){const m=new T.MeshStandardMaterial({color:c,roughness:metal>.5?.28:metal>.15?.48:.76,metalness:metal,envMapIntensity:metal>.5?.85:.38});m.userData.owned=true;materials.set(key,m);}return materials.get(key);}
  function mesh(parent,geo,c,p=V(),name=''){const o=new T.Mesh(geo,typeof c==='number'?mat(c):c);o.position.copy(p);o.name=name;o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  function ell(parent,c,p,s,name=''){const o=mesh(parent,new T.SphereGeometry(1,20,14),c,p,name);o.scale.copy(s);return o;}
  function bar(parent,a,b,r,c,name=''){const d=b.clone().sub(a),l=d.length();const o=mesh(parent,new T.CapsuleGeometry(r,Math.max(.002,l-r*2),3,9),c,a.clone().add(b).multiplyScalar(.5),name);o.quaternion.setFromUnitVectors(up,d.normalize());return o;}
  function stroke(parent,points,r,c,name=''){const curve=new T.CatmullRomCurve3(points.map(p=>V(...p)));return mesh(parent,new T.TubeGeometry(curve,Math.max(8,points.length*4),r,6,false),c,V(),name);}
  function patch(parent,points,c,name=''){const g=new T.BufferGeometry().setFromPoints(points.map(p=>V(...p)));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();const m=mat(c).clone();m.side=T.DoubleSide;m.userData.owned=true;return mesh(parent,g,m,V(),name);}
  // This first mesh and the scarf's first fabric intentionally define the house palette.
  const coat=ell(body,primary,V(0,1.16,.08),V(.43,.55,.275),'TailoredFlightJacket');coat.rotation.x=-.13;
  ell(body,primary,V(0,1.48,.05),V(.46,.19,.28),'ShoulderYoke');
  ell(body,leather,V(0,.77,.15),V(.34,.14,.255),'LeatherWaistBelt');
  ell(body,shirt,V(0,1.23,-.19),V(.225,.40,.095),'IvoryShirt');
  patch(body,[[-.25,1.59,-.22],[-.03,1.45,-.30],[-.14,1.18,-.29],[-.36,1.48,-.20]],primary,'LeftLayeredLapel');
  patch(body,[[.25,1.59,-.22],[.36,1.48,-.20],[.14,1.18,-.29],[.03,1.45,-.30]],primary,'RightLayeredLapel');
  patch(body,[[-.18,1.62,-.235],[-.01,1.50,-.32],[-.08,1.39,-.325],[-.22,1.51,-.27]],shirt,'LeftFoldedCollar');
  patch(body,[[.18,1.62,-.235],[.22,1.51,-.27],[.08,1.39,-.325],[.01,1.50,-.32]],shirt,'RightFoldedCollar');
  patch(body,[[-.042,1.49,-.333],[.045,1.49,-.333],[.06,1.14,-.31],[0,1.05,-.30]],accent,'AcademyTie');
  for(const y of[1.08,1.20,1.32])ell(body,mat(accent,.55),V(.11,y,-.286),V(.025,.025,.014),'JacketButton');
  const buckle=mesh(body,new T.TorusGeometry(.07,.018,5,12),mat(accent,.6),V(0,.80,-.124),'BeltBuckle');buckle.scale.x=1.25;
  const crest=mesh(body,new T.CircleGeometry(.10,5),accent,V(-.27,1.40,-.25),'HouseCrest');crest.rotation.y=-.18;
  const crestInset=mesh(body,new T.CircleGeometry(.071,5),primary,V(-.27,1.40,-.256),'CrestInset');crestInset.rotation.y=-.18;
  stroke(body,[[-.39,1.51,-.09],[-.38,1.10,-.15],[-.29,.87,-.09]],.013,accent,'LeftGoldSeam');
  stroke(body,[[.39,1.51,-.09],[.38,1.10,-.15],[.29,.87,-.09]],.013,accent,'RightGoldSeam');
  // Broom-riding bent knees, shaped boots and small laces read in front and profile.
  for(const side of[-1,1]){
   const hip=V(side*.23,.81,.12),knee=V(side*.45,.39,-.35),ankle=V(side*.43,-.02,.02);
   bar(body,hip,knee,.155,pants,'TrouserThigh');ell(body,pants,knee,V(.15,.14,.15),'BentKnee');bar(body,knee,ankle,.12,pants,'TrouserShin');
   const boot=ell(body,leather,V(side*.43,-.065,-.11),V(.15,.15,.31),'ShapedRidingBoot');boot.rotation.x=.15;
   ell(body,0x1d2026,V(side*.43,-.16,-.12),V(.16,.055,.315),'BootSole');
   for(let lace=0;lace<3;lace++)bar(body,V(side*.43-.08,.025-lace*.025,-.28+lace*.035),V(side*.43+.08,.025-lace*.025,-.28+lace*.035),.008,0xb7a585,'BootLace');
   const band=mesh(body,new T.TorusGeometry(.135,.025,5,16),leather,V(side*.43,.09,.0),'BootCuff');band.rotation.x=Math.PI/2;
  }
  const shoulder=V(-.37,1.47,.02),elbow=V(-.55,1.04,-.22),hand=V(-.09,.51,-.82);
  bar(body,shoulder,elbow,.145,primary,'LeftSleeve');ell(body,primary,elbow,V(.14,.14,.14),'LeftElbow');bar(body,elbow,hand,.12,primary,'LeftForearm');
  ell(body,leather,hand,V(.12,.11,.15),'LeftRidingGlove');
  const arm=new T.Group();arm.name='CastingArm';arm.position.set(.37,1.47,.02);body.add(arm);
  bar(arm,V(),V(.20,-.35,-.19),.145,primary,'RightSleeve');ell(arm,primary,V(.20,-.35,-.19),V(.13,.13,.13),'RightElbow');bar(arm,V(.20,-.35,-.19),V(.24,-.38,-.70),.11,primary,'RightForearm');
  ell(arm,leather,V(.24,-.38,-.70),V(.115,.11,.14),'WandGlove');ell(arm,skin,V(.24,-.38,-.79),V(.08,.07,.065),'WandFingers');
  bar(arm,V(.24,-.38,-.72),V(.24,-.32,-1.46),.026,0x765139,'Wand');
  const spellSocket=new T.Object3D();spellSocket.name='SpellSocket';spellSocket.position.set(.24,-.32,-1.5);arm.add(spellSocket);
  ell(arm,mat(accent,.4),V(.24,-.32,-1.47),V(.032,.032,.032),'WandTip');
  const scarf=mesh(body,new T.TorusGeometry(.28,.07,8,24),accent,V(0,1.60,.025),'KnittedScarf');scarf.rotation.x=Math.PI/2;scarf.scale.y=.84;
  const scarfTail=new T.Group();scarfTail.name='ScarfTail';scarfTail.position.set(-.22,1.58,.26);body.add(scarfTail);
  const fabric=mesh(scarfTail,new T.BoxGeometry(.16,.055,.96),accent,V(0,-.035,.46),'ScarfFabric');fabric.rotation.x=.12;
  for(const z of[.12,.31,.50,.69,.88])mesh(scarfTail,new T.BoxGeometry(.164,.058,.052),primary,V(0,-.035+z*.12,z),'ScarfStripe');
  const cape=new T.Group();cape.name='Cape';cape.position.set(0,1.48,.30);body.add(cape);
  const verts=new Float32Array([-.38,0,0,0,.025,.055,.38,0,0,-.43,-.45,.28,0,-.50,.43,.43,-.45,.28,-.54,-.98,.72,0,-1.04,.94,.54,-.98,.72]);
  const cg=new T.BufferGeometry();cg.setAttribute('position',new T.BufferAttribute(verts,3));cg.setIndex([0,3,1,1,3,4,1,4,2,2,4,5,3,6,4,4,6,7,4,7,5,5,7,8]);cg.computeVertexNormals();const cm=mat(primary).clone();cm.side=T.DoubleSide;cm.userData.owned=true;mesh(cape,cg,cm,V(),'FlowingAcademyCape');
  stroke(cape,[[-.38,0,0],[-.43,-.45,.28],[-.54,-.98,.72]],.013,accent,'CapeEdgeLeft');stroke(cape,[[.38,0,0],[.43,-.45,.28],[.54,-.98,.72]],.013,accent,'CapeEdgeRight');
  // Face: almond eyes, iris/pupil/highlight, sculpted cheeks, eyelids and brows.
  const head=new T.Group();head.name='Head';head.position.set(0,1.94,-.075);body.add(head);
  // Subtle changes in jaw width, cheek height and eye spacing distinguish faces,
  // while the same landmarks also frame the live, front-facing match portraits.
  const faceShapes={hermione:[.97,1.02,1],ron:[.96,1.06,1],draco:[.93,1.06,.97],pansy:[1.02,.96,.97],blaise:[1.04,1.04,1.02],luna:[.96,1.04,.98],cho:[.98,.98,.98],padma:[.99,1.02,1],cedric:[1.04,1.05,1.02],hannah:[1.02,.97,1],ernie:[1.03,1.01,1]};head.scale.fromArray(faceShapes[id]||[1,1,1]);
  const face=ell(head,skin,V(0,0,.01),V(.292,.347,.276),'SculptedFace'),facePositions=face.geometry.getAttribute('position');
  // Shape a continuous cheek/jaw surface. Separate skin balls create visible
  // seams and swollen cheeks in close-up, even when their materials match.
  for(let i=0;i<facePositions.count;i++){const y=facePositions.getY(i),jaw=Math.max(0,1-Math.abs(y+.48)*2.2);facePositions.setX(i,facePositions.getX(i)*(1+jaw*.10));}face.geometry.computeVertexNormals();
  for(const side of[-1,1]){
   ell(head,skin,V(side*.276,-.015,.01),V(.066,.095,.055),'Ear');ell(head,earShade,V(side*.30,-.015,-.027),V(.021,.051,.017),'EarInset');
   ell(head,0xf1eee2,V(side*.112,.025,-.245),V(.064,.039,.024),'EyeWhite');
   ell(head,profile.eyes,V(side*.112,.023,-.266),V(.029,.031,.010),'EyeIris');ell(head,0x17252d,V(side*.112,.022,-.275),V(.015,.023,.006),'EyePupil');ell(head,0xffffff,V(side*.103,.035,-.281),V(.008,.008,.004),'EyeCatchlight');
   stroke(head,[[side*.048,.045,-.255],[side*.105,.063,-.268],[side*.174,.049,-.249]],.008,0x715244,'UpperEyelid');
   stroke(head,[[side*.052,.112+profile.brow,-.245],[side*.11,.133+profile.brow,-.258],[side*.18,.118,-.231]],.017,hair,'ExpressiveEyebrow');
  }
  ell(head,skin,V(0,-.015,-.254),V(.034,.083,.034),'NoseBridge');ell(head,skin,V(0,-.064,-.281),V(.043,.030,.034),'NoseTip');
  stroke(head,[[-.065,-.154,-.228],[0,-.165,-.245],[.065,-.153,-.228]],.010,0x9e6358,'NaturalSmile');
  ell(head,0xbf8b78,V(0,-.176,-.232),V(.044,.012,.014),'LowerLip');
  function lock(p,s,rz=0,ry=0,name='LayeredHairLock'){const l=ell(head,hair,V(...p),V(...s),name);l.rotation.z=rz;l.rotation.y=ry;return l;}
  const cap=mesh(head,new T.SphereGeometry(1,24,14,0,Math.PI*2,0,Math.PI*.62),hair,V(0,.075,.04),'SculptedHairCap');cap.scale.set(.307,.31,.294);
  // Each style uses deliberately arranged, overlapping locks rather than repeated spheres.
  if(['sidepart','neat'].includes(profile.style)){
   for(let i=0;i<7;i++){const x=-.24+i*.075;lock([x,.24-i*.008,-.14],[.076,.18,.11],-.60-i*.035,.12);}
   for(const side of[-1,1])lock([side*.272,.02,.03],[.055,.18,.22],side*.05);
  }else if(profile.style==='crop'){
   for(let row=0;row<3;row++)for(let i=0;i<6;i++)lock([-.24+i*.095,.23-row*.022,-.15+row*.095],[.057,.068,.07],(i%2?1:-1)*.1);
   for(const side of[-1,1])lock([side*.283,.04,.04],[.035,.15,.20]);
  }else if(profile.style==='curls'){
   for(const side of[-1,1])for(let i=0;i<7;i++){
    const y=.20-i*.085,x=side*(.26+.033*Math.sin(i*1.8));lock([x,y,.05+(i%2)*.09],[.107,.155,.112],side*(.12+Math.sin(i)*.20));
   }
   for(let i=0;i<6;i++)lock([-.24+i*.095,.27+Math.sin(i)*.025,-.13],[.11,.14,.10],-.3+i*.12);
  }else if(profile.style==='bob'){
   for(const side of[-1,1])for(let i=0;i<4;i++)lock([side*(.245+i*.014),.065-i*.075,.02],[.087,.23,.23],side*.09);
   for(let i=0;i<6;i++)lock([-.23+i*.09,.19,-.20],[.067,.13,.085],-.1+i*.015);
  }else if(['long','ponytail','braid','braids'].includes(profile.style)){
   for(let i=0;i<6;i++)lock([-.23+i*.09,.24,-.13],[.075,.16,.11],-.32+i*.1);
   for(const side of[-1,1])lock([side*.268,.02,.04],[.065,.22,.18],side*.08);
   if(profile.style==='long')for(const side of[-1,1])for(let i=0;i<6;i++)lock([side*(.26+Math.sin(i)*.025),.03-i*.11,.15],[.10,.19,.15],side*(.12+Math.cos(i)*.08));
   if(profile.style==='ponytail'){
    lock([0,-.03,.30],[.16,.15,.17]);for(let i=0;i<5;i++)lock([Math.sin(i*.8)*.04,-.12-i*.10,.34+i*.045],[.135,.18,.12],.10+i*.03);
    ell(head,accent,V(0,-.06,.33),V(.16,.045,.15),'PonytailRibbon');
   }
   if(profile.style==='braid')for(let i=0;i<8;i++)lock([Math.sin(i*Math.PI)*.025,-.05-i*.08,.29+i*.022],[.095,.075,.10],(i%2?1:-1)*.4);
   if(profile.style==='braids')for(const side of[-1,1]){for(let i=0;i<6;i++)lock([side*(.28+(i%2)*.026),-.02-i*.08,.08],[.075,.08,.09],side*(i%2?.25:-.2));ell(head,accent,V(side*.29,-.48,.08),V(.085,.035,.085),'BraidRibbon');}
  }else{
   for(let i=0;i<8;i++)lock([-.25+i*.07,.25+Math.sin(i*1.7)*.035,-.16],[.080,.16,.11],-.35+i*.1);
   for(const side of[-1,1])lock([side*.27,.055,.03],[.065,.15,.20],side*.08);
   if(profile.style==='waves')for(let i=0;i<5;i++)lock([-.2+i*.10,.27,-.045],[.10,.13,.16],-.55+i*.12);
  }
  if(keeper){
   ell(head,leather,V(0,.20,.03),V(.33,.235,.30),'PaddedKeeperHelmet');
   for(const side of[-1,1]){
    ell(head,leather,V(side*.285,.008,.025),V(.065,.14,.115),'KeeperEarGuard');
    ell(body,leather,V(side*.39,1.49,.08),V(.17,.125,.22),'KeeperShoulderPad');
   }
   stroke(head,[[0,.26,-.249],[0,.37,-.18],[0,.43,.025],[0,.37,.21]],.016,accent,'KeeperHelmetStripe');
  }
  if(id==='ron')for(const side of[-1,1])for(let i=0;i<5;i++)ell(head,0xa96949,V(side*(.075+i*.025),-.09+(i%2)*.025,-.262+i*.007),V(.008,.008,.005),'Freckle');
  if(id==='harry'){
   for(const side of[-1,1])mesh(head,new T.TorusGeometry(.091,.012,6,24),0x24252a,V(side*.113,.026,-.294),'RoundSpectacle');bar(head,V(-.025,.035,-.30),V(.025,.035,-.30),.010,0x24252a,'SpectacleBridge');
   stroke(head,[[.055,.235,-.18],[.086,.187,-.225],[.055,.172,-.237],[.083,.129,-.254]],.008,0xa77366,'LightningScar');
  }
  if(id==='luna')for(const side of[-1,1])mesh(head,new T.TorusGeometry(.035,.009,5,14),mat(0xd3d9d9,.4),V(side*.302,-.125,-.015),'MoonEarring');
  if(id==='padma')ell(head,mat(accent,.4),V(0,.12,-.253),V(.012,.018,.006),'AcademyPin');
  // Batch static details within each rig group. Cast arm, cape and scarf still
  // animate independently, while individual curls/buttons do not add draw calls.
  function batchGroup(group,keep=new Set()){
   const sets=new Map();
   for(const part of [...group.children]){
    if(!part.isMesh||keep.has(part))continue;
    const key=part.material.uuid;if(!sets.has(key))sets.set(key,[]);sets.get(key).push(part);
   }
   for(const parts of sets.values()){
    if(parts.length<2)continue;
    const positions=[],normals=[],uvs=[],indices=[],names=[];
    for(const part of parts){
     part.updateMatrix();const g=part.geometry.clone().applyMatrix4(part.matrix),pos=g.getAttribute('position'),normal=g.getAttribute('normal'),uv=g.getAttribute('uv'),offset=positions.length/3;
     for(let i=0;i<pos.count;i++){positions.push(pos.getX(i),pos.getY(i),pos.getZ(i));normals.push(normal.getX(i),normal.getY(i),normal.getZ(i));uvs.push(uv?uv.getX(i):0,uv?uv.getY(i):0);}
     const ix=g.getIndex();for(let i=0;i<(ix?ix.count:pos.count);i++)indices.push(offset+(ix?ix.getX(i):i));
     names.push(part.name);g.dispose();part.geometry.dispose();part.removeFromParent();
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeBoundingSphere();
    const combined=new T.Mesh(g,parts[0].material);combined.name='CharacterDetailBatch';combined.castShadow=combined.receiveShadow=true;combined.userData.artParts=names;group.add(combined);
   }
  }
  batchGroup(head);batchGroup(arm);batchGroup(cape);batchGroup(scarfTail,new Set([fabric]));batchGroup(body,new Set([coat]));
  wizard.userData.rig={body,head,cape,scarfTail,arm};wizard.userData.replaceable.spellSocket=spellSocket;
  body.userData.artVersion=2;body.userData.characterId=id;
  wizard.userData.artProfile=id;wizard.userData.artParts=['face','hair','jacket','collar','tie','scarf','cape','boots','gloves'];
  wizard.userData.appearance={version:2,id,hairStyle:profile.style,signature:profile.trait,skin:profile.skin,hair:profile.hair,features:['sculpted-face','iris-and-catchlights','layered-hair','tailored-jacket','cape-piping','shaped-boots','striped-scarf']};
  return wizard;
 }
 // The landmark is stored in each original rider's model space, including its pose.
 function getFaceFrame(wizard){
  const T=window.THREE;if(!wizard)return null;wizard.updateWorldMatrix(true,true);
  const model=wizard.userData.modelRoot,face=model?.userData?.faceLandmark;
  if(face){
   model.updateMatrix();
   return {center:new T.Vector3().fromArray(face.center).applyMatrix4(model.matrix),
    radius:Math.max(.42,face.radius*model.scale.y),source:model.userData.uploadedModel};
  }
  const head=wizard.getObjectByName('Head'),center=new T.Vector3();if(!head)return null;head.getWorldPosition(center);wizard.worldToLocal(center);center.y-=.025;return{center,radius:.53,source:wizard.userData.characterId||wizard.userData.artProfile};
 }
 return Object.freeze({decorate,getFaceFrame,profiles:Object.freeze(profiles)});
})();
