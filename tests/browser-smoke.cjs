/* Run with Node and Playwright available via NODE_PATH or PLAYWRIGHT_MODULE. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'tests', 'artifacts');
const baseline = process.argv.includes('--baseline');
const server = http.createServer((req, res) => {
  const target = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(target, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', target.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream');
    res.end(data);
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    if (!baseline) await page.clock.install();
    const blockedNetworkRequests = [];
    if (process.argv.includes('--file')) await page.route(/^https?:\/\//,route=>{blockedNetworkRequests.push(route.request().url());return route.abort();});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = process.argv.includes('--file') ? pathToFileURL(path.join(root, 'index.html')).href : `http://127.0.0.1:${server.address().port}/`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__BROOMBALL__);
    await page.screenshot({ path: path.join(out, baseline ? 'baseline-menu.png' : 'menu.png') });
    await page.click('#startBtn');
    await page.waitForFunction(() => window.__BROOMBALL__.match.state === 'playing');
    const result = await page.evaluate(() => {
      const g = window.__BROOMBALL__;
      g.match.paused = true;
      g.player.pos.set(0, 10, 0);
      g.setCarrier(null);
      g.quaffle.position.set(20, 10, 0);
      const right = g.getObjectiveInfo().direction;
      g.quaffle.position.set(-20, 10, 0);
      const left = g.getObjectiveInfo().direction;
      g.switchCharacter(2); g.match.paused = false; g.castSpell(); g.match.paused = true;
      const shieldBefore = g.player.shield;
      g.switchCharacter(0);
      const shieldAfter = g.player.shield;
      g.match.paused = false; g.toggleView(); g.restartMatch(); g.match.paused = true;
      const visibleAfterRestart = g.player.mesh.visible;
      return { right, left, shieldBefore, shieldAfter, visibleAfterRestart, baseSpeed: g.player.baseSpeed };
    });
    console.log(JSON.stringify({ baseline, result, errors }, null, 2));
    fs.writeFileSync(path.join(out, baseline ? 'baseline.json' : 'smoke.json'), JSON.stringify({ result, errors }, null, 2));
    if (!baseline) {
      assert.match(result.right, /^→/, 'Right-hand objective must point right');
      assert.match(result.left, /^←/, 'Left-hand objective must point left');
      assert.ok(result.shieldBefore > 0 && result.shieldAfter === result.shieldBefore, 'Switching characters preserves active shield');
      assert.ok(result.visibleAfterRestart, 'Restart from first-person restores the rider');
      assert.ok(result.baseSpeed <= 32, 'Comfortable default flight speed');
      assert.deepEqual(errors, [], 'No unhandled browser errors');
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
      const stage = async () => {
        await page.evaluate(() => {
          const g = window.__BROOMBALL__;
          g.match.state = 'playing'; g.match.paused = false; g.match.elapsed = 0;
          g.match.snitchActive = false; g.match.cooldowns = [0, 0, 0];
          g.player.pos.set(0, 10, 0); g.player.vel.set(0, 0, 0); g.player.shield = 0;
          g.setCarrier(null); g.quaffle.position.set(0, 30, -65);
          for (const r of g.rivals) { r.mesh.position.set(45, 35, 60); r.speed = 0; r.stun = 0; }
          for (const a of g.allies || []) { a.mesh.position.set(-40,35,55); a.speed=0; a.stun=100; }
          for (const b of g.bludgers) { b.mesh.position.set(-45, 35, 60); b.frozen = 100; }
          document.getElementById('pause').classList.add('hidden');
          document.getElementById('ending').classList.add('hidden');
        });
      };
      const passed = [];
      await stage();
      await page.keyboard.down('w'); await page.clock.runFor(650);
      const moving = await page.evaluate(() => ({speed:window.__BROOMBALL__.player.speed,z:window.__BROOMBALL__.player.pos.z,paused:window.__BROOMBALL__.match.paused,state:window.__BROOMBALL__.match.state}));
      await page.keyboard.up('w'); await page.clock.runFor(650);
      const stopped = await page.evaluate(() => window.__BROOMBALL__.player.speed);
      console.log('Movement evidence', moving, 'stopped', stopped);
      assert.ok(moving.speed > 15 && moving.z < -4, 'W moves forward');
      assert.ok(stopped < 0.1, 'Releasing movement stops within 650ms'); passed.push('W movement and release braking');
      await stage(); await page.keyboard.down('Shift'); await page.keyboard.down('w'); await page.clock.runFor(850);
      await page.keyboard.down('x'); await page.clock.runFor(400);
      assert.ok(await page.evaluate(() => window.__BROOMBALL__.player.speed < 0.1), 'X brakes while acceleration is held');
      await page.keyboard.up('x'); await page.keyboard.up('w'); await page.keyboard.up('Shift'); passed.push('X overrides boost');
      await stage(); await page.keyboard.down('Space'); await page.clock.runFor(300); await page.keyboard.up('Space');
      const ascended = await page.evaluate(() => window.__BROOMBALL__.player.pos.y);
      assert.ok(ascended > 11, 'Space ascends');
      await page.keyboard.down('q'); await page.clock.runFor(700); await page.keyboard.up('q');
      assert.ok(await page.evaluate(y => window.__BROOMBALL__.player.pos.y < y - 1, ascended), 'Q reverses upward momentum and descends'); passed.push('Vertical input');
      await stage(); await page.keyboard.down('w'); await page.clock.runFor(100);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      assert.ok(await page.evaluate(() => window.__BROOMBALL__.match.paused), 'Window blur pauses match');
      await page.keyboard.up('w');
      await page.evaluate(() => {window.__BROOMBALL__.match.paused=false;window.__BROOMBALL__.player.vel.set(0,0,0);});
      await page.clock.runFor(200);
      assert.ok(await page.evaluate(() => window.__BROOMBALL__.player.speed < .1), 'No stuck movement after focus loss'); passed.push('Focus loss clears held input');
      await stage(); await page.evaluate(() => window.__BROOMBALL__.switchCharacter(0));
      await page.keyboard.press('r');
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.cooldowns[0]),0,'No target does not spend cooldown');
      for (const index of [0,1]) {
        await stage();
        await page.evaluate(index => {const g=window.__BROOMBALL__;g.switchCharacter(index);g.rivals[0].mesh.position.set(0,10,-12);g.setCarrier(g.rivals[0]);},index);
        await page.keyboard.press('r');
        assert.ok(await page.evaluate(index => window.__BROOMBALL__.match.cooldowns[index]>0,index), 'R casts selected spell');
        await page.clock.runFor(400);
        const hit=await page.evaluate(()=>{const g=window.__BROOMBALL__;return{stun:g.rivals[0].stun,carrying:g.carrier===g.rivals[0],projectiles:g.projectiles.length};});
        assert.ok(hit.stun>0, 'Projectile actually hits target');
        assert.equal(hit.carrying,index===1,'Only disarming spell releases the ball');
        assert.ok(index===0?hit.stun<=.65:hit.stun>2.5,'Distinct effect duration');
      }
      passed.push('No-target cooldown and keyboard disarm/stun effects');
      await stage();
      await page.evaluate(()=>{const g=window.__BROOMBALL__;g.match.kickoff=0;g.rivals[0].mesh.position.set(0,10,-15);g.rivals[0].stun=3.2;g.quaffle.position.copy(g.rivals[0].mesh.position);});
      await page.clock.runFor(400);
      const stunnedPickup = await page.evaluate(()=>window.__BROOMBALL__.carrier===window.__BROOMBALL__.rivals[0]);
      await stage();
      await page.evaluate(()=>{const g=window.__BROOMBALL__;g.match.snitchActive=true;const seeker=g.rivals.find(r=>r.role==='seeker');seeker.mesh.position.set(0,18,-20);seeker.stun=3.2;g.snitch.position.copy(seeker.mesh.position);});
      await page.clock.runFor(32);
      const stunnedCatch = await page.evaluate(()=>window.__BROOMBALL__.match.state==='ended');
      console.log('Stun interaction evidence', {stunnedPickup,stunnedCatch});
      await stage();
      await page.clock.runFor(1000);
      const closeTarget = await page.evaluate(()=>{const g=window.__BROOMBALL__;g.switchCharacter(0);g.rivals[0].mesh.position.set(0,11.317,-4);return g.findSpellTarget()===g.rivals[0];});
      await stage();
      await page.clock.runFor(300);
      await page.evaluate(()=>{
        const g=window.__BROOMBALL__;g.switchCharacter(0);const target=g.rivals[0];target.mesh.position.set(0,10,-34);
        let last=performance.now();const end=last+1700;
        const flee=now=>{if(now>end)return;if(target.stun<=0)target.mesh.position.z-=24*(now-last)/1000;last=now;requestAnimationFrame(flee);};requestAnimationFrame(flee);
      });
      await page.keyboard.press('r');await page.clock.runFor(1700);
      const distantHit = await page.evaluate(()=>window.__BROOMBALL__.rivals[0].stun>0);
      console.log('Aiming evidence', {closeTarget,distantHit});
      assert.ok(!stunnedPickup&&!stunnedCatch,'Stunned rivals cannot collect a free ball or catch the Snitch');
      assert.ok(closeTarget,'A nearby opponent centered on the screen reticle can be locked');
      assert.ok(distantHit,'A locked fleeing opponent inside spell range is reached by the projectile');
      passed.push('Stun blocks automatic collection and Snitch capture');
      passed.push('Screen-centered close aim and distant moving spell target');
      await stage(); await page.evaluate(()=>window.__BROOMBALL__.switchCharacter(2)); await page.keyboard.press('r');
      await page.evaluate(()=>window.__BROOMBALL__.pauseMatch());
      const timers=await page.evaluate(()=>{const g=window.__BROOMBALL__;return[g.player.shield,g.match.cooldowns[2],g.match.timeLeft]});
      await page.clock.runFor(1500);
      assert.deepEqual(await page.evaluate(()=>{const g=window.__BROOMBALL__;return[g.player.shield,g.match.cooldowns[2],g.match.timeLeft]}),timers,'Pause freezes all gameplay timers');
      passed.push('Shield and cooldown freeze on pause');
      await stage(); await page.evaluate(()=>{const g=window.__BROOMBALL__;g.match.playerScore=200;g.match.rivalScore=0;g.match.snitchActive=true;g.catchSnitch('rival');});
      assert.match(await page.textContent('#endTitle'),/LIONS|狮/i,'Snitch winner is decided by final score'); passed.push('Snitch final score settlement');
      await stage();
      await page.evaluate(()=>{const g=window.__BROOMBALL__;g.switchCharacter(0);g.player.pos.set(0,10,38);});
      await page.clock.runFor(100);
      await page.screenshot({path:path.join(out,'flight.png')});
      await page.keyboard.press('Escape');
      await page.clock.runFor(32);
      await page.screenshot({path:path.join(out,'pause.png')});
      await page.setViewportSize({width:1280,height:720}); await page.clock.runFor(32);
      await page.screenshot({path:path.join(out,'pause-1280.png')});
      await page.click('#restartPauseBtn');
      await page.clock.runFor(3200);
      assert.ok(await page.evaluate(()=>window.__BROOMBALL__.player.mesh.visible),'Rider is visible after real restart button');
      assert.match(await page.textContent('#coachText'),/W.*X/, 'First tutorial step teaches movement and braking');
      await page.screenshot({path:path.join(out,'flight-1280.png')});
      await page.setViewportSize({width:1440,height:900}); await page.clock.runFor(100);
      await page.screenshot({path:path.join(out,'flight.png')});
      await page.keyboard.press('Escape'); await page.clock.runFor(32);
      await page.locator('#sensitivity').fill('1.4');
      await page.locator('#reducedMotion').check();
      await page.reload({waitUntil:'networkidle'}); await page.clock.runFor(100);
      assert.deepEqual(await page.evaluate(()=>[window.__BROOMBALL__.settings.sensitivity,window.__BROOMBALL__.settings.reducedMotion]),[1.4,true],'Comfort settings persist across reload');
      passed.push('Real restart and persisted comfort settings');
      await page.evaluate(() => {
        const g=window.__BROOMBALL__, T=window.THREE;
        const preview=new T.Scene();preview.background=new T.Color(0x101b2d);
        preview.add(new T.HemisphereLight(0xd7e9ff,0x4a2c26,2.5));
        const light=new T.DirectionalLight(0xffe0ab,3);light.position.set(-4,8,-5);preview.add(light);
        for(let i=0;i<3;i++){g.switchCharacter(i);const model=g.player.mesh.clone(true);model.position.set((i-1)*3.8,0,0);model.rotation.set(0,-.32,0);model.visible=true;preview.add(model);}
        const camera=new T.PerspectiveCamera(38,1440/720,.1,100);camera.position.set(1.8,3.8,-13.5);camera.lookAt(0,1,0);
        const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1440,720);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.render(preview,camera);
        const canvas=renderer.domElement;canvas.id='modelPreview';canvas.style.cssText='position:fixed;inset:0;z-index:100;width:1440px;height:720px';document.body.append(canvas);
      });
      await page.locator('#modelPreview').screenshot({path:path.join(out,'models.png')});
      assert.deepEqual(errors, [], 'No unhandled errors through complete interaction suite');
      console.log(JSON.stringify({passed,moving,stopped,errors},null,2));
      fs.writeFileSync(path.join(out,process.argv.includes('--file')?'interactions-offline.json':'interactions.json'),JSON.stringify({passed,moving,stopped,errors,offline:process.argv.includes('--file'),blockedNetworkRequests},null,2));
    }
    if (baseline) {
      await page.evaluate(() => { const g=window.__BROOMBALL__; g.match.state='playing'; g.match.paused=false; g.player.pos.set(0,10,38); g.player.vel.set(0,0,0); });
      await page.screenshot({ path: path.join(out, 'baseline-flight.png') });
    }
    console.log(baseline ? 'BASELINE_CAPTURED' : 'BROWSER_SMOKE_PASS');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
