const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'artifacts');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:\/\//,r=>r.abort());
  await page.clock.install();await page.goto(pathToFileURL(path.join(root,'index.html')).href);
  await page.evaluate(()=>Promise.all([BroomModels.ready,__BROOMBALL__.modelScenery]));
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
  for(const [house,id]of[['gryffindor','ron'],['gryffindor','hermione'],['hufflepuff','ernie'],['ravenclaw','padma']]){
   await page.locator('.house-option[data-house="'+house+'"]').click();
   await page.locator('.character[data-id="'+id+'"]').click();
   await page.clock.runFor(250);
   const menu=await page.evaluate(()=>{const p=__BROOMBALL__.characterPreview;return{face:BroomCharacterArt.getFaceFrame(p.wizard).source,imported:p.wizard.userData.importedWizard};});
   assert.equal(menu.face,id+'-rider');assert.ok(menu.imported);
   await page.screenshot({path:path.join(out,'four-riders-'+id+'-menu.png')});
   await page.locator('#startBtn').click();await page.keyboard.press('Space');
   await page.clock.runFor(3500);
   const match=await page.evaluate(()=>{const g=__BROOMBALL__;return{state:g.match.state,id:g.player.mesh.userData.characterId,source:BroomCharacterArt.getFaceFrame(g.player.mesh).source,portraits:g.playerPortraits.getStatus(),models:BroomModels.getStatus()};});
   assert.equal(match.state,'playing');assert.equal(match.id,id);assert.equal(match.source,id+'-rider');assert.deepEqual(match.models.errors,[]);
   assert.ok(JSON.stringify(match.portraits).includes(id+'-rider'));
   await page.screenshot({path:path.join(out,'four-riders-'+id+'-match.png')});
   console.log('FOUR_RIDER_BROWSER',id,JSON.stringify(match.portraits));
   await page.evaluate(()=>__BROOMBALL__.returnToMenu());
  }
  for(const [house,ids]of[['gryffindor',['ron','hermione']],['hufflepuff',['ernie']],['ravenclaw',['padma']]]){
   await page.evaluate(house=>{const g=__BROOMBALL__;g.selectHouse('slytherin');g.selectOpponent(house);g.startMatch('standard');},house);
   await page.clock.runFor(200);
   const rivals=await page.evaluate(()=>__BROOMBALL__.rivals.map(u=>({id:u.mesh.userData.characterId,source:BroomCharacterArt.getFaceFrame(u.mesh).source})));
   for(const id of ids)assert.ok(rivals.some(u=>u.id===id&&u.source===id+'-rider'),JSON.stringify(rivals));
   await page.evaluate(()=>__BROOMBALL__.returnToMenu());
  }
  assert.deepEqual(errors,[]);console.log('FOUR_RIDER_BROWSER_PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
