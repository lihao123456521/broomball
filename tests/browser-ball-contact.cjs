/* Visible contact, held-ball tackles and swept motion, exercised in the actual game. */
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
   for(const key of['w','a','s','d','e','r','f','Shift','Escape'])await page.keyboard.up(key);
   await page.evaluate(()=>{
    const g=__BROOMBALL__;g.startMatch('standard');Object.assign(g.match,{state:'playing',paused:false,elapsed:3,timeLeft:177,kickoff:0,pendingRestart:null,stealCooldown:100});
    g.clearInput();g.setAim(0,0);g.player.pos.set(0,10,0);g.player.previousPos.copy(g.player.pos);g.player.mesh.rotation.set(0,0,0);g.player.vel.set(0,0,0);g.player.speed=0;g.player.mesh.userData.broomMultiplier=1;
    for(const u of[...g.rivals,...g.allies]){u.mesh.position.set(38,32,34);u.speed=0;u.stun=100;u.velocity?.set(0,0,0);g.resetAIFlight(u);}
    g.setCarrier(null);g.quaffle.position.set(35,30,35);g.quaffleVel.set(0,0,0);
   });
   // Clear only the deliberate post-release grace period, before arranging contact.
   await advance(450);await page.evaluate(()=>{const g=__BROOMBALL__;g.player.pos.set(0,10,0);g.player.previousPos.copy(g.player.pos);g.player.vel.set(0,0,0);g.player.speed=0;});
  };
  const setupOpponent=async(distance)=>page.evaluate(distance=>{
   const g=__BROOMBALL__,r=g.rivals[0];r.mesh.position.set(0,10,-distance);r.mesh.rotation.set(0,0,0);r.stun=0;r.speed=0;g.resetAIFlight(r);g.setCarrier(r);g.match.stealCooldown=0;
  },distance);
  await check('Loose balls touching the rider or either visible broom end are collected without a key',async()=>{
   const cases=[];for(const offset of[[-1.9,1.05,0],[0,1.05,-1.9],[0,.4,-2.65],[0,.4,3.0]]){
    await stage();await page.evaluate(offset=>{const g=__BROOMBALL__;g.quaffle.position.copy(g.player.pos).add(new THREE.Vector3(...offset));g.quaffleVel.set(0,0,0);},offset);
    await advance(32);const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{holding:g.carrier==='player',position:g.player.pos.toArray(),ball:g.quaffle.position.toArray()};});
    assert.equal(result.holding,true,JSON.stringify({offset,result}));cases.push({offset,result});
   }report.evidence.sideAndFront=cases;
  });
  await check('A ball passing across the rider from the side is caught during the actual flight',async()=>{
   await stage();await page.evaluate(()=>{const g=__BROOMBALL__;g.quaffle.position.set(-7,11.05,0);g.quaffleVel.set(44,0,0);});
   await advance(240);const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{holding:g.carrier==='player',ball:g.quaffle.position.toArray(),gather:!!g.ballGather};});assert.equal(result.holding,true);report.evidence.sideFlight=result;
  });
  await check('Touching the held ball can win possession without F or a sprint',async()=>{
   await stage();await setupOpponent(1.2);await advance(32);
   const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{holding:g.carrier==='player',steals:g.match.stats.steals,speed:g.player.speed,charging:g.match.charging};});
   assert.equal(result.holding,true);assert.equal(result.steals,1);assert.ok(result.speed<1);assert.equal(result.charging,false);report.evidence.automaticTouch=result;
  });
  await check('F wins a close challenge while an opponent eight metres away remains out of reach',async()=>{
   await stage();await setupOpponent(3.3);await page.keyboard.down('f');await advance(80);
   const near=await page.evaluate(()=>{const g=__BROOMBALL__;return{holding:g.carrier==='player',steals:g.match.stats.steals,position:g.player.pos.toArray()};});await page.keyboard.up('f');assert.equal(near.holding,true);assert.equal(near.steals,1);
   await stage();await setupOpponent(8);await page.keyboard.down('f');await advance(32);
   const far=await page.evaluate(()=>{const g=__BROOMBALL__;return{holding:g.carrier==='player',distance:g.player.pos.distanceTo(g.rivals[0].mesh.position),steals:g.match.stats.steals};});await page.keyboard.up('f');assert.equal(far.holding,false);assert.ok(far.distance>7);assert.equal(far.steals,0);report.evidence.pressing={near,far};
  });
  await check('A loose ball eight metres away is not pulled onto the rider',async()=>{
   await stage();await page.evaluate(()=>{const g=__BROOMBALL__;g.quaffle.position.set(8,11.05,0);g.quaffleVel.set(0,0,0);});await advance(450);
   const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{holding:!!g.carrier,distance:g.quaffle.position.distanceTo(g.player.pos),x:g.player.pos.x};});assert.equal(result.holding,false);assert.ok(result.distance>7);assert.equal(result.x,0);report.evidence.noMagnet=result;
  });
  await check('Fast opposing ball and rider motion is resolved as a swept contact rather than missed between frames',async()=>{
   await stage();const result=await page.evaluate(()=>{
    const g=__BROOMBALL__;g.player.previousPos.set(-3,10,0);g.player.pos.set(3,10,0);g.player.speed=60;g.player.vel.set(60,0,0);g.quaffle.position.set(3,11.05,0);g.quaffleVel.set(-60,0,0);
    g.updateQuaffle(.1);return{holding:g.carrier==='player',position:g.player.pos.toArray(),ball:g.quaffle.position.toArray(),gather:!!g.ballGather};
   });assert.equal(result.holding,true);assert.deepEqual(result.position,[3,10,0]);assert.equal(result.gather,true);report.evidence.sweptContact=result;
  });
  await check('A newly won ball has enough protection to prevent an instant repeated turnover',async()=>{
   await stage();await setupOpponent(1.2);await advance(32);const won=await page.evaluate(()=>{const g=__BROOMBALL__;return{holding:g.carrier==='player',uuid:g.player.mesh.uuid,steals:g.match.stats.steals};});assert.equal(won.holding,true);
   await advance(300);const stable=await page.evaluate(()=>{const g=__BROOMBALL__;return{holding:g.carrier==='player',uuid:g.player.mesh.uuid,steals:g.match.stats.steals,cooldown:g.match.stealCooldown};});
   assert.equal(stable.holding,true);assert.equal(stable.uuid,won.uuid);assert.equal(stable.steals,1);assert.ok(stable.cooldown>0);report.evidence.turnoverProtection={won,stable};
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);assert.deepEqual(report.failed,[]);console.log('BROWSER_BALL_CONTACT_PASS',report.passed.length);
 }finally{fs.writeFileSync(path.join(out,'ball-contact-browser.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
