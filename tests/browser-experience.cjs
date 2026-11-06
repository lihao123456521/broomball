/* Browser experience regression: real input where possible; isolated state for edge cases. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'tests', 'artifacts');
const server = http.createServer((req, res) => {
  const target = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(target, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', target.endsWith('.html') ? 'text/html; charset=utf-8' : target.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
    res.end(data);
  });
});

(async () => {
  fs.mkdirSync(out, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined, args: ['--enable-unsafe-swiftshader'] });
  const passed = [], evidence = {}, errors = [], blockedNetworkRequests = [];
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.clock.install();
    if(process.argv.includes('--file'))await page.route(/^https?:\/\//,route=>{blockedNetworkRequests.push(route.request().url());return route.abort();});
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.argv.includes('--file') ? pathToFileURL(path.join(root, 'index.html')).href : `http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__BROOMBALL__);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
    const originalUnitSpeeds = await page.evaluate(() => {const g=window.__BROOMBALL__;return [...g.rivals,...g.allies].map(unit=>unit.speed);});
    await page.screenshot({ path: path.join(out, 'experience-menu.png') });
    const advance = ms => page.clock.runFor(ms);
    const hold = async (key, ms) => { await page.keyboard.down(key); await advance(ms); await page.keyboard.up(key); };
    const check = async (name, fn) => { await fn(); passed.push(name); console.log('PASS', name); };
    const menu = async () => { await page.evaluate(() => window.__BROOMBALL__.returnToMenu()); await advance(32); };
    const start = async mode => {
      await menu();
      await page.evaluate(speeds=>{const g=window.__BROOMBALL__;[...g.rivals,...g.allies].forEach((unit,i)=>{unit.speed=speeds[i];});},originalUnitSpeeds);
      await page.locator(`.mode-option[data-mode="${mode}"]`).click();
      await page.locator('#startBtn').click();
      await advance(3300);
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.state), 'playing', mode + ' starts');
    };
    const stage = async () => {
      await page.evaluate(() => {
        const g = window.__BROOMBALL__;
        g.startMatch('standard');
        g.match.state = 'playing'; g.match.paused = false; g.match.elapsed = 0; g.match.timeLeft = 180;
        g.match.kickoff = 0; g.match.stealCooldown = 100; g.match.snitchActive = false;
        g.player.pos.set(0, 10, 0); g.player.vel.set(0, 0, 0); g.player.stamina = 100;
        g.setAim(0, 0); g.setCarrier(null); g.quaffle.position.set(35, 30, 40);
        for (const r of [...g.rivals, ...g.allies]) { r.mesh.position.set(35, 35, 40); r.speed = 0; r.stun = 100; }
        for (const b of g.bludgers) { b.mesh.position.set(-35, 35, 40); b.frozen = 100; }
      });
      await advance(500);
    };

    await check('Three selectable modes with separate rules', async () => {
      await start('standard');
      evidence.standardRules = await page.evaluate(() => ({ ...window.__BROOMBALL__.match.rules }));
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.mode), 'standard');
      assert.equal(evidence.standardRules.duration, 180);
      assert.equal(evidence.standardRules.snitchAt, 110);
      assert.ok(evidence.standardRules.rivalSnitchAt >= 130);
      await start('challenge');
      evidence.challengeRules = await page.evaluate(() => ({ ...window.__BROOMBALL__.match.rules }));
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.mode), 'challenge');
      await start('training');
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.mode), 'training');
      const before = await page.evaluate(() => ({ time: window.__BROOMBALL__.match.timeLeft, step: window.__BROOMBALL__.match.trainingStep, score: window.__BROOMBALL__.match.rivalScore }));
      await advance(2500);
      const after = await page.evaluate(() => ({ time: window.__BROOMBALL__.match.timeLeft, step: window.__BROOMBALL__.match.trainingStep, score: window.__BROOMBALL__.match.rivalScore }));
      assert.deepEqual(after, before, 'Idle training never times out or advances by itself');
    });

    await check('Movement training progresses only after real movement and height change', async () => {
      await hold('w', 500); await advance(500);
      assert.ok(await page.evaluate(() => window.__BROOMBALL__.match.trainingStep >= 1));
      await hold('Space', 600); await advance(300);
      assert.ok(await page.evaluate(() => window.__BROOMBALL__.match.trainingStep >= 2));
      await page.screenshot({ path: path.join(out, 'experience-training.png') });
    });

    await check('Training can be completed through real keyboard input without resetting task flags', async () => {
      const moveToAxis = async (axis,target,positive,negative) => {
        for(let i=0;i<35;i++) {
          const at=await page.evaluate(axis=>window.__BROOMBALL__.player.pos[axis],axis);
          if(Math.abs(target-at)<1.1)return;
          await hold(target>at?positive:negative,Math.min(300,Math.max(65,Math.abs(target-at)*24)));
          await hold('x',220);
        }
        assert.fail('Keyboard travel failed to reach '+axis+' '+target);
      };
      await moveToAxis('y',9,'Space','q');
      await moveToAxis('z',0,'s','w');
      await advance(400);
      assert.equal(await page.evaluate(()=>window.__BROOMBALL__.carrier),'player','Flying close automatically collects training ball');
      assert.ok(await page.evaluate(()=>window.__BROOMBALL__.match.trainingStep>=3));
      await moveToAxis('y',12.2,'Space','q');
      await moveToAxis('z',-31,'s','w');
      for(let i=0;i<20;i++) {
        if(await page.evaluate(()=>window.__BROOMBALL__.getShotInfo().assisted))break;
        await hold('i',35);await advance(100);
      }
      assert.ok(await page.evaluate(()=>window.__BROOMBALL__.getShotInfo().assisted),'Player can line up assisted goal with keyboard camera controls');
      await page.keyboard.press('f');await advance(1800);
      assert.ok(await page.evaluate(()=>window.__BROOMBALL__.match.trainingStep>=4),'A real goal advances training');
      await page.keyboard.press('r');await advance(600);
      assert.equal(await page.evaluate(()=>window.__BROOMBALL__.match.trainingStep),5,'A valid spell completes training');
      assert.ok(await page.locator('#trainingPlayBtn').isVisible());
      await page.screenshot({path:path.join(out,'experience-training-complete.png')});
      await page.locator('#trainingPlayBtn').click();await advance(3300);
      assert.equal(await page.evaluate(()=>window.__BROOMBALL__.match.mode),'standard');
    });

    await check('Facing away never receives assisted shooting or a reversing homing shot', async () => {
      await stage();
      await page.evaluate(() => { const g=window.__BROOMBALL__; g.player.pos.set(0,15,-30); g.setAim(Math.PI,0); g.setCarrier('player'); });
      await advance(600);
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.getShotInfo().assisted), false);
      await page.keyboard.press('f');
      const release = await page.evaluate(() => window.__BROOMBALL__.quaffle.position.z);
      await advance(350);
      const flight = await page.evaluate(() => ({ z: window.__BROOMBALL__.quaffle.position.z, score: window.__BROOMBALL__.match.playerScore }));
      assert.ok(flight.z > release + 3, 'Backward-facing shot moves away from away goals');
      assert.equal(flight.score, 0);
      evidence.backwardShot = { release, ...flight };
    });

    await check('Shot range gate and genuine goal-plane scoring', async () => {
      await stage();
      await page.evaluate(() => { const g=window.__BROOMBALL__; g.player.pos.set(0,15,5); g.setAim(0,0); g.setCarrier('player'); });
      await advance(500);
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.getShotInfo().assisted), false, 'Distant shot has no assist');
      await page.evaluate(() => { const g=window.__BROOMBALL__; g.player.pos.set(0,12.2,-30); g.setAim(0,0); });
      await advance(700);
      evidence.shot = await page.evaluate(() => { const s=window.__BROOMBALL__.getShotInfo(); return {distance:s.distance,assisted:s.assisted}; });
      assert.ok(evidence.shot.assisted && evidence.shot.distance <= 38);
      await page.keyboard.press('f'); await advance(1700);
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.playerScore), 10);
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.stats.shots), 1);
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.stats.goals), 1);
    });

    await check('The player can intercept a live enemy shot before it crosses the goal', async () => {
      await stage();
      await page.evaluate(() => {
        const g = window.__BROOMBALL__, shooter = g.rivals[0];
        shooter.mesh.position.set(0, 15, 40);
        shooter.mesh.rotation.set(0, Math.PI, 0);
        shooter.stun = 0;
        g.player.pos.set(0, 14.2, 53);
        g.setCarrier(shooter);
      });
      await advance(650);
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.carrier), 'player', 'A player on the incoming trajectory catches the shot');
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.rivalScore), 0, 'An intercepted shot cannot also score');
      await stage();
      await page.evaluate(() => {
        const g = window.__BROOMBALL__;
        g.player.pos.set(0, 12.2, -30);
        g.setAim(0, 0);
        g.setCarrier('player');
      });
      await advance(600);
      await page.keyboard.press('f');
      await advance(50);
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.carrier), null, 'Own shots are not instantly recaught at release');
    });

    await check('Out-of-bounds free ball is recovered into reachable space', async () => {
      await stage();
      await page.evaluate(() => { const g=window.__BROOMBALL__; g.setCarrier(null); g.quaffle.position.set(85,10,20); });
      await advance(800);
      evidence.recoveredBall = await page.evaluate(() => {const p=window.__BROOMBALL__.quaffle.position;return {x:p.x,y:p.y,z:p.z,boundary:(p.x/54)**2+(p.z/73)**2};});
      assert.ok(evidence.recoveredBall.boundary <= 1.001);
      await page.evaluate(() => { const g=window.__BROOMBALL__;g.player.pos.copy(g.quaffle.position); });
      await advance(300);
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.carrier), 'player');
    });

    await check('Snitch release and rival grace period are enforced for both pursuit and capture', async () => {
      await stage();
      await page.evaluate(() => { const g=window.__BROOMBALL__;g.match.elapsed=109;g.updateSnitch(.01); });
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.snitchActive), false);
      await page.evaluate(() => { const g=window.__BROOMBALL__;g.match.elapsed=110;g.updateSnitch(.01); });
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.snitchActive), true);
      await page.evaluate(() => { const g=window.__BROOMBALL__,r=g.rivals.find(r=>r.role==='seeker');g.match.elapsed=129;r.stun=0;r.mesh.position.copy(g.snitch.position);g.updateSnitch(.001); });
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.state), 'playing', 'Coincidental overlap cannot bypass grace');
      await page.evaluate(() => { const g=window.__BROOMBALL__,r=g.rivals.find(r=>r.role==='seeker');g.match.elapsed=130;r.mesh.position.copy(g.snitch.position);g.updateSnitch(.001); });
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.state), 'ended');
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.rivalScore), 150);
    });

    await check('T passes to a nearby ally and offensive spells exclude friendly targets', async () => {
      await stage();
      await page.evaluate(() => { const g=window.__BROOMBALL__;const ally=g.allies.find(a=>a.role==='chaser')||g.allies[0];ally.mesh.position.set(0,10,-12);ally.stun=0;g.setCarrier('player');g.switchCharacter(0); });
      await advance(300);
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.findSpellTarget()), null);
      await page.keyboard.press('r');
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.cooldowns[0]), 0);
      await page.keyboard.press('t'); await advance(700);
      assert.equal(await page.evaluate(() => window.__BROOMBALL__.match.stats.passes), 1);
      assert.ok(await page.evaluate(() => window.__BROOMBALL__.allies.includes(window.__BROOMBALL__.carrier)), 'Pass reaches allied carrier');
    });

    await check('Boost spends stamina, recovers at rest, and brake overrides boost', async () => {
      await stage();
      await page.keyboard.down('Shift'); await page.keyboard.down('w'); await advance(850);
      const spent = await page.evaluate(() => window.__BROOMBALL__.player.stamina);
      assert.ok(spent < 100 && spent > 0);
      await page.keyboard.down('x'); await advance(500);
      assert.ok(await page.evaluate(() => window.__BROOMBALL__.player.speed < .1));
      await page.keyboard.up('x'); await page.keyboard.up('w'); await page.keyboard.up('Shift');
      await advance(1500);
      assert.ok(await page.evaluate(s=>window.__BROOMBALL__.player.stamina>s,spent));
      await page.evaluate(() => {const g=window.__BROOMBALL__;g.player.pos.set(0,10,0);g.player.stamina=0;});
      await page.keyboard.down('Shift');await hold('w',700);await page.keyboard.up('Shift');
      assert.ok(await page.evaluate(()=>window.__BROOMBALL__.player.speed<=window.__BROOMBALL__.player.baseSpeed+.1),'Empty stamina cannot sustain boosted speed');
      evidence.staminaSpent = spent;
    });

    await check('Keyboard turning and Tab objective selection work without mouse lock', async () => {
      await stage();
      const before=await page.evaluate(()=>window.__BROOMBALL__.camera.getWorldDirection(new window.THREE.Vector3()).toArray());
      await hold('ArrowRight',450);await advance(300);
      const after=await page.evaluate(()=>window.__BROOMBALL__.camera.getWorldDirection(new window.THREE.Vector3()).toArray());
      assert.ok(after[0]>before[0]+.2,'Right arrow turns view right');
      await page.evaluate(()=>{const g=window.__BROOMBALL__;g.match.snitchActive=true;g.setCarrier('player');});
      const possessionObjective=await page.evaluate(()=>window.__BROOMBALL__.getObjectiveInfo().text);
      assert.match(possessionObjective,/射|蓝|球门/,'Ball possession has first priority');
      await page.evaluate(()=>{const g=window.__BROOMBALL__;g.setCarrier(null);g.match.trackSnitch=false;});
      await page.keyboard.press('Tab');
      assert.match(await page.evaluate(()=>window.__BROOMBALL__.getObjectiveInfo().text),/飞贼/);
      await page.keyboard.press('Tab');
      assert.match(await page.evaluate(()=>window.__BROOMBALL__.getObjectiveInfo().text),/鬼飞球|拾取/);
    });

    await check('Pause freezes new state and menu/restart clears match statistics', async () => {
      await stage();
      await page.evaluate(()=>{const g=window.__BROOMBALL__;g.player.stamina=42;g.match.stats.shots=3;g.pauseMatch();});
      const before=await page.evaluate(()=>{const g=window.__BROOMBALL__;return{stamina:g.player.stamina,elapsed:g.match.elapsed,time:g.match.timeLeft,stats:{...g.match.stats}};});
      await advance(1500);
      assert.deepEqual(await page.evaluate(()=>{const g=window.__BROOMBALL__;return{stamina:g.player.stamina,elapsed:g.match.elapsed,time:g.match.timeLeft,stats:{...g.match.stats}};}),before);
      await page.locator('#restartPauseBtn').click();await advance(3300);
      assert.deepEqual(await page.evaluate(()=>window.__BROOMBALL__.match.stats),{shots:0,goals:0,steals:0,passes:0});
      await page.keyboard.press('Escape');await advance(32);await page.locator('#menuPauseBtn').click();
      assert.equal(await page.evaluate(()=>window.__BROOMBALL__.match.state),'menu');
      assert.ok(await page.locator('#menu').isVisible());
    });

    await check('A full standard match naturally reaches settlement, persists records, and can restart', async () => {
      await start('standard');
      await hold('w',1000);await hold('ArrowRight',300);await hold('Space',400);
      // No score/timer/state mutation: advance the actual game loop until an ordinary end condition.
      for(let i=0;i<19;i++) {
        if(await page.evaluate(()=>window.__BROOMBALL__.match.state==='ended'))break;
        await advance(10000);
      }
      assert.equal(await page.evaluate(()=>window.__BROOMBALL__.match.state),'ended');
      assert.ok(await page.locator('#ending').isVisible());
      assert.match(await page.textContent('#endStats'),/射门|进球|传球|抢断/);
      assert.ok(await page.evaluate(()=>!!localStorage.getItem('broomball-best')));
      evidence.naturalMatch=await page.evaluate(()=>({elapsed:window.__BROOMBALL__.match.elapsed,score:[window.__BROOMBALL__.match.playerScore,window.__BROOMBALL__.match.rivalScore],record:localStorage.getItem('broomball-best')}));
      await page.screenshot({path:path.join(out,'experience-settlement.png')});
      await page.locator('#menuEndBtn').click();
      assert.equal(await page.evaluate(()=>window.__BROOMBALL__.match.state),'menu');
      await start('standard');
      await page.screenshot({path:path.join(out,'experience-flight.png')});
      await page.setViewportSize({width:1280,height:720});await advance(100);
      await page.screenshot({path:path.join(out,'experience-flight-1280.png')});
    });
    assert.deepEqual(errors, [], 'No unhandled errors throughout experience tests');
    evidence.network = { offline:process.argv.includes('--file'), blockedRequests:blockedNetworkRequests };
    console.log(JSON.stringify({passed,evidence,errors},null,2));
    fs.writeFileSync(path.join(out,process.argv.includes('--file')?'experience-offline-results.json':'experience-results.json'),JSON.stringify({passed,evidence,errors},null,2));
    console.log('BROWSER_EXPERIENCE_PASS');
  } catch(error) {
    if(page)await page.screenshot({path:path.join(out,'experience-failure.png')}).catch(()=>{});
    fs.writeFileSync(path.join(out,'experience-failure.json'),JSON.stringify({passed,evidence,errors,failure:String(error)},null,2));
    throw error;
  } finally { await browser.close();server.close(); }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
