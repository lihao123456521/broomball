const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(root, 'game-models.js'), 'utf8'), {window, document:{currentScript:{src:'file:///game-models.js'}}, URL});
const manifest = JSON.parse(fs.readFileSync(path.join(root,'assets/models/manifest.json')));
for (const id of ['ron','hermione','ernie','padma']) {
  assert.ok(window.BroomModels.hasRider(id), 'Missing uploaded rider: '+id);
  const entry = manifest.find(e=>e.id===id+'-rider');
  assert.ok(entry, 'Missing manifest entry: '+id);
  const original=fs.readFileSync(path.join(root,'assets/models/originals',entry.source));
  assert.equal(crypto.createHash('sha256').update(original).digest('hex'),entry.sha256);
  const binary=fs.readFileSync(path.join(root,'assets/models/runtime',id+'-rider.glb'));
  const scope={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/models/runtime',id+'-rider.js'),'utf8'),scope);
  assert.ok(binary.equals(Buffer.from(scope.window.BroomModelData[id+'-rider'],'base64')));
  assert.ok(entry.runtimeBytes<entry.sourceBytes);
  console.log(id,entry.runtimeTriangles,entry.runtimeBytes);
}
console.log('FOUR_RIDER_ASSETS_PASS');
