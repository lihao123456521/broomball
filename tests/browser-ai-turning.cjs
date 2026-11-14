/* Actual flight-path regression for every non-player role, with explicit game frames. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = path.join(__dirname, 'artifacts');
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE || undefined, args:['--enable-unsafe-swiftshader']});
  const report = {passed:[], evidence:{}, errors:[]};
  try {
    const page = await browser.newPage({viewport:{width:1280,height:900}});
    page.on('pageerror', error => report.errors.push(error.message));
    await page.addInitScript(() => {
      let now=0, nextId=0;
      const callbacks = new Map();
      performance.now = () => now;
      requestAnimationFrame = callback => { callbacks.set(++nextId, callback); return nextId; };
      cancelAnimationFrame = id => callbacks.delete(id);
      window.__advanceAIFrame = milliseconds => {
        now += milliseconds;
        const current=[...callbacks.values()]; callbacks.clear();
        for (const callback of current) callback(now);
      };
      HTMLCanvasElement.prototype.requestPointerLock = () => Promise.resolve();
    });
    await page.goto(process.env.BROOM_GAME_URL || pathToFileURL(path.join(__dirname, '..', 'index.html')).href, {waitUntil:'load'});
    await page.waitForFunction(() => Boolean(window.__BROOMBALL__));
    const check = async (name, run) => { await run(); report.passed.push(name); console.log('PASS', name); };
    await check('All six non-player riders limit actual lateral, vertical and reverse flight turns', async () => {
      const samples = await page.evaluate(() => {
        const g=__BROOMBALL__,V=(x,y,z)=>new THREE.Vector3(x,y,z),result=[];
        g.startMatch('standard'); g.match.state='playing'; g.match.elapsed=5;
        for (const [i,unit] of [...g.rivals,...g.allies].entries()) {
          for (const [maneuver,target] of [['lateral',V(25,18,0)],['vertical',V(0,33,0)],['reverse',V(0,18,30)]]) {
            unit.mesh.position.set(0,18,0); unit.mesh.rotation.set(0,0,0); unit.stun=0;
            g.resetAIFlight(unit); unit.flightSpeed=12;
            const before=unit.mesh.position.clone(), heading=unit.flightDirection.clone(), dt=1/60;
            g.flyAI(unit,target,18,dt);
            const movement=unit.mesh.position.clone().sub(before), travel=movement.clone().normalize();
            result.push({i,team:i<4?'rival':'ally',role:unit.role,maneuver,
              angle:heading.angleTo(travel),headingAngle:heading.angleTo(unit.flightDirection),
              alignment:travel.dot(unit.flightDirection),distance:movement.length(),height:unit.mesh.position.y,
              yawError:Math.atan2(Math.sin(unit.mesh.rotation.y-Math.atan2(-travel.x,-travel.z)),Math.cos(unit.mesh.rotation.y-Math.atan2(-travel.x,-travel.z)))});
          }
        }
        return result;
      });
      assert.equal(samples.length,18);
      for (const s of samples) {
        assert(s.distance>0 && s.distance<.31, JSON.stringify(s));
        assert(s.angle>0 && s.angle<=1.15/60+1e-7, `Actual ${s.role}/${s.maneuver} turn exceeds limit: ${s.angle}`);
        near(s.headingAngle,s.angle,1e-7,'Motion follows bounded heading');
        near(s.alignment,1,1e-7,'Travel and heading stay coherent');
        near(s.yawError,0,1e-7,'Model faces actual horizontal travel');
        if(s.maneuver==='reverse')near(s.height,18,1e-7,'Horizontal U-turn does not loop upward');
      }
      report.evidence.roles=samples;
    });
    await check('Challenge turns remain bounded and standard turns are slower', async () => {
      const evidence=await page.evaluate(() => {
        const g=__BROOMBALL__,unit=g.rivals[0],result={};
        for(const mode of ['standard','challenge']){
          g.startMatch(mode);g.match.state='playing';unit.mesh.position.set(0,18,0);unit.mesh.rotation.set(0,0,0);g.resetAIFlight(unit);
          const before=unit.flightDirection.clone();g.flyAI(unit,new THREE.Vector3(30,18,0),18,.1);
          result[mode]={angle:before.angleTo(unit.flightDirection),speed:unit.flightSpeed};
        }
        return result;
      });
      near(evidence.standard.angle,.115,1e-7,'Standard 0.1 second turn');
      near(evidence.challenge.angle,.15,1e-7,'Challenge 0.1 second turn');
      assert(evidence.standard.angle<evidence.challenge.angle);
      assert(evidence.standard.speed<=1.8+1e-7,'Riders accelerate instead of instantly attaining cruise speed');
      report.evidence.modes=evidence;
    });
    await check('Riders brake into static targets and settle without circling or jitter',async()=>{
      const evidence=await page.evaluate(()=>{
        const g=__BROOMBALL__,unit=g.allies[0],target=new THREE.Vector3(16,25,8),result={};
        g.startMatch('standard');g.match.state='playing';g.match.elapsed=5;
        unit.mesh.position.set(0,18,0);unit.mesh.rotation.set(0,0,0);g.resetAIFlight(unit);
        for(let i=0;i<1800;i++)g.flyAI(unit,target,18,1/60);
        result.distance=unit.mesh.position.distanceTo(target);result.speed=unit.flightSpeed;
        const settled=unit.mesh.position.clone();for(let i=0;i<240;i++)g.flyAI(unit,target,18,1/60);
        result.drift=unit.mesh.position.distanceTo(settled);
        return result;
      });
      assert(evidence.distance<=.4,'Approach settles within arrival radius');
      near(evidence.speed,0,1e-7,'Arrival stops flight');near(evidence.drift,0,1e-7,'Arrival stays stable');
      report.evidence.arrival=evidence;
    });
    await check('An enemy hit stops allied flight and passing, then the ally recovers',async()=>{
      const evidence=await page.evaluate(()=>{
        const g=__BROOMBALL__,ally=g.allies[0],enemy=g.rivals[0];
        g.startMatch('standard');g.match.state='playing';g.match.elapsed=5;
        g.player.pos.set(0,18,15);ally.mesh.position.set(0,18,0);ally.mesh.rotation.set(0,0,0);g.resetAIFlight(ally);ally.flightSpeed=10;
        g.schoolSpells.applyHit('expelliarmus',ally,enemy);
        const before=ally.mesh.position.clone();g.setCarrier(ally);const passBlocked=!g.passQuaffle();
        for(let i=0;i<20;i++)g.updateAllies(1/60);
        const stopped=ally.mesh.position.distanceTo(before),during=ally.stun;
        for(let i=0;i<45;i++)g.updateAllies(1/60);
        const recovered=ally.stun===0,moved=ally.mesh.position.distanceTo(before);
        g.setCarrier(ally);const passAfterRecovery=g.passQuaffle();
        return {passBlocked,stopped,during,recovered,moved,passAfterRecovery,speed:ally.flightSpeed};
      });
      assert(evidence.passBlocked);near(evidence.stopped,0,1e-7,'Stunned teammate holds position');
      assert(evidence.during>0);assert(evidence.recovered);assert(evidence.moved>.1);assert(evidence.passAfterRecovery);
      report.evidence.recovery=evidence;
    });
    await check('Pause freezes actual non-player flight and restart clears flight momentum',async()=>{
      const evidence=await page.evaluate(()=>{
        const g=__BROOMBALL__;g.startMatch('standard');g.match.state='playing';g.match.elapsed=5;
        for(const unit of [...g.rivals,...g.allies]){unit.spellTimer=100;unit.stun=0;}
        for(const b of g.bludgers)b.frozen=100;
        for(let i=0;i<20;i++)window.__advanceAIFrame(1000/60);
        const sample=()=>[...g.rivals,...g.allies].map(u=>({position:u.mesh.position.toArray(),direction:u.flightDirection.toArray(),speed:u.flightSpeed}));
        const moving=sample();g.pauseMatch();for(let i=0;i<20;i++)window.__advanceAIFrame(1000/60);const paused=sample();
        g.restartMatch();const reset=sample();return{moving,paused,reset};
      });
      assert(evidence.moving.some(u=>u.speed>0));assert.deepEqual(evidence.paused,evidence.moving);
      for(const unit of evidence.reset){near(unit.speed,0,1e-7,'Restart clears speed');near(Math.hypot(...unit.direction),1,1e-7,'Restart heading normalized');}
      report.evidence.pause=evidence;
    });
    await check('The game loop keeps AI paths consistent across normal and slow frame cadences',async()=>{
      const evidence=await page.evaluate(()=>{
        const g=__BROOMBALL__,result={};
        for(const [name,frames] of [['normal',Array(60).fill(1000/60)],['slow',Array(10).fill(100)]]){
          g.startMatch('standard');g.match.state='playing';g.match.elapsed=5;
          g.player.pos.set(0,18,30);g.setCarrier(null);g.quaffle.position.set(0,18,0);
          for(const unit of [...g.rivals,...g.allies]){unit.spellTimer=100;unit.stun=0;}
          for(const b of g.bludgers)b.frozen=100;
          for(const dt of frames)window.__advanceAIFrame(dt);
          result[name]=[...g.rivals,...g.allies].map(u=>({position:u.mesh.position.toArray(),direction:u.flightDirection.toArray()}));
        }return result;
      });
      for(let i=0;i<6;i++)for(const key of ['position','direction'])evidence.normal[i][key].forEach((v,j)=>near(v,evidence.slow[i][key][j],1e-6,`Cadence rider ${i} ${key}`));
      report.evidence.cadence=evidence;
    });
    assert.deepEqual(report.errors,[]);
  }finally{
    fs.writeFileSync(path.join(out,'ai-turning.json'),JSON.stringify(report,null,2));
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
