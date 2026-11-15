/* Face framing is checked on the real selectable rigs, including the uploaded Harry. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const{pathToFileURL}=require('node:url');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tests/artifacts');
(async()=>{
 fs.mkdirSync(out,{recursive:true});const report={passed:[],failed:[],errors:[],evidence:{}};
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});page.on('pageerror',e=>report.errors.push(e.message));await page.clock.install();
  await page.goto(pathToFileURL(path.join(root,'index.html')).href);await page.waitForFunction(()=>!!window.__BROOMBALL__);
  await page.evaluate(()=>Promise.all([BroomModels.ready,__BROOMBALL__.modelScenery]));await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
  const advance=ms=>page.clock.runFor(ms),check=async(name,fn)=>{try{await fn();report.passed.push(name);console.log('PASS',name);}catch(e){report.failed.push({name,error:e.message});console.error('FAIL',name,e.message);}};
  const identities=()=>page.evaluate(()=>Object.entries(SchoolMagic.rosters).flatMap(([house,roster])=>roster.map(p=>({id:p.id,name:p.name,house,key:house+':'+p.id}))));
  await check('All twelve actual home-page models have a front-facing facial close-up',async()=>{
   const roster=await identities(),statuses=[];await page.locator('[data-view="face"]').click();
   for(const p of roster){
    await page.locator(`.house-option[data-house="${p.house}"]`).click();await page.locator(`.character[data-id="${p.id}"]`).click();await advance(220);
    const status=await page.evaluate(()=>__BROOMBALL__.characterPreview.getStatus());assert.equal(status.characterId,p.id);assert.equal(status.viewMode,'face');assert.equal(status.ready,true);assert.equal(status.faceSource,p.id==='harry'?'harry-rider':p.id);assert.ok(status.meshCount>0);assert.equal(status.error,null);
    const projected=await page.evaluate(()=>{const preview=__BROOMBALL__.characterPreview,f=BroomCharacterArt.getFaceFrame(preview.wizard),c=f.center.clone();preview.wizard.localToWorld(c);const p=c.project(preview.camera);return{x:p.x,y:p.y};});assert.ok(Math.abs(projected.x)<.12&&Math.abs(projected.y)<.15,JSON.stringify(projected));
    await page.locator('#characterPreview').screenshot({path:path.join(out,`face-roster-${p.id}.png`)});statuses.push(status);
   }
   assert.equal(new Set(statuses.map(s=>s.characterId)).size,12);assert.ok(statuses.find(s=>s.characterId==='harry').uploadedIds.includes('harry-rider'));report.evidence.roster=statuses;
   await page.locator('[data-view="body"]').click();await advance(200);assert.equal(await page.evaluate(()=>__BROOMBALL__.characterPreview.getStatus().viewMode),'body');
  });
  await check('Live face cards draw all twelve real rigs and preserve the uploaded Harry model',async()=>{
   await page.evaluate(()=>{const g=__BROOMBALL__;g.startMatch('standard');Object.assign(g.match,{state:'playing',paused:false,stealCooldown:100});});await advance(200);
   const roster=await identities(),statuses=[];
   for(let i=0;i<roster.length;i+=2){const result=await page.evaluate(async({controlled,carrier})=>{
    const p=__BROOMBALL__.playerPortraits;p.update(.2,{active:true,controlled,carrier});await Promise.resolve();await Promise.resolve();p.update(.2,{active:true,controlled,carrier});const gl=p.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let colored=0;for(let x=3;x<pixels.length;x+=4)if(pixels[x]>0)colored++;return{status:p.getStatus(),colored};
   },{controlled:roster[i],carrier:roster[i+1]});assert.equal(result.status.layout,'dual');assert.ok(result.colored>2500,'Actual face geometry must shade the canvas');for(const slot of result.status.slots){assert.equal(slot.visible,true);assert.equal(slot.ready,true);assert.equal(slot.profile,slot.identity.id);assert.ok(slot.facePixels>65);if(slot.identity.id==='harry')assert.ok(slot.uploadedIds.includes('harry-rider'));}statuses.push(result);}
   report.evidence.renderedFaces=statuses;
  });
  await check('The controlled ball carrier is shown once and compact screens retain the controlled home player',async()=>{
   const roster=await identities(),controlled=roster.find(p=>p.id==='hermione'),carrier=roster.find(p=>p.id==='draco');
   await page.evaluate(p=>__BROOMBALL__.playerPortraits.update(.2,{active:true,controlled:p,carrier:p}),controlled);let s=await page.evaluate(()=>__BROOMBALL__.playerPortraits.getStatus());assert.equal(s.layout,'single');assert.equal(s.slots.filter(p=>p.visible).length,1);assert.ok(s.width<130);
   await page.setViewportSize({width:800,height:600});await page.evaluate(p=>__BROOMBALL__.playerPortraits.update(.2,{active:true,...p}),{controlled,carrier});s=await page.evaluate(()=>__BROOMBALL__.playerPortraits.getStatus());assert.equal(s.layout,'single');assert.equal(s.slots.find(p=>p.visible).identity.id,'hermione');assert.equal(s.slots.find(p=>p.visible).role,'controlled');assert.ok(s.width<=110);await page.locator('#playerPortraits').screenshot({path:path.join(out,'face-compact-defense.png')});
   await page.setViewportSize({width:1280,height:720});await page.evaluate(p=>__BROOMBALL__.playerPortraits.update(.2,{active:true,...p}),{controlled,carrier});assert.equal(await page.locator('[data-portrait="carrier"] .portrait-role').textContent(),'对方持球');s=await page.evaluate(()=>__BROOMBALL__.playerPortraits.getStatus());assert.equal(s.slots.find(p=>p.role==='controlled').identity.id,'hermione');assert.equal(s.slots.filter(p=>p.visible).length,2);
   await page.evaluate(p=>__BROOMBALL__.playerPortraits.update(.2,{active:true,controlled:p,carrier:null}),controlled);s=await page.evaluate(()=>__BROOMBALL__.playerPortraits.getStatus());assert.equal(s.slots.find(p=>p.visible).identity.id,'hermione');report.evidence.compact=s;
  });
  await check('The portrait renderer stops in menus and is capped below ten frames a second during play',async()=>{
   await page.setViewportSize({width:1280,height:720});await page.evaluate(()=>{const g=__BROOMBALL__;g.startMatch('standard');Object.assign(g.match,{state:'playing',paused:false,stealCooldown:100});g.setCarrier('player');});await advance(300);
   const a=await page.evaluate(()=>__BROOMBALL__.playerPortraits.getStatus());await advance(1000);const b=await page.evaluate(()=>__BROOMBALL__.playerPortraits.getStatus());assert.ok(b.renderedFrames>a.renderedFrames);assert.ok(b.renderedFrames-a.renderedFrames<=9);assert.equal(b.slots.filter(p=>p.visible).length,1);
   await page.evaluate(()=>__BROOMBALL__.returnToMenu());await advance(100);const c=await page.evaluate(()=>__BROOMBALL__.playerPortraits.getStatus());await advance(1000);const d=await page.evaluate(()=>__BROOMBALL__.playerPortraits.getStatus());assert.equal(d.active,false);assert.equal(d.renderedFrames,c.renderedFrames);report.evidence.refresh={a,b,c,d};
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.failed,[]);console.log('PLAYER_PORTRAITS_PASS');
 }finally{fs.writeFileSync(path.join(out,'player-portraits.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
