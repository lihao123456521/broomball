/* Aggressive team pressing and optional spectacular-goal celebrations in the real browser. */
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
  // Keep the complete virtual clock and input simulation, but rasterize only the final state of each step.
  const advance=async ms=>{await page.evaluate(()=>{const g=__BROOMBALL__;window.__pressureRender=g.renderer.render.bind(g.renderer);g.renderer.render=()=>{};});await page.clock.runFor(ms);await page.evaluate(()=>{const g=__BROOMBALL__;g.renderer.render=window.__pressureRender;delete window.__pressureRender;g.renderer.render(g.scene,g.camera);});};
  const check=async(name,fn)=>{try{await fn();report.passed.push(name);console.log('PASS',name);}catch(e){report.failed.push({name,error:e.message});console.error('FAIL',name,e.message);}};
  const release=async()=>{for(const key of['w','a','s','d','e','r','f','Shift','Escape','Space'])await page.keyboard.up(key);};
  const stage=async()=>{
   await release();await page.evaluate(()=>{
    const g=__BROOMBALL__;g.startMatch('standard');g.setCommentaryEnabled(false);Object.assign(g.match,{state:'playing',paused:false,elapsed:3,timeLeft:177,kickoff:0,pendingRestart:null,stealCooldown:100});
    g.settings.reducedMotion=false;g.clearInput();g.setAim(0,0);g.player.pos.set(0,10,0);g.player.previousPos.copy(g.player.pos);g.player.mesh.position.copy(g.player.pos);g.player.mesh.rotation.set(0,0,0);g.player.vel.set(0,0,0);g.player.speed=0;
    for(const u of[...g.rivals,...g.allies]){u.mesh.position.set(38,32,34);u.speed=0;u.stun=100;u.velocity?.set(0,0,0);g.resetAIFlight(u);}
    g.setCarrier('player');g.quaffleVel.set(0,0,0);
   });
  };
  const scoreBeautiful=async(closeTeam=false)=>{
   await stage();await page.evaluate(closeTeam=>{
    const g=__BROOMBALL__;g.player.pos.set(0,10,-29);g.player.previousPos.copy(g.player.pos);g.player.mesh.position.copy(g.player.pos);
    if(closeTeam){const field=g.allies.filter(a=>a.role==='chaser');field.forEach((a,i)=>{a.mesh.position.set(i?5:-4,10+i*2,-25+i*5);a.previousPos=a.mesh.position.clone();});}
    g.setCarrier('player');g.match.charging=true;g.match.shotCharge=.85;g.throwQuaffle();
   },closeTeam);await advance(1800);
   assert.equal(await page.evaluate(()=>!!__BROOMBALL__.match.celebration),true,'The staged long-range shot must produce a celebration');
  };
  const torsoY=()=>page.evaluate(()=>{const g=__BROOMBALL__,mesh=g.crowd.root.children.find(m=>m.name==='CrowdTorso'),matrix=new THREE.Matrix4();mesh.getMatrixAt(0,matrix);return matrix.elements[13];});
  await check('Press targeting predicts carrier velocity instead of chasing the old position',async()=>{
   await stage();const result=await page.evaluate(()=>{const g=__BROOMBALL__,r=g.rivals[0];r.mesh.position.set(4,12,-8);r.velocity=new THREE.Vector3(6,-2,-10);g.setCarrier(r);const target=g.getPressTarget(r);return{origin:r.mesh.position.toArray(),velocity:r.velocity.toArray(),target:target.toArray()};});
   assert.ok(Math.abs(result.target[0]-5.68)<1e-6,JSON.stringify(result));assert.ok(Math.abs(result.target[1]-11.44)<1e-6);assert.ok(Math.abs(result.target[2]+10.8)<1e-6);report.evidence.prediction=result;
  });
  await check('Holding F auto-sprints toward the carrier with reduced stamina cost',async()=>{
   await stage();await page.evaluate(()=>{const g=__BROOMBALL__,r=g.rivals[0];r.mesh.position.set(0,10,-12);r.speed=0;r.stun=100;g.setCarrier(r);});await page.keyboard.down('f');await advance(650);
   const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{speed:g.player.speed,baseSpeed:g.player.baseSpeed,stamina:g.player.stamina,boosting:g.player.boosting,z:g.player.pos.z,action:g.match.primaryAction};});await page.keyboard.up('f');
   assert.ok(result.speed>result.baseSpeed+4,JSON.stringify(result));assert.ok(result.stamina<100&&result.stamina>75);assert.equal(result.boosting,true);assert.ok(result.z<-1);assert.equal(result.action,'defend');report.evidence.autoPress=result;
  });
  await check('An allied presser can win the ball and hand control to the user',async()=>{
   await stage();const result=await page.evaluate(()=>{const g=__BROOMBALL__,r=g.rivals[0],ally=g.allies.find(a=>a.role==='chaser');g.setCarrier(r);r.mesh.position.set(0,10,0);r.speed=0;r.stun=0;ally.mesh.position.set(0,10,1.2);ally.speed=0;ally.stun=0;g.player.pos.set(10,10,8);g.player.previousPos.copy(g.player.pos);g.player.mesh.position.copy(g.player.pos);g.match.stealCooldown=0;const expected=ally.mesh.uuid;g.updateSteals(1/60);return{expected,actual:g.player.mesh.uuid,holding:g.carrier==='player',steals:g.match.stats.steals,cooldown:g.match.stealCooldown};});
   assert.equal(result.actual,result.expected,JSON.stringify(result));assert.equal(result.holding,true);assert.equal(result.steals,1);assert.ok(result.cooldown>0);report.evidence.teamSteal=result;
  });
  await check('A real long-range player shot opens celebration and the crowd reaction',async()=>{
   await scoreBeautiful();const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{score:g.match.playerScore,reason:g.match.celebration.reason,selected:g.match.celebration.selected,panel:!document.getElementById('goalCelebration').classList.contains('hidden'),camera:g.cameraFraming.mode,crowd:g.crowd.getStatus().celebration};});
   assert.equal(result.score,1);assert.match(result.reason,/远射/);assert.equal(result.selected,'fist');assert.equal(result.panel,true);assert.equal(result.camera,'celebration');assert.ok(result.crowd);report.evidence.longGoal=result;
   await page.screenshot({path:path.join(out,'pressure-celebration-fist.png')});
  });
  await check('Glide selection freezes match clocks while spectators visibly jump',async()=>{
   await scoreBeautiful();const before=await page.evaluate(()=>{const g=__BROOMBALL__;return{elapsed:g.match.elapsed,timeLeft:g.match.timeLeft};}),y0=await torsoY();await page.keyboard.press('r');await advance(500);
   const after=await page.evaluate(()=>{const g=__BROOMBALL__;return{elapsed:g.match.elapsed,timeLeft:g.match.timeLeft,selected:g.match.celebration?.selected,camera:g.cameraFraming.mode,crowdTime:g.crowd.getStatus().celebration?.time};}),y1=await torsoY();
   assert.equal(after.selected,'glide');assert.equal(after.elapsed,before.elapsed);assert.equal(after.timeLeft,before.timeLeft);assert.equal(after.camera,'celebration');assert.ok(after.crowdTime>0);assert.ok(Math.abs(y1-y0)>1e-5,JSON.stringify({y0,y1}));report.evidence.glide={before,after,crowdMatrixDelta:y1-y0};
   await page.screenshot({path:path.join(out,'pressure-celebration-glide.png')});
   const pauseAt=await page.evaluate(()=>__BROOMBALL__.match.celebration.elapsed);await page.keyboard.press('Escape');await advance(300);const paused=await page.evaluate(()=>({paused:__BROOMBALL__.match.paused,elapsed:__BROOMBALL__.match.celebration?.elapsed}));assert.equal(paused.paused,true);assert.equal(paused.elapsed,pauseAt);await page.keyboard.press('Escape');await advance(80);assert.equal(await page.evaluate(()=>__BROOMBALL__.match.paused),false);assert.equal(await page.evaluate(()=>__BROOMBALL__.match.celebration?.selected),'glide');report.evidence.glide.pause={pauseAt,paused};
  });
  await check('Team celebration moves teammates and fits an 800 × 600 viewport',async()=>{
   await scoreBeautiful(true);await page.setViewportSize({width:800,height:600});await page.keyboard.press('f');await advance(900);
   const result=await page.evaluate(()=>{const g=__BROOMBALL__,panel=document.getElementById('goalCelebration'),rect=panel.getBoundingClientRect(),buttons=[...panel.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}),actors=g.match.celebration.actors.map(a=>({travel:a.mesh.position.distanceTo(a.position)}));return{selected:g.match.celebration.selected,actors,panel:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},buttons,viewport:{width:innerWidth,height:innerHeight}};});
   assert.equal(result.selected,'team');assert.ok(result.actors.slice(1).some(a=>a.travel>.1),JSON.stringify(result.actors));assert.ok(result.panel.x>=0&&result.panel.y>=0&&result.panel.x+result.panel.width<=800&&result.panel.y+result.panel.height<=600,JSON.stringify(result.panel));assert.equal(result.buttons.length,4);for(const b of result.buttons)assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=800&&b.y+b.height<=600);report.evidence.team=result;
   await page.screenshot({path:path.join(out,'pressure-celebration-team-800.png')});
  });
  await check('Space skips celebration and hands the restart to the opponent',async()=>{
   await scoreBeautiful();await page.keyboard.press('Space');await advance(100);const skipped=await page.evaluate(()=>{const g=__BROOMBALL__;return{celebration:g.match.celebration,panel:!document.getElementById('goalCelebration').classList.contains('hidden'),kickoff:g.match.kickoff,timeLeft:g.match.timeLeft};});
   assert.equal(skipped.celebration,null);assert.equal(skipped.panel,false);assert.ok(skipped.kickoff>0);await advance(2200);const restarted=await page.evaluate(()=>{const g=__BROOMBALL__;return{pending:g.match.pendingRestart,rival:g.rivals.includes(g.carrier),timeLeft:g.match.timeLeft};});assert.equal(restarted.pending,null);assert.equal(restarted.rival,true);assert.ok(restarted.timeLeft<skipped.timeLeft);report.evidence.skip={skipped,restarted};
  });
  await check('Ordinary goals keep playing and crowd matrices recover after cheering',async()=>{
   await stage();const y0=await torsoY();await page.evaluate(()=>__BROOMBALL__.scoreGoal('player'));await advance(100);const during=await page.evaluate(()=>({celebration:__BROOMBALL__.match.celebration,crowd:__BROOMBALL__.crowd.getStatus().celebration,kickoff:__BROOMBALL__.match.kickoff}));assert.equal(during.celebration,null);assert.ok(during.crowd);assert.ok(during.kickoff>0);await advance(3200);const after=await page.evaluate(()=>({crowd:__BROOMBALL__.crowd.getStatus().celebration})),y1=await torsoY();assert.equal(after.crowd,null);assert.ok(Math.abs(y1-y0)<1e-6,JSON.stringify({y0,y1}));report.evidence.ordinary={during,after,y0,y1};
  });
  await check('Reduced motion keeps celebration poses static without stopping the skip flow',async()=>{
   await stage();await page.evaluate(()=>{__BROOMBALL__.settings.reducedMotion=true;});await page.evaluate(()=>{const g=__BROOMBALL__;g.player.pos.set(0,10,-29);g.player.previousPos.copy(g.player.pos);g.player.mesh.position.copy(g.player.pos);g.setCarrier('player');g.match.charging=true;g.match.shotCharge=.85;g.throwQuaffle();});await advance(1800);await page.keyboard.press('r');const before=await page.evaluate(()=>{const c=__BROOMBALL__.match.celebration;return c?c.scorer.position.toArray():null;});await advance(500);const after=await page.evaluate(()=>{const c=__BROOMBALL__.match.celebration;return c?c.scorer.position.toArray():null;});assert.deepEqual(after,before);
   await page.keyboard.press('f');const teamBefore=await page.evaluate(()=>__BROOMBALL__.match.celebration.actors.map(a=>a.mesh.position.toArray()));await advance(400);const teamAfter=await page.evaluate(()=>__BROOMBALL__.match.celebration.actors.map(a=>a.mesh.position.toArray()));assert.deepEqual(teamAfter,teamBefore);
   await page.keyboard.press('Space');await advance(100);assert.equal(await page.evaluate(()=>__BROOMBALL__.match.celebration),null);report.evidence.reducedMotion={before,after,teamBefore,teamAfter};
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);assert.deepEqual(report.failed,[]);console.log('PRESSURE_CELEBRATION_PASS',report.passed.length);
 }finally{fs.writeFileSync(path.join(out,'pressure-celebration-browser.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
