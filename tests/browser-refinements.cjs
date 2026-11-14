/* Imported content, a closer broadcast camera and smooth fixed-endpoint throws. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tests/artifacts');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--enable-unsafe-swiftshader']});
 const report={passed:[],errors:[],requests:[],evidence:{}};
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route(/^https?:\/\//,r=>{report.requests.push(r.request().url());return r.abort();});
  await page.clock.install();
  await page.goto(pathToFileURL(path.join(root,'index.html')).href,{waitUntil:'load'});
  await page.waitForFunction(()=>!!window.__BROOMBALL__);
  await page.evaluate(()=>window.BroomModels.ready);
  await page.waitForFunction(()=>window.BroomModels.getStatus().loaded===7);
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
  const check=async(name,fn)=>{await fn();report.passed.push(name);console.log('PASS',name);};
  await check('All seven supplied models load offline and are placed in the live game',async()=>{
   const state=await page.evaluate(()=>window.BroomModels.getStatus());
   assert.equal(state.total,7);assert.equal(state.loaded,7);assert.deepEqual(state.errors,[]);
   assert.equal(new Set(state.models.map(x=>x.source)).size,7);
   for(const model of state.models)assert.ok(model.placements>0||model.placements?.length>0,model.source+' must be used in the scene');
   report.evidence.models=state;
   await page.screenshot({path:path.join(out,'refinements-menu.png')});
  });
  await page.locator('#startBtn').click();await page.clock.runFor(4200);
  await check('The broadcast camera is modestly closer and keeps its elevated match view',async()=>{
   const state=await page.evaluate(()=>{const g=window.__BROOMBALL__,f=g.player.pos.clone().lerp(g.quaffle.position,.24);f.x=Math.max(-28,Math.min(28,f.x));f.z=Math.max(-40,Math.min(40,f.z));return {mode:g.match.cameraMode,distance:g.camera.position.distanceTo(f),rise:g.camera.position.y-f.y,fov:g.camera.fov};});
   assert.equal(state.mode,'broadcast');assert.ok(state.distance>62&&state.distance<79);assert.ok(state.rise>40&&state.rise<54);report.evidence.camera=state;
   await page.screenshot({path:path.join(out,'refinements-match-1440.png')});
  });
  const stage=async()=>page.evaluate(()=>{
   const g=window.__BROOMBALL__;g.startMatch('standard');Object.assign(g.match,{state:'playing',paused:false,elapsed:3,kickoff:0,pendingRestart:null,stealCooldown:100});
   g.clearInput();g.setAim(0,0);g.player.pos.set(0,10,0);g.player.previousPos.copy(g.player.pos);g.player.mesh.rotation.set(0,0,0);
   for(const u of [...g.allies,...g.rivals]){u.mesh.position.set(38,30,34);u.speed=0;u.stun=100;u.velocity?.set(0,0,0);}
   g.allies[0].mesh.position.set(0,10,-28);g.allies[0].stun=0;g.setCarrier('player');
   for(const b of g.bludgers){b.frozen=100;b.mesh.position.set(40,35,40);}
  });
  await check('A pass rises and falls on a gentle arc without chasing a moved receiver',async()=>{
   await stage();await page.keyboard.press('s');
   const release=await page.evaluate(()=>{const g=window.__BROOMBALL__;return {destination:g.passDestination.toArray(),duration:g.passFlight.duration,start:g.quaffle.position.toArray(),velocity:g.quaffleVel.toArray()};});
   await page.clock.runFor(release.duration*500);
   const middle=await page.evaluate(()=>{const g=window.__BROOMBALL__;const s={position:g.quaffle.position.toArray(),velocity:g.quaffleVel.toArray()};g.allies[0].mesh.position.set(20,10,-28);return s;});
   assert.ok(middle.position[1]>(release.start[1]+release.destination[1])/2+.5);
   assert.ok(middle.velocity[1]<release.velocity[1]);
   await page.clock.runFor(200);
   assert.deepEqual(await page.evaluate(()=>window.__BROOMBALL__.passDestination.toArray()),release.destination);
   report.evidence.arc={release,middle};
  });
  await check('The curved preview is subtle and a real short pass still transfers control',async()=>{
   await stage();await page.clock.runFor(100);
   const preview=await page.evaluate(()=>{const p=window.__BROOMBALL__.scene.getObjectByName('PassArcPreview');return {points:p.geometry.getAttribute('position').count,opacity:p.material.opacity};});
   assert.ok(preview.points>8);assert.ok(preview.opacity<=.45);
   await page.keyboard.press('s');await page.clock.runFor(1250);
   assert.equal(await page.evaluate(()=>window.__BROOMBALL__.carrier==='player'&&window.__BROOMBALL__.match.stats.completedPasses===1),true);report.evidence.preview=preview;
  });
  await check('All active commentary and local spells use female English recordings',async()=>{
   const state=await page.evaluate(()=>({voice:window.BroomVoice.getStatus(),clips:Object.entries(window.BroomCommentaryClips).map(([id,c])=>({id,src:c.src,text:c.text}))}));
   assert.match(state.voice.lang,/^en/);assert.match(state.voice.voice,/Samantha/);assert.ok(state.clips.length>=65);
   for(const cue of state.clips){assert.match(cue.src,/assets\/voice\//);assert.ok(fs.statSync(path.resolve(root,cue.src)).size>1000);assert.doesNotMatch(cue.text,/[\u3400-\u9fff]/);}
   report.evidence.voice={...state.voice,commentaryClips:state.clips.length};
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);
  console.log('BROWSER_REFINEMENTS_PASS');
 }finally{fs.writeFileSync(path.join(out,'refinements-report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
