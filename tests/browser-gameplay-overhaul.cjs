/* Gameplay overhaul: responsive loose-ball flight, buffered team actions and visual feedback. */
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
  const release=async()=>{for(const key of['w','a','s','d','e','r','f','Shift','Escape'])await page.keyboard.up(key);};
  const stage=async()=>{
   await release();await page.evaluate(()=>{
    const g=__BROOMBALL__;g.startMatch('standard');Object.assign(g.match,{state:'playing',paused:false,elapsed:3,timeLeft:177,kickoff:0,pendingRestart:null,stealCooldown:100});
    g.clearInput();g.setAim(0,0);g.player.pos.set(0,10,0);g.player.previousPos.copy(g.player.pos);g.player.mesh.rotation.set(0,0,0);g.player.vel.set(0,0,0);g.player.speed=0;
    for(const u of[...g.rivals,...g.allies]){u.mesh.position.set(38,32,34);u.speed=0;u.stun=100;u.velocity?.set(0,0,0);g.resetAIFlight(u);}
    g.setCarrier('player');g.quaffleVel.set(0,0,0);
   });
  };
  const receivers=async()=>page.evaluate(()=>{
   const g=__BROOMBALL__;for(const [a,p]of[[g.allies[0],[0,10,-18]],[g.allies[2],[8,10,-40]]]){a.mesh.position.set(...p);a.mesh.rotation.set(0,0,0);a.stun=0;a.speed=0;g.resetAIFlight(a);}g.setCarrier('player');
  });
  await check('High loose balls get responsive predictive altitude tracking and a real pickup',async()=>{
   await stage();const initial=await page.evaluate(()=>{
    const g=__BROOMBALL__;g.setCarrier(null);g.player.pos.set(0,8,0);g.player.previousPos.copy(g.player.pos);g.player.vel.set(0,0,0);g.quaffle.position.set(0,26,0);g.quaffleVel.set(0,0,0);
    for(let i=0;i<12;i++)g.updatePlayer(1/60);return{verticalSpeed:g.player.vel.y,height:g.player.pos.y};
   });assert.ok(initial.verticalSpeed>8,JSON.stringify(initial));
   await advance(1900);const result=await page.evaluate(()=>({holding:__BROOMBALL__.carrier==='player',height:__BROOMBALL__.player.pos.y,touches:__BROOMBALL__.match.stats.touches}));
   assert.equal(result.holding,true,JSON.stringify(result));assert.ok(result.height>20);assert.ok(result.touches>=1);report.evidence.highBall={initial,result};
  });
  await check('Defenders also track altitude during a high opponent pass',async()=>{
   await stage();const result=await page.evaluate(()=>{
    const g=__BROOMBALL__,sender=g.rivals[0],receiver=g.rivals[1];g.player.pos.set(0,8,-3);g.player.previousPos.copy(g.player.pos);g.player.vel.set(0,0,0);
    sender.mesh.position.set(0,10,0);sender.stun=0;sender.speed=0;receiver.mesh.position.set(0,30,-20);receiver.stun=0;receiver.speed=0;g.resetAIFlight(sender);g.resetAIFlight(receiver);g.setCarrier(sender);g.match.stealCooldown=0;g.updateRivals(.016);
    const passing=g.passTarget===receiver&&!g.carrier;for(let i=0;i<12;i++)g.updatePlayer(1/60);return{passing,verticalSpeed:g.player.vel.y,ballHeight:g.quaffle.position.y,carrier:g.carrier==='player'?'player':g.carrier?.mesh?.name||null,targetIsReceiver:g.passTarget===receiver,target:g.passTarget?.mesh?.name||null,mode:g.passMode};
   });assert.equal(result.passing,true,JSON.stringify(result));assert.ok(result.verticalSpeed>8,JSON.stringify(result));report.evidence.opponentPassAltitude=result;
  });
  await check('A through ball buffered during a short pass executes as a real one-touch combination',async()=>{
   await stage();await receivers();await page.keyboard.press('e');await advance(80);await page.keyboard.press('r');
   const queued=await page.evaluate(()=>({buffer:__BROOMBALL__.actionBuffer?.kind,passes:__BROOMBALL__.match.stats.passes}));assert.equal(queued.buffer,'through');assert.equal(queued.passes,1);
   await advance(3300);const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{passes:g.match.stats.passes,completed:g.match.stats.completedPasses,oneTouch:g.match.stats.oneTouchPasses,holding:g.carrier==='player',mode:g.passMode,buffer:g.actionBuffer};});
   assert.equal(result.passes,2,JSON.stringify(result));assert.equal(result.completed,2);assert.equal(result.oneTouch,1);assert.equal(result.holding,true);assert.equal(result.buffer,null);report.evidence.oneTouchPass={queued,result};
  });
  await check('Holding F before reception starts charging only after the actual catch',async()=>{
   await stage();await receivers();await page.keyboard.press('e');await advance(80);await page.keyboard.down('f');await advance(100);
   assert.equal(await page.evaluate(()=>__BROOMBALL__.actionBuffer?.type),'shot');await advance(1300);
   const held=await page.evaluate(()=>({charging:__BROOMBALL__.match.charging,holding:__BROOMBALL__.carrier==='player',shots:__BROOMBALL__.match.stats.shots,action:__BROOMBALL__.match.primaryAction}));
   assert.equal(held.holding,true,JSON.stringify(held));assert.equal(held.charging,true);assert.equal(held.shots,0);assert.equal(held.action,'shoot');
   await advance(220);await page.keyboard.up('f');const released=await page.evaluate(()=>({shots:__BROOMBALL__.match.stats.shots,charging:__BROOMBALL__.match.charging,speed:__BROOMBALL__.quaffleVel.length()}));
   assert.equal(released.shots,1);assert.equal(released.charging,false);assert.ok(released.speed>24);report.evidence.bufferedCharge={held,released};
  });
  await check('Releasing F before reception produces exactly one quick one-touch shot',async()=>{
   await stage();await receivers();await page.keyboard.press('e');await advance(80);await page.keyboard.down('f');await advance(160);await page.keyboard.up('f');
   const queued=await page.evaluate(()=>({released:__BROOMBALL__.actionBuffer?.released,charge:__BROOMBALL__.actionBuffer?.charge}));assert.equal(queued.released,true);assert.ok(queued.charge>0);
   await advance(1400);const result=await page.evaluate(()=>({shots:__BROOMBALL__.match.stats.shots,oneTouch:__BROOMBALL__.match.stats.oneTouchShots,charging:__BROOMBALL__.match.charging,buffer:__BROOMBALL__.actionBuffer}));
   assert.equal(result.shots,1,JSON.stringify(result));assert.equal(result.oneTouch,1);assert.equal(result.charging,false);assert.equal(result.buffer,null);report.evidence.quickShot={queued,result};
  });
  await check('An interception clears buffered actions without a late ghost shot',async()=>{
   await stage();await receivers();await page.evaluate(()=>{const g=__BROOMBALL__,r=g.rivals[0];r.mesh.position.set(0,10,-6);r.stun=0;r.speed=0;g.resetAIFlight(r);});
   await page.keyboard.press('e');await advance(70);await page.keyboard.down('f');await advance(650);await page.keyboard.up('f');
   const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{intercepted:g.carrier===g.rivals[0],buffer:g.actionBuffer,shots:g.match.stats.shots,charging:g.match.charging,completed:g.match.stats.completedPasses};});
   assert.equal(result.intercepted,true,JSON.stringify(result));assert.equal(result.buffer,null);assert.equal(result.shots,0);assert.equal(result.charging,false);assert.equal(result.completed,0);report.evidence.interception=result;
  });
  await check('Ball trails, reflection lighting and buffered-action HUD are live in the rendered game',async()=>{
   await stage();await receivers();await page.keyboard.press('e');await advance(100);await page.keyboard.press('r');await advance(40);
   const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{environment:!!g.scene.environment,trail:g.ballTrail.visible,trailName:g.ballTrail.name,halo:g.contactHalo.visible,hint:document.getElementById('passHint').textContent,shortDisabled:document.getElementById('shortPassBtn').disabled,primaryDisabled:document.getElementById('primaryBtn').disabled};});
   assert.equal(result.environment,true);assert.equal(result.trail,true);assert.equal(result.trailName,'QuaffleMotionTrail');assert.equal(result.halo,true);assert.match(result.hint,/预输入/);assert.equal(result.shortDisabled,false);assert.equal(result.primaryDisabled,false);report.evidence.presentation=result;
   await page.screenshot({path:path.join(out,'gameplay-overhaul-buffered-pass.png')});
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);assert.deepEqual(report.failed,[]);console.log('BROWSER_GAMEPLAY_OVERHAUL_PASS',report.passed.length);
 }finally{fs.writeFileSync(path.join(out,'gameplay-overhaul-browser.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
