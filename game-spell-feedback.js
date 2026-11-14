/* Readable spell feedback, separate from gameplay rules. */
window.createSpellFeedback=function({T,scene,V,player,pos,state,actors,bludgers,tone,getCarrier,quaffle}){
 const views=new Map(),effects=[],tethers=[],lastShield=new Map();let clock=0;
 function dispose(root){root.traverse(p=>{p.geometry?.dispose();for(const m of(Array.isArray(p.material)?p.material:[p.material]))if(m){m.map?.dispose();m.dispose();}});root.removeFromParent();}
 function material(color,opacity=.8){return new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false});}
 function ring(parent,name,color,radius,y){const m=new T.Mesh(new T.TorusGeometry(radius,.035,6,40),material(color));m.name=name;m.position.y=y;m.rotation.x=Math.PI/2;parent.add(m);return m;}
 function view(unit){
  let v=views.get(unit);if(v&&v.root===unit.mesh)return v;if(v)dispose(v.group);
  const group=new T.Group();group.name='SpellStatusFeedback';unit.mesh.add(group);
  const slow=new T.Group();slow.name='SlowBlueBands';group.add(slow);ring(slow,'SlowBandA',0x67c5ff,.85,.35);ring(slow,'SlowBandB',0x67c5ff,1.05,.7);ring(slow,'SlowBandC',0x67c5ff,.65,1.05);
  const blind=new T.Group();blind.name='BlackBlindfold';blind.position.set(0,1.9,-.07);group.add(blind);const band=new T.Mesh(new T.BoxGeometry(.62,.17,.61),material(0x090711,1));band.position.z=-.05;blind.add(band);
  const confusion=new T.Group();confusion.name='PurpleConfusionSpiral';group.add(confusion);const points=[];for(let i=0;i<70;i++){const t=i/69*Math.PI*5,r=.11+i/69*.48;points.push(V(Math.cos(t)*r,2.6+i/69*.45,Math.sin(t)*r));}confusion.add(new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0xc992ff,transparent:true,opacity:.9})));
  const bubble=new T.Mesh(new T.SphereGeometry(1.8,20,14),material(0x61aaff,.14));bubble.name='ProtegoBlueBubble';bubble.position.y=1;group.add(bubble);const shieldRing=ring(bubble,'ShieldOrbit',0x99dcff,1,0);shieldRing.scale.setScalar(1.7);
  const green=new T.Group();green.name='SerpentGreenWake';group.add(green);for(let i=0;i<6;i++){const m=new T.Mesh(new T.SphereGeometry(.07,7,5),material(0x77ee9e,.65-i*.07));m.position.set((i%2?-.15:.15),.3,1+i*.36);green.add(m);}
  const heal=new T.Group();heal.name='GoldenRecoveryMotes';group.add(heal);for(let i=0;i<10;i++)heal.add(new T.Mesh(new T.SphereGeometry(.055,6,5),material(0xffd988)));
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=120;const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;const label=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false}));label.name='SpellStatusCountdown';label.position.y=3.35;label.scale.set(5.8,.9,1);label.renderOrder=20;group.add(label);
  const body=unit.mesh.userData.rig?.body,hand=body?.children.find(m=>m.geometry?.type==='SphereGeometry'&&Math.abs(m.position.x+.08)<.02&&Math.abs(m.position.y-.48)<.02);
  v={hand,handBase:hand?.position.clone(),root:unit.mesh,group,slow,blind,confusion,bubble,green,heal,label,canvas,texture,lastText:''};views.set(unit,v);return v;
 }
 function burst(at,color,kind='ring'){
  const mesh=new T.Group();mesh.position.copy(at);scene.add(mesh);
  if(kind==='ring'){for(let i=0;i<2;i++){const m=new T.Mesh(new T.TorusGeometry(.7,.06,6,40),material(color,.9));m.rotation.set(i*Math.PI/2,0,0);mesh.add(m);}}
  else for(let i=0;i<12;i++){const m=new T.Mesh(new T.OctahedronGeometry(.09),material(color));m.position.set(Math.cos(i*2.4)*.5,(i%4)*.22,Math.sin(i*2.4)*.5);m.userData.velocity=m.position.clone().normalize().multiplyScalar(kind==='inward'?-1.2:2);mesh.add(m);}
  effects.push({mesh,life:kind==='ring'?.55:1,total:kind==='ring'?.55:1,kind});
 }
 function sound(effect){const sounds={expelliarmus:[145,.12,'sawtooth'],arresto:[175,.42,'sine'],serpent:[270,.17,'sawtooth'],obscuro:[95,.16,'triangle'],confundus:[650,.2,'sine'],protego:[820,.13,'sine'],finite:[950,.22,'triangle'],rennervate:[520,.3,'sine'],accio:[410,.3,'triangle'],ward:[310,.5,'sine']};const s=sounds[effect];if(s){tone(...s,.035);if(effect==='confundus'){tone(480,.38,'sine',.018);tone(760,.5,'sine',.009);}}}
 function hit(effect,unit){const s=state(unit);sound(effect);if(effect==='expelliarmus'){s.recoil=.65;burst(pos(unit).clone().add(V(0,1,0)),0xff5c55);}else if(effect==='serpent'){s.bank=1.4;burst(pos(unit),0x69ed93,'shards');}else if(effect==='obscuro')burst(pos(unit).clone().add(V(0,1.9,0)),0x51476d,'shards');else if(effect==='confundus')burst(pos(unit).clone().add(V(0,2.5,0)),0xc395ff);}
 function cleanse(unit){const s=state(unit);for(const [key,color]of [['blind',0x77618f],['confused',0xbe8aff],['slow',0x6bbdff]])if(s[key]>0)burst(pos(unit).clone().add(V(0,1,0)),color,'shards');s.cleansing=1;sound('finite');}
 function heal(unit){state(unit).healing=1.8;sound('rennervate');burst(pos(unit).clone().add(V(0,1,0)),0xffd795,'inward');}
 function shieldHit(unit,color=0x83cbff){if(clock-(lastShield.get(unit)??-99)<.3)return;lastShield.set(unit,clock);sound('protego');burst(pos(unit).clone().add(V(0,1,0)),color);}
 function zoneHit(z,unit){const direction=pos(unit).clone().sub(z.center);if(direction.lengthSq()<.01)direction.set(0,.4,1);const at=z.center.clone().addScaledVector(direction.normalize(),z.radius);burst(at,0xffdc78);sound('ward');}
 function tether(caster){const group=new T.Group();group.name='AccioWandTether';const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(6),3));group.add(new T.Line(geometry,new T.LineBasicMaterial({color:0xace4ff,transparent:true,opacity:.9})));for(let i=0;i<5;i++)group.add(new T.Mesh(new T.SphereGeometry(.065,7,5),material(0xc9efff)));scene.add(group);tethers.push({mesh:group,caster,life:1.8});sound('accio');}
 function zone(kind,radius,color){const group=new T.Group();group.name=kind==='ward'?'GoldenFixedDome':'BlueSlowBoundary';
  if(kind==='ward'){
   const dome=new T.Mesh(new T.SphereGeometry(radius,28,14,0,Math.PI*2,0,Math.PI/2),material(0xffd569,.12));group.add(dome);ring(group,'DomeBase',0xffd569,radius,0);
   for(let i=1;i<=3;i++){const y=radius*i/4;ring(group,'DomeLatitude'+i,0xffd569,Math.sqrt(radius*radius-y*y),y);}
  }else{ring(group,'BoundaryLower',0x6daeff,radius,-2.5);ring(group,'BoundaryUpper',0x6daeff,radius,2.5);for(let i=0;i<12;i++){const a=i/12*Math.PI*2,m=new T.Mesh(new T.CylinderGeometry(.025,.025,5,5),material(0x6daeff,.5));m.position.set(Math.cos(a)*radius,0,Math.sin(a)*radius);group.add(m);}}
  return group;
 }
 function update(dt){clock+=dt;
  const all=actors();for(const u of all){const s=state(u);for(const k of ['recoil','bank','healing','cleansing'])s[k]=Math.max(0,(s[k]||0)-dt);const v=view(u),frozen=bludgers.includes(u)?u.frozen||0:0,shield=u===player?player.shield:s.shield;
   v.slow.visible=(s.slow>0&&!(s.bank>0))||frozen>0;v.blind.visible=s.blind>0;v.confusion.visible=s.confused>0;v.bubble.visible=shield>0;v.green.visible=s.bank>0;v.heal.visible=s.healing>0;
   v.slow.rotation.y=clock*.45;v.confusion.rotation.y=clock*2;v.bubble.rotation.y=clock*.7;
   for(let i=0;i<v.heal.children.length;i++){const a=i*2.4+clock*3,r=Math.max(.1,((clock+i*.13)%1.2));v.heal.children[i].position.set(Math.cos(a)*r,.3+(i*.19+clock*.6)%1.7,Math.sin(a)*r);}
   const rig=u.mesh.userData.rig;if(rig){if(v.hand)v.hand.position.copy(v.handBase).add(V(0,(s.recoil||0)*.4,(s.recoil||0)*.35));const broom=u.mesh.userData.replaceable?.broom;if(broom)broom.rotation.z=s.bank>0?.32*Math.sin(s.bank*5):0;rig.body.rotation.x=s.recoil>0?.52*s.recoil/.65:s.healing>0?.14*s.healing/1.8:s.slow>0?.08:0;rig.body.rotation.z=s.bank>0?.4*Math.sin(s.bank*5):0;rig.body.rotation.y=s.confused>0?Math.sin(clock*6)*.18:0;const head=u.mesh.getObjectByName('Head');if(head)head.rotation.y=s.blind>0?Math.sin(clock*9)*.28:s.confused>0?Math.sin(clock*5)*.45:0;}
   const list=[];for(const [label,t]of [['缴械',s.recoil],['减速',s.slow],['偏航',s.bank],['蒙眼',s.blind],['混淆',s.confused],['护盾',shield],['恢复',s.healing],['解咒',s.cleansing],['冻结',frozen]])if(t>0)list.push(label+' '+t.toFixed(1)+'秒');
   const text=list.join(' · ');v.label.visible=!!text;if(text!==v.lastText){const c=v.canvas.getContext('2d');c.clearRect(0,0,512,120);c.font=(text.length>15?'28':'44')+'px Microsoft YaHei,sans-serif';const width=Math.min(500,c.measureText(text.slice(0,36)).width+28);c.fillStyle='rgba(5,12,25,.88)';c.fillRect((512-width)/2,15,width,80);c.fillStyle='#f7e9c3';c.textAlign='center';c.fillText(text.slice(0,36),256,70);v.texture.needsUpdate=true;v.lastText=text;}
  }
  for(const [u,v]of views)if(!all.includes(u)||v.root!==u.mesh){dispose(v.group);views.delete(u);}
  for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;for(const m of e.mesh.children){if(e.kind==='ring')m.scale.addScalar(dt*4);else m.position.addScaledVector(m.userData.velocity,dt);m.material.opacity=Math.max(0,e.life/e.total);}if(e.life<=0){dispose(e.mesh);effects.splice(i,1);}}
  for(let i=tethers.length-1;i>=0;i--){const t=tethers[i];t.life-=dt;const from=V();t.caster.mesh.updateMatrixWorld(true);t.caster.mesh.getObjectByName('SpellSocket').getWorldPosition(from);const to=quaffle.position,arr=t.mesh.children[0].geometry.attributes.position;arr.setXYZ(0,from.x,from.y,from.z);arr.setXYZ(1,to.x,to.y,to.z);arr.needsUpdate=true;t.mesh.children[0].geometry.computeBoundingSphere();for(let j=1;j<t.mesh.children.length;j++)t.mesh.children[j].position.lerpVectors(from,to,(clock*2+j*.2)%1);if(t.life<=0||getCarrier()){dispose(t.mesh);tethers.splice(i,1);}}
 }
 function reset(){for(const [u,v]of views){const body=u.mesh.userData.rig?.body;if(body)body.rotation.set(0,0,0);if(v.hand)v.hand.position.copy(v.handBase);const broom=u.mesh.userData.replaceable?.broom;if(broom)broom.rotation.z=0;const head=u.mesh.getObjectByName('Head');if(head)head.rotation.y=0;dispose(v.group);}views.clear();for(const e of [...effects,...tethers])dispose(e.mesh);effects.length=tethers.length=0;lastShield.clear();}
 function animationTime(mesh,dt,time){const unit=actors().find(u=>u.mesh===mesh);if(!unit)return time;const v=view(unit);v.phase=(v.phase??time)+dt*(state(unit).slow>0?.3:1);return v.phase;}
 return {animationTime,update,reset,hit,cleanse,heal,shieldHit,zoneHit,tether,zone,sound,views,effects,tethers};
};
