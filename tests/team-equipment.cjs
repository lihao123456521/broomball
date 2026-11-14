const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const output=process.env.BROOM_OUTPUT||path.join(__dirname,'artifacts');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--enable-unsafe-swiftshader']});const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.resolve();});
 async function loaded(){await page.waitForFunction(()=>__BROOMBALL__.snitch.userData.imported&&[__BROOMBALL__.player.mesh,...__BROOMBALL__.allies.map(x=>x.mesh),...__BROOMBALL__.rivals.map(x=>x.mesh)].every(m=>!m.userData.broomLoading&&m.userData.broomId));}
 async function settle(mode,side){await page.evaluate(({mode,side})=>{const g=__BROOMBALL__;g.startMatch(mode);Object.assign(g.match,{state:'playing',paused:true,snitchActive:true});g.catchSnitch(side);},{mode,side});}
 try{
  await page.goto(process.env.BROOM_GAME_URL||'http://127.0.0.1:8765/',{waitUntil:'networkidle'});await loaded();
  const initial=await page.evaluate(()=>{const g=__BROOMBALL__;return [g.player.mesh,...g.allies.map(x=>x.mesh),...g.rivals.map(x=>x.mesh)].map(m=>m.userData.broomId);});assert(initial.every(id=>id==='lux-basic'));
  await page.click('#broomShopToggle');await page.waitForFunction(()=>[...document.querySelectorAll('.broom-product-image')].every(i=>i.complete&&i.naturalWidth>0));
  await page.getByLabel('接应手扫帚',{exact:true}).selectOption('classic');await page.waitForFunction(()=>__BROOMBALL__.allies[0].mesh.userData.broomId==='classic');
  await page.reload({waitUntil:'networkidle'});await loaded();assert.equal(await page.evaluate(()=>__BROOMBALL__.allies[0].mesh.userData.broomId),'classic');
  await page.evaluate(()=>__BROOMBALL__.selectHouse('ravenclaw'));await loaded();assert.equal(await page.evaluate(()=>__BROOMBALL__.allies[0].mesh.userData.broomId),'lux-basic');
  await page.evaluate(()=>__BROOMBALL__.selectHouse('gryffindor'));await loaded();assert.equal(await page.evaluate(()=>__BROOMBALL__.allies[0].mesh.userData.broomId),'classic');
  await page.evaluate(()=>{BroomGarage.assign('gryffindor','chaser','lux-basic');__BROOMBALL__.applyTeamEquipment();});await loaded();
  // An opponent win earns 120, spends 100 once, and equips the upgrade only next match.
  await settle('standard','rival');
  const first=await page.evaluate(()=>({player:BroomGarage.state.coins,team:JSON.parse(JSON.stringify(BroomGarage.opponent(__BROOMBALL__.match.awayHouse))),live:__BROOMBALL__.rivals.find(r=>r.role==='seeker').mesh.userData.broomLevel}));
  assert.equal(first.player,40);assert.equal(first.team.coins,20);assert.equal(first.team.lastReward,120);assert.equal(first.team.lastSpent,100);assert.equal(first.team.members.seeker.level,1);assert.equal(first.live,0);
  await page.evaluate(()=>__BROOMBALL__.catchSnitch('rival'));assert.equal(await page.evaluate(()=>BroomGarage.opponent(__BROOMBALL__.match.awayHouse).matches),1);
  await page.evaluate(()=>{__BROOMBALL__.returnToMenu();__BROOMBALL__.startMatch('standard');__BROOMBALL__.match.paused=true;});await loaded();
  assert.equal(await page.evaluate(()=>__BROOMBALL__.rivals.find(r=>r.role==='seeker').mesh.userData.broomMultiplier),1.03);
  await page.evaluate(()=>{const g=__BROOMBALL__;Object.assign(g.match,{state:'playing',paused:true,elapsed:140});g.snitch.position.set(-30,20,-30);g.updateSnitch(.01);});
  // Verify equipment affects the actual AI movement distance.
  const motion=await page.evaluate(()=>{const g=__BROOMBALL__,r=g.rivals.find(x=>x.role==='seeker');r.mesh.position.set(0,14,0);const before=r.mesh.position.clone();g.updateRivals(.1);return {distance:r.mesh.position.distanceTo(before),expected:r.speed*g.match.rules.rivalSpeed*1.03*.1};});
  assert(Math.abs(motion.distance-motion.expected)<.001);
  // Read update output through the match frame: resume long enough for real AI to move.
  await page.evaluate(()=>{const g=__BROOMBALL__;g.returnToMenu();g.startMatch('training');g.match.paused=true;g.match.state='playing';g.match.elapsed=111;g.match.snitchActive=true;g.snitch.visible=true;g.snitch.position.set(3,13,32);g.updateSnitch(.02);g.updateCamera(1);});
  const flap=await page.evaluate(()=>{const g=__BROOMBALL__,wing=g.snitch.getObjectByName('WingL'),before=wing.rotation.z;g.updateSnitch(.02);return {imported:g.snitch.userData.imported,before,after:wing.rotation.z,parts:g.snitch.getObjectByName('Lux3DGoldenSnitch').children.map(x=>x.name)};});assert(flap.imported);assert.notEqual(flap.before,flap.after);
  await page.screenshot({path:path.join(output,'snitch-in-game.png')});await page.evaluate(()=>__BROOMBALL__.returnToMenu());
  await page.click('#broomShopToggle');await page.locator('#broomShop').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'team-shop.png')});
  // Losses and draws also pay the opponent according to THEIR result, not ours.
  const before=await page.evaluate(()=>BroomGarage.opponent(__BROOMBALL__.match.awayHouse).coins);await settle('standard','player');
  const after=await page.evaluate(()=>BroomGarage.opponent(__BROOMBALL__.match.awayHouse));assert.equal(after.lastReward,40);assert(after.coins>=0);assert.equal(after.coins+after.lastSpent,before+40);
  await page.evaluate(()=>__BROOMBALL__.returnToMenu());const snap=await page.evaluate(()=>JSON.stringify(BroomGarage.opponent(__BROOMBALL__.match.awayHouse)));await page.reload({waitUntil:'networkidle'});await loaded();assert.equal(await page.evaluate(()=>JSON.stringify(BroomGarage.opponent(__BROOMBALL__.match.awayHouse))),snap);
  const noTraining=await page.evaluate(()=>{const g=BroomGarage,t=g.opponent('slytherin'),n=t.matches,c=t.coins;g.settleOpponent('slytherin','training',0,150);return t.matches===n&&t.coins===c;});assert(noTraining);
  // A future stronger model can be purchased only if funds cover the real price.
  const future=await page.evaluate(()=>{const b=BroomGarage;const team=b.opponent('hufflepuff');b.catalog.push({id:'test-fast',name:'Future fixture',price:50,power:1.2,model:null});b.settleOpponent('hufflepuff','standard',0,150);const t=JSON.parse(JSON.stringify(team));b.catalog.pop();return t;});assert(future.owned.includes('test-fast'));assert(Object.values(future.members).every(m=>m.id==='test-fast'));assert.equal(future.coins+future.lastSpent,120);assert(future.coins>=0);
  // Migrate the previous save without losing money or upgrades; everyone initially gets basic brooms.
  const legacy=await browser.newContext();const lp=await legacy.newPage();await lp.addInitScript(()=>localStorage.setItem('broomball-career-v1',JSON.stringify({coins:345,equipped:'classic',owned:['classic','lux-basic'],levels:{'lux-basic':2}})));await lp.goto(process.env.BROOM_GAME_URL||'http://127.0.0.1:8765/',{waitUntil:'networkidle'});assert.deepEqual(await lp.evaluate(()=>({coins:BroomGarage.state.coins,id:BroomGarage.state.equipped,lv:BroomGarage.level('lux-basic')})),{coins:345,id:'lux-basic',lv:2});await legacy.close();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,allActors:initial,firstOpponentSettlement:first,flap,futureBudget:{coins:future.coins,spent:future.lastSpent},errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

