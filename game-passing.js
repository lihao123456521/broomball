/* Fixed, gently lofted throws. The trajectory never homes after release. */
window.BroomPassing=(()=>{
 'use strict';
 function create(T,{start,end,kind='short'}){
  const from=start.clone(),to=end.clone(),delta=to.clone().sub(from),distance=delta.length();
  const duration=Math.max(.24,distance/(kind==='through'?38:32));
  const loft=kind==='through'?Math.min(4.8,1.6+distance*.055):Math.min(2, .55+distance*.026);
  const side=new T.Vector3(-delta.z,0,delta.x).normalize();
  // Through passes bend very slightly into the running lane; short passes stay direct.
  const bend=kind==='through'?Math.min(1.2,distance*.024):0;
  function positionAt(time){
   const t=Math.max(0,Math.min(1,time/duration)),arc=4*t*(1-t);
   return from.clone().lerp(to,t).add(new T.Vector3(0,loft*arc,0)).addScaledVector(side,bend*arc);
  }
  function velocityAt(time){
   const t=Math.max(0,Math.min(1,time/duration)),arcSlope=4*(1-2*t)/duration;
   return delta.clone().divideScalar(duration).add(new T.Vector3(0,loft*arcSlope,0)).addScaledVector(side,bend*arcSlope);
  }
  return {from,to,duration,loft,bend,positionAt,velocityAt};
 }
 return Object.freeze({create});
})();
