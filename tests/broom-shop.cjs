const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const out=path.join(__dirname,'artifacts');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined,args:['--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.resolve();});
 try{
  await page.goto(process.env.BROOM_GAME_URL || 'http://127.0.0.1:8765/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__BROOMBALL__?.player.mesh.userData.broomId==='lux-basic');
  assert.equal(await page.evaluate(()=>BroomGarage.state.coins),0);
  const model=await page.evaluate(()=>{let tris=0;const mesh=__BROOMBALL__.player.mesh.getObjectByName('Lux3DBasicBroom');mesh.traverse(m=>{if(m.isMesh)tris+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;});return {tris,bounds:new THREE.Box3().setFromObject(__BROOMBALL__.player.mesh.userData.replaceable.broom).getSize(new THREE.Vector3()).toArray()};});
  assert(model.tris<25000);assert(Math.abs(model.bounds[2]-4.8)<.01);
  await page.click('#broomShopToggle');
  assert.equal(await page.getByRole('button',{name:'升级 · 100 金币',exact:true}).first().isDisabled(),true);
  await page.locator('.broom-card').nth(1).getByRole('button',{name:'装备',exact:true}).click();
  assert.equal(await page.evaluate(()=>BroomGarage.state.equipped),'classic');
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.evaluate(()=>BroomGarage.state.equipped),'classic');
  await page.click('#broomShopToggle');
  await page.locator('.broom-card').nth(0).getByRole('button',{name:'装备',exact:true}).click();
  await page.waitForFunction(()=>__BROOMBALL__.player.mesh.userData.broomId==='lux-basic');
  await page.evaluate(()=>{__BROOMBALL__.startMatch('standard');__BROOMBALL__.match.state='playing';__BROOMBALL__.match.paused=true;__BROOMBALL__.match.snitchActive=true;__BROOMBALL__.catchSnitch('player');});
  assert.equal(await page.evaluate(()=>BroomGarage.state.coins),120);
  assert.match(await page.locator('#broomReward').innerText(),/奖金 \+120/);
  await page.evaluate(()=>__BROOMBALL__.catchSnitch('player'));
  assert.equal(await page.evaluate(()=>BroomGarage.state.coins),120,'no duplicate rewards');
  await page.click('#menuEndBtn');
  await page.locator('.broom-card').nth(0).getByRole('button',{name:'升级 · 100 金币',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>({coins:BroomGarage.state.coins,level:BroomGarage.level(),multiplier:BroomGarage.multiplier()})),{coins:20,level:1,multiplier:1.03});
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.evaluate(()=>BroomGarage.level()),1);assert.equal(await page.evaluate(()=>BroomGarage.state.coins),20);
  await page.evaluate(()=>{__BROOMBALL__.startMatch('training');__BROOMBALL__.match.paused=false;});
  await page.keyboard.down('w');
  const speed=await page.evaluate(()=>{__BROOMBALL__.updatePlayer(1);return Math.hypot(__BROOMBALL__.player.vel.x,__BROOMBALL__.player.vel.z);});
  await page.keyboard.up('w');assert(Math.abs(speed-22*1.03)<.01,'upgrade changes flight speed');
  await page.evaluate(()=>{__BROOMBALL__.returnToMenu();});
  assert.equal(await page.evaluate(()=>BroomGarage.state.coins),20,'training/exit do not pay');
  // Test each settlement outcome through the same match-end path, without waiting real match timers.
  for(const [mode,home,away,side,bonus] of [['standard',0,0,'rival',40],['standard',0,150,'player',70],['challenge',0,0,'player',180]]){
   const before=await page.evaluate(()=>BroomGarage.state.coins);
   await page.evaluate(({mode,home,away,side})=>{const g=__BROOMBALL__;g.startMatch(mode);Object.assign(g.match,{state:'playing',paused:true,playerScore:home,rivalScore:away,snitchActive:true});g.catchSnitch(side);},{mode,home,away,side});
   assert.equal(await page.evaluate(()=>BroomGarage.state.coins),before+bonus);
   await page.evaluate(()=>__BROOMBALL__.returnToMenu());
  }
  const economy=await page.evaluate(()=>{
   const b=BroomGarage;const before=b.state.coins;
   b.catalog.push({id:'test-future',name:'Test future model',price:50,model:null});
   const purchased=b.buy('test-future'),duplicate=b.buy('test-future'),equipped=b.equip('test-future');
   const paid=before-b.state.coins;b.equip('lux-basic');
   b.upgrade('lux-basic');const lv2=b.level();const insufficient=b.upgrade('lux-basic');
   b.reward('challenge',10,0);b.reward('challenge',10,0);const toMax=b.upgrade('lux-basic'),overMax=b.upgrade('lux-basic');
   return {purchased,duplicate,equipped,paid,lv2,insufficient,toMax,overMax,lv:b.level(),multiplier:b.multiplier(),training:b.reward('training',100,0)};
  });
  await page.evaluate(()=>BroomGarage.catalog.pop());
  assert.deepEqual(economy,{purchased:true,duplicate:false,equipped:true,paid:50,lv2:2,insufficient:false,toMax:true,overMax:false,lv:3,multiplier:1.09,training:0});
  await page.evaluate(()=>{const g=__BROOMBALL__;g.startMatch('training');g.match.paused=true;g.switchCharacter(1);});
  await page.waitForFunction(()=>__BROOMBALL__.player.mesh.userData.broomId==='lux-basic');
  await page.screenshot({path:path.join(out,'broom-in-game-check.png')});
  await page.evaluate(()=>__BROOMBALL__.returnToMenu());
  await page.click('#broomShopToggle');
  await page.locator('#broomShop').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,'broom-shop-check.png')});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,model,speed,economy,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


