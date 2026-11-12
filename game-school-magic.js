/* Original game adaptations of school characters and spell roles. */
window.SchoolMagic=(()=>{
 const c=(id,name,en,cn,spell,effect,description,cooldown,range,color,look={})=>({id,name,en,cn,spell,effect,description,cooldown,range,color,pitch:1,rate:1,...look});
 const rosters={
  gryffindor:[
   c('harry','哈利 · 波特','HARRY POTTER','除你武器','EXPELLIARMUS','expelliarmus','勇敢迎战 · 瞄准使对手掉球',7,36,0xff8266,{hair:0x21212b}),
   c('hermione','赫敏 · 格兰杰','HERMIONE GRANGER','减震止速','ARRESTO MOMENTUM','arresto','精准控制 · 减速对手或冻结游走球',9,32,0xff6aab,{hair:0x513427,longHair:true}),
   c('ron','罗恩 · 韦斯莱','RON WEASLEY','盔甲护身','PROTEGO','protego','保护伙伴 · 自身及附近一名队友获得护盾',14,20,0x79bfff,{hair:0xb35e32})
  ],
  slytherin:[
   c('draco','德拉科 · 马尔福','DRACO MALFOY','乌龙出洞','SERPENSORTIA','serpent','好胜施压 · 蛇形魔法迫使对手偏航',9,32,0x83dc9b,{hair:0xd8d0a1}),
   c('pansy','潘西 · 帕金森','PANSY PARKINSON','蒙眼咒','OBSCURO','obscuro','寻找破绽 · 短暂遮挡视野、干扰瞄准',11,30,0x9077c6,{hair:0x161c20,bob:true}),
   c('blaise','布雷斯 · 扎比尼','BLAISE ZABINI','混淆咒','CONFUNDUS','confundus','冷静布局 · 制造假球，诱导目标偏离路线',12,30,0xc6a5ef,{hair:0x191413,skin:0x8c5b40})
  ],
  ravenclaw:[
   c('luna','卢娜 · 洛夫古德','LUNA LOVEGOOD','呼神护卫','EXPECTO PATRONUM','patronus','银兔护航 6 秒 · 为附近队友最多挡开两次游走球',16,20,0xb4e5ff,{hair:0xd9c58b,longHair:true}),
   c('cho','秋 · 张','CHO CHANG','飞来咒','ACCIO','accio','召回 24 米内的自由鬼飞球 · 不能夺取持有中的球',10,24,0x79c8fa,{hair:0x171a20,longHair:true}),
   c('padma','帕德玛 · 佩蒂尔','PADMA PATIL','障碍重重','IMPEDIMENTA','impedimenta','预判路线 · 前方形成短时减速区域',14,14,0x7ba7ff,{hair:0x231b18,skin:0xb98561,longHair:true})
  ],
  hufflepuff:[
   c('cedric','塞德里克 · 迪戈里','CEDRIC DIGGORY','咒立停','FINITE INCANTATEM','finite','沉着应对 · 清除自己与附近队友的干扰',12,20,0xffdfa0,{hair:0x5c3b26}),
   c('hannah','汉娜 · 艾博','HANNAH ABBOTT','快快复苏','RENNERVATE','rennervate','关怀伙伴 · 帮助受击队友恢复，补充冲刺体力',14,22,0xffc580,{hair:0xd3aa55,longHair:true}),
   c('ernie','厄尼 · 麦克米兰','ERNIE MACMILLAN','统统加护','PROTEGO TOTALUM','ward','坚守职责 · 建立保护区，为队友抵挡一次攻击',17,0,0xffe978,{hair:0x795c35})
  ]
 };
 const all=Object.values(rosters).flat(),byId=id=>all.find(c=>c.id===id);
 return {rosters,all,byId};
})();
window.createSchoolSpellEngine=function(api){
 const {THREE:T,scene,player,rivals,allies,bludgers,practiceDummy,match,V,notify}=api;
 const statuses=new Map(),zones=[],decoys=[],visuals=[],guardians=[];
 const isPlayer=u=>u===player,pos=u=>u===player?player.pos:u.mesh.position;
 const state=u=>{if(!statuses.has(u))statuses.set(u,{slow:0,blind:0,confused:0,shield:0,stun:0,haste:0});return statuses.get(u);};
 const feedback=window.createSpellFeedback({T,scene,V,player,pos,state,actors:()=>[player,...rivals,...allies,practiceDummy,...bludgers],bludgers,tone:api.tone,getCarrier:api.getCarrier,quaffle:api.quaffle});
 const friendly=u=>u===player||allies.includes(u),team=u=>friendly(u)?[player,...allies]:rivals;
 const enemies=u=>friendly(u)?(api.training()?(practiceDummy.mesh.visible?[practiceDummy]:[]):rivals):[player,...allies];
 const protectedByShield=u=>u===player?player.shield>0:state(u).shield>0;
 function pulse(at,color,radius=1){const mesh=new T.Mesh(new T.SphereGeometry(radius,12,8),new T.MeshBasicMaterial({color,wireframe:true,transparent:true,opacity:.65,depthWrite:false}));mesh.position.copy(at);scene.add(mesh);visuals.push({mesh,life:.6,total:.6});}
 function remove(mesh){mesh.traverse(p=>{p.geometry?.dispose();if(p.material){for(const m of(Array.isArray(p.material)?p.material:[p.material]))if(!m.userData.shared)m.dispose();}});mesh.removeFromParent();}
 function shieldFor(u,duration){if(u===player)player.shield=Math.max(player.shield,duration);else state(u).shield=Math.max(state(u).shield,duration);feedback.sound('protego');}
 function blocked(u){if(protectedByShield(u)){feedback.shieldHit(u);return true;}for(const z of zones)if(z.kind==='ward'&&friendly(z.owner)===friendly(u)&&pos(u).distanceTo(z.center)<z.radius&&!z.used.has(u)){z.used.add(u);feedback.zoneHit(z,u);return true;}return false;}
 function clear(u,restoring=false){if(!restoring)feedback.cleanse(u);const s=state(u);s.slow=s.blind=s.confused=s.stun=s.recoil=s.bank=0;u.stun=0;for(const d of decoys.filter(d=>d.target===u))d.life=0;}
 function target(cfg,caster=player){
  if(!['expelliarmus','arresto','serpent','obscuro','confundus'].includes(cfg.effect))return null;
  const origin=pos(caster).clone().add(V(0,1,0)),forward=caster===player?api.camera.getWorldDirection(V()):V(0,0,-1).applyQuaternion(caster.mesh.quaternion),cone=Math.cos((caster===player?22:38)*Math.PI/180);
  let candidates=enemies(caster);if(cfg.effect==='arresto'&&caster===player)candidates=[...candidates,...bludgers];let best=null,score=Infinity;
  for(const u of candidates){if(u!==player&&!u.mesh.visible)continue;const aim=pos(u).clone().add(bludgers.includes(u)?V():V(0,1,0)),delta=aim.clone().sub(origin),distance=delta.length();if(distance<.1||distance>cfg.range||delta.dot(forward)<=0)continue;
   const sight=caster===player?aim.sub(api.camera.position).normalize():delta.normalize(),alignment=sight.dot(forward);if(alignment<cone)continue;const rank=(1-alignment)*100+distance*.04;if(rank<score){best=u;score=rank;}
  }return best;
 }
 function makeZone(kind,owner,center,radius,life,color){const mesh=feedback.zone(kind,radius,color);mesh.position.copy(center);scene.add(mesh);zones.push({kind,owner,center:center.clone(),radius,life,mesh,used:new Set()});feedback.sound(kind==='ward'?'ward':'arresto');}
 function applyHit(effect,u,caster){
  if(bludgers.includes(u)){u.frozen=3.2;u.vel.multiplyScalar(.15);feedback.hit('arresto',u);return;}
  if(blocked(u)){if(caster===player)notify('对手的防护挡住了咒语',1.5);return;}
  const s=state(u);
  if(effect==='expelliarmus'){if(api.getCarrier()===(u===player?'player':u))api.dropQuaffle();if(u===player)s.stun=.65;else u.stun=Math.max(u.stun||0,.65);}
  if(effect==='arresto')s.slow=3.2;
  if(effect==='serpent'){const forward=pos(u).clone().sub(pos(caster)).normalize(),side=V(-forward.z,.25,forward.x).normalize();pos(u).addScaledVector(side,3);api.constrainPitch(pos(u),4,38);s.slow=1.4;}
  if(effect==='obscuro')s.blind=2.8;
  if(effect==='confundus'){
   s.confused=4;const fake=api.quaffle.clone(true);fake.name='FalseQuaffle';fake.scale.setScalar(.88);fake.position.copy(api.quaffle.position).add(V(12,4,7));fake.traverse(p=>{if(p.geometry)p.geometry=p.geometry.clone();if(p.material){p.material=p.material.clone();p.material.transparent=true;p.material.opacity=u===player?.72:.48;if(u!==player){p.material.color.set(0xc3a5ff);p.material.wireframe=true;}}});scene.add(fake);decoys.push({target:u,mesh:fake,life:4});
  }
  feedback.hit(effect,u);if(caster===player)notify(({expelliarmus:'缴械命中 · 对手短暂受击',arresto:'减速命中 · 持续 3.2 秒',serpent:'蛇形魔法命中 · 对手偏航',obscuro:'蒙眼咒命中 · 干扰对手瞄准',confundus:'混淆咒命中 · 对手被假球引开'})[effect]||'咒语命中',1.6);
 }
 function projectile(cfg,caster,u){
  const mesh=new T.Group(),color=cfg.color;if(cfg.effect==='serpent'){
   for(let i=0;i<7;i++){const bead=new T.Mesh(new T.SphereGeometry(.2-i*.016,8,6),new T.MeshBasicMaterial({color}));bead.position.z=i*.26;bead.position.x=Math.sin(i)*.2;mesh.add(bead);}
  }else mesh.add(new T.Mesh(new T.SphereGeometry(.18,10,8),new T.MeshBasicMaterial({color})));
  caster.mesh.updateMatrixWorld(true);caster.mesh.getObjectByName('SpellSocket').getWorldPosition(mesh.position);scene.add(mesh);api.projectiles.push({mesh,target:u,effect:cfg.effect,caster,vel:V(),life:2.8,color});
 }
 function summonGuardian(owner){
  for(let i=guardians.length-1;i>=0;i--)if(guardians[i].owner===owner){remove(guardians[i].mesh);guardians.splice(i,1);}
  const mesh=new T.Group();mesh.name='SilverHarePatronus';
  const silver=new T.MeshStandardMaterial({color:0xdaf4ff,emissive:0x83bfff,emissiveIntensity:1.3,roughness:.35,transparent:true,opacity:.82,depthWrite:false});
  const inner=new T.MeshBasicMaterial({color:0xb6d4ff,transparent:true,opacity:.8,depthWrite:false});
  function part(name,location,scale,material=silver){const m=new T.Mesh(new T.SphereGeometry(1,14,10),material);m.name=name;m.position.copy(location);m.scale.copy(scale);mesh.add(m);return m;}
  part('Body',V(0,.25,0),V(.34,.38,.63));part('Head',V(0,.55,.57),V(.27,.3,.29));part('Muzzle',V(0,.46,.82),V(.17,.14,.2));
  for(const side of [-1,1]){
   const ear=part(side<0?'EarL':'EarR',V(side*.16,1.12,.49),V(.095,.49,.105));ear.rotation.z=-side*.16;
   const lining=part('EarInner',V(side*.16,1.12,.585),V(.043,.37,.025),inner);lining.rotation.z=-side*.16;
   part('Eye',V(side*.22,.63,.7),V(.037,.045,.035),new T.MeshBasicMaterial({color:0xffffff}));
   part('RearPaw',V(side*.27,.03,-.24),V(.19,.18,.31));part('FrontPaw',V(side*.2,-.02,.43),V(.09,.16,.25));
  }
  part('Tail',V(0,.33,-.63),V(.18,.18,.2));
  const halo=part('Halo',V(0,.36,.03),V(.6,.85,.95),new T.MeshBasicMaterial({color:0xaedcff,transparent:true,opacity:.1,depthWrite:false}));
  for(let i=0;i<6;i++)part('Spark'+i,V(),V(.035,.035,.035),inner);
  mesh.add(new T.PointLight(0xabcfff,.7,6));mesh.position.copy(pos(owner)).add(V(1.4,1.1,.5));scene.add(mesh);
  guardians.push({owner,mesh,halo,life:6,blocks:2,age:0,dash:0,dashTarget:V(),blockedAt:new Map()});pulse(mesh.position,0xe1f5ff,1);
 }
 function updateGuardians(dt){
  for(let i=guardians.length-1;i>=0;i--){
   const g=guardians[i];g.life-=dt;g.age+=dt;g.dash=Math.max(0,g.dash-dt);
   if(g.life<=0||g.blocks<=0){pulse(g.mesh.position,0xd5efff,.8);remove(g.mesh);guardians.splice(i,1);continue;}
   const protectedUnits=team(g.owner).filter(u=>u===g.owner||pos(u).distanceTo(pos(g.owner))<=20);
   for(const ball of bludgers){
    if(!ball.mesh.visible||ball.frozen>0||g.age-(g.blockedAt.get(ball)??-99)<.8)continue;
    const start=ball.mesh.position,step=ball.vel.clone().multiplyScalar(dt*(match.mode==='challenge'?1:.65)),length=step.lengthSq();
    let threatened=null,nearest=Infinity;
    for(const u of protectedUnits){
     const delta=pos(u).clone().sub(start);if(ball.vel.dot(delta)<=0&&delta.length()>2.4)continue;
     const t=length?Math.max(0,Math.min(1,delta.dot(step)/length)):0,distance=start.clone().addScaledVector(step,t).distanceTo(pos(u));
     if(distance<4.6&&distance<nearest){nearest=distance;threatened=u;}
    }
    if(!threatened)continue;
    g.blocks--;g.blockedAt.set(ball,g.age);g.dash=.5;g.dashTarget.copy(start);
    const away=start.clone().sub(pos(threatened));if(away.lengthSq()<.01)away.set(1,.4,0);away.normalize();
    ball.vel.copy(away).multiplyScalar(28);ball.retarget=1.4;ball.frozen=.12;ball.mesh.position.addScaledVector(away,1.2);
    pulse(start,0xe8f7ff,1.3);if(friendly(g.owner)){api.tone(1050,.1,'sine',.035);notify('银兔挡开游走球 · 剩余 '+g.blocks+' 次',1.3);}
    if(g.blocks===0)break;
   }
   const idle=pos(g.owner).clone().add(V(Math.cos(g.age*2)*1.7,1.3+Math.abs(Math.sin(g.age*5))*.35,Math.sin(g.age*2)*1.7)),destination=g.dash>0?g.dashTarget:idle;
   const direction=destination.clone().sub(g.mesh.position);g.mesh.position.lerp(destination,1-Math.exp(-dt*(g.dash>0?20:7)));
   if(direction.lengthSq()>.01)g.mesh.rotation.y=Math.atan2(direction.x,direction.z);
   g.mesh.rotation.x=Math.sin(g.age*7)*.07;g.halo.material.opacity=.08+Math.sin(g.age*8)*.025;
   for(let n=0;n<6;n++){const spark=g.mesh.getObjectByName('Spark'+n);spark.position.set(Math.sin(g.age*3+n)*.45,.3+Math.cos(g.age*4+n)*.45,-.5-n*.21);}
   // Keep the final interception visible briefly before the guardian dissolves.
   if(g.blocks===0){g.mesh.position.copy(g.dashTarget);g.life=0;}
  }
 }
 function accioStatus(caster=player){
  const carrier=api.getCarrier(),distance=pos(caster).distanceTo(api.quaffle.position),range=24;
  if(carrier===(caster===player?'player':caster))return {ok:false,distance,range,message:'你已经持球 · F / 左键射门，T 传球'};
  if(carrier)return {ok:false,distance,range,message:friendly(carrier==='player'?player:carrier)===friendly(caster)?'队友正持球 · 按 T 要球；飞来咒只召回自由球':'对手正持球 · 先抢断或缴械，再召回自由球'};
  if(!api.quaffle.visible)return {ok:false,distance,range,message:'当前没有可召回的鬼飞球'};
  if(distance>range)return {ok:false,distance,range,message:'鬼飞球距离 '+Math.ceil(distance)+' 米 · 请靠近到 '+range+' 米内再按 R'};
  return {ok:true,distance,range,message:'自由鬼飞球 '+Math.ceil(distance)+' 米 · R / 右键召回'};
 }
 function cast(cfg,caster=player){
  const isSelf=caster===player,near=team(caster).filter(u=>u!==caster&&pos(u).distanceTo(pos(caster))<=cfg.range).sort((a,b)=>pos(a).distanceToSquared(pos(caster))-pos(b).distanceToSquared(pos(caster)));
  const aimed=target(cfg,caster);
  if(['expelliarmus','arresto','serpent','obscuro','confundus'].includes(cfg.effect)&&!aimed){if(isSelf)notify('瞄准 '+cfg.range+' 米内的目标 · 未消耗冷却',1.5);return false;}
  if(cfg.effect==='accio'){const status=accioStatus(caster);if(!status.ok){if(isSelf)notify(status.message+' · 未消耗冷却',2.8);return false;}}
  if(aimed)projectile(cfg,caster,aimed);
  else if(cfg.effect==='protego'){shieldFor(caster,4);if(near[0])shieldFor(near[0],4);}
  else if(cfg.effect==='patronus')summonGuardian(caster);
  else if(cfg.effect==='accio'){api.summonBall(caster);feedback.tether(caster);}
  else if(cfg.effect==='impedimenta'){const forward=isSelf?api.camera.getWorldDirection(V()):V(0,0,-1).applyQuaternion(caster.mesh.quaternion);const center=pos(caster).clone().addScaledVector(forward,12);api.constrainPitch(center,4,38);makeZone('slow',caster,center,6,5,cfg.color);}
  else if(cfg.effect==='finite'){clear(caster);for(const u of near)clear(u);}
  else if(cfg.effect==='rennervate'){const hurt=near.filter(u=>u.stun>0||state(u).stun>0||state(u).slow>0||state(u).blind>0||state(u).confused>0)[0]||near[0]||caster;clear(hurt,true);if(hurt===player){player.stamina=Math.min(100,player.stamina+25);player.exhausted=false;}else state(hurt).haste=3;/* AI has no stamina meter: a short recovery boost is equivalent. */feedback.heal(hurt);}
  else if(cfg.effect==='ward')makeZone('ward',caster,pos(caster),7,6,cfg.color);
  caster.mesh.userData.castTime=.55;
  if(isSelf){match.usedSpell=true;match.callout=cfg.cn+' · '+cfg.spell;match.calloutTime=1.45;notify(cfg.cn+' · '+cfg.description,2);api.speak(cfg.spell);api.tone(520,.18,'triangle',.06);if(api.training()&&match.trainingStep===4&&!aimed)api.finishTraining();}
  return true;
 }
 function castPlayer(){if(match.state!=='playing'||match.paused)return false;const i=match.selected,cfg=api.configs[i];if(match.cooldowns[i]>0){notify(cfg.cn+' · 冷却 '+match.cooldowns[i].toFixed(1)+' 秒',1);return false;}if(!cast(cfg))return false;match.cooldowns[i]=cfg.cooldown;return true;}
 function speed(u){const s=state(u);return s.stun>0?0:(s.slow>0?.48:1)*(s.haste>0?1.12:1);}
 function aiTarget(u,normal){const s=state(u),d=decoys.find(d=>d.target===u&&d.life>0);if(d)return d.mesh.position;if(s.blind>0)return pos(u).clone().add(V(Math.sin(match.elapsed+u.index)*8,0,Math.cos(match.elapsed+u.index)*8));return normal;}
 function debuffed(u){const s=state(u);return s.slow>0||s.blind>0||s.confused>0||s.stun>0||u.stun>0;}
 function update(dt){
  for(let i=0;i<3;i++)match.cooldowns[i]=Math.max(0,match.cooldowns[i]-dt);
  for(const [u,s]of statuses){for(const key of ['slow','blind','confused','shield','stun','haste'])s[key]=Math.max(0,s[key]-dt);}
  for(let i=visuals.length-1;i>=0;i--){const v=visuals[i];v.life-=dt;v.mesh.scale.multiplyScalar(1+dt*2);v.mesh.material.opacity=Math.max(0,v.life/v.total)*.6;if(v.life<=0){remove(v.mesh);visuals.splice(i,1);}}
  for(let i=api.projectiles.length-1;i>=0;i--){const p=api.projectiles[i];p.life-=dt;const aim=pos(p.target).clone().add(bludgers.includes(p.target)?V():V(0,1,0)),delta=aim.sub(p.mesh.position),distance=delta.length();p.vel.copy(delta).normalize().multiplyScalar(46);p.mesh.position.addScaledVector(p.vel,Math.min(dt,distance/46));if(p.effect==='serpent')p.mesh.lookAt(pos(p.target));if(distance<Math.max(1.25,46*dt)){applyHit(p.effect,p.target,p.caster||player);if(api.training()&&p.target===practiceDummy)api.finishTraining();p.life=0;}if(p.life<=0){remove(p.mesh);api.projectiles.splice(i,1);}}
  for(let i=zones.length-1;i>=0;i--){const z=zones[i];z.life-=dt;z.mesh.rotation.y+=dt*.4;if(z.kind==='slow')for(const u of enemies(z.owner))if(pos(u).distanceTo(z.center)<z.radius&&!protectedByShield(u))state(u).slow=Math.max(state(u).slow,.25);if(z.life<=0){remove(z.mesh);zones.splice(i,1);}}
  for(let i=decoys.length-1;i>=0;i--){const d=decoys[i];d.life-=dt;d.mesh.position.y+=Math.sin(match.elapsed*4)*dt;d.mesh.visible=true;if(d.life<=0){remove(d.mesh);decoys.splice(i,1);}}
  const s=state(player),fog=document.getElementById('spellVeil');if(fog){fog.hidden=s.blind<=0;fog.style.opacity=String(Math.min(.88,s.blind));}
  updateGuardians(dt);
  // Both teams use their own school's spells; cadence and aim leave time to react.
  if(!api.training())for(const u of [...rivals,...allies]){u.spellTimer=(u.spellTimer??(12+u.index*3))-dt;if(u.spellTimer>0||u.stun>0)continue;const cfg=SchoolMagic.byId(u.mesh.userData.characterId)||SchoolMagic.rosters[match.awayHouse][u.index%3];const support=['finite','rennervate','protego','ward','patronus'].includes(cfg.effect);if((!support||cfg.effect==='protego'||cfg.effect==='ward'||cfg.effect==='patronus'&&bludgers.some(b=>b.mesh.visible&&pos(u).distanceTo(b.mesh.position)<28)||team(u).some(debuffed))&&cast(cfg,u))u.spellTimer=cfg.cooldown+7;else u.spellTimer=3;}
  feedback.update(dt);
 }
 function reset(){feedback.reset();for(const p of api.projectiles.splice(0))remove(p.mesh);for(const v of [...zones,...decoys,...visuals,...guardians])remove(v.mesh);zones.length=decoys.length=visuals.length=guardians.length=0;statuses.clear();for(const u of [...rivals,...allies])u.spellTimer=12+u.index*3;const fog=document.getElementById('spellVeil');if(fog)fog.hidden=true;}
 function help(cfg){if(cfg.effect==='accio')return accioStatus().message;if(cfg.effect==='patronus'){const guard=guardians.find(g=>g.owner===player);return guard?'银兔护航 '+guard.life.toFixed(1)+' 秒 · 剩余拦截 '+guard.blocks+' 次':'R / 右键 · 银兔护航 6 秒，最多拦截两次';}return ['expelliarmus','arresto','serpent','obscuro','confundus'].includes(cfg.effect)?'瞄准 '+cfg.range+' 米内目标 · R 施法':cfg.effect==='accio'?'自由鬼飞球 '+cfg.range+' 米内 · R 召回':cfg.description+' · R / 右键';}
 return {castPlayer,target,update,reset,speed,aiTarget,state,blocked,clear,cast,applyHit,zones,decoys,guardians,feedback,accioStatus,help};
};
