/* Stadium surroundings are visual only; the playable airspace stays unobstructed. */
window.BroomEnvironment = (() => {
  function build({ THREE: T, scene }) {
    const root = new T.Group();
    root.name = 'HighlandStadium';
    scene.add(root);
    scene.fog.color.set(0x9bafbf);
    scene.fog.density = .00155;
    scene.traverse(object => {
      const uniforms = object.material?.uniforms;
      if (uniforms?.top && uniforms?.horizon && uniforms?.bottom) {
        uniforms.top.value.set(0x345779);
        uniforms.horizon.value.set(0xb6c5d2);
        uniforms.bottom.value.set(0x6c8494);
      }
    });
    const palette = new Map();
    const material = (color, roughness = .9) => {
      const key = color + ':' + roughness;
      if (!palette.has(key)) palette.set(key, new T.MeshStandardMaterial({ color, roughness }));
      return palette.get(key);
    };
    const mesh = (geometry, color, x, y, z, parent = root) => {
      const object = new T.Mesh(geometry, typeof color === 'number' ? material(color) : color);
      object.position.set(x, y, z);
      object.receiveShadow = true;
      parent.add(object);
      return object;
    };
    const box = (w, h, d, x, y, z, color, parent) => mesh(new T.BoxGeometry(w, h, d), color, x, y, z, parent);
    const cylinder = (rt, rb, h, x, y, z, color, segments = 12, parent) =>
      mesh(new T.CylinderGeometry(rt, rb, h, segments), color, x, y, z, parent);
    let seed = 24617;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

    // Grounded surroundings replace the isolated platform without filling the airspace.
    const land = cylinder(360, 360, 5, 0, -5.1, 0, 0x283e38, 96);
    land.receiveShadow = false;
    for (let i = 0; i < 20; i++) {
      const angle = i / 20 * Math.PI * 2;
      const distance = 200 + random() * 75;
      const hill = mesh(new T.SphereGeometry(1, 14, 8), i % 2 ? 0x344b46 : 0x3b5048,
        Math.sin(angle) * distance, -9, Math.cos(angle) * distance);
      hill.scale.set(48 + random() * 36, 18 + random() * 32, 40 + random() * 40);
      hill.receiveShadow = false;
    }

    // A lake, its stone rim, and a small boathouse form a recognizable eastern landmark.
    const shore = cylinder(1, 1, .7, 163, -2.1, -24, 0x8b8772, 64);
    shore.scale.set(48, 1, 102);
    const waterMaterial = new T.MeshStandardMaterial({ color: 0x38717f, metalness: .35, roughness: .28 });
    const water = cylinder(1, 1, .12, 163, -1.68, -24, waterMaterial, 64);
    water.scale.set(45, 1, 98);
    const ripples = [];
    for (let i = 0; i < 6; i++) {
      const ring = mesh(new T.RingGeometry(5 + i * 2, 5.06 + i * 2, 48),
        new T.MeshBasicMaterial({ color: 0xa6cbd1, transparent: true, opacity: .19, side: T.DoubleSide, depthWrite: false }),
        160 + (i % 2) * 8, -1.59, -20 - i * 6);
      ring.rotation.x = -Math.PI / 2;
      ripples.push(ring);
    }
    box(13, .5, 6, 125, -1.1, 36, 0x837359);
    box(10, 7, 8, 122, 2, 48, 0x686353);
    const boatRoof = cylinder(0, 9, 5, 122, 8, 48, 0x36465b, 4);
    boatRoof.rotation.y = Math.PI / 4;

    // A compact castle silhouette is kept beyond the stands and boundary.
    const castle = new T.Group();
    castle.position.set(-128, -1.4, -151);
    castle.rotation.y = -.22;
    root.add(castle);
    box(65, 6, 46, 0, 0, 0, 0x505a5b, castle);
    box(43, 22, 20, 0, 13, 2, 0x777d7b, castle);
    box(28, 32, 16, -5, 18, -13, 0x8b8b7d, castle);
    const roof = cylinder(0, 24, 13, -5, 39, -13, 0x344458, 4, castle);
    roof.scale.z = .6;
    roof.rotation.y = Math.PI / 4;
    const towerPositions = [[-29, -16, 36], [27, -16, 44], [-29, 18, 27], [27, 18, 29], [-6, -14, 61]];
    const windowMaterial = new T.MeshBasicMaterial({ color: 0xf5ce87 });
    for (const [x, z, h] of towerPositions) {
      cylinder(4.2, 5.2, h, x, h / 2, z, 0x83877e, 10, castle);
      cylinder(5.2, 5.2, 1.4, x, h - .5, z, 0xaca58c, 10, castle);
      cylinder(0, 6.4, 12, x, h + 6, z, 0x30465e, 10, castle);
      cylinder(.1, .1, 4, x, h + 14, z, 0xc9b477, 6, castle);
      for (let level = 8; level < h - 4; level += 9) {
        box(1.1, 2.5, .1, x, level, z + 4.45, windowMaterial, castle);
        box(.1, 2.5, 1.1, x + 4.45, level, z, windowMaterial, castle);
      }
    }
    for (let x = -20; x <= 20; x += 5) {
      box(2.4, 2.5, 3, x, 25, 11, 0x969580, castle);
      box(1.2, 3.6, .12, x, 15, 12.1, windowMaterial, castle);
    }
    // The path stays outside the southern edge of the active pitch.
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      const x = -23 - t * 83, z = -107 - t * 35;
      const tile = box(8, .14, 7, x, -1.5, z, i % 2 ? 0x8c8873 : 0x7e806d);
      tile.rotation.y = .35;
    }

    // Seeded trees make reloads stable and keep screenshots reproducible.
    for (let i = 0; i < 145; i++) {
      const angle = random() * Math.PI * 2;
      const distance = 111 + random() * 104;
      const x = Math.sin(angle) * distance, z = Math.cos(angle) * distance * 1.05;
      if (x > 112 && z > -135 && z < 88) continue;
      if (x < -85 && z < -100) continue;
      const height = 7 + random() * 11;
      cylinder(.4, .65, height * .45, x, height * .18 - 1.5, z, 0x5d5446, 6);
      cylinder(0, height * .23, height * .68, x, height * .48, z, i % 3 ? 0x254e43 : 0x3c5a47, 7);
      cylinder(0, height * .17, height * .53, x, height * .72, z, 0x3c6551, 7);
    }

    // Roofs unify the old separate seating blocks into a coherent stadium bowl.
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2;
      const stand = new T.Group();
      stand.position.set(Math.sin(a) * 79, 0, Math.cos(a) * 98);
      stand.rotation.y = a;
      root.add(stand);
      const color = Math.cos(a) < 0 ? 0x305579 : 0x793c48;
      const roofPanel = box(17.2, .6, 10, 0, 12.4, 0, color, stand);
      roofPanel.rotation.x = -.12;
      box(17.5, .32, .24, 0, 11.85, -5, 0xd5b87a, stand);
      for (const x of [-7.3, 7.3]) cylinder(.16, .2, 12.2, x, 5.9, 3.5, 0x777b73, 6, stand);
      box(15.9, 2.2, .3, 0, 8.2, -4, color, stand);
    }

    const label = (text, sub, color, x, y, z, scale = 1) => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 160;
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'rgba(7,17,29,.9)'; ctx.fillRect(4, 4, 632, 152);
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.strokeRect(5, 5, 630, 150);
      ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.font = '600 45px "Microsoft YaHei", sans-serif';
      ctx.fillText(text, 320, 67);
      ctx.fillStyle = '#d8e0e6'; ctx.font = '25px "Microsoft YaHei", sans-serif'; ctx.fillText(sub, 320, 116);
      const texture = new T.CanvasTexture(c);
      const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, depthWrite: false, transparent: true }));
      sprite.position.set(x, y, z); sprite.scale.set(25 * scale, 6.25 * scale, 1);
      root.add(sprite);
      return sprite;
    };
    label('蓝色门环 · 进攻', '瞄准门环  /  F 射门  /  +10', '#a5d9ff', 0, 26, -65);
    label('金色门环 · 本方', '保护球门  /  拦截来球', '#f0d28d', 0, 26, 65);
    label('HIGHLAND ARENA', '金 色 球 场', '#dfcb97', -61, 18, 0, .8);

    // Field graphics provide orientation even while looking down from altitude.
    const lineMaterial = new T.LineBasicMaterial({ color: 0xc9dfcb, transparent: true, opacity: .62 });
    const line = (points, mat = lineMaterial) => {
      const result = new T.Line(new T.BufferGeometry().setFromPoints(points), mat);
      root.add(result); return result;
    };
    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 48; i++) {
        const a = i / 48 * Math.PI;
        pts.push(new T.Vector3(Math.cos(a) * 22, .2, side * (59 - Math.sin(a) * 17)));
      }
      line(pts, new T.LineBasicMaterial({ color: side < 0 ? 0x80b6dc : 0xdcc37f, transparent: true, opacity: .85 }));
      for (let i = 0; i < 3; i++) {
        const z = side * (20 + i * 5);
        line([new T.Vector3(-2.2, .2, z - side * 1.8), new T.Vector3(0, .2, z), new T.Vector3(2.2, .2, z - side * 1.8)]);
      }
    }

    // Subtle landing shadows make the player's altitude legible without obstructing targets.
    const shadowMaterial = new T.MeshBasicMaterial({ color: 0x061e23, transparent: true, opacity: .22, depthWrite: false });
    const playerShadow = mesh(new T.CircleGeometry(1.4, 24), shadowMaterial, 0, .21, 38);
    playerShadow.rotation.x = -Math.PI / 2;
    playerShadow.name = 'PlayerGroundMarker';
    const marker = mesh(new T.RingGeometry(1.6, 1.69, 32), new T.MeshBasicMaterial({ color: 0xffdb80, transparent: true, opacity: .5, depthWrite: false }), 0, .22, 38);
    marker.rotation.x = -Math.PI / 2;

    // Merge opaque static meshes by material. The original stadium has thousands of
    // tiny meshes; this keeps richer scenery from adding thousands of draw calls.
    const batchStats = batchStaticMeshes(T, scene);
    return {
      root, batchStats,
      update(dt, { player, elapsed, active, reducedMotion }) {
        playerShadow.visible = marker.visible = active;
        if (active) {
          playerShadow.position.set(player.x, .21, player.z);
          marker.position.set(player.x, .22, player.z);
          playerShadow.scale.setScalar(1 + player.y * .025);
          shadowMaterial.opacity = Math.max(.07, .26 - player.y * .004);
        }
        if (!reducedMotion) for (let i = 0; i < ripples.length; i++) ripples[i].scale.setScalar(1 + Math.sin(elapsed * .6 + i) * .07);
      }
    };
  }

  function batchStaticMeshes(T, scene) {
    scene.updateMatrixWorld(true);
    const groups = new Map();
    scene.traverse(object => {
      if (!object.isMesh || !object.material?.isMeshStandardMaterial || object.material.transparent ||
          object.material.side === T.DoubleSide || !object.geometry.getAttribute('normal') ||
          !object.geometry.getAttribute('uv')) return;
      const key = object.material.uuid + ':' + object.castShadow + ':' + object.receiveShadow;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(object);
    });
    let original = 0, batches = 0;
    for (const objects of groups.values()) {
      if (objects.length < 3) continue;
      const positions = [], normals = [], uvs = [], indices = [];
      for (const object of objects) {
        const g = object.geometry.clone().applyMatrix4(object.matrixWorld);
        const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv');
        const offset = positions.length / 3;
        for (let i = 0; i < p.count; i++) {
          positions.push(p.getX(i), p.getY(i), p.getZ(i));
          normals.push(n.getX(i), n.getY(i), n.getZ(i));
          uvs.push(uv.getX(i), uv.getY(i));
        }
        const index = g.getIndex();
        for (let i = 0; i < (index ? index.count : p.count); i++) indices.push(offset + (index ? index.getX(i) : i));
        g.dispose(); object.removeFromParent(); object.geometry.dispose();
      }
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices); geometry.computeBoundingSphere();
      const combined = new T.Mesh(geometry, objects[0].material);
      combined.name = 'StaticEnvironmentBatch';
      combined.castShadow = objects[0].castShadow;
      combined.receiveShadow = objects[0].receiveShadow;
      scene.add(combined);
      original += objects.length; batches++;
    }
    return { originalMeshes: original, batches };
  }
  return { build };
})();
