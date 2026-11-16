/* Rendered core UI acceptance and a passive 30-second control/keeper audit. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tests/artifacts');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const report={passed:[],failed:[],errors:[],requests:[],evidence:{}};
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route(/^https?:\/\//,r=>{report.requests.push(r.request().url());return r.abort();});
  await page.clock.install();
  await page.goto(pathToFileURL(path.join(root,'index.html')).href,{waitUntil:'load'});
  await page.waitForFunction(()=>!!window.__BROOMBALL__);
  await page.evaluate(()=>Promise.all([BroomModels.ready,__BROOMBALL__.modelScenery]));
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
  const advance=ms=>page.clock.runFor(ms);
  const speeds=await page.evaluate(()=>({allies:__BROOMBALL__.allies.map(u=>u.speed),rivals:__BROOMBALL__.rivals.map(u=>u.speed)}));
  const check=async(name,run)=>{try{await run();report.passed.push(name);console.log('PASS',name);}catch(e){report.failed.push({name,error:e.message});console.error('FAIL',name,e.message);}};
  const restoreSpeeds=()=>page.evaluate(speeds=>{const g=__BROOMBALL__;g.allies.forEach((u,i)=>u.speed=speeds.allies[i]);g.rivals.forEach((u,i)=>u.speed=speeds.rivals[i]);},speeds);
  const stage=async()=>{
   await restoreSpeeds();await page.evaluate(()=>{
    const g=__BROOMBALL__;g.startMatch('standard');g.setCommentaryEnabled(false);
    Object.assign(g.match,{state:'playing',paused:false,elapsed:3,timeLeft:177,kickoff:0,pendingRestart:null,stealCooldown:100});
    g.clearInput();g.player.pos.set(0,10,4);g.player.previousPos.copy(g.player.pos);g.player.vel.set(0,0,0);g.setAim(0,0);
    for(const u of[...g.allies,...g.rivals]){u.mesh.position.set(38,10,34);u.stun=100;u.speed=0;u.velocity?.set(0,0,0);g.resetAIFlight(u);}
    g.allies.find(u=>u.role==='keeper').mesh.position.set(0,10,53);
    const field=g.allies.filter(u=>u.role!=='keeper');field[0].mesh.position.set(15,10,-10);field[0].stun=0;field[1].mesh.position.set(-14,10,-6);field[1].stun=0;
    g.rivals[0].mesh.position.set(0,10,-4);g.rivals[0].stun=0;g.rivals[0].speed=-2;g.setCarrier('player');
   });await advance(1100);
  };
  const layout=()=>page.evaluate(()=>{
   const g=__BROOMBALL__,rect=id=>{const element=document.querySelector(id),r=element.getBoundingClientRect(),s=getComputedStyle(element);return{x:r.x,y:r.y,width:r.width,height:r.height,display:s.display,position:s.position,flexDirection:s.flexDirection,text:element.textContent.trim(),top:s.top,bottom:s.bottom};};
   g.camera.updateMatrixWorld(true);const p=g.player.pos.clone().add(new THREE.Vector3(0,1.4,0)).project(g.camera);
   return{width:innerWidth,height:innerHeight,scoreboard:rect('.scoreboard'),home:rect('.lions'),away:rect('.ravens'),clock:rect('.clock'),actions:rect('.action-bar'),buttons:[...document.querySelectorAll('.action-bar button')].map(b=>({id:b.id,...rect('#'+b.id),disabled:b.disabled})),portrait:rect('#playerPortraits'),radar:rect('#radar'),status:rect('.match-status'),objective:rect('.objective'),passHint:rect('#passHint'),player:{id:g.player.mesh.uuid,x:(p.x*.5+.5)*innerWidth,y:(1-p.y)*.5*innerHeight,z:p.z},state:g.match.state,paused:g.match.paused,portraitStatus:g.playerPortraits.getStatus()};
  });
  const onScreen=(r,v)=>{assert.ok(r.width>0&&r.height>0&&r.display!=='none');assert.ok(r.x>=-1&&r.y>=-1&&r.x+r.width<=v.width+1&&r.y+r.height<=v.height+1,JSON.stringify(r));};
  for(const[width,height]of[[1280,720],[800,600]]){
   await check(`Attack, defence, pause and full-time UI render at ${width} × ${height}`,async()=>{
    await page.setViewportSize({width,height});await stage();const attack=await layout();
    for(const r of[attack.scoreboard,attack.actions,attack.portrait,attack.radar])onScreen(r,attack);
    assert.ok(attack.home.x<attack.clock.x&&attack.clock.x<attack.away.x,'Scoreboard teams and clock must read left-to-right');
    assert.ok(attack.home.y+attack.home.height>attack.clock.y&&attack.home.y<attack.clock.y+attack.clock.height,'Scoreboard columns must share a row');
    assert.equal(attack.buttons.length,3);for(const b of attack.buttons)onScreen(b,attack);
    assert.equal(attack.buttons.find(b=>b.id==='primaryBtn').text.replace(/\s+/g,''),'F射门');
    assert.ok(Math.abs(attack.player.x/width-.5)<.1&&Math.abs(attack.player.y/height-.5)<.1);
    await page.screenshot({path:path.join(out,`core-presentation-attack-${width}.png`)});
    await page.evaluate(()=>__BROOMBALL__.setCarrier(__BROOMBALL__.rivals[0]));await advance(900);const defence=await layout();
    assert.equal(defence.player.id,attack.player.id);assert.equal(defence.buttons.find(b=>b.id==='primaryBtn').text.replace(/\s+/g,''),'F逼抢');
    assert.equal(defence.buttons.find(b=>b.id==='shortPassBtn').disabled,true);assert.equal(defence.buttons.find(b=>b.id==='throughPassBtn').disabled,true);
    await page.screenshot({path:path.join(out,`core-presentation-defence-${width}.png`)});
    await page.keyboard.press('Escape');await advance(100);assert.equal(await page.locator('#pause').isVisible(),true);
    const paused=await page.evaluate(()=>{const d=document.querySelector('#pause .core-dialog'),r=d.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,display:getComputedStyle(d).display};});onScreen(paused,defence);
    await page.screenshot({path:path.join(out,`core-presentation-pause-${width}.png`)});
    await page.locator('#resumeBtn').click();await page.evaluate(()=>__BROOMBALL__.match.timeLeft=.03);await advance(100);
    assert.equal(await page.locator('#ending').isVisible(),true);assert.equal(await page.evaluate(()=>__BROOMBALL__.match.state),'ended');
    const ended=await page.evaluate(()=>{const d=document.querySelector('#ending .core-dialog'),r=d.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,display:getComputedStyle(d).display};});onScreen(ended,defence);
    assert.match(await page.locator('#endStats').innerText(),/成功传球/);
    await page.screenshot({path:path.join(out,`core-presentation-full-time-${width}.png`)});
    report.evidence[width]={attack,defence,paused,ended};
   });
  }
  await check('Thirty seconds of natural match play preserve one keeper and avoid near-ball control oscillation',async()=>{
   await page.setViewportSize({width:1280,height:720});await restoreSpeeds();
   await page.evaluate(()=>{const g=__BROOMBALL__;g.startMatch('standard');g.setCommentaryEnabled(false);});await advance(3200);await page.keyboard.press('e');
   await page.evaluate(()=>{
    const g=__BROOMBALL__,audit={start:g.match.elapsed,samples:[],switches:[],last:null};window.__CORE_PRESENTATION_AUDIT__=audit;
    function sample(){
     const units=[g.player,...g.allies],keepers=units.filter(u=>u.role==='keeper'),keeper=g.homeKeeper(),carrier=g.carrier==='player'?g.player.mesh.uuid:g.carrier?.mesh.uuid||null;
     const entry={time:g.match.elapsed-audit.start,player:g.player.mesh.uuid,role:g.player.role,carrier,side:g.carrier==='player'||g.allies.includes(g.carrier)?'home':g.rivals.includes(g.carrier)?'away':'loose',keeperCount:keepers.length,keeper:keeper?.mesh.uuid||null,keeperIds:keepers.map(u=>u.mesh.uuid),nearBall:g.player.pos.distanceTo(g.quaffle.position),position:g.player.pos.toArray(),keeperPosition:(keeper===g.player?g.player.pos:keeper?.mesh.position)?.toArray(),state:g.match.state,paused:g.match.paused};audit.lastFrame=entry;
     if(audit.last&&audit.last.player!==entry.player)audit.switches.push({...entry,from:audit.last.player});
     if(!audit.last||entry.time-audit.last.time>=.095||audit.last.player!==entry.player||entry.time>=30){audit.samples.push(entry);audit.last=entry;}
     if(entry.time<30.02&&g.match.state==='playing')requestAnimationFrame(sample);
    }requestAnimationFrame(sample);
   });await advance(30100);
   const audit=await page.evaluate(()=>window.__CORE_PRESENTATION_AUDIT__);report.evidence.natural=audit;assert.ok(audit.samples.length>200);
   assert.ok(audit.samples.at(-1).time>=30);assert.ok(audit.samples.every(s=>s.keeperCount===1&&s.keeper&&s.keeperIds[0]===s.keeper),'Each frame needs one consistent logical keeper');
   const keeperBodies=[...new Set(audit.samples.map(s=>s.keeper))];assert.equal(keeperBodies.length,1,'Switching control must not turn a different body into the goalkeeper');
   const oscillations=[],rapidKeeperReturns=[];
   for(let i=1;i<audit.switches.length;i++){
    const a=audit.switches[i-1],b=audit.switches[i];
    if(b.time-a.time<.35&&a.from===b.player&&a.carrier&&a.carrier===b.carrier&&a.side==='away'&&b.side==='away'&&a.nearBall<15&&b.nearBall<15)oscillations.push({a,b});
    if(b.time-a.time<.05&&a.from===b.player&&b.from===a.player&&a.role!=='keeper'&&b.role==='keeper'&&Math.hypot(...a.position.map((v,j)=>v-b.position[j]))>10)rapidKeeperReturns.push({a,b});
   }
   const maxKeeperReturnsInTenSeconds=Math.max(0,...rapidKeeperReturns.map(({b})=>rapidKeeperReturns.filter(item=>item.b.time>=b.time-10&&item.b.time<=b.time).length));
   report.evidence.natural={...audit,keeperBodies,oscillations,rapidKeeperReturns,maxKeeperReturnsInTenSeconds};
   assert.deepEqual(oscillations,[]);assert.ok(maxKeeperReturnsInTenSeconds<3,'Repeated one-frame keeper/field camera returns during possession must not loop');
   await page.screenshot({path:path.join(out,'core-presentation-natural-30s.png')});
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);assert.deepEqual(report.failed,[]);console.log('CORE_PRESENTATION_PASS',report.passed.length);
 }finally{fs.writeFileSync(path.join(out,'core-presentation.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
