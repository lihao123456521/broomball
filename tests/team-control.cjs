/* Deterministic automatic selection without THREE, a browser or hidden state. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','game-team-control.js'),'utf8'),{window});
const {getDesiredUnit}=window.BroomTeamControl;
const p=(x,z=0,y=10)=>({x,y,z});
const unit=(x,z=0,role='chaser',y=10)=>({mesh:{position:p(x,z,y),visible:true,userData:{}},role,stun:0});
const playerAt=(x,z=0,role='chaser',y=10)=>{const unitPlayer=unit(x,z,role,y);unitPlayer.pos=unitPlayer.mesh.position;return unitPlayer;};
let passed=0;
function check(name,run){run();passed++;console.log('PASS',name);}
function fixture(){
 const player=playerAt(12),near=unit(3),far=unit(20),goalkeeper=unit(.5,0,'keeper'),enemy=unit(0);
 return {player,near,far,goalkeeper,enemy,options:{player,allies:[near,far,goalkeeper],rivals:[enemy],carrier:enemy,ball:{position:p(0)},now:10,lastSwitchAt:0}};
}
check('A friendly holder is selected immediately despite cooldown and competing distances',()=>{
 const f=fixture();assert.equal(getDesiredUnit({...f.options,carrier:f.far,lastSwitchAt:10}),f.far);
});
check('A friendly keeper holding the ball is controllable without a special flag',()=>{
 const f=fixture();assert.equal(getDesiredUnit({...f.options,carrier:f.goalkeeper,lastSwitchAt:10}),f.goalkeeper);
});
check('Possession remains authoritative until physics drops a just-hit friendly holder',()=>{
 const f=fixture();f.near.stun=1;assert.equal(getDesiredUnit({...f.options,carrier:f.near}),f.near);
});
check('The current player keeps control while holding the ball under either carrier representation',()=>{
 const f=fixture();assert.equal(getDesiredUnit({...f.options,carrier:'player'}),f.player);assert.equal(getDesiredUnit({...f.options,carrier:f.player}),f.player);
});
check('A turnover immediately selects the nearest available field defender',()=>{
 const f=fixture();assert.equal(getDesiredUnit({...f.options,possessionChanged:true,lastSwitchAt:10}),f.near);
 f.player.pos.x=1;assert.equal(getDesiredUnit({...f.options,possessionChanged:true}),f.player);
});
check('Forced selection bypasses both the cooldown and small-distance hysteresis',()=>{
 const f=fixture();f.player.pos.x=5;f.near.mesh.position.x=4.9;
 assert.equal(getDesiredUnit({...f.options,force:true,lastSwitchAt:10}),f.near);
 assert.equal(getDesiredUnit({...f.options,possessionChanged:true,lastSwitchAt:10}),f.near);
});
check('Normal defensive selection waits 0.35 seconds after an actual switch',()=>{
 const f=fixture();assert.equal(getDesiredUnit({...f.options,now:10.2,lastSwitchAt:10}),f.player);
 assert.equal(getDesiredUnit({...f.options,now:10.36,lastSwitchAt:10}),f.near);
});
check('Tiny nearest-player fluctuations do not make control alternate every frame',()=>{
 const f=fixture();f.player.pos.x=5;
 for(let frame=0;frame<180;frame++){
  f.near.mesh.position.x=4.9+Math.sin(frame)*.35;
  assert.equal(getDesiredUnit({...f.options,now:10+frame/60}),f.player);
 }
});
check('A meaningful distance advantage switches and the advantage requirement is capped',()=>{
 const f=fixture();assert.equal(getDesiredUnit(f.options),f.near);
 f.player.pos.x=80;f.near.mesh.position.x=70;f.far.mesh.position.x=90;assert.equal(getDesiredUnit(f.options),f.near);
});
check('Equal-distance ties retain the current player without depending on the allies order',()=>{
 const f=fixture();f.player.pos.x=3;f.near.mesh.position.x=-3;
 assert.equal(getDesiredUnit({...f.options,force:true,allies:[f.far,f.near,f.goalkeeper]}),f.player);
});
check('Stunned, hidden, disabled and disposed defenders cannot be auto-selected',()=>{
 const f=fixture();f.player.pos.x=30;f.near.stun=1;f.far.mesh.visible=false;
 const disabled=unit(1),disposed=unit(2),ready=unit(9);disabled.disabled=true;disposed.mesh.userData.disposed=true;
 assert.equal(getDesiredUnit({...f.options,allies:[f.near,f.far,f.goalkeeper,disabled,disposed,ready],force:true}),ready);
});
check('A field player is preferred to a closer keeper even when the current player is a keeper',()=>{
 const f=fixture();f.player.role='keeper';f.player.pos.x=.1;
 assert.equal(getDesiredUnit({...f.options,lastSwitchAt:10}),f.near);
});
check('The only available goalkeeper is a valid defensive fallback',()=>{
 const f=fixture();f.player.stun=1;f.near.stun=1;f.far.mesh.visible=false;
 assert.equal(getDesiredUnit(f.options),f.goalkeeper);
});
check('Free-ball recovery uses the ball position and the same defensive hysteresis',()=>{
 const f=fixture();assert.equal(getDesiredUnit({...f.options,carrier:null,ball:{position:p(18)},force:true}),f.far);
 assert.equal(getDesiredUnit({...f.options,carrier:null,ball:p(18),lastSwitchAt:10}),f.player);
});
check('Friendly passing can preserve the current player until the actual reception',()=>{
 const f=fixture();assert.equal(getDesiredUnit({...f.options,carrier:null,passSender:'player',passTarget:f.near}),f.player);
});
check('An explicit receiver-selection mode locks on the intended receiver throughout the pass',()=>{
 const f=fixture();assert.equal(getDesiredUnit({...f.options,carrier:null,passSender:'player',passTarget:f.far,selectPassReceiver:true,lastSwitchAt:10}),f.far);
 assert.equal(getDesiredUnit({...f.options,carrier:null,passSender:f.near,passTarget:'player',selectPassReceiver:true}),f.player);
});
check('Disabled selection, pauses and non-match phases preserve control',()=>{
 const f=fixture();for(const options of [{enabled:false},{paused:true},{phase:'menu'},{phase:'countdown'},{phase:'ended'}])assert.equal(getDesiredUnit({...f.options,...options,force:true}),f.player);
});
check('Actual height differences participate in nearest-player selection',()=>{
 const f=fixture();f.near.mesh.position.y=35;f.far.mesh.position.x=8;
 assert.equal(getDesiredUnit({...f.options,force:true}),f.far);
});
check('A reset match clock cannot inherit a switch cooldown from a previous match',()=>{
 const f=fixture();assert.equal(getDesiredUnit({...f.options,now:0,lastSwitchAt:170}),f.near);
});
check('An opponent is never selected even if accidentally included in the allies input',()=>{
 const f=fixture();assert.equal(getDesiredUnit({...f.options,allies:[f.enemy,f.near],force:true}),f.near);
});
check('Missing targets, invalid positions and no available candidates fail safely',()=>{
 const f=fixture();assert.equal(getDesiredUnit({...f.options,carrier:null,ball:null}),f.player);
 f.near.mesh.position.x=NaN;f.far.stun=1;f.goalkeeper.stun=1;
 assert.equal(getDesiredUnit({...f.options,force:true}),f.player);assert.equal(getDesiredUnit(),null);
});
check('Decision making does not mutate units or the options object',()=>{
 const f=fixture(),before=JSON.stringify(f.options);getDesiredUnit(f.options);assert.equal(JSON.stringify(f.options),before);
});
console.log('TEAM_CONTROL_PASS',passed);
