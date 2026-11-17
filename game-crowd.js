/* Articulated stadium spectators. Instance batches keep a full crowd inexpensive. */
window.BroomCrowd=(()=>{
 'use strict';
 function build({THREE:T,scene}){
  const root=new T.Group();root.name='StadiumCrowd';scene.add(root);
  const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),up=v(0,1,0),dummy=new T.Object3D();
  const palette=[0x922f43,0x275e49,0x315d8c,0xc5a04e],accents=[0xf0c45e,0xc0c9c2,0xd0b894,0x332c27];
  const skin=[0xe7bc98,0xc9906c,0x946447,0xe0b18a,0x6e4737],hair=[0x2a2527,0x52372a,0xb7753b,0xc9af79,0x151b23];
  const material=new T.MeshStandardMaterial({color:0xffffff,roughness:.92,metalness:0,emissive:0xffffff,emissiveIntensity:.045});
  const sphere=new T.SphereGeometry(1,8,5),handShape=new T.IcosahedronGeometry(1,0),limb=new T.CylinderGeometry(1,1,1,6,1),box=new T.BoxGeometry(1,1,1);
  const specs={
   head:{name:'CrowdHead',geometry:sphere},hair:{name:'CrowdHair',geometry:new T.SphereGeometry(1,8,4,0,Math.PI*2,0,Math.PI*.58)},
   neck:{name:'CrowdNeck',geometry:limb},torso:{name:'CrowdTorso',geometry:new T.CylinderGeometry(1,.86,1,6,1)},
   upperArms:{name:'CrowdUpperArms',geometry:limb},forearms:{name:'CrowdForearms',geometry:limb},hands:{name:'CrowdHands',geometry:handShape},
   thighs:{name:'CrowdThighs',geometry:limb},shins:{name:'CrowdShins',geometry:limb},boots:{name:'CrowdBoots',geometry:box},
   scarf:{name:'CrowdScarf',geometry:new T.TorusGeometry(1,.25,4,8)},scarfTail:{name:'CrowdScarfTail',geometry:box}
  };
  const batches=new Map(),spectators=[],wavers=[];
  let celebration=null,celebrationWasActive=false,currentParts=null;
  const celebrationMatrix=new T.Matrix4();
  for(const [id,spec]of Object.entries(specs))batches.set(id,{...spec,items:[],mesh:null});
  const matrix=(pos,scale,quaternion)=>{dummy.position.copy(pos);dummy.scale.copy(scale);dummy.quaternion.copy(quaternion||new T.Quaternion());dummy.updateMatrix();return dummy.matrix.clone();};
  const segment=(a,b,r)=>{const delta=b.clone().sub(a);return matrix(a.clone().add(b).multiplyScalar(.5),v(r,delta.length(),r),new T.Quaternion().setFromUnitVectors(up,delta.normalize()));};
  function add(id,local,color,fan){const batch=batches.get(id),index=batch.items.length;batch.items.push({matrix:fan.clone().multiply(local),color});currentParts?.push({id,index});return index;}
  let seed=42673;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let section=0;section<28;section++){
   const angle=section/28*Math.PI*2,house=Math.floor(section/7);
   for(let tier=0;tier<3;tier++)for(let seat=0;seat<9;seat++){
    const crowdIndex=spectators.length,standing=(crowdIndex%11===3||crowdIndex%17===2),cheering=standing||crowdIndex%7===1;
    const size=.92+random()*.13,coat=palette[(section+seat%3)%4],trim=accents[(section+seat%3)%4],skinColor=skin[Math.floor(random()*skin.length)],hairColor=hair[Math.floor(random()*hair.length)];
    const localX=-6.65+seat*1.66,localZ=(seat%2?-.48:.12),standBase=v(Math.sin(angle)*(72+tier*3),1+tier*2.35,Math.cos(angle)*(91+tier*3));
    const standMatrix=new T.Matrix4().makeRotationY(angle);standMatrix.setPosition(standBase);
    const personMatrix=matrix(v(localX,0,localZ),v(.94+random()*.12,size,.94+random()*.12),new T.Quaternion().setFromAxisAngle(up,(random()-.5)*.13));
    const fan=standMatrix.clone().multiply(personMatrix),hipY=standing?1.97:1.6,shoulderY=standing?2.77:2.4,headY=shoulderY+.36;
    const parts=[];currentParts=parts;
    add('torso',matrix(v(0,hipY+.4,.06),v(.34,.82,.235)),coat,fan);
    add('neck',matrix(v(0,shoulderY+.055,.015),v(.105,.18,.105)),skinColor,fan);
    add('head',matrix(v(0,headY,0),v(.235,.27,.225)),skinColor,fan);
    add('hair',matrix(v(0,headY+.025,.022),v(.244,.28,.236)),hairColor,fan);
    const scarfRotation=new T.Quaternion().setFromAxisAngle(v(1,0,0),Math.PI/2);
    add('scarf',matrix(v(0,shoulderY+.05,0),v(.14,.14,.14),scarfRotation),trim,fan);
    add('scarfTail',matrix(v(.08,shoulderY-.21,-.245),v(.11,.45,.035)),trim,fan);
    for(const side of[-1,1]){
     const shoulder=v(side*.31,shoulderY-.07,.04);
     let elbow,hand;
     if(cheering&&side===1){elbow=v(.58,shoulderY+.20,-.08);hand=v(.50,shoulderY+.57,-.14);}
     else if(standing){elbow=v(side*.44,shoulderY-.37,-.05);hand=v(side*.35,hipY+.12,-.12);}
     else{elbow=v(side*.43,shoulderY-.37,-.15);hand=v(side*.22,hipY+.13,-.40);}
     const upperIndex=add('upperArms',segment(shoulder,elbow,.105),coat,fan),foreIndex=add('forearms',segment(elbow,hand,.09),coat,fan),handIndex=add('hands',matrix(hand,v(.105,.12,.10)),skinColor,fan);
     if(cheering&&side===1&&crowdIndex%3===0)wavers.push({fan,shoulder,elbow,hand,upperIndex,foreIndex,handIndex,phase:crowdIndex*.41,house});
     const hip=v(side*.16,hipY,.07),knee=standing?v(side*.17,1.48,-.01):v(side*.18,1.50,-.50),ankle=v(side*.18,1.09,standing?-.035:-.49);
     add('thighs',segment(hip,knee,.12),0x242b39,fan);add('shins',segment(knee,ankle,.105),0x242b39,fan);
     add('boots',matrix(v(side*.18,1.025,standing?-.13:-.60),v(.24,.16,.39)),0x242328,fan);
    }
    currentParts=null;
    const localBounds=new T.Box3(v(-.72,.94,-.84),v(.78,headY+.38+(cheering?.24:0),.40));
    const bounds=localBounds.applyMatrix4(fan),position=v().applyMatrix4(fan);
    spectators.push({section,house,tier,position,height:bounds.max.y-bounds.min.y,bounds,parts,pose:standing?'standing-cheer':cheering?'seated-cheer':'seated'});
   }
  }
  for(const [id,batch]of batches){
   const mesh=new T.InstancedMesh(batch.geometry,material,batch.items.length);mesh.name=batch.name;mesh.castShadow=false;mesh.receiveShadow=true;
   mesh.userData.crowdPart=id;mesh.userData.people=spectators.length;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
   for(let i=0;i<batch.items.length;i++){mesh.setMatrixAt(i,batch.items[i].matrix);mesh.setColorAt(i,new T.Color(batch.items[i].color));}
   mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();mesh.computeBoundingBox();root.add(mesh);batch.mesh=mesh;
  }
  const bounds=new T.Box3().setFromObject(root);root.userData.spectators=spectators;root.userData.crowdCount=spectators.length;
  function getStatus(){return {people:spectators.length,drawCalls:batches.size,animatedFans:wavers.length,parts:Object.fromEntries([...batches].map(([id,batch])=>[id,batch.items.length])),bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},celebration:celebration?{house:celebration.house,time:celebration.time,duration:celebration.duration}:null};}
  function restoreCrowdPose(){
   for(const spectator of spectators)for(const part of spectator.parts){const batch=batches.get(part.id);if(batch.mesh)batch.mesh.setMatrixAt(part.index,batch.items[part.index].matrix);}
   for(const batch of batches.values())if(batch.mesh)batch.mesh.instanceMatrix.needsUpdate=true;celebrationWasActive=false;
  }
  function celebrate({house=0,duration=4}={}){celebration={house,time:0,duration};return celebration;}
  function reset(){celebration=null;restoreCrowdPose();}
  function update(dt,{elapsed=0,active=true,reducedMotion=false}={}){
   if(!active)return;
   if(celebration){
    celebration.time+=dt;
    if(celebration.time>=celebration.duration){celebration=null;restoreCrowdPose();}
    else{
     for(const spectator of spectators){
      const energy=spectator.house===celebration.house?1:.42,lift=reducedMotion?0:Math.max(0,Math.sin(celebration.time*7.5+spectator.position.x*.11+spectator.position.z*.07))*.45*energy;
      for(const part of spectator.parts){const batch=batches.get(part.id),pose=celebrationMatrix.copy(batch.items[part.index].matrix);pose.elements[13]+=lift;batch.mesh.setMatrixAt(part.index,pose);}
     }
     for(const batch of batches.values())batch.mesh.instanceMatrix.needsUpdate=true;celebrationWasActive=true;
    }
   }else if(celebrationWasActive)restoreCrowdPose();
   if(reducedMotion)return;
   const upper=batches.get('upperArms').mesh,fore=batches.get('forearms').mesh,hands=batches.get('hands').mesh;
   for(const fan of wavers){
    const energy=celebration?(fan.house===celebration.house?1:.42):0,phase=celebration?celebration.time*7.5+fan.phase:elapsed*2.3+fan.phase,wave=Math.sin(phase),lift=celebration?Math.max(0,wave)*.45*energy:0;
    const elbow=fan.elbow.clone().add(v(.015*wave,.018*wave+lift*.65,0)),hand=fan.hand.clone().add(v((celebration?.11:.065)*wave,(celebration?.13:.05)*Math.cos(phase)+lift,0));
    upper.setMatrixAt(fan.upperIndex,fan.fan.clone().multiply(segment(fan.shoulder,elbow,.105)));
    fore.setMatrixAt(fan.foreIndex,fan.fan.clone().multiply(segment(elbow,hand,.09)));
    hands.setMatrixAt(fan.handIndex,fan.fan.clone().multiply(matrix(hand,v(.105,.12,.10))));
   }
   upper.instanceMatrix.needsUpdate=fore.instanceMatrix.needsUpdate=hands.instanceMatrix.needsUpdate=true;
  }
  return {root,spectators,getStatus,update,celebrate,reset};
 }
 return Object.freeze({build});
})();
