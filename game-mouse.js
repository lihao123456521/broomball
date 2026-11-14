/* Pointer-lock aiming with a drag fallback for embedded browsers. */
window.createBroomMouseControls=function({canvas,isActive,look,shoot,cast,onUnlock,notify,hint}){
 let drag=null,wasLocked=document.pointerLockElement===canvas,fallbackNotified=false;
 const locked=()=>document.pointerLockElement===canvas;
 function reset(){drag=null;}
 function fallback(){if(!fallbackNotified&&isActive()){fallbackNotified=true;notify('按住左键拖动转向 · 单击射门 · WASD 飞行',3);}updateHint();}
 function requestLock(){
  reset();fallbackNotified=false;
  if(document.activeElement?.blur)document.activeElement.blur();canvas.focus();
  try{if(!canvas.requestPointerLock){fallback();return;}const result=canvas.requestPointerLock();if(result?.catch)result.catch(fallback);}catch{fallback();}
  updateHint();
 }
 function updateHint(){if(!hint)return;hint.hidden=!isActive();const text=locked()?'鼠标转向 · WASD 飞行 · Esc 暂停':'按住左键拖动转向 · 单击射门 · WASD 飞行';if(hint.textContent!==text)hint.textContent=text;}
 addEventListener('mousemove',e=>{
  if(!isActive()){reset();return;}
  if(locked()){look(e.movementX,e.movementY);return;}
  if(!drag)return;
  if(!(e.buttons&1)){reset();return;}
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;drag.travel+=Math.hypot(dx,dy);
  if(drag.travel>4){drag.moved=true;look(dx,dy);}
 });
 canvas.addEventListener('mousedown',e=>{
  if(!isActive())return;canvas.focus();e.preventDefault();
  if(locked()){if(e.button===0)shoot();else if(e.button===2)cast();return;}
  if(e.button===0)drag={x:e.clientX,y:e.clientY,travel:0,moved:false};
  else if(e.button===2)cast();
 });
 addEventListener('mouseup',e=>{if(e.button!==0||!drag)return;const click=!drag.moved;reset();if(click&&isActive()&&!locked()&&e.target===canvas)shoot();});
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 document.addEventListener('pointerlockerror',fallback);
 document.addEventListener('pointerlockchange',()=>{const now=locked(),released=wasLocked&&!now;wasLocked=now;reset();updateHint();if(released)onUnlock();});
 document.addEventListener('mouseleave',reset);
 return {requestLock,reset,updateHint,getState:()=>({locked:locked(),dragging:!!drag,moved:!!drag?.moved})};
};
