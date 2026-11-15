/* Pixel-based rider readability, real imported meshes and human spectator silhouettes. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'tests/artifacts');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const report={passed:[],errors:[],requests:[],evidence:{views:[]}};
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route(/^https?:\/\//,r=>{report.requests.push(r.request().url());return r.abort();});
  await page.clock.install();
  await page.addInitScript(()=>{HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.resolve();});
  await page.goto(pathToFileURL(path.join(root,'index.html')).href,{waitUntil:'load'});
  await page.waitForFunction(()=>!!window.__BROOMBALL__);
  await page.evaluate(()=>Promise.all([BroomModels.ready,__BROOMBALL__.modelScenery]));
  await page.waitForFunction(()=>__BROOMBALL__.player.mesh.userData.importedWizard&&!__BROOMBALL__.player.mesh.userData.broomLoading);
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
  const advance=ms=>page.clock.runFor(ms);
  const check=async(name,fn)=>{await fn();report.passed.push(name);console.log('PASS',name);};
  // Render only the rider in white to count actual silhouette pixels. This excludes
  // hidden procedural bodies and empty space inside a projected bounding box.
  const riderPixels=()=>page.evaluate(()=>{
   const g=__BROOMBALL__,T=THREE,r=g.renderer,w=innerWidth,h=innerHeight;
   const scene=new T.Scene();scene.background=new T.Color(0);const copy=g.player.mesh.clone(true);scene.add(copy);
   const material=new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide});scene.overrideMaterial=material;
   const target=new T.WebGLRenderTarget(w,h),buffer=new Uint8Array(w*h*4),old=r.getRenderTarget();
   r.setRenderTarget(target);r.render(scene,g.camera);r.readRenderTargetPixels(target,0,0,w,h,buffer);
   let minX=w,minY=h,maxX=-1,maxY=-1,count=0;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(buffer[i]<128||buffer[i+1]<128||buffer[i+2]<128)continue;count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,h-y-1);maxY=Math.max(maxY,h-y-1);}
   r.setRenderTarget(old);target.dispose();material.dispose();r.render(g.scene,g.camera);
   return{height:count?maxY-minY+1:0,width:count?maxX-minX+1:0,pixels:count,minX,minY,maxX,maxY,mode:g.match.cameraMode,position:g.player.pos.toArray(),camera:g.camera.position.toArray()};
  });
  const start=async()=>{
   await page.evaluate(()=>{const g=__BROOMBALL__;g.returnToMenu();g.startMatch('standard');});
   await advance(4200);
  };
  await check('All seven uploaded GLBs have visible mesh instances in the live scene',async()=>{
   await start();
   const state=await page.evaluate(()=>{
    const g=__BROOMBALL__,models=[];
    g.scene.traverseVisible(o=>{if(!o.userData.uploadedModel)return;let vertices=0,meshes=0;o.traverseVisible(m=>{if(m.isMesh){vertices+=m.geometry.getAttribute('position')?.count||0;meshes++;}});if(meshes)models.push({id:o.userData.uploadedModel,source:o.userData.sourceFile,meshes,vertices});});
    return{models,status:BroomModels.getStatus(),heroImported:g.player.mesh.userData.importedWizard,proceduralBodyVisible:g.player.mesh.userData.replaceable.body.visible};
   });
   assert.equal(state.status.loaded,7);assert.deepEqual(state.status.errors,[]);assert.equal(new Set(state.models.map(m=>m.id)).size,7);
   assert.equal(state.heroImported,true);assert.equal(state.proceduralBodyVisible,false);assert(state.models.every(m=>m.vertices>100));report.evidence.imports=state;
  });
  await check('The flying rider remains visible in the wider default team view at three window sizes',async()=>{
   for(const [width,height]of[[1440,900],[1280,720],[800,600]]){
    await page.setViewportSize({width,height});await start();
    const hero=await riderPixels();const threshold=height>=720?40:30;
    assert.equal(hero.mode,'broadcast');assert.ok(hero.height>=threshold,JSON.stringify(hero));assert.ok(hero.width>=30);assert.ok(hero.pixels>=550);assert.ok(hero.minX>width*.15&&hero.maxX<width*.85);assert.ok(hero.minY>80&&hero.maxY<height-95,'The whole rider stays above the action bar');
    report.evidence.views.push({width,height,hero});await page.screenshot({path:path.join(out,`presence-match-${width}.png`)});
   }
  });
  await check('The stands keep full human silhouettes and show readable nearby fans in close view',async()=>{
   await page.setViewportSize({width:1280,height:720});await start();
   await page.keyboard.press('v');await advance(1800);
   const crowd=await page.evaluate(()=>{
    const g=__BROOMBALL__,c=g.crowd,status=c.getStatus(),samples=[];
    g.camera.updateMatrixWorld(true);
    for(const fan of c.spectators){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,inFront=true;const b=fan.bounds;
     for(let i=0;i<8;i++){const v=new THREE.Vector3(i&1?b.max.x:b.min.x,i&2?b.max.y:b.min.y,i&4?b.max.z:b.min.z).project(g.camera);if(v.z>=1){inFront=false;break;}minX=Math.min(minX,(v.x*.5+.5)*innerWidth);maxX=Math.max(maxX,(v.x*.5+.5)*innerWidth);minY=Math.min(minY,(1-v.y)*.5*innerHeight);maxY=Math.max(maxY,(1-v.y)*.5*innerHeight);}
     if(inFront&&minX>=0&&maxX<innerWidth&&minY>90&&maxY<innerHeight-95)samples.push({height:maxY-minY,width:maxX-minX,section:fan.section,tier:fan.tier});
    }
    return{status,samples:samples.sort((a,b)=>b.height-a.height),parts:['CrowdHead','CrowdTorso','CrowdUpperArms','CrowdForearms','CrowdThighs','CrowdShins','CrowdBoots'].map(name=>({name,count:g.scene.getObjectByName(name)?.count||0}))};
   });
   assert.ok(crowd.status.people>=400);assert.ok(crowd.status.drawCalls<=24);assert(crowd.parts.every(part=>part.count>=crowd.status.people));
   assert.ok(crowd.samples.filter(f=>f.height>=12&&f.width>=4).length>=12,'Several nearby fans must be large enough to read as human figures');report.evidence.crowd=crowd;
  });
  await check('Passing keeps the controlled rider visible in the team view',async()=>{
   await start();await page.evaluate(()=>{const g=__BROOMBALL__;g.clearInput();g.setAim(0,0);g.player.pos.set(0,10,0);g.player.previousPos.copy(g.player.pos);for(const u of[...g.allies,...g.rivals]){u.mesh.position.set(38,30,34);u.speed=0;u.stun=100;u.velocity?.set(0,0,0);}g.allies[0].mesh.position.set(0,10,-38);g.allies[0].stun=0;g.setCarrier('player');for(const b of g.bludgers)b.frozen=100;});
   await advance(900);const before=await riderPixels();await page.keyboard.press('j');await advance(400);const flight=await riderPixels();
   assert.ok(before.height>=35);assert.ok(flight.height>=35);assert.ok(flight.height>=before.height*.75,'A pass keeps the controlled rider readable');report.evidence.passFraming={before,flight};
  });
  await check('V offers a close rider view and restores the tactical team view',async()=>{
   await start();await page.setViewportSize({width:1280,height:720});await advance(900);const close=await riderPixels();
   await page.keyboard.press('v');await advance(1800);const tactical=await riderPixels();assert.equal(tactical.mode,'close');assert.ok(tactical.height>close.height*1.3);
   await page.keyboard.press('v');await advance(1800);const restored=await riderPixels();assert.equal(restored.mode,'broadcast');assert.ok(restored.height>=40);report.evidence.viewToggle={close,tactical,restored};
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);console.log('CHARACTER_PRESENCE_PASS');
 }finally{fs.writeFileSync(path.join(out,'character-presence.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
