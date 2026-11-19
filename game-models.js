/* Uploaded GLB assets, optimized for the arena and packed for file:// play. */
window.BroomModels = (() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  const riders = {
    harry:    ['harry-rider',  'textured (2)(1).glb', '哈利'],
    draco:    ['draco-rider',  'textured(3).glb', '德拉科'],
    cedric:   ['cedric-rider', 'textured (4).glb', '塞德里克'],
    blaise:   ['blaise-rider', 'textured (5).glb', '布雷斯'],
    pansy:    ['pansy-rider',  'textured (6).glb', '潘西'],
    hannah:   ['hannah-rider', 'textured(7).glb', '汉娜'],
    cho:      ['cho-rider',    'textured (8).glb', '秋'],
    luna:     ['luna-rider',   'textured (9).glb', '卢娜'],
    ron:      ['ron-rider',    'Ron.glb', '罗恩'],
    hermione: ['hermione-rider', 'hermine.glb', '赫敏'],
    ernie:    ['ernie-rider',  'eni.glb', '厄尼'],
    padma:    ['padma-rider',  'padema.glb', '帕德玛']
  };
  const sources = [
    ['academy-hall', 'textured.glb', '学院主堡'],
    ['academy-tower', 'textured (1).glb', '学院尖塔'],
    ['gatehouse', 'textured (2).glb', '双塔石桥'],
    ['rampart', 'textured (3).glb', '学院城墙'],
    ['broom', 'textured(1).glb', '上传的飞行扫帚'],
    ['snitch', 'textured (1)(1).glb', '金色飞贼奖杯'],
    ['stadium-ground', 'ground.glb', '草地球场'],
    ['goal-pillar', 'pillar.glb', '铜制球门'],
    ...Object.values(riders)
  ];
  const state = new Map(sources.map(([id, source, name]) => [id, { id, source, name, status: 'idle', placements: [] }]));
  const templates = new Map();
  const ornaments = [];
  let scenery = null;
  let activeScene = null;
  let ready = null;

  function getStatus() {
    const placements = new Map(sources.map(([id]) => [id, []]));
    activeScene?.traverse(object => { const id = object.userData?.uploadedModel; if (placements.has(id)) placements.get(id).push(object.userData.placement || object.name); });
    const models = [...state.values()].map(entry => ({ ...entry, placements: activeScene ? placements.get(entry.id) : [...entry.placements] }));
    return { total: models.length, loaded: models.filter(m => m.status === 'ready').length,
      errors: models.filter(m => m.status === 'error').map(m => ({ id: m.id, message: m.error })), models };
  }

  function loadData(id) {
    if (window.BroomModelData?.[id]) return Promise.resolve(window.BroomModelData[id]);
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('assets/models/runtime/' + id + '.js', base).href;
      script.onload = () => window.BroomModelData?.[id] ? resolve(window.BroomModelData[id]) : reject(new Error('Missing embedded model ' + id));
      script.onerror = () => reject(new Error('Cannot load local model ' + id));
      document.head.append(script);
    });
  }

  function load(id) {
    if (!state.has(id)) return Promise.reject(new Error('Unknown uploaded model: ' + id));
    if (templates.has(id)) return templates.get(id);
    const record = state.get(id); record.status = 'loading';
    const promise = loadData(id).then(encoded => {
      const binary = atob(encoded), bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Promise((resolve, reject) => new THREE.GLTFLoader().parse(bytes.buffer, '', gltf => resolve(gltf.scene), reject));
    }).then(template => {
      template.name = 'UploadedTemplate:' + id;
      template.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = true; object.receiveShadow = true;
        object.geometry.userData.sharedModel = true;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          material.userData.sharedModel = true;
          if (material.isMeshStandardMaterial) {
            material.envMapIntensity = material.metalness > .5 ? .82 : .46;
            material.dithering = true;
          }
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
            if (!material[key]) continue;
            material[key].anisotropy = 4;
            material[key].needsUpdate = true;
          }
        }
      });
      if (id.endsWith('-rider')) template.userData.faceLandmark = findFace(template);
      record.status = 'ready';
      window.dispatchEvent(new CustomEvent('uploaded-model-ready', { detail: { id } }));
      return template;
    }).catch(error => {
      record.status = 'error'; record.error = String(error.message || error);
      console.warn('Uploaded GLB unavailable:', id, error);
      throw error;
    });
    templates.set(id, promise);
    return promise;
  }

  // Clones share immutable geometry/material/texture data. The game skips disposing
  // sharedModel resources when a wizard changes character or equipment.
  function instance(template, id, label) {
    const result = template.clone(true);
    result.name = 'UploadedModel:' + id;
    recordPlacement(result, id, label);
    return result;
  }

  function recordPlacement(object, id, label) {
    if (!state.has(id) || !object) return;
    object.userData.uploadedModel = id; object.userData.sourceFile = state.get(id).source; object.userData.placement = label;
    state.get(id).placements.push(label);
  }

  function fit(model, dimension, length, position, rotationY = 0, grounded = false) {
    model.rotation.y = rotationY;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    const scale = length / Math.max(.0001, size[dimension]);
    const center = box.getCenter(new THREE.Vector3());
    model.scale.setScalar(scale);
    model.position.set(position.x - center.x * scale,
      position.y - (grounded ? box.min.y : center.y) * scale,
      position.z - center.z * scale);
    return model;
  }

  // The twelve uploaded riders each contain one posed, textured mesh. Measure the
  // upper head once per template in model space so a rider's lean travels with it.
  function findFace(template) {
    const box = new THREE.Box3().setFromObject(template);
    const height = box.max.y - box.min.y;
    // A forward-leaning rider's shoulders extend behind the head. Use the
    // crown to locate its horizontal centre, then aim lower at the face.
    const cut = box.max.y - height * .12;
    const head = new THREE.Box3(), point = new THREE.Vector3();
    template.traverse(part => {
      if (!part.isMesh) return;
      const positions = part.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld);
        if (point.y >= cut) head.expandByPoint(point);
      }
    });
    const size = head.getSize(new THREE.Vector3()), center = head.getCenter(new THREE.Vector3());
    center.y = box.max.y - height * .105;
    return { center: center.toArray(), radius: Math.max(size.x * .72, height * .15) };
  }

  async function mountWizard(wizard, { characterId } = {}) {
    const id = riders[characterId]?.[0];
    if (!id) return null;
    const token = {}; wizard.userData.uploadedAppearanceRequest = token;
    try {
      const template = await load(id);
      if (wizard.userData.uploadedAppearanceRequest !== token || wizard.userData.disposed) return null;
      const model = instance(template, id, 'player-and-team-' + characterId);
      fit(model, 'y', 3.25, new THREE.Vector3(0, 1.05, .1), Math.PI);
      model.userData.restRotationX = model.rotation.x;
      model.userData.restPositionY = model.position.y;
      wizard.userData.modelRoot = model;
      wizard.userData.replaceable.body.visible = false;
      wizard.userData.replaceable.broom.visible = false;
      wizard.userData.importedWizard = true;
      wizard.add(model);
      return model;
    } catch { return null; }
  }

  async function mountPitch(scene) {
    const ground = instance(await load('stadium-ground'), 'stadium-ground', 'match-turf');
    const bounds = new THREE.Box3().setFromObject(ground);
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    // The painted white boundary lies at about 84% of the uploaded grass disc.
    ground.scale.set(131 / size.x, .65 / size.y, 177 / size.z);
    ground.position.set(-center.x * ground.scale.x, .045 - bounds.max.y * ground.scale.y, -center.z * ground.scale.z);
    ground.traverse(part => { if (part.isMesh) part.castShadow = false; });
    scenery.add(ground);
    scene.getObjectByName('PitchFallback').visible = false;
  }

  async function mountGoals(scene, goals, openingRadius) {
    const template = await load('goal-pillar');
    // Measured from pillar.glb. The artist's opening is slightly oval.
    // Fit its inside edge to the circular scoring aperture, and shorten only
    // the shaft below the ring so each foot still rests on the grass.
    const ringY = 1.1175, shaftTop = .60, footY = -1.524;
    const scaleX = openingRadius / .318, scaleY = openingRadius / .3575;
    const variants = new Map();
    for (const goal of goals) {
      if (!variants.has(goal.y)) {
        const variant = template.clone(true);
        const shaftHeight = goal.y + (shaftTop - ringY) * scaleY;
        variant.traverse(part => {
          if (!part.isMesh) return;
          const geometry = part.geometry.clone(), positions = geometry.attributes.position;
          for (let i = 0; i < positions.count; i++) {
            const y = positions.getY(i);
            const worldY = y < shaftTop ? (y - footY) * shaftHeight / (shaftTop - footY) : goal.y + (y - ringY) * scaleY;
            positions.setXYZ(i, positions.getX(i) * scaleX, worldY, positions.getZ(i) * scaleX);
          }
          geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
          part.geometry = geometry;
        });
        variants.set(goal.y, variant);
      }
      const pillar = instance(variants.get(goal.y), 'goal-pillar', 'scoring-hoop');
      pillar.position.set(goal.x, 0, goal.z); scenery.add(pillar);
    }
    scene.getObjectByName('GoalFallback').visible = false;
  }

  async function mountScene({ scene, snitch, goals = [], openingRadius } = {}) {
    if (scenery) return scenery;
    activeScene = scene;
    scenery = new THREE.Group(); scenery.name = 'ImportedAcademy'; scene.add(scenery);
    const placeholder = scene.getObjectByName('HighlandStadium')?.children.find(child => child.isGroup && Math.abs(child.position.x + 128) < .1 && Math.abs(child.position.z + 151) < .1);
    const placements = [
      ['academy-hall', 'western-great-hall', 'y', 62, [-102, -2, -116], .20],
      ['academy-tower', 'north-west-tower', 'y', 36, [-76, -2, -55], .08],
      ['academy-tower', 'north-east-tower', 'y', 32, [76, -2, -88], -.2],
      ['gatehouse', 'western-entry-bridge', 'x', 44, [-103, -2, 4], .20],
      ['rampart', 'western-rampart', 'y', 25, [-99, -2, 58], .08],
      ['rampart', 'north-rampart', 'y', 23, [-35, -2, -108], .12]
    ];
    const jobs = placements.map(async ([id, label, dimension, size, point, rotation]) => {
      const model = instance(await load(id), id, label);
      fit(model, dimension, size, new THREE.Vector3(...point), rotation, true);
      scenery.add(model);
      if (id === 'academy-hall' && placeholder) placeholder.visible = false;
    });
    if (scene.getObjectByName('PitchFallback')) jobs.push(mountPitch(scene));
    if (goals.length && scene.getObjectByName('GoalFallback')) jobs.push(mountGoals(scene, goals, openingRadius));
    jobs.push((async () => {
      const template = await load('snitch');
      const podium = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3, 2.7, 12), new THREE.MeshStandardMaterial({ color: 0x263b45, metalness: .45, roughness: .5 }));
      podium.position.set(-61, 1.0, 27); podium.castShadow = true; podium.receiveShadow = true;
      podium.name = 'GoldenCupPodium'; scenery.add(podium);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(2.45, .1, 6, 36), new THREE.MeshStandardMaterial({ color: 0xe8bc5b, metalness: .7, roughness: .35 }));
      rim.rotation.x = Math.PI / 2; rim.position.set(-61, 2.4, 27); scenery.add(rim);
      const trophy = instance(template, 'snitch', 'permanent-sideline-golden-cup');
      const mount = new THREE.Group(); mount.name = 'GoldenCup'; mount.position.set(-61, 6, 27); scenery.add(mount);
      fit(trophy, 'x', 5.4, new THREE.Vector3()); mount.add(trophy); ornaments.push(mount);
      if (snitch) {
        const appearance = instance(template, 'snitch', 'match-snitch-appearance');
        fit(appearance, 'x', 2.9, new THREE.Vector3());
        // Keep named procedural wings for existing animation calls while hiding their geometry.
        for (const child of snitch.children) if (child.isMesh) child.visible = false;
        snitch.add(appearance);
      }
    })());
    // Warm the actual equipment and character too, not merely the static scenery.
    jobs.push(load('broom'), load('harry-rider'));
    await Promise.allSettled(jobs);
    return scenery;
  }

  function update(dt, elapsed = 0) {
    for (const trophy of ornaments) {
      trophy.rotation.y += Math.min(dt, .1) * .35;
      trophy.position.y = 6 + Math.sin(elapsed * 1.3) * .3;
    }
  }

  return { load, mountWizard, mountScene, update, getStatus, recordPlacement, hasRider: id => !!riders[id],
    get ready() { return ready || (ready = Promise.allSettled(sources.map(([id]) => load(id)))); } };
})();
