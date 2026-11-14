const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined,args:['--enable-unsafe-swiftshader']});const results=[];
try{for(const mode of ['rejected','missing','throwing','native']){const c=await b.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
if(mode!=='native')await p.addInitScript(mode=>{if(mode==='missing')HTMLCanvasElement.prototype.requestPointerLock=undefined;else if(mode==='throwing')HTMLCanvasElement.prototype.requestPointerLock=()=>{throw new Error('Unsupported browser');};else HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.reject(new Error('Not supported in embedded browser'));},mode);
await p.goto(process.env.BROOM_GAME_URL||'http://127.0.0.1:8765/',{waitUntil:'networkidle'});await p.locator('[data-mode="training"]').click();await p.click('#startBtn');await p.waitForFunction(()=>__BROOMBALL__.match.state==='playing'&&!__BROOMBALL__.match.paused);
if(mode==='native'){
 await p.waitForFunction(()=>__BROOMBALL__.mouseControls.getState().locked,{},{timeout:3000});const before=await p.evaluate(()=>__BROOMBALL__.getAimState().targetYaw);await p.mouse.move(800,340);await p.mouse.move(900,380,{steps:8});const after=await p.evaluate(()=>__BROOMBALL__.getAimState().targetYaw);assert.notEqual(before,after);await p.keyboard.press('Escape');await p.waitForFunction(()=>__BROOMBALL__.match.paused);results.push({mode,lockedAim:true,pause:true});
}else{
 assert.equal(await p.evaluate(()=>__BROOMBALL__.mouseControls.getState().locked),false);await p.evaluate(()=>{__BROOMBALL__.setCarrier('player');__BROOMBALL__.setAim(0,-.12);});
 await p.mouse.move(780,330);const initial=await p.evaluate(()=>__BROOMBALL__.getAimState().targetYaw);await p.mouse.move(800,330);assert.equal(await p.evaluate(()=>__BROOMBALL__.getAimState().targetYaw),initial,'hover does not aim');
 await p.mouse.down();await p.mouse.move(930,290,{steps:10});await p.mouse.up();const aim=await p.evaluate(()=>__BROOMBALL__.getAimState());assert(aim.targetYaw<-.2);assert(aim.targetPitch>-.1);assert.equal(await p.evaluate(()=>__BROOMBALL__.match.stats.shots),0,'drag never shoots');
 await p.mouse.click(810,330);assert.equal(await p.evaluate(()=>__BROOMBALL__.match.stats.shots),1,'click shoots');
 await p.keyboard.press('3');await p.mouse.click(820,340,{button:'right'});assert(await p.evaluate(()=>__BROOMBALL__.player.shield>0));
 await p.mouse.move(800,330);await p.mouse.down();await p.mouse.move(850,340);await p.keyboard.press('Escape');await p.mouse.up();assert.equal(await p.evaluate(()=>__BROOMBALL__.mouseControls.getState().dragging),false);assert(await p.evaluate(()=>__BROOMBALL__.match.paused));
 await p.click('#resumeBtn');await p.waitForFunction(()=>!__BROOMBALL__.match.paused);await p.keyboard.down('w');await p.waitForFunction(()=>__BROOMBALL__.player.speed>10);await p.keyboard.up('w');
 await p.evaluate(()=>{__BROOMBALL__.setAim(0,-.12);});await p.mouse.move(800,330);await p.mouse.down();await p.mouse.move(900,340,{steps:8});await p.mouse.up();assert(await p.evaluate(()=>Math.abs(__BROOMBALL__.getAimState().targetYaw)>.1));
 results.push({mode,dragAim:true,clickShot:true,rightClickSpell:true,pauseResume:true,keyboardFlight:true});
}
assert.deepEqual(errors,[]);await c.close();}console.log(JSON.stringify({passed:true,results},null,2));}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
