/* Matchday entrance, progressive tutorial and human-friendly difficulty checks. */
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
  const advance=ms=>page.evaluate(ms=>{const g=__BROOMBALL__;let remaining=ms/1000;while(remaining>1e-8&&!g.match.paused&&g.match.state!=='ended'){const dt=Math.min(1/60,remaining);g.update(dt);g.updateCamera(dt);remaining-=dt;}g.updateHUD();g.updateTeamHUD();g.updateBallMarker();},ms),render=()=>page.clock.runFor(40),release=async()=>{for(const key of['w','a','s','d','e','r','f','Shift','Escape','Space'])await page.keyboard.up(key);};
  const check=async(name,fn)=>{try{await fn();report.passed.push(name);console.log('PASS',name);}catch(e){report.failed.push({name,error:e.message});console.error('FAIL',name,e.message);}};
  const rect=id=>page.evaluate(id=>{const r=document.querySelector(id).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};},id);
  const onScreen=(r,w,h)=>{assert.ok(r.width>0&&r.height>0);assert.ok(r.x>=-1&&r.y>=-1&&r.x+r.width<=w+1&&r.y+r.height<=h+1,JSON.stringify(r));};
  const tutorialState=()=>page.evaluate(()=>{const g=__BROOMBALL__,t=g.match.tutorial;return{mode:g.match.mode,state:g.match.state,timeLeft:g.match.timeLeft,step:t?.step,kind:t?t.kind||g.tutorialSteps[t.step].kind:null,progress:t?.progress,complete:t?.complete,passes:g.match.stats.completedPasses,shots:g.match.stats.shots,steals:g.match.stats.steals,coachVisible:!document.getElementById('tutorialCoach').classList.contains('hidden')};});

  await check('Homepage defaults to rookie and exposes three genuinely different difficulty rules',async()=>{
   const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{mode:g.match.mode,rules:g.modes,buttons:[...document.querySelectorAll('.mode-option')].map(b=>({mode:b.dataset.mode,pressed:b.getAttribute('aria-pressed')})),tutorial:document.getElementById('tutorialBtn').textContent.trim(),brief:document.getElementById('modeBrief').textContent};});
   assert.equal(result.mode,'rookie');assert.equal(result.buttons.length,3);assert.equal(result.buttons.find(b=>b.mode==='rookie').pressed,'true');assert.match(result.tutorial,/6 项实操训练/);assert.match(result.brief,/辅助/);
   assert.ok(result.rules.rookie.rivalSpeed<result.rules.standard.rivalSpeed&&result.rules.standard.rivalSpeed<result.rules.challenge.rivalSpeed);assert.ok(result.rules.rookie.rivalStealRadius<result.rules.challenge.rivalStealRadius);assert.ok(result.rules.rookie.shotAssistRange>result.rules.standard.shotAssistRange);report.evidence.difficulty=result;
   await render();await page.screenshot({path:path.join(out,'onboarding-home-1280.png')});
  });
  await check('Homepage mode, tutorial and entrance controls fit 800 × 600',async()=>{
   await page.setViewportSize({width:800,height:600});await advance(100);for(const id of['.mode-picker','#tutorialBtn','#startBtn','.matchday-flow'])onScreen(await rect(id),800,600);await render();await page.screenshot({path:path.join(out,'onboarding-home-800.png')});await page.setViewportSize({width:1280,height:720});await advance(50);
  });
  await check('Teams physically enter while the broadcast camera and pause clock remain coherent',async()=>{
   await page.locator('#startBtn').click();const before=await page.evaluate(()=>__BROOMBALL__.match.entrance.actors.map(a=>({start:a.start.toArray(),current:a.unit.mesh.position.toArray()})));await advance(1450);
   const during=await page.evaluate(()=>{const g=__BROOMBALL__;return{state:g.match.state,elapsed:g.match.entrance?.elapsed,timeLeft:g.match.timeLeft,camera:g.cameraFraming.mode,positions:g.match.entrance?.actors.map(a=>a.unit.mesh.position.toArray()),panel:!document.getElementById('matchEntrance').classList.contains('hidden')};});
   assert.equal(during.state,'entrance');assert.equal(during.camera,'entrance');assert.equal(during.panel,true);assert.equal(during.timeLeft,180);assert.ok(during.positions.some((p,i)=>Math.hypot(...p.map((v,j)=>v-before[i].current[j]))>2));
   const pauseAt=during.elapsed;await page.keyboard.press('Escape');await advance(300);const paused=await page.evaluate(()=>({paused:__BROOMBALL__.match.paused,elapsed:__BROOMBALL__.match.entrance?.elapsed}));assert.equal(paused.paused,true);assert.equal(paused.elapsed,pauseAt);await page.keyboard.press('Escape');await advance(100);assert.equal(await page.evaluate(()=>__BROOMBALL__.match.paused),false);
   await render();await page.screenshot({path:path.join(out,'onboarding-entrance.png')});report.evidence.entrance={before,during,paused};await advance(5100);const natural=await page.evaluate(()=>({state:__BROOMBALL__.match.state,entrance:__BROOMBALL__.match.entrance}));assert.equal(natural.state,'countdown');assert.equal(natural.entrance,null);await page.evaluate(()=>__BROOMBALL__.returnToMenu());
  });
  await check('Space skips entrance, restores every target and reduced motion bypasses the cinematic',async()=>{
   await page.locator('#startBtn').click();const targets=await page.evaluate(()=>__BROOMBALL__.match.entrance.actors.map(a=>({id:a.unit.mesh.uuid,target:a.target.toArray()})));await page.keyboard.press('Space');await advance(50);const skipped=await page.evaluate(()=>{const g=__BROOMBALL__,e=g.match.entrance;return{state:g.match.state,entrance:e,panel:!document.getElementById('matchEntrance').classList.contains('hidden'),positions:[g.player,...g.allies,...g.rivals].map(u=>({id:u.mesh.uuid,position:u.mesh.position.toArray()}))};});assert.equal(skipped.state,'countdown');assert.equal(skipped.entrance,null);assert.equal(skipped.panel,false);for(const target of targets){const actual=skipped.positions.find(p=>p.id===target.id);assert.ok(actual);assert.ok(Math.hypot(...actual.position.map((v,i)=>v-target.target[i]))<1e-6);}await advance(3100);assert.equal(await page.evaluate(()=>__BROOMBALL__.match.state),'playing');assert.equal(await page.evaluate(()=>__BROOMBALL__.carrier),'player');
   await page.evaluate(()=>{const g=__BROOMBALL__;g.returnToMenu();g.settings.reducedMotion=true;});await page.locator('#startBtn').click();await advance(50);assert.equal(await page.evaluate(()=>__BROOMBALL__.match.state),'countdown');assert.equal(await page.evaluate(()=>__BROOMBALL__.match.entrance),null);await page.evaluate(()=>{const g=__BROOMBALL__;g.returnToMenu();g.settings.reducedMotion=false;});
  });
  await check('Tutorial starts with real gameplay and freezes the match clock',async()=>{
   await page.locator('#tutorialBtn').click();await advance(650);const state=await tutorialState();assert.equal(state.mode,'rookie');assert.equal(state.state,'playing');assert.equal(state.step,0);assert.equal(state.kind,'move');assert.equal(state.timeLeft,180);assert.equal(state.coachVisible,true);await render();await page.screenshot({path:path.join(out,'onboarding-tutorial-move.png')});report.evidence.tutorialStart=state;
  });
  await check('WASD movement with a reversal completes the cumulative-distance drill',async()=>{
   await page.keyboard.down('w');await advance(250);await page.keyboard.up('w');assert.equal((await tutorialState()).step,0);await page.keyboard.down('s');await advance(650);await page.keyboard.up('s');const state=await tutorialState();assert.equal(state.step,1,JSON.stringify(state));assert.equal(state.kind,'sprint');assert.equal(state.timeLeft,180);
  });
  await check('Moving with Shift completes the stamina drill',async()=>{
   await page.keyboard.down('w');await page.keyboard.down('Shift');await advance(1450);await page.keyboard.up('Shift');await page.keyboard.up('w');const state=await tutorialState();assert.equal(state.step,2,JSON.stringify(state));assert.equal(state.kind,'short');
  });
  await check('E completes a real short-pass reception before unlocking through passes',async()=>{
   await page.keyboard.press('e');await advance(1900);const state=await tutorialState();assert.equal(state.step,3,JSON.stringify(state));assert.equal(state.kind,'through');assert.equal(state.passes,1);
  });
  await check('R completes a real through-pass reception before unlocking shooting',async()=>{
   await page.keyboard.press('r');await advance(2400);const state=await tutorialState();assert.equal(state.step,4,JSON.stringify(state));assert.equal(state.kind,'shot');assert.equal(state.passes,2);await render();await page.screenshot({path:path.join(out,'onboarding-tutorial-shot.png')});
  });
  await check('Charging and releasing F completes the shooting drill',async()=>{
   await page.keyboard.down('f');await advance(650);await page.keyboard.up('f');await advance(120);const state=await tutorialState();assert.equal(state.step,5,JSON.stringify(state));assert.equal(state.kind,'defend');assert.equal(state.shots,1);
  });
  await check('Holding F wins the staged ball and completes all six drills with a responsive panel',async()=>{
   await page.keyboard.down('f');await advance(1500);await page.keyboard.up('f');const state=await tutorialState();assert.equal(state.complete,true,JSON.stringify(state));assert.equal(state.steals,1);assert.equal(state.timeLeft,180);await page.setViewportSize({width:800,height:600});await advance(80);onScreen(await rect('#tutorialCoach'),800,600);assert.equal(await page.locator('#tutorialDone').isVisible(),true);await render();await page.screenshot({path:path.join(out,'onboarding-tutorial-complete-800.png')});report.evidence.tutorialComplete=state;
  });
  await check('Completing onboarding flows into a rookie matchday entrance',async()=>{
   await page.locator('#tutorialDone').click();await advance(100);const result=await page.evaluate(()=>({mode:__BROOMBALL__.match.mode,state:__BROOMBALL__.match.state,tutorial:__BROOMBALL__.match.tutorial,coach:!document.getElementById('tutorialCoach').classList.contains('hidden')}));assert.equal(result.mode,'rookie');assert.equal(result.state,'entrance');assert.equal(result.tutorial,null);assert.equal(result.coach,false);
  });
  await check('Rookie and challenge steal radii produce different actual contact outcomes',async()=>{
   const result=await page.evaluate(()=>{
    const g=__BROOMBALL__,stage=mode=>{g.startMatch(mode);Object.assign(g.match,{state:'playing',kickoff:0,stealCooldown:0});g.clearInput();g.player.pos.set(0,10,0);g.player.previousPos.copy(g.player.pos);g.setCarrier('player');for(const r of g.rivals){r.mesh.position.set(35,28,35);r.stun=100;g.resetAIFlight(r);}const r=g.rivals[0];r.mesh.position.set(0,10,-2);r.stun=0;r.previousPos=r.mesh.position.clone();g.updateSteals(1/60);return g.carrier===r;};
    return{rookie:stage('rookie'),challenge:stage('challenge')};
   });assert.equal(result.rookie,false);assert.equal(result.challenge,true);report.evidence.stealDifficulty=result;
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);assert.deepEqual(report.failed,[]);console.log('ONBOARDING_PASS',report.passed.length);
 }finally{fs.writeFileSync(path.join(out,'onboarding-browser.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
