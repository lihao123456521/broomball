/* Match-aware spell choices. This module only describes a play; the game owns effects. */
window.BroomMatchSkills=(()=>{
 'use strict';
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
 const position=(unit,player)=>unit==='player'?player.pos:unit?.mesh?.position;
 const active=unit=>!!unit?.mesh&&unit.mesh.visible!==false&&!(unit.stun>0);
 function alignment(origin,target,aim){
  if(!aim)return -1;
  const dx=target.x-origin.x,dy=target.y-origin.y,dz=target.z-origin.z;
  return (dx*aim.x+dy*aim.y+dz*aim.z)/(Math.hypot(dx,dy,dz)||1);
 }
 function laneDistance(point,from,to){
  const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,length=dx*dx+dy*dy+dz*dz;
  const t=length?((point.x-from.x)*dx+(point.y-from.y)*dy+(point.z-from.z)*dz)/length:0;
  const clamped=Math.max(0,Math.min(1,t));
  return {t,distance:Math.hypot(point.x-from.x-dx*clamped,point.y-from.y-dy*clamped,point.z-from.z-dz*clamped)};
 }
 function getContext(options){
  const {player,rivals=[],allies=[],carrier=null,quaffle,passTarget=null,passReceiver=null,
   aim,config={},selected=0,training=false,practiceDummy=null,bludgers=[]}=options;
  const friendly=unit=>unit==='player'||allies.includes(unit);
  const effect=config.effect||['expelliarmus','stupefy','protego'][selected];
  const range=effect==='protego'?(config.protectRange||36):(config.range||0),origin=player.pos;
  const phase=training?'training':friendly(carrier)?'attacking':rivals.includes(carrier)?'defending':'transition';
  const result=(target,protectedUnit,label,reason,action)=>({target,protectedUnit,label,reason,action,phase,range,
   distance:position(target||protectedUnit,player)?distance(origin,position(target||protectedUnit,player)):null,
   available:!!target||!!protectedUnit});
  if(effect==='protego'){
   const holder=friendly(carrier)?carrier:null;
   const receiver=friendly(passTarget)?passTarget:null;
   const protectedUnit=[holder,receiver].find(unit=>unit&&(unit==='player'||active(unit))&&distance(origin,position(unit,player))<=range)||'player';
   const isSelf=protectedUnit==='player';
   return result(null,protectedUnit,isSelf?'护住自己':holder===protectedUnit?'护住持球队友':'保护接应队友',
    isSelf?'4 秒防撞与防抢断':holder===protectedUnit?'为队友争取出球时间':'为接球与推进争取时间',
    isSelf?'protect-self':holder===protectedUnit?'protect-carrier':'protect-receiver');
  }
  const inRange=unit=>active(unit)&&distance(origin,position(unit,player))<=range;
  const enemies=rivals.filter(inRange);
  if(training){
   const candidates=[practiceDummy,...(effect==='stupefy'?bludgers:[])].filter(unit=>unit&&inRange(unit)
    &&alignment(origin,position(unit,player),aim)>=Math.cos(22*Math.PI/180));
   candidates.sort((a,b)=>alignment(origin,position(b,player),aim)-alignment(origin,position(a,player),aim));
   return candidates.length?result(candidates[0],null,'练习施法','对准训练目标','training-target'):
    result(null,null,'瞄准训练目标',range+' 米内施放 · 未命中不消耗冷却','no-target');
  }
  // Possession changes the play immediately, even when the carrier is behind the rider.
  if(rivals.includes(carrier)){
   if(inRange(carrier))return result(carrier,null,effect==='expelliarmus'?'抢断持球者':'截停持球者',
    effect==='expelliarmus'?'缴械后靠近争夺落球':'停住推进 · 接近后按 B 抢断','stop-carrier');
   return result(null,null,'接近对方持球者',range+' 米内可截停推进 · 未消耗冷却','carrier-out-of-range');
  }
  const holder=friendly(carrier)?carrier:null;
  const holderPosition=position(holder,player);
  const receiver=holder&&friendly(passReceiver)&&passReceiver!==holder?passReceiver:
   holder&&friendly(passTarget)&&passTarget!==holder?passTarget:null;
  const receiverPosition=position(receiver,player);
  if(holderPosition){
   const threats=enemies.map(unit=>{
    const p=position(unit,player),pressure=distance(p,holderPosition);
    const lane=receiverPosition?laneDistance(p,holderPosition,receiverPosition):null;
    const intercept=!!lane&&lane.t>.08&&lane.t<.96&&lane.distance<5.5;
    return {unit,pressure,intercept,score:(intercept?10+lane.distance:40+pressure)+distance(origin,p)*.04};
   }).filter(threat=>threat.pressure<14||threat.intercept).sort((a,b)=>a.score-b.score);
   if(threats.length){
    const threat=threats[0];
    return result(threat.unit,null,threat.intercept?'打开传球路线':'摆脱贴身逼抢',
     threat.intercept?'压制拦截者 · 随后 J 短传 / K 直塞':'为持球人创造推进与出球空间',
     threat.intercept?'clear-passing-lane':'beat-press');
   }
  }else if(quaffle?.position){
   const contest=enemies.filter(unit=>distance(position(unit,player),quaffle.position)<15)
    .sort((a,b)=>distance(position(a,player),quaffle.position)-distance(position(b,player),quaffle.position));
   if(contest.length)return result(contest[0],null,'争夺二点球','压制球旁对手 · 靠近接球','win-loose-ball');
  }
  if(effect==='stupefy'){
   const protectedPosition=holderPosition||origin;
   const danger=bludgers.filter(unit=>inRange(unit)&&!(unit.frozen>0)&&distance(position(unit,player),protectedPosition)<9)
    .sort((a,b)=>distance(position(a,player),protectedPosition)-distance(position(b,player),protectedPosition));
   if(danger.length)return result(danger[0],null,'冻结逼近的游走球','保护持球与接应路线','freeze-bludger');
  }
  // Manual aim remains available for a deliberate off-ball play; no unrelated auto-target.
  const aimed=enemies.filter(unit=>alignment(origin,position(unit,player),aim)>=Math.cos(22*Math.PI/180))
   .sort((a,b)=>alignment(origin,position(b,player),aim)-alignment(origin,position(a,player),aim));
  if(aimed.length)return result(aimed[0],null,'压制瞄准对手','为下一次攻防创造空间','aimed-opponent');
  return result(null,null,'暂无需要压制的对手','靠近持球者、逼抢者或传球路线 · 未消耗冷却','no-target');
 }
 return Object.freeze({getContext});
})();
