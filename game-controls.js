/* One compact left-hand layout, shared by the match and its on-screen actions. */
window.BroomControls=Object.freeze({
 version:1,
 keys:Object.freeze({up:'KeyW',left:'KeyA',down:'KeyS',right:'KeyD',pass:'KeyE',through:'KeyR',primary:'KeyF',sprint:['ShiftLeft','ShiftRight'],pause:'Escape'}),
 labels:Object.freeze({pass:'E 短传',through:'R 直塞',shoot:'F 射门',defend:'F 逼抢',sprint:'Shift 冲刺'}),
 isGameplayKey(code){return ['KeyW','KeyA','KeyS','KeyD','KeyE','KeyR','KeyF','ShiftLeft','ShiftRight'].includes(code);},
 movement(keys){return {x:Number(!!keys.KeyD)-Number(!!keys.KeyA),z:Number(!!keys.KeyS)-Number(!!keys.KeyW)};}
});
