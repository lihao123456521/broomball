/* House colors, crests and spectator stands for the stadium and match UI. */
window.BroomHouses = (() => {
  'use strict';

  const houses = [
    { id: 'gryffindor', name: '格兰芬多', enName: 'Gryffindor', animal: '狮', motto: '勇气 · 胆识 · 骑士精神', color: '#8e243b', secondary: '#f3cb70' },
    { id: 'slytherin', name: '斯莱特林', enName: 'Slytherin', animal: '蛇', motto: '抱负 · 谋略 · 决心', color: '#205b48', secondary: '#d1e2df' },
    { id: 'ravenclaw', name: '拉文克劳', enName: 'Ravenclaw', animal: '鹰', motto: '智慧 · 学识 · 创意', color: '#244d85', secondary: '#e0a36c' },
    { id: 'hufflepuff', name: '赫奇帕奇', enName: 'Hufflepuff', animal: '獾', motto: '忠诚 · 耐心 · 公正', color: '#e2ac35', secondary: '#29211a' }
  ];
  const houseById = new Map(houses.map(house => [house.id, house]));
  const shield = 'M12 9H84V49Q84 70 48 90Q12 70 12 49Z';
  // Local vector artwork is shared by the menu crests and in-world cloth.
  const animalLines = {
    gryffindor: 'M31 30L23 28L22 42L27 47L22 55L29 60L29 68L40 72L48 79L56 72L67 68L67 60L74 55L69 47L74 42L73 28L65 30L58 23H38Z M31 43L36 37H60L65 43L61 56L54 65H42L35 56Z M36 47L41 49M55 49L60 47M44 55L48 58L52 55M48 58V63',
    slytherin: 'M62 33C49 19 28 28 28 42C28 60 68 46 68 60C68 72 42 75 35 63M62 33L73 32L70 43L60 42Z M70 42L76 47L80 45M76 47L76 51',
    ravenclaw: 'M47 55L32 30L20 24L24 42L31 47L28 50L35 57L46 61L48 74L52 61L62 57L70 50L67 47L74 42L78 24L66 30L54 48L52 40L59 42L55 35L47 36Z M27 35L35 44M69 35L61 44',
    hufflepuff: 'M30 37L29 29L37 27L43 31H53L59 27L67 29L66 37L69 52L63 62L48 73L33 62L27 52Z M38 32L34 45L41 57M58 32L62 45L55 57M42 58L48 63L54 58M35 47L38 48M58 48L61 47'
  };

  function crestSVG(id) {
    const house = houseById.get(id);
    if (!house) return '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" aria-hidden="true" focusable="false"><path d="${shield}" fill="${house.color}" stroke="${house.secondary}" stroke-width="4"/><path d="${animalLines[id]}" fill="none" stroke="${house.secondary}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  const uniforms = new WeakMap();
  function applyUniform(wizard, houseId) {
    const house = houseById.get(houseId);
    const rig = wizard?.userData.rig;
    if (!house || !rig) return;
    if (!uniforms.has(wizard)) {
      // The coat and first scarf fabric define the original costume palette for this rig.
      const coat = rig.body.children[0].material.color;
      const scarf = rig.scarfTail.children[0].material.color;
      const parts = { primary: [], accent: [] };
      rig.body.traverse(part => {
        const material = part.material;
        if (!material?.color || part.parent?.name === 'Head') return;
        const colors = material.color.equals(coat) ? parts.primary
          : material.color.equals(scarf) ? parts.accent : null;
        if (!colors) return;
        if (!material.userData.owned) {
          part.material = material.clone();
          part.material.userData.owned = true;
        }
        colors.push(part.material);
      });
      uniforms.set(wizard, parts);
    }
    const parts = uniforms.get(wizard);
    for (const material of parts.primary) material.color.set(house.color);
    for (const material of parts.accent) material.color.set(house.secondary);
    wizard.userData.houseId = houseId;
  }

  function paintCrest(ctx, house, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 96, size / 96);
    ctx.fillStyle = house.color;
    ctx.strokeStyle = house.secondary;
    ctx.lineWidth = 4;
    const outline = new Path2D(shield);
    ctx.fill(outline);
    ctx.stroke(outline);
    ctx.lineWidth = 3.2;
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.stroke(new Path2D(animalLines[house.id]));
    ctx.restore();
  }

  function paintPanel(ctx, width, height) {
    ctx.fillStyle = '#152027';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#cfaa67';
    ctx.lineWidth = 4;
    ctx.strokeRect(7, 7, width - 14, height - 14);
    ctx.strokeStyle = '#64553f';
    ctx.lineWidth = 1;
    ctx.strokeRect(14, 14, width - 28, height - 28);
  }

  function paintFlag(ctx, house, showName = false) {
    ctx.fillStyle = house.color;
    ctx.fillRect(0, 0, 192, 288);
    ctx.fillStyle = house.secondary;
    ctx.fillRect(12, 0, 4, 288);
    ctx.fillRect(176, 0, 4, 288);
    const shading = ctx.createLinearGradient(0, 0, 192, 0);
    shading.addColorStop(0, '#0004');
    shading.addColorStop(.45, '#fff1');
    shading.addColorStop(1, '#0005');
    ctx.fillStyle = shading;
    ctx.fillRect(0, 0, 192, 288);
    paintCrest(ctx, house, 17, 41, 158);
    if (showName) {
      ctx.textAlign = 'center';
      ctx.font = '700 29px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = house.secondary;
      ctx.fillText(house.name, 96, 226);
    }
  }

  let home = houses[0], away = houses[1], repaintMatch;
  function setTeams(homeId, awayId) {
    const nextHome = houseById.get(homeId), nextAway = houseById.get(awayId);
    if (!nextHome || !nextAway || (home === nextHome && away === nextAway)) return;
    home = nextHome;
    away = nextAway;
    repaintMatch?.();
  }

  function decorate({ THREE: T, scene }) {
    const existing = scene.getObjectByName('HouseStands');
    if (existing) return existing;
    const root = new T.Group();
    root.name = 'HouseStands';
    root.userData.houses = houses.map(house => house.id);
    scene.add(root);

    const bronze = new T.MeshStandardMaterial({ color: 0x9d8154, roughness: .66, metalness: .32 });
    const poleGeometry = new T.BoxGeometry(.22, 1, .22);
    const crossbarGeometry = new T.BoxGeometry(2.9, .16, .23);
    const flagGeometry = new T.PlaneGeometry(2.55, 3.825, 10, 1);
    const vertices = flagGeometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i);
      vertices.setZ(i, Math.sin(x * 4 + y) * .12 * (1 - (y + 1.9125) / 3.825));
    }

    function place(name, x, z) {
      const stand = new T.Group();
      stand.name = name;
      stand.position.set(x, 0, z);
      stand.rotation.y = Math.atan2(-x, -z);
      root.add(stand);
      return stand;
    }

    function cloth(parent, geometry, textureWidth, textureHeight, x, y) {
      const canvas = document.createElement('canvas');
      canvas.width = textureWidth;
      canvas.height = textureHeight;
      const ctx = canvas.getContext('2d');
      const texture = new T.CanvasTexture(canvas);
      texture.colorSpace = T.SRGBColorSpace;
      const material = new T.MeshBasicMaterial({ map: texture, side: T.DoubleSide, toneMapped: false });
      const surface = new T.Mesh(geometry, material);
      surface.position.set(x, y, .15);
      parent.add(surface);
      return draw => {
        draw(ctx, textureWidth, textureHeight);
        texture.needsUpdate = true;
      };
    }

    function flag(parent, x, y) {
      const pole = new T.Mesh(poleGeometry, bronze);
      pole.scale.y = y + 4.5;
      pole.position.set(x, y + 2 - pole.scale.y / 2, -.18);
      parent.add(pole);
      const bar = new T.Mesh(crossbarGeometry, bronze);
      bar.position.set(x, y + 1.96, .04);
      parent.add(bar);
      return cloth(parent, flagGeometry, 192, 288, x, y);
    }

    const standFlagGeometry = flagGeometry.clone().scale(1.6, 1.6, 1);
    const standSections = [17, 11, 3, 25];
    houses.forEach((house, index) => {
      // Suspend a single banner under the front fascia of each house's roof section.
      const angle = standSections[index] / 28 * Math.PI * 2;
      const stand = place('HouseStand:' + house.id, Math.sin(angle) * 73.7, Math.cos(angle) * 92.7);
      stand.rotation.y = angle + Math.PI;
      cloth(stand, standFlagGeometry, 192, 288, 0, 8.8)(ctx => paintFlag(ctx, house, true));
    });

    const entrance = place('HouseCupEntrance', 31, -79);
    const drawMatch = cloth(entrance, new T.PlaneGeometry(23, 7.2), 800, 250, 0, 12.9);
    const drawHomeFlag = flag(entrance, -11.8, 15.5);
    const drawAwayFlag = flag(entrance, 11.8, 15.5);
    repaintMatch = () => {
      root.userData.homeHouse = home.id;
      root.userData.awayHouse = away.id;
      drawMatch((ctx, width, height) => {
        paintPanel(ctx, width, height);
        paintCrest(ctx, home, 29, 50, 153);
        paintCrest(ctx, away, 618, 50, 153);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f7ecce';
        ctx.font = '700 52px "Microsoft YaHei", sans-serif';
        ctx.fillText('学院杯', 400, 89);
        ctx.fillStyle = '#dfc590';
        ctx.font = '600 22px Georgia, serif';
        ctx.fillText('H O U S E   C U P', 400, 127);
        ctx.fillStyle = '#f7ecce';
        ctx.font = '600 30px "Microsoft YaHei", sans-serif';
        ctx.fillText(home.name + '  ×  ' + away.name, 400, 188);
      });
      drawHomeFlag(ctx => paintFlag(ctx, home));
      drawAwayFlag(ctx => paintFlag(ctx, away));
    };
    repaintMatch();
    return root;
  }

  return { houses, crestSVG, decorate, setTeams, applyUniform };
})();
