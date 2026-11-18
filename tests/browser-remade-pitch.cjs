/* Verify the surfaces a player actually sees against the game's scoring planes. */
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE,
    args: ['--enable-unsafe-swiftshader']
  });
  try {
    const page = await browser.newPage({offline: true});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const entry = process.argv[2] || path.join(__dirname, '..', 'index.html');
    await page.goto(pathToFileURL(path.resolve(entry)).href);
    await page.evaluate(() => Promise.all([BroomModels.ready, __BROOMBALL__.modelScenery]));
    const report = await page.evaluate(() => {
      const g = __BROOMBALL__;
      g.startMatch('standard');
      function modelOf(mesh) {
        for (let o = mesh; o; o = o.parent) if (o.userData.uploadedModel) return o;
        return null;
      }
      const meshes = [], pillars = [];
      g.scene.updateMatrixWorld(true);
      g.scene.traverseVisible(object => {
        if (object.isMesh && !object.material.transparent) meshes.push(object);
        if (object.userData.uploadedModel === 'goal-pillar') pillars.push(object);
      });
      const ray = new THREE.Raycaster();
      const grass = [];
      for (const x of [-30, -10, 10, 30]) {
        for (const z of [-38, -15, 15, 38]) {
          ray.set(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));
          const surface = modelOf(ray.intersectObjects(meshes, false)[0]?.object);
          grass.push({x, z, surface:surface?.userData.uploadedModel || null});
        }
      }

      const goals = [...g.homeGoals, ...g.awayGoals];
      ray.far = 8;
      const rings = goals.map(goal => {
        const sign = Math.sign(goal.z);
        const pillar = pillars.find(p => Math.hypot(p.position.x - goal.x, p.position.z - goal.z) < .05);
        if (!pillar) return null;
        const aperture = [];
        for (let i = 0; i < 8; i++) {
          const angle = i * Math.PI / 4;
          // Find the artist's inside edge independently of the fit calculation.
          for (let step = 0; step <= 35; step++) {
            const radius = 2.4 + step * .05;
            const point = new THREE.Vector3(goal.x + radius * Math.cos(angle), goal.y + radius * Math.sin(angle), goal.z - 4 * sign);
            ray.set(point, new THREE.Vector3(0, 0, sign));
            if (ray.intersectObject(pillar, true).length) {
              aperture.push(radius);
              break;
            }
          }
        }
        // A static batch must not leave the old solid ring at the same location.
        ray.set(new THREE.Vector3(goal.x + 3.52, goal.y, goal.z - 4 * sign), new THREE.Vector3(0, 0, sign));
        const rimHits = ray.intersectObjects(meshes, false);
        const singleRim = rimHits.length > 0 && rimHits.every(hit => modelOf(hit.object) === pillar);
        // Feed a free ball through the normal continuous collision and scoring path.
        const scoring = [0, 2.45, 3.5].map(offset => {
          Object.assign(g.match, {state:'playing', paused:false, kickoff:0, pendingRestart:null});
          g.setCarrier(null);
          for (const unit of [...g.allies, ...g.rivals]) unit.stun = 1;
          const key = sign < 0 ? 'playerScore' : 'rivalScore', before = g.match[key];
          g.quaffle.position.set(goal.x + offset, goal.y, goal.z - .2 * sign);
          g.quaffleVel.set(0, 0, 40 * sign);
          g.updateQuaffle(1 / 60);
          return g.match[key] - before;
        });
        return {goal:goal.toArray(), aperture, singleRim, scoring};
      });
      return {grass, rings, pillarCount:pillars.length};
    });

    assert.deepEqual(errors, []);
    for (const sample of report.grass) assert.equal(sample.surface, 'stadium-ground', JSON.stringify(sample));
    console.log('PASS imported turf is the top surface across all 16 field samples');
    assert.equal(report.pillarCount, 6);
    assert.equal(report.rings.length, 6);
    for (const ring of report.rings) {
      assert.ok(ring);
      assert.ok(ring.singleRim, JSON.stringify(ring));
      assert.equal(ring.aperture.length, 8, JSON.stringify(ring));
      assert.ok(ring.aperture.every(radius => Math.abs(radius - 3.33) < .32), JSON.stringify(ring));
      assert.deepEqual(ring.scoring, [1, 1, 0], JSON.stringify(ring));
    }
    console.log('PASS all six rendered openings align with playable scoring paths and reject rim strikes');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
