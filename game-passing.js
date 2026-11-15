/* Reachable receiving positions and fixed flight paths. Airborne passes never home. */
window.BroomPassing=(()=>{
 'use strict';
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 const speedFor=kind=>kind==='through'?32:28;
 function vector(T,value,fallback){return value?new T.Vector3(value.x||0,value.y||0,value.z||0):fallback.clone();}
 function horizontal(T,value,fallback){const v=vector(T,value,fallback);v.y=0;return v.lengthSq()>.0001?v.normalize():fallback.clone().normalize();}
 function reachableDistance(time,speed,limit){
  if(time<=0||limit<=0)return 0;
  const initial=clamp(speed,0,limit),acceleration=18,accelerating=Math.min(time,(limit-initial)/acceleration);
  return initial*accelerating+.5*acceleration*accelerating**2+limit*(time-accelerating);
 }
 function interceptTime(offset,velocity,speed){
  const a=velocity.lengthSq()-speed*speed,b=2*offset.dot(velocity),c=offset.lengthSq();
  if(c<.0001)return 0;
  if(Math.abs(a)<.0001)return b<0?-c/b:Infinity;
  const discriminant=b*b-4*a*c;
  if(discriminant<0)return Infinity;
  const root=Math.sqrt(discriminant),times=[(-b-root)/(2*a),(-b+root)/(2*a)].filter(t=>t>=0);
  return times.length?Math.min(...times):Infinity;
 }
 function plan(T,{start,receiverPosition,receiverVelocity,receiverForward,kind='short',attackDirection,
  receiverSpeed=22,receiverCarryOffset,receiverControlled=false}){
  const base=receiverPosition.clone(),velocity=vector(T,receiverVelocity,new T.Vector3());
  const attack=typeof attackDirection==='number'?new T.Vector3(0,0,Math.sign(attackDirection)||-1):horizontal(T,attackDirection,new T.Vector3(0,0,-1));
  const flatVelocity=velocity.clone();flatVelocity.y=0;
  const runDirection=flatVelocity.length()>2?flatVelocity.clone().normalize():attack;
  const forward=horizontal(T,receiverForward,flatVelocity.lengthSq()>.01?runDirection:attack);
  const turnTime=Math.acos(clamp(forward.dot(runDirection),-1,1))/1.15;
  const initialSpeed=Math.max(0,flatVelocity.dot(runDirection)),speedLimit=Math.max(0,receiverSpeed);
  const offset=vector(T,receiverCarryOffset,new T.Vector3(.95,1.15,-.35));
  let speed=speedFor(kind);const lead=new T.Vector3();
  let receivePosition=base.clone(),destination=receivePosition.clone().add(offset);
  let duration=Math.max(.22,start.distanceTo(destination)/speed),reachable=0;
  if(receiverControlled&&velocity.length()>.2){
   const travelSpeed=velocity.length(),maxLead=16,delta=destination.clone().sub(start);
   let meetingTime=interceptTime(delta,velocity,speed);
   if(!Number.isFinite(meetingTime)||meetingTime*travelSpeed>maxLead){
    const horizon=maxLead/travelSpeed;
    const required=destination.clone().addScaledVector(velocity,horizon).distanceTo(start)/horizon;
    // Only the ball accelerates. The user's current motion remains under their control.
    speed=clamp(Math.max(speed,required),speed,64);meetingTime=interceptTime(delta,velocity,speed);
   }
   const predictionLimited=!Number.isFinite(meetingTime)||meetingTime*travelSpeed>maxLead+.01;
   lead.copy(velocity).multiplyScalar(Number.isFinite(meetingTime)?Math.max(.22,meetingTime):maxLead/travelSpeed).clampLength(0,maxLead);
   receivePosition=base.clone().add(lead);destination=receivePosition.clone().add(offset);
   duration=Math.max(.22,start.distanceTo(destination)/speed);
   return {receivePosition,destination,duration,kind,speed,lead:lead.clone(),leadDistance:lead.length(),
    runDirection:runDirection.clone(),turnTime:0,reachableDistance:lead.length(),carryOffset:offset.clone(),receiverControlled:true,predictionLimited};
  }
  // Predict against the same final flight time; a fixed lead creates impossible short through balls.
  for(let i=0;i<8;i++){
   lead.set(0,0,0);
   if(kind==='through'){
    reachable=reachableDistance(Math.max(0,duration-turnTime),initialSpeed,speedLimit)*.62;
    lead.copy(runDirection).multiplyScalar(Math.min(10,reachable));
    lead.y=clamp(velocity.y*duration*.35,-1.5,1.5);
   }else if(velocity.lengthSq()>.04){
    lead.copy(velocity).multiplyScalar(Math.min(.32,duration*.7)).clampLength(0,4);
    // A stationary receiver must not be pulled into an invented run by a short pass.
    if(speedLimit===0)lead.set(0,0,0);
   }
   receivePosition=base.clone().add(lead);destination=receivePosition.clone().add(offset);
   duration=Math.max(.22,start.distanceTo(destination)/speed);
  }
  return {receivePosition,destination,duration,kind,speed,lead:lead.clone(),leadDistance:lead.length(),
   runDirection:runDirection.clone(),turnTime,reachableDistance:reachable,carryOffset:offset.clone(),receiverControlled,predictionLimited:false};
 }
 function create(T,{start,end,kind='short',duration:plannedDuration,durationOverride}){
  const from=start.clone(),to=end.clone(),delta=to.clone().sub(from),distance=delta.length();
  const override=durationOverride??plannedDuration;
  const duration=Number.isFinite(override)&&override>0?Math.max(.12,override):Math.max(.22,distance/speedFor(kind));
  const loft=kind==='through'?Math.min(1.6,.36+distance*.022):Math.min(1.1,.22+distance*.018);
  const bend=0;
  const terminalVelocity=delta.clone().divideScalar(duration).add(new T.Vector3(0,-4*loft/duration,0));
  function positionAt(time){
   // Continue through a missed reception instead of pausing at an invisible endpoint.
   if(time>duration){const after=time-duration;return to.clone().addScaledVector(terminalVelocity,after).add(new T.Vector3(0,-3.75*after*after,0));}
   const t=Math.max(0,Math.min(1,time/duration)),arc=4*t*(1-t);
   return from.clone().lerp(to,t).add(new T.Vector3(0,loft*arc,0));
  }
  function velocityAt(time){
   if(time>duration)return terminalVelocity.clone().add(new T.Vector3(0,-7.5*(time-duration),0));
   const t=Math.max(0,Math.min(1,time/duration)),arcSlope=4*(1-2*t)/duration;
   return delta.clone().divideScalar(duration).add(new T.Vector3(0,loft*arcSlope,0));
  }
  return {from,to,duration,loft,bend,positionAt,velocityAt};
 }
 return Object.freeze({create,plan});
})();
