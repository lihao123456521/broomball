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
  await page.evaluate(()=>Promise.all([BroomModels.ready,__BROOMBALL__.modelScenery]));await page.clock.pauseAt(await page.evaluate(()=>Date.now()+10000));
  // Preserve the exact virtual clock and game steps; only intermediate rasterization is skipped.
  const advance=async ms=>{await page.evaluate(()=>{const g=__BROOMBALL__;window.__testRender=g.renderer.render.bind(g.renderer);g.renderer.render=()=>{};});await page.clock.runFor(ms);await page.evaluate(()=>{const g=__BROOMBALL__;g.renderer.render=window.__testRender;delete window.__testRender;g.renderer.render(g.scene,g.camera);});};
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
   const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{holding:g.carrier==='player',steals:g.match.stats.steals,speed:g.player.speed,charging:g.match.charging,winnerSwiped:g.player.mesh.userData.swipeTime>0,loserStumbled:g.rivals[0].mesh.userData.stumbleTime>0};});
   assert.ok(result.winnerSwiped&&result.loserStumbled);assert.equal(result.holding,true);assert.equal(result.steals,1);assert.ok(result.speed<1);assert.equal(result.charging,false);report.evidence.automaticTouch=result;
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
  await check('Holding F reaches low and ceiling-height loose balls at the point of contact',async()=>{
   const cases=[];
   for(const ballHeight of[2,38.5]){
    await stage();
    await page.evaluate(h=>{const g=__BROOMBALL__;g.quaffle.position.set(12,h,-9);},ballHeight);
    await page.keyboard.down('f');
    const result=await page.evaluate(()=>{
     const g=__BROOMBALL__,ball=g.quaffle.position.clone(),body=g.player.mesh;let frames=0,maxStep=0;
     for(;frames<240&&!g.carrier;frames++){
      const before=g.player.pos.clone();g.update(1/60);maxStep=Math.max(maxStep,before.distanceTo(g.player.pos));
     }
     return{holding:g.carrier==='player',sameBody:g.player.mesh===body,seconds:frames/60,
      gap:g.player.pos.distanceTo(ball),height:g.player.pos.y,maxStep};
    });
    await page.keyboard.up('f');
    assert.equal(result.holding,true,JSON.stringify(result));assert.ok(result.sameBody);
    assert.ok(result.seconds>.3&&result.seconds<3,JSON.stringify(result));assert.ok(result.maxStep<.75);
    assert.ok(result.gap<3.6);assert.equal(await page.evaluate(()=>__BROOMBALL__.match.stats.shots),0);
    cases.push({ballHeight,...result});
   }
   report.evidence.altitudeChase=cases;
  });
  await check('Nearby defenders match a high carrier and arrive under control when challenging',async()=>{
   await stage();await setupOpponent(11);
   await page.evaluate(()=>{const g=__BROOMBALL__,opponent=g.rivals[0];opponent.mesh.position.y=27;g.resetAIFlight(opponent);g.setCarrier(opponent);g.match.stealCooldown=0;});
   await advance(240);
   const assisted=await page.evaluate(()=>{const p=__BROOMBALL__.player;return{height:p.pos.y,vertical:p.vel.y,horizontal:Math.hypot(p.pos.x,p.pos.z)};});
   assert.ok(assisted.height>11&&assisted.vertical>9,JSON.stringify(assisted));assert.equal(assisted.horizontal,0);
   await page.keyboard.down('f');
   const result=await page.evaluate(()=>{
    const g=__BROOMBALL__,opponent=g.rivals[0];let frames=0;
    while(frames++<180&&g.carrier===opponent)g.update(1/60);
    return{holding:g.carrier==='player',steals:g.match.stats.steals,gap:g.player.pos.distanceTo(opponent.mesh.position),seconds:frames/60};
   });
   await page.keyboard.up('f');assert.equal(result.holding,true,JSON.stringify(result));assert.equal(result.steals,1);assert.ok(result.gap<3.6);
   report.evidence.highChallenge={assisted,result};
  });
  await check('The same held F follows a rival pass through to an interception',async()=>{
   await stage();
   await page.evaluate(()=>{
    const g=__BROOMBALL__,sender=g.rivals[0],receiver=g.rivals[1];
    for(const [r,p] of [[sender,[-6,10,-3]],[receiver,[12,14,-4]]]){
     r.mesh.position.set(...p);r.stun=0;r.speed=0;g.resetAIFlight(r);
    }
    g.setCarrier(sender);g.match.stealCooldown=0;
   });
   await page.keyboard.down('f');
   const result=await page.evaluate(()=>{
    const g=__BROOMBALL__,receiver=g.rivals[1],origin=g.player.pos.clone();g.update(1/60);
    const launched=g.passTarget===receiver,positions=[];let frames=0;
    while(frames<120&&!g.carrier){g.update(1/60);frames++;if(frames%4===0)positions.push([frames,g.player.pos.toArray(),g.quaffle.position.toArray()]);}
    return{launched,frames,holding:g.carrier==='player',distance:g.player.pos.distanceTo(origin),action:g.match.primaryAction,positions};
   });
   await page.keyboard.up('f');
   assert.ok(result.launched);assert.equal(result.holding,true,JSON.stringify(result));assert.ok(result.frames>3);assert.ok(result.distance>.8);assert.equal(result.action,'defend');
   const stats=await page.evaluate(()=>__BROOMBALL__.match.stats);
   assert.equal(stats.shots,0);assert.equal(stats.steals,0);assert.equal(stats.interceptions,1);report.evidence.heldPressInterception=result;
  });
  await check('Pressing F during a home shot does not queue an unwanted chase after the save',async()=>{
   await stage();await page.evaluate(()=>__BROOMBALL__.setCarrier('player'));
   await page.keyboard.press('f');await page.keyboard.down('f');
   const result=await page.evaluate(()=>{
    const g=__BROOMBALL__,during=g.match.primaryAction;
    g.rivals[2].mesh.position.set(0,14,-20);g.setCarrier(g.rivals[2]);g.updatePlayer(1/60);
    return{during,after:g.match.primaryAction,speed:g.player.speed,shots:g.match.stats.shots};
   });
   await page.keyboard.up('f');assert.deepEqual(result,{during:null,after:null,speed:0,shots:1});
  });
  await check('A distant high ball leaves idle flight level and a low catch returns to a comfortable passing height',async()=>{
   await stage();await page.evaluate(()=>{__BROOMBALL__.quaffle.position.set(42,38,-18);});await advance(500);
   assert.equal(await page.evaluate(()=>__BROOMBALL__.player.pos.y),10);
   const result=await page.evaluate(()=>{
    const g=__BROOMBALL__;g.player.pos.set(0,1,0);g.player.previousPos.copy(g.player.pos);g.setCarrier('player');
    const receiver=g.allies[0];receiver.mesh.position.set(0,17,-14);receiver.stun=0;
    const available=g.getPassReceiver()===receiver,start=g.player.pos.y;for(let i=0;i<60;i++)g.updatePlayer(1/60);
    return{available,start,height:g.player.pos.y};
   });
   assert.ok(result.available);assert.ok(result.height>4&&result.height<7,JSON.stringify(result));report.evidence.recovery=result;
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
