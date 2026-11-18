/* Check the two camera cuts against the selected match rider's real face. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
 const root = path.resolve(__dirname, '..');
 const out = path.join(__dirname, 'artifacts');
 fs.mkdirSync(out, { recursive: true });
 const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE || undefined,
  args: ['--enable-unsafe-swiftshader']
 });
 try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:\/\//, request => request.abort());
  await page.clock.install();
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await page.evaluate(() => Promise.all([BroomModels.ready, __BROOMBALL__.modelScenery]));
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const ids = await page.evaluate(() => Object.entries(BroomRoster.rosters).flatMap(([house, members]) => members.map(member => ({ house, id: member.id }))));
  assert.equal(ids.length, 12);
  for (const {house, id} of ids) {
   await page.locator('.house-option[data-house="' + house + '"]').click();
   await page.locator('.character[data-id="' + id + '"]').click();
   await page.locator('#startBtn').click();
   if (id === 'harry') {
    const teamPositions = await page.evaluate(() => {
     const g = __BROOMBALL__;
     g.camera.updateMatrixWorld();
     return g.match.entrance.actors.map(actor => actor.unit.mesh.position.clone().project(g.camera).toArray());
    });
    assert.ok(teamPositions.every(([x, y, z]) => Math.abs(x) < .95 && Math.abs(y) < .85 && z > 0 && z < 1));
    await page.clock.runFor(20);
    await page.screenshot({path:path.join(out, 'entrance-teams.png')});
   }
   const sizes = [];
   for (const [time, shot] of [[2.35, 'tracking'], [4.15, 'portrait']]) {
    const sample = await page.evaluate(time => {
     const g = __BROOMBALL__;
     let remaining = time - g.match.entrance.elapsed;
     while (remaining > 0) {
      const step = Math.min(remaining, 1 / 60);
      g.updateMatchEntrance(step);
      remaining -= step;
     }
     g.updateCamera(0);
     g.camera.updateMatrixWorld();
     const rider = g.player.mesh;
     const face = BroomCharacterArt.getFaceFrame(rider);
     const center = rider.localToWorld(face.center);
     const projected = center.clone().project(g.camera);
     const side = new THREE.Vector3(1, 0, 0).applyQuaternion(g.camera.quaternion);
     const edge = center.clone().addScaledVector(side, face.radius).project(g.camera);
     const ray = new THREE.Raycaster();
     ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), g.camera);
     const actors = [g.player, ...g.allies, ...g.rivals].map(unit => unit.mesh);
     const hit = ray.intersectObjects(actors, true).find(result => {
      for (let node = result.object; node; node = node.parent) if (!node.visible) return false;
      return true;
     });
     let owner = hit?.object;
     while (owner && !actors.includes(owner)) owner = owner.parent;
     return {
      shot: g.cameraFraming.phase,
      subject: g.cameraFraming.subject === rider.uuid,
      id: rider.userData.characterId,
      title: document.getElementById('entranceCaptain').textContent,
      name: g.configs[g.match.selected].name,
      diameter: (edge.x - projected.x) * innerWidth,
      projected: [projected.x, projected.y],
      hitCaptain: owner === rider
     };
    }, time);
    assert.equal(sample.shot, shot);
    assert.equal(sample.id, id);
    assert.equal(sample.title, sample.name);
    assert.ok(sample.subject && sample.hitCaptain, JSON.stringify({ id, sample }));
    assert.ok(Math.abs(sample.projected[0]) < .2 && Math.abs(sample.projected[1]) < .55);
    assert.ok(sample.diameter > 140);
    sizes.push(sample.diameter);
    if (['harry', 'luna'].includes(id)) {
     await page.clock.runFor(20);
     await page.screenshot({ path: path.join(out, 'entrance-' + id + '-' + shot + '.png') });
    }
   }
   assert.ok(sizes[1] > sizes[0] * 1.45);
   const handoff = await page.evaluate(() => {
    const g = __BROOMBALL__, entrance = g.match.entrance;
    g.updateMatchEntrance(entrance.duration - entrance.elapsed - .001);
    g.updateCamera(0);
    const previous = g.camera.position.clone();
    g.updateMatchEntrance(.01);
    return { distance: previous.distanceTo(g.camera.position), state: g.match.state };
   });
   assert.ok(handoff.distance < .05);
   assert.equal(handoff.state, 'countdown');
   await page.evaluate(() => __BROOMBALL__.returnToMenu());
   console.log('CAPTAIN', id, sizes.map(Math.round).join(' / '));
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#startBtn').click();
  assert.equal(await page.evaluate(() => __BROOMBALL__.match.state), 'countdown');
  assert.deepEqual(errors, []);
  console.log('CAPTAIN_ENTRANCE_PASS', ids.length);
 } finally {
  await browser.close();
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
