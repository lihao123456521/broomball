/* Team visibility, independent movement/pass controls and the actual selectable 3D roster. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const{pathToFileURL}=require('node:url');
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
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
  await page.addInitScript(()=>{HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.resolve();});
  await page.goto(pathToFileURL(path.join(root,'index.html')).href,{waitUntil:'load'});
  await page.waitForFunction(()=>!!window.__BROOMBALL__);
  await page.evaluate(()=>Promise.all([BroomModels.ready,__BROOMBALL__.modelScenery]));
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
  const advance=ms=>page.clock.runFor(ms);
  const check=async(name,fn)=>{try{await fn();report.passed.push(name);console.log('PASS',name);}catch(e){report.failed.push({name,error:e.message});console.error('FAIL',name,e.message);}};
  const up=async()=>{for(const k of['w','a','s','d','j','k','t','z','c','Tab','Shift'])await page.keyboard.up(k);};
  const stage=async()=>{
   await up();await page.evaluate(()=>{
    const g=__BROOMBALL__;g.startMatch('standard');Object.assign(g.match,{state:'playing',paused:false,elapsed:3,timeLeft:177,kickoff:0,pendingRestart:null,stealCooldown:100,autoSwitch:true,cameraMode:'broadcast'});
    g.clearInput();g.setAim(0,0);g.player.pos.set(0,10,10);g.player.previousPos.copy(g.player.pos);g.player.mesh.rotation.set(0,0,0);g.player.vel.set(0,0,0);g.player.stamina=100;
    for(const u of[...g.allies,...g.rivals]){u.mesh.position.set(38,32,34);u.speed=0;u.stun=100;u.velocity?.set(0,0,0);g.resetAIFlight(u);}
    g.allies[0].mesh.position.set(18,10,-10);g.allies[0].stun=0;g.allies[2].mesh.position.set(-18,14,-5);g.allies[2].stun=0;
    for(const b of g.bludgers){b.mesh.position.set(40,35,40);b.frozen=100;}
    g.setCarrier('player');
   });await advance(1400);
  };
  const projectTeam=()=>page.evaluate(()=>{const g=__BROOMBALL__;g.camera.updateMatrixWorld(true);return[g.player,...g.allies.filter(a=>a.role==='chaser'&&a.stun<=0)].map((u,i)=>{const p=(u===g.player?g.player.pos:u.mesh.position).clone().add(new THREE.Vector3(0,1.4,0)),q=p.project(g.camera);return{id:i,x:(q.x*.5+.5)*innerWidth,y:(1-q.y)*.5*innerHeight,z:q.z};});});
  const passStage=async()=>{await stage();await page.evaluate(()=>{const g=__BROOMBALL__;g.allies[0].mesh.position.set(0,10,-18);g.allies[2].mesh.position.set(12,10,12);g.setAim(0,0);});};

  await check('S backpedals while holding the ball and cannot also trigger a pass',async()=>{
   await stage();const before=await page.evaluate(()=>({z:__BROOMBALL__.player.pos.z,stamina:__BROOMBALL__.player.stamina}));
   await page.keyboard.down('Shift');await page.keyboard.down('s');await advance(650);await page.keyboard.up('s');await page.keyboard.up('Shift');
   const moving=await page.evaluate(()=>{const g=__BROOMBALL__;return{z:g.player.pos.z,speed:g.player.speed,stamina:g.player.stamina,passes:g.match.stats.passes,carrier:g.carrier==='player'};});
   assert.ok(moving.z>before.z+5);assert.ok(moving.speed>8&&moving.speed<16);assert.equal(moving.passes,0);assert.equal(moving.carrier,true);assert.ok(moving.stamina>=before.stamina-.1,'Reverse does not spend sprint stamina');
   await advance(500);assert.ok(await page.evaluate(()=>__BROOMBALL__.player.speed<.1));report.evidence.backpedal={before,moving};
  });
  await check('J short passes once per press and actual reception switches control',async()=>{
   await passStage();const receiver=await page.evaluate(()=>{const g=__BROOMBALL__;return{uuid:g.allies[0].mesh.uuid,selected:g.getPassReceiver()===g.allies[0]};});assert.equal(receiver.selected,true);
   await page.keyboard.down('j');await advance(100);await page.keyboard.down('j');await advance(100);await page.keyboard.up('j');
   assert.equal(await page.evaluate(()=>__BROOMBALL__.match.stats.passes),1);
   await advance(1050);const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{uuid:g.player.mesh.uuid,carrier:g.carrier==='player',completed:g.match.stats.completedPasses};});assert.equal(result.uuid,receiver.uuid);assert.equal(result.carrier,true);assert.equal(result.completed,1);report.evidence.shortPass=result;
  });
  await check('K sends a lead pass without changing aim pitch and T remains a short-pass alias',async()=>{
   await passStage();const planned=await page.evaluate(()=>{
    const g=__BROOMBALL__,a=g.allies[0];a.speed=24;a.velocity.set(6,0,-8);a.flightDirection.copy(a.velocity).normalize();a.flightSpeed=a.velocity.length();a.mesh.rotation.y=Math.atan2(-a.velocity.x,-a.velocity.z);
    const p=g.planPass('player',a,'through');return{pitch:g.getAimState().targetPitch,receiver:a.mesh.position.toArray(),direction:a.flightDirection.toArray(),reachable:p.reachableDistance,destination:p.destination.toArray(),feet:p.receivePosition.toArray()};
   });await page.keyboard.down('k');await advance(100);await page.keyboard.up('k');
   const through=await page.evaluate(()=>{const g=__BROOMBALL__;return{mode:g.passMode,destination:g.passDestination.toArray(),feet:g.passReceivePosition.toArray(),receiver:g.allies[0].mesh.position.toArray(),pitch:g.getAimState().targetPitch,passes:g.match.stats.passes};});assert.equal(through.mode,'through');
   const lead=through.feet.map((v,i)=>v-planned.receiver[i]),leadDistance=Math.hypot(...lead);assert.ok(leadDistance>0);assert.ok(lead.reduce((sum,v,i)=>sum+v*planned.direction[i],0)/leadDistance>.999);assert.ok(leadDistance<=planned.reachable+1e-6);
   assert.deepEqual(through.destination,planned.destination);assert.deepEqual(through.feet,planned.feet);assert.equal(through.pitch,planned.pitch);assert.equal(through.passes,1);through.planned=planned;through.leadDistance=leadDistance;
   await passStage();await page.keyboard.press('t');assert.equal(await page.evaluate(()=>__BROOMBALL__.passMode),'short');report.evidence.through=through;
  });
  await check('The default tactical view shows the controlled rider and both field passing options',async()=>{
   const views=[];for(const[width,height]of[[1440,900],[1280,720],[800,600]]){
    await page.setViewportSize({width,height});await stage();const actors=await projectTeam();assert.equal(actors.length,3);
    for(const actor of actors){assert.ok(actor.z<1&&actor.z>-1);assert.ok(actor.x>width*.03&&actor.x<width*.97,JSON.stringify({width,height,actor}));assert.ok(actor.y>70&&actor.y<height-80,JSON.stringify({width,height,actor}));}
    views.push({width,height,actors});await page.screenshot({path:path.join(out,`tactical-match-${width}.png`)});
   }report.evidence.teamViews=views;
  });
  await check('The camera keeps passing options visible through forward movement and a control switch',async()=>{
   await page.setViewportSize({width:1280,height:720});await stage();await page.evaluate(()=>{for(const a of __BROOMBALL__.allies.filter(a=>a.role==='chaser'))a.speed=24;});
   await page.keyboard.down('w');await advance(1700);await page.keyboard.up('w');await advance(900);const moving=await projectTeam();for(const p of moving)assert.ok(p.x>0&&p.x<1280&&p.y>40&&p.y<660,JSON.stringify(p));
   await page.keyboard.press('c');await advance(1000);const switched=await projectTeam();for(const p of switched)assert.ok(p.x>0&&p.x<1280&&p.y>40&&p.y<660,JSON.stringify(p));report.evidence.dynamicViews={moving,switched};
  });
  await check('Holding Tab gives an overview and releasing it restores the selected match view',async()=>{
   await stage();const before=await page.evaluate(()=>({mode:__BROOMBALL__.match.cameraMode,fov:__BROOMBALL__.camera.fov,position:__BROOMBALL__.camera.position.toArray()}));
   await page.keyboard.down('Tab');await advance(1000);const overview=await page.evaluate(()=>({mode:__BROOMBALL__.match.cameraMode,position:__BROOMBALL__.camera.position.toArray()}));assert.ok(Math.hypot(...overview.position.map((v,i)=>v-before.position[i]))>10);
   await page.keyboard.up('Tab');await advance(1500);const after=await page.evaluate(()=>({mode:__BROOMBALL__.match.cameraMode,position:__BROOMBALL__.camera.position.toArray()}));assert.equal(after.mode,before.mode);assert.ok(Math.hypot(...after.position.map((v,i)=>v-before.position[i]))<3);report.evidence.peek={before,overview,after};
  });
  if(!process.argv.includes('--gameplay-only')){
  await check('All twelve selectable characters show their actual current 3D model on the home page',async()=>{
   await up();await page.evaluate(()=>__BROOMBALL__.returnToMenu());const roster=await page.evaluate(()=>Object.fromEntries(Object.entries(SchoolMagic.rosters).map(([h,r])=>[h,r.map(p=>p.id)])));
   const statuses=[];for(const[house,ids]of Object.entries(roster)){
    await page.locator(`.house-option[data-house="${house}"]`).click();
    for(const id of ids){await page.locator(`.character[data-id="${id}"]`).click();let status;
     for(let i=0;i<25;i++){await advance(90);status=await page.evaluate(()=>__BROOMBALL__.characterPreview.getStatus());if(status.ready&&status.characterId===id)break;}
     assert.equal(status.characterId,id);assert.equal(status.house,house);assert.equal(status.ready,true);assert.equal(status.active,true);assert.ok(status.meshCount>=1);assert.ok(status.triangles>1000);assert.ok(status.renderedFrames>0);assert.ok(status.projectedBounds.pixelHeight>120);assert.ok(!status.error);
     const actual=await page.evaluate(()=>{const w=__BROOMBALL__.characterPreview.wizard;let meshes=0;w.traverseVisible(o=>{if(o.isMesh)meshes++;});return{id:w.userData.characterId,profile:w.userData.artProfile,meshes};});assert.equal(actual.id,id);assert.equal(actual.profile,id);assert.ok(actual.meshes>=1);statuses.push({...status,actual});
     await page.locator('#characterPreview').screenshot({path:path.join(out,`roster-${id}.png`)});
    }
   }
   assert.equal(new Set(statuses.map(s=>s.characterId)).size,12);assert.ok(statuses.find(s=>s.characterId==='harry').uploadedIds.includes('harry-rider'));report.evidence.roster=statuses;
  });
  await check('The 3D character stage stops rendering while a match is active',async()=>{
   await page.evaluate(()=>__BROOMBALL__.startMatch('standard'));await advance(500);const a=await page.evaluate(()=>__BROOMBALL__.characterPreview.getStatus());await advance(1000);const b=await page.evaluate(()=>__BROOMBALL__.characterPreview.getStatus());assert.equal(b.active,false);assert.equal(b.renderedFrames,a.renderedFrames);report.evidence.previewPause={a,b};
  });
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);assert.deepEqual(report.failed,[]);console.log('TACTICAL_ROSTER_PASS');
 }finally{fs.writeFileSync(path.join(out,'tactical-roster.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
