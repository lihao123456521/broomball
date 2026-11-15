/* Spell decisions use the live possession and passing lane, rather than the camera aim. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const window={};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','game-match-skills.js'),'utf8'),{window});
const getContext=window.BroomMatchSkills.getContext;
const p=(x,y=10,z=0)=>({x,y,z});
const unit=(x,y=10,z=0)=>({mesh:{position:p(x,y,z),visible:true},stun:0});
const player={pos:p(0),mesh:{position:p(0),visible:true}};
const disarm={effect:'expelliarmus',range:36};
const stun={effect:'stupefy',range:32};
const shield={effect:'protego',range:0};
const checks=[];
function check(name,run){run();checks.push(name);console.log('PASS',name);}
function context(overrides={}){return getContext({player,rivals:[],allies:[],carrier:null,quaffle:{position:p(0,10,-40)},
 aim:p(0,0,-1),config:disarm,...overrides});}
check('A defender can stop the opponent with the ball behind their current aim',()=>{
 const holder=unit(0,10,20),decoy=unit(0,10,-8);
 const result=context({rivals:[decoy,holder],carrier:holder});
 assert.equal(result.target,holder);assert.equal(result.action,'stop-carrier');assert.equal(result.phase,'defending');assert.equal(result.available,true);
});
check('An out-of-range carrier does not redirect a defensive skill onto an unrelated opponent',()=>{
 const holder=unit(0,10,45),decoy=unit(0,10,-4);
 const result=context({rivals:[decoy,holder],carrier:holder});
 assert.equal(result.target,null);assert.equal(result.available,false);assert.equal(result.action,'carrier-out-of-range');
});
check('The actual height difference participates in spell range',()=>{
 const holder=unit(20,45,0);
 const result=context({rivals:[holder],carrier:holder});
 assert.equal(result.available,false);
});
check('An attacking skill opens the selected passing lane before hitting an unrelated marker',()=>{
 const receiver=unit(0,10,-28),interceptor=unit(1,10,-15),marker=unit(8,10,0);
 const result=context({rivals:[marker,interceptor],allies:[receiver],carrier:'player',passReceiver:receiver});
 assert.equal(result.target,interceptor);assert.equal(result.action,'clear-passing-lane');assert.equal(result.phase,'attacking');
});
check('Off-ball support can protect a teammate by clearing the return-pass route',()=>{
 const holder=unit(0,10,-28),interceptor=unit(1,10,-15);
 const result=context({rivals:[interceptor],allies:[holder],carrier:holder,passReceiver:'player'});
 assert.equal(result.target,interceptor);assert.equal(result.action,'clear-passing-lane');
});
check('A loose ball selects an opponent contesting the ball rather than a closer spectator',()=>{
 const ball={position:p(0,10,-20)},contest=unit(2,10,-20),unrelated=unit(8,10,7);
 const result=context({quaffle:ball,rivals:[unrelated,contest]});
 assert.equal(result.target,contest);assert.equal(result.action,'win-loose-ball');assert.equal(result.phase,'transition');
});
check('A shield protects the actual friendly carrier and a pending reception',()=>{
 const holder=unit(0,10,-25),receiver=unit(4,10,-20);
 const held=context({config:shield,allies:[holder,receiver],carrier:holder,passTarget:receiver});
 assert.equal(held.protectedUnit,holder);assert.equal(held.action,'protect-carrier');assert.equal(held.range,36);
 const airborne=context({config:shield,allies:[receiver],passTarget:receiver});
 assert.equal(airborne.protectedUnit,receiver);assert.equal(airborne.action,'protect-receiver');
});
check('A distant or absent friendly carrier falls back to a self shield',()=>{
 const holder=unit(0,10,-50);
 const result=context({config:shield,allies:[holder],carrier:holder});
 assert.equal(result.protectedUnit,'player');assert.equal(result.action,'protect-self');assert.equal(result.distance,0);
});
check('Hidden or already stunned pressure does not consume a new attacking cast',()=>{
 const hidden=unit(0,10,-8),stunned=unit(1,10,-8);hidden.mesh.visible=false;stunned.stun=2;
 const result=context({rivals:[hidden,stunned],carrier:'player'});
 assert.equal(result.available,false);assert.equal(result.target,null);
});
check('Stupefy can stop a nearby unfrozen bludger threatening the ball carrier',()=>{
 const danger=unit(5),frozen=unit(2);frozen.frozen=2;
 const result=context({config:stun,carrier:'player',bludgers:[frozen,danger]});
 assert.equal(result.target,danger);assert.equal(result.action,'freeze-bludger');
});
check('Guided training preserves aim and requires the practice target inside the aiming cone',()=>{
 const dummy=unit(0,10,-16),rival=unit(0,10,6);
 const good=context({training:true,practiceDummy:dummy,rivals:[rival],carrier:rival});
 assert.equal(good.target,dummy);assert.equal(good.phase,'training');
 dummy.mesh.position.x=20;
 const miss=context({training:true,practiceDummy:dummy,rivals:[rival],carrier:rival});
 assert.equal(miss.target,null);assert.equal(miss.available,false);
});
console.log('MATCH_SKILLS_PASS',checks.length);
