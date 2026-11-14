/* Analytic trajectory properties, including the derivative used by live collisions. */
const assert = require('node:assert/strict');
const THREE = require('../vendor/three-0.160.0.min.js');
global.window = {};
require('../game-passing.js');
for (const kind of ['short', 'through']) {
 const start = new THREE.Vector3(2,11,8), end = new THREE.Vector3(15,13,-28);
 const path = window.BroomPassing.create(THREE,{start,end,kind});
 assert.ok(path.positionAt(0).distanceTo(start)<1e-8);
 assert.ok(path.positionAt(path.duration).distanceTo(end)<1e-8);
 assert.ok(path.positionAt(path.duration/2).y>(start.y+end.y)/2+.5);
 const t=path.duration*.3,h=1e-5;
 const numerical=path.positionAt(t+h).sub(path.positionAt(t-h)).divideScalar(2*h);
 assert.ok(numerical.distanceTo(path.velocityAt(t))<1e-6,'Collision velocity follows the curved flight');
 start.set(999,999,999);end.set(-999,-999,-999);
 assert.ok(path.positionAt(0).x===2,'Inputs are copied; airborne balls never home to a moving receiver');
 console.log('PASS',kind,'fixed-endpoint arc and continuous tangent');
}
