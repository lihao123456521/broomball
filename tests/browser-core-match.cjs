/* The complete keyboard contract: move, sprint, pass, through ball, shoot/press and pause. */
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
  const releaseKeys=async()=>{for(const key of['w','a','s','d','e','r','f','Shift','Escape','j','k','t','z','c','b','x','q','v','1','2','3','Space','Control','ArrowUp','ArrowDown'])await page.keyboard.up(key);};
  const stage=async()=>{
   await releaseKeys();await page.evaluate(()=>{
    const g=__BROOMBALL__;g.startMatch('standard');Object.assign(g.match,{state:'playing',paused:false,elapsed:3,timeLeft:177,kickoff:0,pendingRestart:null,stealCooldown:100,cameraMode:'broadcast'});
    g.clearInput();g.setAim(0,0);g.player.pos.set(0,10,0);g.player.previousPos.copy(g.player.pos);g.player.mesh.rotation.set(0,0,0);g.player.vel.set(0,0,0);g.player.stamina=100;g.player.mesh.userData.broomMultiplier=1;
    for(const u of[...g.rivals,...g.allies]){u.mesh.position.set(38,32,34);u.speed=0;u.stun=100;u.velocity?.set(0,0,0);u.mesh.userData.broomMultiplier=1;g.resetAIFlight(u);}
    for(const b of g.bludgers||[]){b.mesh.position.set(40,35,40);b.frozen=100;}
    g.setCarrier('player');
   });
  };
  const receiver=async(distance=24)=>page.evaluate(distance=>{
   const g=__BROOMBALL__,a=g.allies[0];a.mesh.position.set(0,10,-distance);a.mesh.rotation.set(0,0,0);a.stun=0;g.resetAIFlight(a);return a.mesh.uuid;
  },distance);
  await check('Kickoff starts with the actual controlled rider holding the ball',async()=>{
   await page.evaluate(()=>__BROOMBALL__.startMatch('standard'));await advance(3100);
   const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{state:g.match.state,holding:g.carrier==='player',uuid:g.player.mesh.uuid,ballDistance:g.quaffle.position.distanceTo(g.player.pos),camera:g.match.cameraMode};});
   assert.equal(result.state,'playing');assert.equal(result.holding,true);assert.ok(result.ballDistance<2);assert.equal(result.camera,'broadcast');report.evidence.kickoff=result;
  });
  await check('WASD move the controlled rider on the pitch and Shift gives a measurable sprint',async()=>{
   const movements=[];for(const [key,axis,sign]of[['w',2,-1],['s',2,1],['a',0,-1],['d',0,1]]){
    await stage();await page.keyboard.down(key);await advance(600);await page.keyboard.up(key);
    const state=await page.evaluate(()=>{const g=__BROOMBALL__;return{position:g.player.pos.toArray(),speed:g.player.speed,passes:g.match.stats.passes,holding:g.carrier==='player'};});
    assert.ok(state.position[axis]*sign>5,JSON.stringify({key,state}));assert.ok(Math.abs(state.position[1]-10)<.15);assert.equal(state.passes,0);assert.equal(state.holding,true);movements.push({key,...state});
   }
   await stage();await page.keyboard.down('w');await page.keyboard.down('Shift');await advance(650);
   const sprint=await page.evaluate(()=>{const g=__BROOMBALL__;return{speed:g.player.speed,stamina:g.player.stamina};});await releaseKeys();assert.ok(sprint.speed>movements[0].speed+7);assert.ok(sprint.stamina<100);report.evidence.movement={movements,sprint};
  });
  await check('E performs a real short pass and control moves only when the teammate receives it',async()=>{
   await stage();const target=await receiver();const sender=await page.evaluate(()=>__BROOMBALL__.player.mesh.uuid);
   await page.keyboard.press('e');await advance(160);
   const airborne=await page.evaluate(()=>{const g=__BROOMBALL__;return{uuid:g.player.mesh.uuid,carrier:g.carrier,mode:g.passMode,passes:g.match.stats.passes,y:g.player.pos.y};});
   assert.equal(airborne.uuid,sender);assert.equal(airborne.carrier,null);assert.equal(airborne.mode,'short');assert.equal(airborne.passes,1);assert.ok(Math.abs(airborne.y-10)<.15);
   await advance(1200);const caught=await page.evaluate(()=>{const g=__BROOMBALL__;return{uuid:g.player.mesh.uuid,holding:g.carrier==='player',completed:g.match.stats.completedPasses,gather:!!g.ballGather};});
   assert.equal(caught.uuid,target);assert.equal(caught.holding,true);assert.equal(caught.completed,1);report.evidence.shortPass={sender,target,airborne,caught};
  });
  await check('R sends a reachable through ball and gives control to the player who actually collects it',async()=>{
   await stage();const target=await receiver(15);await page.evaluate(()=>{const a=__BROOMBALL__.allies[0];a.speed=24;});
   await page.keyboard.press('r');const flight=await page.evaluate(()=>{const g=__BROOMBALL__;return{mode:g.passMode,duration:g.passFlight.duration,feet:g.passReceivePosition.toArray(),destination:g.passDestination.toArray(),projectiles:g.projectiles?.length||0};});
   assert.equal(flight.mode,'through');assert.equal(flight.projectiles,0);assert.ok(flight.feet[2]<-15);await advance((flight.duration+.4)*1000);
   const caught=await page.evaluate(()=>{const g=__BROOMBALL__;return{uuid:g.player.mesh.uuid,holding:g.carrier==='player',completed:g.match.stats.completedPasses};});assert.equal(caught.uuid,target);assert.equal(caught.holding,true);assert.equal(caught.completed,1);report.evidence.throughPass={flight,caught};
  });
  await check('An intercepted pass gives the opponent the ball and selects the nearest home defender',async()=>{
   await stage();await receiver(24);await page.evaluate(()=>{const g=__BROOMBALL__;g.rivals[0].mesh.position.set(0,10,-4);g.rivals[0].mesh.rotation.set(0,0,0);g.rivals[0].stun=0;g.resetAIFlight(g.rivals[0]);g.allies[2].mesh.position.set(3,10,-7);g.allies[2].stun=0;});
   await page.keyboard.press('e');await advance(200);
   const result=await page.evaluate(()=>{const g=__BROOMBALL__,opponent=g.rivals[0];return{opponentHolding:g.carrier===opponent,completed:g.match.stats.completedPasses,passTarget:!!g.passTarget,controlledDistance:g.player.pos.distanceTo(opponent.mesh.position),otherDistances:g.allies.filter(a=>a.role!=='keeper'&&a.stun<=0).map(a=>a.mesh.position.distanceTo(opponent.mesh.position))};});
   assert.equal(result.opponentHolding,true);assert.equal(result.completed,0);assert.equal(result.passTarget,false);assert.ok(result.otherDistances.every(d=>result.controlledDistance<=d+.2),JSON.stringify(result));report.evidence.interception=result;
  });
  await check('Enemy possession selects the nearest defender without teleporting either body',async()=>{
   await stage();const result=await page.evaluate(()=>{
    const g=__BROOMBALL__,closest=g.allies[0],other=g.allies[2],rival=g.rivals[0],old=g.player.mesh;
    g.player.pos.set(0,10,18);closest.mesh.position.set(8,10,-10);closest.stun=0;other.mesh.position.set(-8,10,-14);other.stun=0;rival.mesh.position.set(10,10,-12);rival.stun=0;
    const body=closest.mesh,bodyBefore=body.position.clone(),oldBefore=old.position.clone();g.setCarrier(rival);
    return{controlled:g.player.mesh.uuid,expected:body.uuid,holder:g.carrier===rival,bodyMotion:body.position.distanceTo(bodyBefore),oldMotion:old.position.distanceTo(oldBefore),charging:g.match.charging};
   });assert.equal(result.controlled,result.expected);assert.equal(result.holder,true);assert.equal(result.bodyMotion,0);assert.equal(result.oldMotion,0);assert.equal(result.charging,false);report.evidence.defensiveSelection=result;
  });
  await check('A friendly keeper who gains possession becomes the actual controlled ball carrier',async()=>{
   await stage();const result=await page.evaluate(()=>{const g=__BROOMBALL__,keeper=g.allies[1];keeper.stun=0;keeper.mesh.position.set(0,10,25);const uuid=keeper.mesh.uuid;g.setCarrier(keeper);g.match.stealCooldown=0;g.rivals[0].mesh.position.set(.6,10,25);g.rivals[0].stun=0;return{expected:uuid,controlled:g.player.mesh.uuid,holding:g.carrier==='player'};});
   assert.equal(result.controlled,result.expected);assert.equal(result.holding,true);
   await advance(1300);const protectedHold=await page.evaluate(()=>{const g=__BROOMBALL__;return{holding:g.carrier==='player',controlled:g.player.mesh.uuid,role:g.player.role,shots:g.match.stats.shots};});assert.equal(protectedHold.holding,true);assert.equal(protectedHold.controlled,result.expected);assert.equal(protectedHold.role,'keeper');assert.equal(protectedHold.shots,0);
   const target=await page.evaluate(()=>{const g=__BROOMBALL__,a=g.allies[0];for(const r of g.rivals){r.stun=100;r.mesh.position.set(38,32,34);}a.mesh.position.set(0,10,5);a.mesh.rotation.set(0,0,0);a.stun=0;a.speed=0;g.resetAIFlight(a);return a.mesh.uuid;});
   await page.keyboard.press('e');const flight=await page.evaluate(()=>__BROOMBALL__.passFlight.duration);await advance((flight+.4)*1000);
   const distributed=await page.evaluate(()=>{const g=__BROOMBALL__;return{holding:g.carrier==='player',controlled:g.player.mesh.uuid,role:g.player.role,keepers:[g.player,...g.allies].filter(u=>u.role==='keeper').map(u=>u.mesh.uuid),homeKeeper:g.homeKeeper()?.mesh.uuid,completed:g.match.stats.completedPasses};});
   assert.equal(distributed.holding,true);assert.equal(distributed.controlled,target);assert.equal(distributed.role,'chaser');assert.deepEqual(distributed.keepers,[result.expected]);assert.equal(distributed.homeKeeper,result.expected);assert.equal(distributed.completed,1);report.evidence.keeperControl={result,protectedHold,distributed};
  });
  await check('The conceding side restarts and an enemy kickoff selects the closest home defender',async()=>{
   await stage();await page.evaluate(()=>{const g=__BROOMBALL__;for(const a of g.allies.filter(a=>a.role!=='keeper'))a.stun=0;g.rivals[0].stun=0;g.scoreGoal('player');});await advance(2150);
   const away=await page.evaluate(()=>{const g=__BROOMBALL__,enemy=g.rivals.includes(g.carrier)?g.carrier:null;return{enemyHolding:!!enemy,pending:g.match.pendingRestart,distance:enemy?g.player.pos.distanceTo(enemy.mesh.position):Infinity,others:enemy?g.allies.filter(a=>a.role!=='keeper'&&a.stun<=0).map(a=>a.mesh.position.distanceTo(enemy.mesh.position)):[]};});
   assert.equal(away.enemyHolding,true);assert.equal(away.pending,null);assert.ok(away.others.every(d=>away.distance<=d+.5),JSON.stringify(away));
   await page.evaluate(()=>__BROOMBALL__.scoreGoal('rival'));await advance(2150);assert.equal(await page.evaluate(()=>__BROOMBALL__.carrier==='player'),true);report.evidence.restarts=away;
  });
  await check('Holding F attacks by charging one shot and releasing F launches it once',async()=>{
   await stage();await page.keyboard.down('f');await advance(500);
   const held=await page.evaluate(()=>{const g=__BROOMBALL__;return{charging:g.match.charging,charge:g.match.shotCharge,shots:g.match.stats.shots,holding:g.carrier==='player'};});assert.equal(held.charging,true);assert.ok(held.charge>.25);assert.equal(held.shots,0);assert.equal(held.holding,true);
   await page.keyboard.up('f');const released=await page.evaluate(()=>{const g=__BROOMBALL__;return{charging:g.match.charging,shots:g.match.stats.shots,holding:!!g.carrier,speed:g.quaffleVel.length()};});assert.equal(released.charging,false);assert.equal(released.shots,1);assert.equal(released.holding,false);assert.ok(released.speed>24);await advance(150);assert.equal(await page.evaluate(()=>__BROOMBALL__.match.stats.shots),1);report.evidence.shot={held,released};
  });
  await check('Holding F defends by pressing and stealing; receiving possession does not create a ghost shot',async()=>{
   await stage();await page.evaluate(()=>{const g=__BROOMBALL__;g.rivals[0].mesh.position.set(0,10,-10);g.rivals[0].stun=0;g.setCarrier(g.rivals[0]);g.match.stealCooldown=0;});
   await page.keyboard.down('f');await advance(1000);const won=await page.evaluate(()=>{const g=__BROOMBALL__;return{holding:g.carrier==='player',steals:g.match.stats.steals,charging:g.match.charging,shots:g.match.stats.shots,position:g.player.pos.toArray()};});
   assert.equal(won.holding,true);assert.ok(won.steals>=1);assert.equal(won.charging,false);assert.equal(won.shots,0);await page.keyboard.up('f');assert.equal(await page.evaluate(()=>__BROOMBALL__.match.stats.shots),0);report.evidence.press=won;
  });
  await check('Losing possession while F is held cancels the shot and key release cannot fire for a different rider',async()=>{
   await stage();await page.keyboard.down('f');await advance(300);assert.ok(await page.evaluate(()=>__BROOMBALL__.match.shotCharge>.1));
   await page.evaluate(()=>{const g=__BROOMBALL__;g.rivals[0].mesh.position.set(0,10,-20);g.rivals[0].stun=0;g.setCarrier(g.rivals[0]);});await page.keyboard.up('f');
   const lost=await page.evaluate(()=>{const g=__BROOMBALL__;return{shots:g.match.stats.shots,charging:g.match.charging,charge:g.match.shotCharge};});assert.deepEqual(lost,{shots:0,charging:false,charge:0});report.evidence.lostCharge=lost;
  });
  await check('Retired action keys cannot pass, cast, change control, move vertically or change the camera',async()=>{
   await stage();await receiver(24);const before=await page.evaluate(()=>{const g=__BROOMBALL__;return{uuid:g.player.mesh.uuid,position:g.player.pos.toArray(),camera:g.match.cameraMode,selected:g.match.selected};});
   for(const key of['j','k','t','z','c','b','x','q','v','1','2','3','Space','Control','ArrowUp','ArrowDown']){await page.keyboard.down(key);await advance(30);await page.keyboard.up(key);}
   const after=await page.evaluate(()=>{const g=__BROOMBALL__;return{uuid:g.player.mesh.uuid,position:g.player.pos.toArray(),camera:g.match.cameraMode,selected:g.match.selected,passes:g.match.stats.passes,shots:g.match.stats.shots,projectiles:g.projectiles?.length||0,holding:g.carrier==='player'};});
   assert.equal(after.uuid,before.uuid);assert.deepEqual(after.position,before.position);assert.equal(after.camera,before.camera);assert.equal(after.selected,before.selected);assert.equal(after.passes,0);assert.equal(after.shots,0);assert.equal(after.projectiles,0);assert.equal(after.holding,true);report.evidence.retiredKeys={before,after};
  });
  await check('Esc pauses all movement and charging, then resumes without stuck input or a late shot',async()=>{
   await stage();await page.keyboard.down('w');await page.keyboard.down('f');await advance(150);await page.keyboard.press('Escape');
   const paused=await page.evaluate(()=>{const g=__BROOMBALL__;return{paused:g.match.paused,position:g.player.pos.toArray(),time:g.match.timeLeft,charging:g.match.charging};});assert.equal(paused.paused,true);assert.equal(paused.charging,false);
   await page.keyboard.up('w');await page.keyboard.up('f');await advance(600);const still=await page.evaluate(()=>{const g=__BROOMBALL__;return{position:g.player.pos.toArray(),time:g.match.timeLeft,shots:g.match.stats.shots};});assert.deepEqual(still.position,paused.position);assert.equal(still.time,paused.time);assert.equal(still.shots,0);
   await page.keyboard.press('Escape');await advance(300);const resumed=await page.evaluate(()=>{const g=__BROOMBALL__;return{paused:g.match.paused,position:g.player.pos.toArray(),shots:g.match.stats.shots,charging:g.match.charging};});assert.equal(resumed.paused,false);assert.deepEqual(resumed.position,still.position);assert.equal(resumed.shots,0);assert.equal(resumed.charging,false);report.evidence.pause={paused,still,resumed};
  });
  await check('A low loose ball can be collected by automatic flight height without a vertical key or a body teleport',async()=>{
   await stage();const result=await page.evaluate(()=>{
    const g=__BROOMBALL__;g.setCarrier(null);g.player.pos.set(0,10,0);g.player.previousPos.copy(g.player.pos);g.player.vel.set(0,0,0);g.quaffle.position.set(0,2,0);g.quaffleVel.set(0,0,0);
    window.__coreLowBall={uuid:g.player.mesh.uuid,start:g.player.pos.clone(),last:g.player.pos.clone(),bodyStarts:new Map(g.allies.map(a=>[a.mesh,a.mesh.position.clone()])),maxBodyStep:0};
    return{uuid:g.player.mesh.uuid,initialHeight:g.player.pos.y,ball:g.quaffle.position.toArray()};
   });
   let caught=null;for(let i=0;i<120;i++){
    await advance(16);caught=await page.evaluate(()=>{const g=__BROOMBALL__,s=window.__coreLowBall;s.maxBodyStep=Math.max(s.maxBodyStep,s.last.distanceTo(g.player.pos));s.last.copy(g.player.pos);return{holding:g.carrier==='player',uuid:g.player.mesh.uuid,height:g.player.pos.y,velocity:g.player.vel.toArray(),maxBodyStep:s.maxBodyStep,otherMotion:Math.max(0,...[...s.bodyStarts].map(([body,position])=>body.position.distanceTo(position)))};});
    if(caught.holding)break;
   }
   assert.equal(caught.holding,true,JSON.stringify(caught));assert.equal(caught.uuid,result.uuid);assert.ok(caught.height<8);assert.ok(caught.maxBodyStep<.2,JSON.stringify(caught));assert.equal(caught.otherMotion,0);report.evidence.lowLooseBall={initial:result,caught};
  });
  await check('Each house fields its three distinct captains and a separately voiced, controllable keeper',async()=>{
   const rosters=await page.evaluate(()=>Object.keys(BroomRoster.rosters));
   for(const [index,house] of rosters.entries()){
    const result=await page.evaluate(({house,index})=>{
     const g=__BROOMBALL__;g.returnToMenu();g.selectHouse(house);g.switchCharacter(index%3);g.startMatch('standard');
     const home=[g.player,...g.allies],away=g.rivals;
     const ids=units=>units.map(unit=>unit.mesh.userData.characterId).sort();
     const expected=side=>[...BroomRoster.rosters[side].map(profile=>profile.id),side+'-keeper'].sort();
     const selected=g.player.mesh.userData.characterId,homeIds=ids(home),awayIds=ids(away);
     const keeper=home.find(unit=>unit.role==='keeper'),keeperId=keeper.mesh.userData.characterId;
     let helmet=false;keeper.mesh.traverse(node=>{if(node.name==='PaddedKeeperHelmet'||node.userData.artParts?.includes('PaddedKeeperHelmet'))helmet=true;});
     const clips=[],announce=g.commentary.announce;
     try{
      g.commentary.announce=(key,text,options)=>{clips.push(options.clip);return false;};
      Object.assign(g.match,{state:'playing',elapsed:18,kickoff:0});
      g.setCarrier(keeper);g.throwQuaffle();
     }finally{g.commentary.announce=announce;}
     return{homeIds,awayIds,selected,expectedCaptain:BroomRoster.rosters[house][index%3].id,expectedHome:expected(house),
      expectedAway:expected(g.match.awayHouse),keeperId,controlled:g.player.mesh.userData.characterId,helmet,clips};
    },{house,index});
    assert.deepEqual(result.homeIds,result.expectedHome);assert.deepEqual(result.awayIds,result.expectedAway);
    assert.equal(result.selected,result.expectedCaptain);assert.equal(result.keeperId,house+'-keeper');
    assert.equal(result.controlled,result.keeperId);assert.ok(result.helmet);
    assert.deepEqual(result.clips,['possession-'+house,'shot-'+house]);
   }
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);assert.deepEqual(report.failed,[]);console.log('BROWSER_CORE_MATCH_PASS',report.passed.length);
 }finally{fs.writeFileSync(path.join(out,'core-match-browser.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
