/* Uploaded GLB assets, optimized for the arena and packed for file:// play. */
window.BroomModels = (() => {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  const sources = [
    ['academy-hall', 'textured.glb', '学院主堡'],
    ['academy-tower', 'textured (1).glb', '学院尖塔'],
    ['gatehouse', 'textured (2).glb', '双塔石桥'],
    ['rampart', 'textured (3).glb', '学院城墙'],
    ['broom', 'textured(1).glb', '上传的飞行扫帚'],
    ['snitch', 'textured (1)(1).glb', '金色飞贼奖杯'],
    ['harry-rider', 'textured (2)(1).glb', '哈利飞行模型']
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

  async function mountWizard(wizard, { characterId } = {}) {
    if (characterId !== 'harry') return null;
    const token = {}; wizard.userData.uploadedAppearanceRequest = token;
    try {
      const template = await load('harry-rider');
      if (wizard.userData.uploadedAppearanceRequest !== token || wizard.userData.disposed) return null;
      const model = instance(template, 'harry-rider', 'player-and-team-harry');
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

  async function mountScene({ scene, snitch } = {}) {
    if (scenery) return scenery;
    activeScene = scene;
    scenery = new THREE.Group(); scenery.name = 'ImportedAcademy'; scene.add(scenery);
    const placeholder = scene.getObjectByName('HighlandStadium')?.children.find(child => child.isGroup && Math.abs(child.position.x + 128) < .1 && Math.abs(child.position.z + 151) < .1);
    if (placeholder) placeholder.visible = false;
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
    });
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

  return { load, mountWizard, mountScene, update, getStatus, recordPlacement,
    get ready() { return ready || (ready = Promise.allSettled(sources.map(([id]) => load(id)))); } };
})();
