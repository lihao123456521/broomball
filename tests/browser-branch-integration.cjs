/* Regression for the useful features retained while merging the gameplay branches. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const out=path.join(__dirname,'artifacts');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--enable-unsafe-swiftshader']});
 const report={passed:[],evidence:{},errors:[],requests:[]};
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route(/^https?:\/\//,route=>{report.requests.push(route.request().url());return route.abort();});
  await page.clock.install();
  await page.goto(pathToFileURL(path.join(__dirname,'..','index.html')).href,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__BROOMBALL__&&window.BroomModels);
  await page.evaluate(()=>BroomModels.ready);
  await page.waitForFunction(()=>__BROOMBALL__.player.mesh.userData.broomId==='uploaded-broom'&&!__BROOMBALL__.player.mesh.userData.broomLoading);
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
  const check=async(name,run)=>{await run();report.passed.push(name);console.log('PASS',name);};
  await check('Merged shop uses the uploaded broom by default, with real alternatives',async()=>{
   const result=await page.evaluate(()=>({catalog:BroomGarage.catalog.map(c=>c.id),equipped:BroomGarage.state.equipped,model:__BROOMBALL__.player.mesh.userData.broomId,error:__BROOMBALL__.player.mesh.userData.broomError}));
   assert.deepEqual(result.catalog,['uploaded-broom','lux-basic','classic']);assert.equal(result.equipped,'uploaded-broom');assert.equal(result.model,'uploaded-broom');assert.equal(result.error,false);
   await page.locator('#broomShopToggle').click();assert.equal(await page.locator('.broom-card').count(),3);
   assert(await page.locator('.broom-card').first().getByRole('button',{name:'升级 · 100 金币',exact:true}).isDisabled());
   report.evidence.defaultEquipment=result;
  });
  await check('All four academy selections activate their twelve character profiles',async()=>{
   const selected=[];
   for(const house of ['gryffindor','slytherin','ravenclaw','hufflepuff']){
    await page.locator('.house-option[data-house="'+house+'"]').click();
    selected.push(await page.evaluate(()=>({house:__BROOMBALL__.match.homeHouse,profiles:__BROOMBALL__.configs.map(c=>c.id),player:__BROOMBALL__.player.mesh.userData.characterId,labels:[...document.querySelectorAll('.character strong')].map(n=>n.textContent)})));
   }
   assert.equal(new Set(selected.flatMap(r=>r.profiles)).size,12);
   assert(selected.every(r=>r.player===r.profiles[0]&&r.labels.length===3));report.evidence.academies=selected;
   await page.locator('.house-option[data-house="gryffindor"]').click();
  });
  await check('A timed win pays one reward and advances the third opponent chaser equipment slot',async()=>{
   const before=await page.evaluate(()=>{const g=__BROOMBALL__;g.startMatch('standard');Object.assign(g.match,{state:'playing',paused:false,playerScore:20,rivalScore:10,timeLeft:.001});return BroomGarage.state.coins;});
   await page.clock.runFor(50);
   const result=await page.evaluate(()=>({coins:BroomGarage.state.coins,team:BroomGarage.opponent(__BROOMBALL__.match.awayHouse),state:__BROOMBALL__.match.state}));
   assert.equal(result.state,'ended');assert.equal(result.coins,before+120);assert.equal(result.team.matches,1);assert(result.team.members.chaser2);assert.equal(result.team.members.seeker,undefined);
   await page.clock.runFor(150);assert.equal(await page.evaluate(()=>BroomGarage.state.coins),result.coins);report.evidence.reward=result;
  });
  await check('Equipping and upgrading changes the actual controlled rider speed',async()=>{
   await page.locator('#menuEndBtn').click();
   await page.evaluate(()=>__BROOMBALL__.switchCharacter(1));
   const classic=page.locator('.broom-card').filter({has:page.getByRole('heading',{name:'经典训练扫帚',exact:true})});
   await classic.getByRole('button',{name:'装备',exact:true}).click();
   await classic.getByRole('button',{name:'升级 · 100 金币',exact:true}).click();
   await page.evaluate(()=>__BROOMBALL__.startMatch('training'));
   await page.keyboard.down('w');await page.clock.runFor(800);await page.keyboard.up('w');
   const result=await page.evaluate(()=>({speed:__BROOMBALL__.player.speed,broom:__BROOMBALL__.player.mesh.userData.broomId,level:BroomGarage.level('classic'),coins:BroomGarage.state.coins}));
   assert.equal(result.broom,'classic');assert.equal(result.level,1);assert.equal(result.coins,20);assert(Math.abs(result.speed-22.66)<.02);report.evidence.upgrade=result;
   await page.evaluate(()=>__BROOMBALL__.returnToMenu());assert.equal(await page.evaluate(()=>BroomGarage.state.coins),20,'Training and leaving do not pay match rewards');
  });
  await check('Every non-player rider turns its actual path through a bounded heading',async()=>{
   const result=await page.evaluate(()=>{
    const g=__BROOMBALL__,rows=[];g.startMatch('standard');g.match.state='playing';g.match.elapsed=5;
    for(const unit of [...g.rivals,...g.allies])for(const [maneuver,target]of [['side',new THREE.Vector3(25,18,0)],['reverse',new THREE.Vector3(0,18,30)]]){
     unit.mesh.position.set(0,18,0);unit.mesh.rotation.set(0,0,0);unit.stun=0;g.resetAIFlight(unit);unit.flightSpeed=12;
     const start=unit.mesh.position.clone(),heading=unit.flightDirection.clone();g.flyAI(unit,target,18,1/60);
     const movement=unit.mesh.position.clone().sub(start);rows.push({maneuver,role:unit.role,distance:movement.length(),angle:heading.angleTo(unit.flightDirection),alignment:movement.normalize().dot(unit.flightDirection)});
    }return rows;
   });
   assert.equal(result.length,14);for(const row of result){assert(row.distance>0);assert(row.angle<=1.15/60+1e-6);assert(Math.abs(row.alignment-1)<1e-6);}report.evidence.turning=result;
  });
  await check('Narration settings operate the one English commentary controller',async()=>{
   const result=await page.evaluate(()=>{const g=__BROOMBALL__;g.setCommentaryEnabled(false);const disabled=g.commentary.state.enabled;g.setCommentaryEnabled(true);const enabled=g.commentary.state.enabled;return{disabled,enabled,count:Object.keys(BroomCommentaryClips).length,first:BroomCommentaryClips['pass']};});
   assert.equal(result.disabled,false);assert.equal(result.enabled,true);assert.equal(result.count,65);assert.match(result.first.src,/assets\/voice\/commentary\//);report.evidence.commentary=result;
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);console.log('BRANCH_INTEGRATION_PASS');
 }finally{fs.writeFileSync(path.join(out,'branch-integration.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
