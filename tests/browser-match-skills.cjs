/* Keyboard-driven match skills: actual projectiles, possession changes and teammate shields. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
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
  await page.addInitScript(()=>{HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.resolve();});
  await page.goto(pathToFileURL(path.join(root,'index.html')).href,{waitUntil:'load'});
  await page.waitForFunction(()=>!!window.__BROOMBALL__);
  await page.evaluate(()=>Promise.all([BroomModels.ready,__BROOMBALL__.modelScenery]));
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
  const check=async(name,fn)=>{try{await fn();report.passed.push(name);console.log('PASS',name);}catch(e){report.failed.push({name,error:e.message});console.error('FAIL',name,e.message);}};
  const stage=async()=>{
   for(const k of['1','2','3','r','c','b'])await page.keyboard.up(k);
   await page.evaluate(()=>{
    const g=__BROOMBALL__;g.startMatch('standard');Object.assign(g.match,{state:'playing',paused:false,elapsed:3,timeLeft:177,kickoff:0,pendingRestart:null,stealCooldown:100,autoSwitch:true,cameraMode:'broadcast'});
    g.clearInput();g.setAim(0,0);g.match.cooldowns.fill(0);g.player.pos.set(0,10,0);g.player.previousPos.copy(g.player.pos);g.player.mesh.rotation.set(0,0,0);g.player.vel.set(0,0,0);g.player.shield=0;
    for(const u of[...g.allies,...g.rivals]){u.mesh.position.set(38,32,34);u.speed=0;u.stun=100;u.velocity?.set(0,0,0);u.mesh.userData.matchShield=0;g.resetAIFlight(u);}
    for(const b of g.bludgers){b.mesh.position.set(40,35,40);b.frozen=100;}
    g.setCarrier(null);g.quaffle.position.set(-35,30,30);
   });
  };
  const flySpell=()=>page.evaluate(()=>{const g=__BROOMBALL__;for(let i=0;i<90;i++)g.updateSpells(1/120);});
  await check('R intercepts the opposing carrier behind the aim and the actual hit drops the ball',async()=>{
   await stage();await page.evaluate(()=>{const g=__BROOMBALL__;g.rivals[0].mesh.position.set(0,10,20);g.rivals[0].stun=0;g.rivals[1].mesh.position.set(0,10,-5);g.rivals[1].stun=0;g.setCarrier(g.rivals[0]);});
   await page.keyboard.press('1');await page.keyboard.press('r');
   const launched=await page.evaluate(()=>{const g=__BROOMBALL__;return{target:g.projectiles[0]?.target===g.rivals[0],action:g.getMatchSkillContext().action,used:g.match.usedSpell};});
   assert.equal(launched.target,true);assert.equal(launched.action,'stop-carrier');assert.equal(launched.used,true);
   await flySpell();const hit=await page.evaluate(()=>{const g=__BROOMBALL__;return{dropped:g.carrier===null,stun:g.rivals[0].stun,projectiles:g.projectiles.length,cooldown:g.match.cooldowns[0]};});
   assert.equal(hit.dropped,true);assert.ok(hit.stun>0);assert.equal(hit.projectiles,0);assert.ok(hit.cooldown>0);report.evidence.defensiveHit={launched,hit};
  });
  await check('An attacking spell selects the passing-lane interceptor and actually stuns them',async()=>{
   await stage();await page.evaluate(()=>{const g=__BROOMBALL__;g.allies[0].mesh.position.set(0,10,-28);g.allies[0].stun=0;g.rivals[0].mesh.position.set(1,10,-15);g.rivals[0].stun=0;g.setCarrier('player');});
   await page.keyboard.press('2');await page.clock.runFor(100);
   const marker=await page.evaluate(()=>{
    const g=__BROOMBALL__,m=g.scene.getObjectByName('SkillTargetMarker'),enemy=g.rivals[0].mesh.position;
    return{visible:m?.visible,position:m?.position.toArray(),expected:[enemy.x,enemy.y+1,enemy.z],holding:g.carrier==='player',shotInfo:!!g.getShotInfo(),action:g.getMatchSkillContext().action};
   });
   assert.equal(marker.holding,true);assert.equal(marker.shotInfo,true);assert.equal(marker.visible,true);assert.equal(marker.action,'clear-passing-lane');
   assert.ok(marker.position.every((v,i)=>Math.abs(v-marker.expected[i])<1e-6),JSON.stringify(marker));
   await page.keyboard.press('r');
   const launched=await page.evaluate(()=>{const g=__BROOMBALL__;return{target:g.projectiles[0]?.target===g.rivals[0],action:g.getMatchSkillContext().action};});
   assert.equal(launched.target,true);assert.equal(launched.action,'clear-passing-lane');await flySpell();
   const hit=await page.evaluate(()=>{const g=__BROOMBALL__;return{stun:g.rivals[0].stun,stillHolding:g.carrier==='player',projectiles:g.projectiles.length};});
   assert.ok(hit.stun>=3);assert.equal(hit.stillHolding,true);assert.equal(hit.projectiles,0);report.evidence.attackingHit={marker,launched,hit};
  });
  await check('A teammate shield blocks a real close-range steal and expiry restores the steal',async()=>{
   await stage();await page.evaluate(()=>{const g=__BROOMBALL__;g.allies[0].mesh.position.set(0,10,-18);g.allies[0].stun=0;g.rivals[0].mesh.position.set(.5,10,-18);g.rivals[0].stun=0;g.setCarrier(g.allies[0]);g.match.stealCooldown=0;});
   await page.keyboard.press('3');await page.keyboard.press('r');
   const blocked=await page.evaluate(()=>{const g=__BROOMBALL__;g.updateSteals();return{shield:g.allies[0].mesh.userData.matchShield,self:g.player.shield,protected:g.carrier===g.allies[0],action:g.getMatchSkillContext().action};});
   assert.equal(blocked.shield,4);assert.equal(blocked.self,0);assert.equal(blocked.protected,true);assert.equal(blocked.action,'protect-carrier');
   const expired=await page.evaluate(()=>{const g=__BROOMBALL__;g.allies[0].mesh.userData.matchShield=0;g.match.stealCooldown=0;g.updateSteals();return{stolen:g.carrier===g.rivals[0]};});
   assert.equal(expired.stolen,true);report.evidence.teammateShield={blocked,expired};
  });
  await check('A shield reflects an actual bludger collision with a teammate; without it the teammate drops possession',async()=>{
   await stage();await page.evaluate(()=>{const g=__BROOMBALL__;g.allies[0].mesh.position.set(0,10,-18);g.allies[0].stun=0;g.setCarrier(g.allies[0]);});
   await page.keyboard.press('3');await page.keyboard.press('r');
   const protectedHit=await page.evaluate(()=>{
    const g=__BROOMBALL__,a=g.allies[0],b=g.bludgers[0];
    b.mesh.position.copy(a.mesh.position).add(new THREE.Vector3(.5,0,0));b.frozen=0;b.retarget=100;b.vel.set(0,0,0);
    g.updateBludgers(1/60);
    return{holding:g.carrier===a,stun:a.stun,shield:a.mesh.userData.matchShield,ballFrozen:b.frozen,reflectionSpeed:b.vel.length(),selfHit:g.player.hitCooldown};
   });
   assert.equal(protectedHit.holding,true);assert.equal(protectedHit.stun,0);assert.equal(protectedHit.shield,4);assert.equal(protectedHit.ballFrozen,.35);assert.ok(protectedHit.reflectionSpeed>=26);assert.equal(protectedHit.selfHit,0);
   const unprotectedHit=await page.evaluate(()=>{
    const g=__BROOMBALL__,a=g.allies[0],b=g.bludgers[0];
    a.mesh.userData.matchShield=0;b.mesh.position.copy(a.mesh.position).add(new THREE.Vector3(.5,0,0));b.frozen=0;b.retarget=100;b.vel.set(0,0,0);
    g.updateBludgers(1/60);
    return{dropped:g.carrier===null,stun:a.stun,ballFrozen:b.frozen,selfHit:g.player.hitCooldown};
   });
   assert.equal(unprotectedHit.dropped,true);assert.equal(unprotectedHit.stun,1.6);assert.equal(unprotectedHit.ballFrozen,0);assert.equal(unprotectedHit.selfHit,0);report.evidence.teammateBludger={protectedHit,unprotectedHit};
  });
  await check('C changes the controlled rider while the shield remains on the originally protected body',async()=>{
   await stage();await page.evaluate(()=>{const g=__BROOMBALL__;g.allies[0].mesh.position.set(0,10,-18);g.allies[0].stun=0;g.allies[2].mesh.position.set(22,10,-10);g.allies[2].stun=0;g.setCarrier(g.allies[0]);});
   await page.keyboard.press('3');await page.keyboard.press('r');
   const before=await page.evaluate(()=>{const g=__BROOMBALL__;return{body:g.allies[0].mesh.uuid,old:g.player.mesh.uuid};});
   await page.keyboard.press('c');
   const into=await page.evaluate(()=>{const g=__BROOMBALL__;return{body:g.player.mesh.uuid,shield:g.player.shield,oldBody:g.allies[0].mesh.uuid,oldShield:g.allies[0].mesh.userData.matchShield||0,holder:g.carrier==='player'};});
   assert.equal(into.body,before.body);assert.equal(into.oldBody,before.old);assert.equal(into.shield,4);assert.equal(into.oldShield,0);assert.equal(into.holder,true);
   await page.evaluate(()=>__BROOMBALL__.switchControl(__BROOMBALL__.allies[2]));
   const away=await page.evaluate(()=>{const g=__BROOMBALL__;return{shield:g.player.shield,body:g.allies[2].mesh.uuid,originalShield:g.allies[2].mesh.userData.matchShield};});
   assert.equal(away.shield,0);assert.equal(away.body,before.body);assert.equal(away.originalShield,4);report.evidence.controlSwap={before,into,away};
  });
  await check('A carrier outside skill range does not launch or consume cooldown',async()=>{
   await stage();await page.evaluate(()=>{const g=__BROOMBALL__;g.rivals[0].mesh.position.set(0,10,50);g.rivals[0].stun=0;g.rivals[1].mesh.position.set(0,10,-5);g.rivals[1].stun=0;g.setCarrier(g.rivals[0]);});
   await page.keyboard.press('1');await page.keyboard.press('r');
   const result=await page.evaluate(()=>{const g=__BROOMBALL__;return{cooldown:g.match.cooldowns[0],projectiles:g.projectiles.length,used:g.match.usedSpell,action:g.getMatchSkillContext().action};});
   assert.equal(result.cooldown,0);assert.equal(result.projectiles,0);assert.equal(result.used,false);assert.equal(result.action,'carrier-out-of-range');report.evidence.outOfRange=result;
  });
  await check('The number keys select skills during the match without replacing the controlled character',async()=>{
   await stage();const before=await page.evaluate(()=>{const g=__BROOMBALL__;return{uuid:g.player.mesh.uuid,id:g.player.mesh.userData.characterId};});
   const selections=[];for(const key of['2','3','1']){await page.keyboard.press(key);selections.push(await page.evaluate(()=>{const g=__BROOMBALL__;return{uuid:g.player.mesh.uuid,id:g.player.mesh.userData.characterId,selected:g.match.selected};}));}
   for(const state of selections){assert.equal(state.uuid,before.uuid);assert.equal(state.id,before.id);}assert.deepEqual(selections.map(s=>s.selected),[1,2,0]);report.evidence.skillsDoNotReplacePlayers={before,selections};
  });
  await check('The chosen home-page rider survives skill selection, control swaps, returning to the menu and a restart',async()=>{
   await stage();await page.evaluate(()=>{const g=__BROOMBALL__;g.returnToMenu();g.selectHouse('gryffindor');});
   await page.locator('.character[data-id="hermione"]').click();
   const menuState=()=>page.evaluate(()=>{const g=__BROOMBALL__;return{selected:g.match.selected,id:g.player.mesh.userData.characterId,card:document.querySelector('.character[aria-pressed="true"]')?.dataset.id,preview:g.characterPreview.getStatus()};});
   for(let i=0;i<30;i++){await page.clock.runFor(50);const state=await menuState();if(state.preview.ready&&state.preview.characterId==='hermione')break;}
   const selected=await menuState();assert.equal(selected.id,'hermione');assert.equal(selected.selected,1);assert.equal(selected.card,'hermione');assert.equal(selected.preview.characterId,'hermione');assert.equal(selected.preview.ready,true);
   await page.evaluate(()=>{
    const g=__BROOMBALL__;g.startMatch('standard');g.match.state='playing';
    g.allies[0].mesh.position.set(30,10,20);g.allies[2].mesh.position.set(0,10,30);g.setCarrier(g.allies[2]);
   });
   const started=await page.evaluate(()=>{const g=__BROOMBALL__;return{id:g.player.mesh.userData.characterId,selected:g.match.selected,uuid:g.player.mesh.uuid};});
   assert.equal(started.id,'hermione');assert.equal(started.selected,1);
   await page.keyboard.press('1');await page.keyboard.press('c');
   const changed=await page.evaluate(()=>{const g=__BROOMBALL__;return{id:g.player.mesh.userData.characterId,selected:g.match.selected,uuid:g.player.mesh.uuid};});
   assert.equal(changed.selected,0);assert.notEqual(changed.uuid,started.uuid);assert.notEqual(changed.id,'hermione');
   await page.evaluate(()=>__BROOMBALL__.returnToMenu());
   for(let i=0;i<30;i++){await page.clock.runFor(50);const state=await menuState();if(state.preview.ready&&state.preview.characterId==='hermione')break;}
   const restored=await menuState();assert.equal(restored.id,'hermione');assert.equal(restored.selected,1);assert.equal(restored.card,'hermione');assert.equal(restored.preview.characterId,'hermione');assert.equal(restored.preview.ready,true);
   await page.evaluate(()=>__BROOMBALL__.startMatch('standard'));
   const next=await page.evaluate(()=>{const g=__BROOMBALL__;return{id:g.player.mesh.userData.characterId,selected:g.match.selected};});assert.equal(next.id,'hermione');assert.equal(next.selected,1);
   await page.evaluate(()=>{const g=__BROOMBALL__;g.match.state='playing';g.switchCharacter(2);g.switchControl(g.allies[0]);g.restartMatch();});
   const restarted=await page.evaluate(()=>{const g=__BROOMBALL__;return{id:g.player.mesh.userData.characterId,selected:g.match.selected,state:g.match.state};});assert.equal(restarted.id,'hermione');assert.equal(restarted.selected,1);assert.equal(restarted.state,'countdown');
   report.evidence.startingCharacter={selected,started,changed,restored,next,restarted};
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);assert.deepEqual(report.failed,[]);console.log('BROWSER_MATCH_SKILLS_PASS',report.passed.length);
 }finally{fs.writeFileSync(path.join(out,'match-skills-browser.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
