/* Live passing: immediate interceptions, reachable runs, continuous catches and manual control. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tests/artifacts');
(async()=>{
 fs.mkdirSync(out,{recursive:true});const report={passed:[],failed:[],errors:[],requests:[],evidence:{}};
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>report.errors.push(e.message));
  await page.route(/^https?:\/\//,r=>{report.requests.push(r.request().url());return r.abort();});
  await page.clock.install();await page.addInitScript(()=>{HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.resolve();});
  await page.goto(pathToFileURL(path.join(root,'index.html')).href,{waitUntil:'load'});await page.waitForFunction(()=>!!window.__BROOMBALL__);
  await page.evaluate(()=>Promise.all([BroomModels.ready,__BROOMBALL__.modelScenery]));await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
  const advance=ms=>page.clock.runFor(ms);
  const check=async(name,fn)=>{try{await fn();report.passed.push(name);console.log('PASS',name);}catch(e){report.failed.push({name,error:e.message});console.error('FAIL',name,e.message);}};
  const stage=async()=>{
   for(const key of['w','a','s','d','j','k','t','z','c','Shift'])await page.keyboard.up(key);
   await page.evaluate(()=>{
    const g=__BROOMBALL__;g.startMatch('standard');Object.assign(g.match,{state:'playing',paused:false,elapsed:3,timeLeft:177,kickoff:0,pendingRestart:null,stealCooldown:100,autoSwitch:true,cameraMode:'broadcast'});
    g.clearInput();g.setAim(0,0);g.player.pos.set(0,10,0);g.player.previousPos.copy(g.player.pos);g.player.mesh.rotation.set(0,0,0);g.player.vel.set(0,0,0);g.player.stamina=100;g.player.mesh.userData.broomMultiplier=1;
    for(const u of[...g.rivals,...g.allies]){u.mesh.position.set(38,32,34);u.speed=0;u.stun=100;u.velocity?.set(0,0,0);u.mesh.userData.broomMultiplier=1;g.resetAIFlight(u);}
    for(const b of g.bludgers){b.mesh.position.set(40,35,40);b.frozen=100;}
    const a=g.allies[0];a.mesh.position.set(0,10,-24);a.mesh.rotation.set(0,0,0);a.stun=0;g.resetAIFlight(a);g.setCarrier('player');
   });
  };
  await check('A defender four metres away can intercept the first part of a short pass',async()=>{
   await stage();await page.evaluate(()=>{const g=__BROOMBALL__;g.rivals[0].mesh.position.set(0,10,-4);g.rivals[0].mesh.rotation.set(0,0,0);g.rivals[0].stun=0;g.resetAIFlight(g.rivals[0]);});
   await page.keyboard.press('j');await advance(180);
   const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{intercepted:g.carrier===g.rivals[0],completed:g.match.stats.completedPasses,ball:g.quaffle.position.toArray(),body:g.rivals[0].mesh.position.toArray()};});
   assert.equal(result.intercepted,true);assert.equal(result.completed,0);report.evidence.nearInterception=result;
  });
  await check('A completed pass gathers into the hand without a ball teleport or a moving player teleport',async()=>{
   await stage();await advance(700);await page.keyboard.press('j');
   const result=await page.evaluate(()=>{
    const g=__BROOMBALL__,recipient=g.allies[0].mesh,source=g.player.mesh,recipientPosition=recipient.position.clone(),sourcePosition=source.position.clone(),samples=[];
    let maxJump=0,gatherSeen=false,caughtAt=null;
    for(let i=0;i<100;i++){const before=g.quaffle.position.clone();g.updateQuaffle(1/60);g.updateCamera(1/60);maxJump=Math.max(maxJump,before.distanceTo(g.quaffle.position));if(g.ballGather)gatherSeen=true;if(g.carrier&&!caughtAt)caughtAt=i/60;if(i%8===0)samples.push({t:i/60,ball:g.quaffle.position.toArray(),gather:!!g.ballGather});}
    return{maxJump,gatherSeen,caughtAt,completed:g.match.stats.completedPasses,controlled:g.player.mesh===recipient,sourceMotion:source.position.distanceTo(sourcePosition),recipientMotion:recipient.position.distanceTo(recipientPosition),samples};
   });
   assert.equal(result.completed,1);assert.equal(result.controlled,true);assert.equal(result.gatherSeen,true);assert.ok(result.maxJump<=.8,JSON.stringify(result));assert.equal(result.sourceMotion,0);assert.equal(result.recipientMotion,0);report.evidence.continuousCatch=result;
  });
  await check('Eight- and fifteen-metre through balls are reachable by a teammate starting from rest',async()=>{
   const cases=[];for(const distance of[8,15]){
    await stage();await page.evaluate(distance=>{const g=__BROOMBALL__,a=g.allies[0];a.mesh.position.set(0,10,-distance);a.speed=24;g.resetAIFlight(a);},distance);
    const receiver=await page.evaluate(()=>__BROOMBALL__.allies[0].mesh.uuid);await page.keyboard.press('k');
    const plan=await page.evaluate(()=>{const g=__BROOMBALL__;return{duration:g.passFlight.duration,destination:g.passDestination.toArray(),feet:g.passReceivePosition.toArray()};});
    await advance((plan.duration+.35)*1000);
    const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{holder:g.carrier==='player',uuid:g.player.mesh.uuid,completed:g.match.stats.completedPasses};});
    assert.equal(result.holder,true);assert.equal(result.uuid,receiver);assert.equal(result.completed,1);cases.push({distance,plan,result});
   }report.evidence.shortThrough=cases;
  });
  await check('A running lateral receiver gets a through ball along their run instead of an imposed world-Z bend',async()=>{
   await stage();await page.evaluate(()=>{const g=__BROOMBALL__,a=g.allies[0];g.setAim(-Math.PI/2,0);a.mesh.position.set(20,10,0);a.mesh.rotation.set(0,-Math.PI/2,0);a.speed=24;g.resetAIFlight(a);a.flightSpeed=16;a.velocity.set(16,0,0);});
   const receiver=await page.evaluate(()=>__BROOMBALL__.allies[0].mesh.uuid);await page.keyboard.press('k');
   const plan=await page.evaluate(()=>{const g=__BROOMBALL__;return{duration:g.passFlight.duration,feet:g.passReceivePosition.toArray(),destination:g.passDestination.toArray(),bend:g.passFlight.bend};});
   assert.ok(plan.feet[0]>20);assert.ok(Math.abs(plan.feet[2])<1e-6);assert.equal(plan.bend,0);await advance((plan.duration+.4)*1000);
   const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{holding:g.carrier==='player',uuid:g.player.mesh.uuid,completed:g.match.stats.completedPasses};});assert.equal(result.holding,true);assert.equal(result.uuid,receiver);assert.equal(result.completed,1);report.evidence.lateralThrough={plan,result};
  });
  await check('An airborne ball keeps its released endpoint when the intended receiver changes course',async()=>{
   await stage();await page.keyboard.press('j');const released=await page.evaluate(()=>{const g=__BROOMBALL__;return{destination:g.passDestination.toArray(),feet:g.passReceivePosition.toArray(),duration:g.passFlight.duration};});
   await page.evaluate(()=>{const g=__BROOMBALL__;g.allies[0].mesh.position.set(25,15,-28);g.allies[0].velocity.set(18,0,0);});await advance(released.duration*500);
   const after=await page.evaluate(()=>{const g=__BROOMBALL__;return{destination:g.passDestination.toArray(),feet:g.passReceivePosition.toArray(),ball:g.quaffle.position.toArray(),bend:g.passFlight.bend};});
   assert.deepEqual(after.destination,released.destination);assert.deepEqual(after.feet,released.feet);assert.equal(after.bend,0);report.evidence.fixedEndpoint={released,after};
  });
  await check('A missed reception continues in motion without freezing at the old destination',async()=>{
   await stage();await page.keyboard.press('k');const result=await page.evaluate(()=>{
    const g=__BROOMBALL__,duration=g.passFlight.duration,samples=[];g.allies[0].mesh.position.set(25,20,-20);
    let maxJump=0,minGapAfterArrival=Infinity;
    for(let t=0;t<duration+.12;t+=1/60){const before=g.quaffle.position.clone();g.updateQuaffle(1/60);const gap=before.distanceTo(g.quaffle.position);maxJump=Math.max(maxJump,gap);if(t>=duration-1/60)minGapAfterArrival=Math.min(minGapAfterArrival,gap);samples.push({t,position:g.quaffle.position.toArray(),gap});}
    return{duration,maxJump,minGapAfterArrival,holder:!!g.carrier,samples:samples.slice(-10)};
   });assert.equal(result.holder,false);assert.ok(result.maxJump<=.8,JSON.stringify(result));assert.ok(result.minGapAfterArrival>.1,JSON.stringify(result));report.evidence.missedReception=result;
  });
  await check('A return pass meets the player who continues running without changing their movement speed',async()=>{
   const cases=[];for(const senderZ of[-30,18]){
    await stage();await page.evaluate(senderZ=>{const g=__BROOMBALL__;g.allies[0].mesh.position.set(0,10,senderZ);g.allies[0].speed=0;g.setCarrier(g.allies[0]);},senderZ);
    await page.keyboard.down('w');await advance(400);
    const before=await page.evaluate(()=>{const g=__BROOMBALL__;return{uuid:g.player.mesh.uuid,velocity:g.player.vel.toArray(),speed:g.player.speed};});
    await page.keyboard.press('j');const plan=await page.evaluate(()=>{const g=__BROOMBALL__;return{duration:g.passFlight.duration,destination:g.passDestination.toArray(),ballSpeed:g.passFlight.to.distanceTo(g.passFlight.from)/g.passFlight.duration};});
    await advance((plan.duration+.25)*1000);const after=await page.evaluate(()=>{const g=__BROOMBALL__;return{uuid:g.player.mesh.uuid,velocity:g.player.vel.toArray(),speed:g.player.speed,holding:g.carrier==='player',completed:g.match.stats.completedPasses};});await page.keyboard.up('w');
    assert.equal(after.holding,true,JSON.stringify({senderZ,before,plan,after}));assert.equal(after.uuid,before.uuid);assert.equal(after.completed,1);assert.ok(after.speed>=21.5&&after.speed<=22.5);if(senderZ>0)assert.ok(plan.ballSpeed>28&&plan.ballSpeed<=64.01);cases.push({senderZ,before,plan,after});
   }report.evidence.runningReturn=cases;
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);assert.deepEqual(report.failed,[]);console.log('BROWSER_PASS_FEEL_PASS',report.passed.length);
 }finally{fs.writeFileSync(path.join(out,'pass-feel-browser.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
