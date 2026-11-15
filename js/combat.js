// ============================================================================
// REAL-TIME TWIN-STICK COMBAT ENGINE & HEADLESS BALANCE SIMULATOR
// ============================================================================
import { state, cInput, rand, pick, clamp, uid, log } from './state.js';
import {
  PLANET_THEMES, ARENA_W, ARENA_H, COMBAT_PLAYER_DASH_CD,
  COMBAT_ROUT_THRESHOLD, COMBAT_MATCHUP, DIFFICULTY
} from './data.js';
import { sfx } from './audio.js';
import {
  hasDoctrine, playerFactionCfg, enemyFactionCfg, refreshIncome,
  findPlanet, updateSystemOwner, applyVeterancyPromotion
} from './economy.js';
import { makeShip, makeRegiment, finishEnemyTurn } from './strategy.js';

let uiHooks = {
  render: () => {}
};

export function registerCombatHooks(hooks) {
  uiHooks = { ...uiHooks, ...hooks };
}

export function shipCombatProfile(type) {
  switch (type) {
    case 'CRUISER':     return { speed: 145, range: 410, cd: 0.58, projSpeed: 620, radius: 22, sfx: 'cannon', spread: 1, preferRange: 0.72 };
    case 'CARRIER':     return { speed: 120, range: 430, cd: 0.30, projSpeed: 520, radius: 24, sfx: 'plasma', spread: 1, preferRange: 0.85 };
    case 'TRANSPORT':   return { speed: 155, range: 250, cd: 0.52, projSpeed: 500, radius: 19, sfx: 'laser',  spread: 1, preferRange: 0.55 };
    case 'INTERDICTOR': return { speed: 170, range: 300, cd: 0.50, projSpeed: 560, radius: 17, sfx: 'laser',  spread: 1, preferRange: 0.90 };
    default:            return { speed: 225, range: 330, cd: 0.38, projSpeed: 700, radius: 15, sfx: 'laser',  spread: 1, preferRange: 0.95 };
  }
}

export function regCombatProfile(type) {
  switch (type) {
    case 'SKIRMISHER': return { speed: 210, range: 350, cd: 0.25, projSpeed: 680, radius: 14, sfx: 'laser',  splash: 0,  preferRange: 0.90 };
    case 'MECH':       return { speed: 145, range: 260, cd: 0.16, projSpeed: 560, radius: 18, sfx: 'plasma', splash: 0,  preferRange: 0.65 };
    case 'ARTILLERY':  return { speed: 115, range: 450, cd: 2.10, projSpeed: 460, radius: 17, sfx: 'cannon', splash: 56, preferRange: 1.00 };
    default:           return { speed: 168, range: 250, cd: 0.36, projSpeed: 600, radius: 14, sfx: 'laser',  splash: 0,  preferRange: 0.72 };
  }
}

export function generateCombatArena(kind, planet, defenderSector) {
  const obstacles = [], objectives = [], decorations = [];
  const seed = Math.floor(Math.random() * 0x7fffffff);
  let seedState = seed || 1;
  const random = (min, max) => {
    seedState = (seedState * 1664525 + 1013904223) >>> 0;
    return min + (seedState / 4294967296) * (max - min);
  };
  const integer = (min, max) => Math.floor(random(min, max + 1));
  const clearOf = (x, y, r, pad = 36) =>
    !obstacles.some(o => Math.hypot(o.x - x, o.y - y) < (o.r || 20) + r + pad);

  if (kind === 'NAVAL') {
    const count = integer(9, 15);
    let attempts = 0;
    while (obstacles.length < count && attempts++ < count * 14) {
      const r = random(22, 58), x = random(315, ARENA_W - 315), y = random(105, ARENA_H - 105);
      if (!clearOf(x, y, r, 34)) continue;
      const sides = integer(6, 9), rotation = random(0, Math.PI * 2), verts = [];
      for (let k = 0; k < sides; k++) {
        const a = rotation + k / sides * Math.PI * 2, vr = r * random(0.72, 1.18);
        verts.push({ x: Math.cos(a) * vr, y: Math.sin(a) * vr });
      }
      obstacles.push({ kind: 'ASTEROID', x, y, r, verts, hp: Math.round(145 + r * 3.4), maxHp: Math.round(145 + r * 3.4), destructible: true, seed: obstacles.length });
    }
    const relaySpots = [];
    let relayAttempts = 0;
    while (relaySpots.length < 2 && relayAttempts++ < 100) {
      const x = random(430, 970), y = random(235, 665);
      if (relaySpots.every(q => Math.hypot(q.x - x, q.y - y) > 270) &&
          !obstacles.some(o => Math.hypot(o.x - x, o.y - y) < o.r + 105)) relaySpots.push({ x, y });
    }
    if (relaySpots.length < 2) relaySpots.splice(0, relaySpots.length,
      { x: ARENA_W * 0.5, y: ARENA_H * 0.30 }, { x: ARENA_W * 0.5, y: ARENA_H * 0.70 });
    objectives.push(
      { id: 'obj-0', name: 'Nav Relay Alpha', x: relaySpots[0].x, y: relaySpots[0].y, r: 58, owner: 'N', prog: 0, reinforceTimer: 0 },
      { id: 'obj-1', name: 'Nav Relay Beta',  x: relaySpots[1].x, y: relaySpots[1].y, r: 58, owner: 'N', prog: 0, reinforceTimer: 0 }
    );
  } else {
    const count = integer(8, 13);
    let attempts = 0;
    while (obstacles.filter(o => o.kind === 'RIDGE').length < count && attempts++ < count * 16) {
      const r = random(22, 52), x = random(300, ARENA_W - 300), y = random(105, ARENA_H - 105);
      if (!clearOf(x, y, r, 58)) continue;
      const sides = integer(5, 8), rotation = random(0, Math.PI * 2), verts = [];
      for (let k = 0; k < sides; k++) {
        const a = rotation + k / sides * Math.PI * 2, vr = r * random(0.76, 1.2);
        verts.push({ x: Math.cos(a) * vr, y: Math.sin(a) * vr });
      }
      obstacles.push({ kind: 'RIDGE', x, y, r, verts, rotation, hp: 9999, maxHp: 9999, destructible: false });
    }
    const fort = defenderSector ? (defenderSector.fort || 1) : 1;
    const barricadeCount = Math.max(1, Math.min(6, fort + integer(0, 2)));
    let placed = 0, fortAttempts = 0;
    while (placed < barricadeCount && fortAttempts++ < barricadeCount * 20) {
      const r = random(15, 24), x = random(ARENA_W * 0.64, ARENA_W * 0.84), y = random(ARENA_H * 0.18, ARENA_H * 0.82);
      if (!clearOf(x, y, r, 48)) continue;
      obstacles.push({ kind: 'BARRICADE', x, y, r, angle: random(-0.35, 0.35), hp: 90 + fort * 25, maxHp: 90 + fort * 25, destructible: true });
      placed++;
    }
    let lz = { x: random(ARENA_W * 0.43, ARENA_W * 0.57), y: random(ARENA_H * 0.30, ARENA_H * 0.70) };
    let core = { x: random(ARENA_W * 0.70, ARENA_W * 0.84), y: random(ARENA_H * 0.28, ARENA_H * 0.72) };
    let objAttempts = 0;
    while (objAttempts++ < 80 && (
      Math.hypot(lz.x - core.x, lz.y - core.y) < 280 ||
      obstacles.some(o => Math.hypot(o.x - lz.x, o.y - lz.y) < o.r + 92) ||
      obstacles.some(o => Math.hypot(o.x - core.x, o.y - core.y) < o.r + 100)
    )) {
      lz = { x: random(ARENA_W * 0.43, ARENA_W * 0.57), y: random(ARENA_H * 0.28, ARENA_H * 0.72) };
      core = { x: random(ARENA_W * 0.70, ARENA_W * 0.84), y: random(ARENA_H * 0.25, ARENA_H * 0.75) };
    }
    objectives.push(
      { id: 'obj-0', name: 'Forward LZ',  x: lz.x,   y: lz.y,   r: 62, owner: 'N', prog: 0,    reinforceTimer: 0 },
      { id: 'obj-1', name: 'Sector Core', x: core.x, y: core.y, r: 66, owner: 'E', prog: -100, reinforceTimer: 0 }
    );
    const biome = (PLANET_THEMES[planet?.id] || {}).biome || 'BARREN';
    const decorType = ({
      DESERT: 'DUNE_ROCK', JUNGLE: 'ALIEN_FLORA', ICE: 'ICE_SPIRE',
      INDUSTRIAL: 'INDUSTRIAL_WRECK', CRYSTAL: 'CRYSTAL', DARK: 'OBSIDIAN',
      VOLCANIC: 'LAVA_VENT', URBAN: 'RUIN', BARREN: 'SCRAP'
    })[biome] || 'SCRAP';
    const decorCount = biome === 'JUNGLE' ? 28 : biome === 'DESERT' ? 22 : 18;
    for (let i = 0; i < decorCount; i++) {
      const x = random(35, ARENA_W - 35), y = random(35, ARENA_H - 35);
      if (x < 260 || x > ARENA_W - 260) continue;
      if (objectives.some(o => Math.hypot(o.x - x, o.y - y) < o.r + 35)) continue;
      if (obstacles.some(o => Math.hypot(o.x - x, o.y - y) < o.r + 18)) continue;
      const hazardous = (biome === 'VOLCANIC' && i % 3 === 0) || (biome === 'CRYSTAL' && i % 4 === 0) || (biome === 'INDUSTRIAL' && i % 4 === 1);
      decorations.push({
        kind: decorType, x, y, scale: random(0.65, 1.45), angle: random(0, Math.PI * 2),
        variant: integer(0, 3), hazardous,
        hazardRadius: hazardous ? (biome === 'VOLCANIC' ? 54 : 43) : 0,
        hazardDamage: hazardous ? (biome === 'VOLCANIC' ? 5 : 3) : 0
      });
    }
  }
  return { obstacles, objectives, decorations, seed, width: ARENA_W, height: ARENA_H };
}

export function startNavalCombat(playerFleet, enemyFleet) {
  if (state.combat !== null) {
    log('Warning: ignored duplicate naval combat while engagement is active.');
    return;
  }
  const arena = generateCombatArena('NAVAL', null, null);
  state.combat = {
    kind: 'NAVAL',
    player: JSON.parse(JSON.stringify(playerFleet)),
    enemy: JSON.parse(JSON.stringify(enemyFleet)),
    obstacles: arena.obstacles,
    objectives: arena.objectives,
    decorations: arena.decorations || [],
    layoutSeed: arena.seed,
    units: [],
    projectiles: [],
    particles: [],
    wrecks: [],
    shockwaves: [],
    floatTexts: [],
    strikes: [],
    batteries: [],
    log: [],
    winner: null,
    endReason: '',
    activeId: null,
    camX: ARENA_W * 0.25,
    camY: ARENA_H * 0.5,
    elapsed: 0
  };
  const combat = state.combat;

  combat.player.ships.forEach((s, i) => {
    const prof = shipCombatProfile(s.type);
    const yOff = (i - (combat.player.ships.length - 1) / 2) * 76;
    const cmd = playerFleet.commander;
    const cfg = playerFactionCfg();
    const fMult = cmd?.fireRateMult || 1;
    const sMult = (cmd?.speedMult || 1) * (hasDoctrine('N_ENGINES') ? 1.12 : 1) * (s.type === 'CORVETTE' ? cfg.fastSpeedMult : 1);
    const rMult = cmd?.rangeMult || 1;
    const dmgMult = hasDoctrine('N_WEAPONS') ? 1.15 : 1;
    combat.units.push({
      id: s.id, side: 'P', ship: s,
      x: 190, y: clamp(ARENA_H * 0.5 + yOff, 90, ARENA_H - 90),
      vx: 0, vy: 0, aim: 0,
      hp: s.hp, maxHp: s.maxHp,
      shields: s.shields, maxShields: s.maxShields,
      fire: Math.round(s.fire * dmgMult), speed: prof.speed * sMult, range: prof.range * rMult,
      cdMax: prof.cd / fMult, cd: 0, projSpeed: prof.projSpeed,
      radius: prof.radius, sfx: prof.sfx, spread: prof.spread, splash: 0, preferRange: prof.preferRange,
      dashCd: 0, dashTime: 0, dashVx: 0, dashVy: 0, invuln: 0, hitFlash: 0
    });
  });

  combat.enemy.ships.forEach((s, i) => {
    const prof = shipCombatProfile(s.type);
    const yOff = (i - (combat.enemy.ships.length - 1) / 2) * 76;
    combat.units.push({
      id: s.id, side: 'E', ship: s,
      x: ARENA_W - 190, y: clamp(ARENA_H * 0.5 + yOff, 90, ARENA_H - 90),
      vx: 0, vy: 0, aim: Math.PI,
      hp: s.hp, maxHp: s.maxHp,
      shields: s.shields, maxShields: s.maxShields,
      fire: s.fire, speed: prof.speed * 0.92 * (s.type === 'CORVETTE' ? enemyFactionCfg().fastSpeedMult : 1), range: prof.range,
      cdMax: prof.cd * 1.15, cd: rand(0.4, 0.1), projSpeed: prof.projSpeed,
      radius: prof.radius, sfx: prof.sfx, spread: prof.spread, splash: 0, preferRange: prof.preferRange,
      dashCd: 0, dashTime: 0, dashVx: 0, dashVy: 0, invuln: 0, hitFlash: 0
    });
  });

  const firstP = combat.units.find(u => u.side === 'P');
  combat.activeId = firstP ? firstP.id : null;
  openCombatOverlay('NAVAL ENGAGEMENT', 'REAL-TIME // WASD + MOUSE • Q/SHIFT ACTIVE • R-CLICK ORDERS • TAB SWAP');
  const nCmd = playerFleet.commander ? ` [${playerFleet.commander.name}: ${playerFleet.commander.aura}]` : '';
  combatLog(`Fleets engaged!${nCmd} Relay control calls in light patrol craft; eliminate the enemy fleet to win.`);
}

export function startGroundCombat(planet, attackerArmy, defenderSector) {
  const defenderArmy = defenderSector.armyId ? planet.armies[defenderSector.armyId] : null;
  const defRegs = defenderArmy ? JSON.parse(JSON.stringify(defenderArmy.regs)) :
    [makeRegiment('INFANTRY', 'E'), makeRegiment('SKIRMISHER', 'E')];

  const arena = generateCombatArena('GROUND', planet, defenderSector);
  const fortBonus = (defenderSector.fort || 0) * 2;
  const bombPenalty = planet.bombardment > 0 ? planet.bombardment * 8 : 0;

  state.combat = {
    kind: 'GROUND',
    planet,
    attackerArmy: JSON.parse(JSON.stringify(attackerArmy)),
    defenderSector,
    defenderArmy,
    theme: PLANET_THEMES[planet.id] || null,
    obstacles: arena.obstacles,
    objectives: arena.objectives,
    decorations: arena.decorations || [],
    layoutSeed: arena.seed,
    units: [],
    projectiles: [],
    particles: [],
    wrecks: [],
    shockwaves: [],
    floatTexts: [],
    strikes: [],
    batteries: [],
    log: [],
    winner: null,
    endReason: '',
    activeId: null,
    camX: ARENA_W * 0.25,
    camY: ARENA_H * 0.5,
    elapsed: 0
  };
  const combat = state.combat;

  attackerArmy.regs.forEach((r, i) => {
    const regCopy = JSON.parse(JSON.stringify(r));
    const prof = regCombatProfile(regCopy.type);
    const yOff = (i - (attackerArmy.regs.length - 1) / 2) * 68;
    const cmd = attackerArmy.commander;
    const cfg = playerFactionCfg();
    const fMult = cmd?.fireRateMult || 1;
    const sMult = (cmd?.speedMult || 1) * (regCopy.type === 'SKIRMISHER' ? cfg.fastSpeedMult : 1);
    const rMult = (cmd?.rangeMult || 1) * (hasDoctrine('G_BARRAGE') ? 1.10 : 1);
    const atkMult = hasDoctrine('G_BARRAGE') ? 1.15 : 1;
    combat.units.push({
      id: regCopy.id, side: 'P', reg: regCopy,
      x: 180, y: clamp(ARENA_H * 0.5 + yOff, 90, ARENA_H - 90),
      vx: 0, vy: 0, aim: 0,
      hp: regCopy.hp, maxHp: regCopy.maxHp,
      shields: 0, maxShields: 0,
      fire: Math.round(regCopy.atk * atkMult), def: regCopy.def || 10,
      speed: prof.speed * sMult, range: prof.range * rMult,
      cdMax: prof.cd / fMult, cd: 0, projSpeed: prof.projSpeed,
      radius: prof.radius, sfx: prof.sfx, spread: 1, splash: prof.splash, preferRange: prof.preferRange,
      dashCd: 0, dashTime: 0, dashVx: 0, dashVy: 0, invuln: 0, hitFlash: 0
    });
  });

  defRegs.forEach((r, i) => {
    r.def = (r.def || 10) + fortBonus;
    if (bombPenalty > 0) r.hp = Math.max(10, r.hp - bombPenalty);
    const prof = regCombatProfile(r.type);
    const yOff = (i - (defRegs.length - 1) / 2) * 68;
    combat.units.push({
      id: r.id, side: 'E', reg: r,
      x: ARENA_W - 200, y: clamp(ARENA_H * 0.5 + yOff, 90, ARENA_H - 90),
      vx: 0, vy: 0, aim: Math.PI,
      hp: r.hp, maxHp: r.maxHp,
      shields: 0, maxShields: 0,
      fire: r.atk, def: r.def,
      speed: prof.speed * 0.9 * (r.type === 'SKIRMISHER' ? enemyFactionCfg().fastSpeedMult : 1), range: prof.range,
      cdMax: prof.cd * 1.15, cd: rand(0.4, 0.1), projSpeed: prof.projSpeed,
      radius: prof.radius, sfx: prof.sfx, spread: 1, splash: prof.splash, preferRange: prof.preferRange,
      dashCd: 0, dashTime: 0, dashVx: 0, dashVy: 0, invuln: 0, hitFlash: 0
    });
  });

  if (planet.bombardment > 0) planet.bombardment = 0;

  const adjSectors = (defenderSector.links || []).map(id => planet.sectors.find(s => s.id === id)).filter(Boolean);
  [defenderSector, ...adjSectors].forEach(s => {
    if (s.type === 'BATTERY' && (s.owner === 'P' || s.owner === 'E')) {
      combat.batteries.push({ owner: s.owner, name: s.name, timer: 2.5 });
    }
  });
  const batNote = combat.batteries.length ? ` • BATTERY SUPPORT (${combat.batteries.map(b => b.owner).join('/')})` : '';
  const firstP = combat.units.find(u => u.side === 'P');
  combat.activeId = firstP ? firstP.id : null;
  openCombatOverlay(`GROUND ASSAULT // ${defenderSector.name.toUpperCase()}`, `${(combat.theme?.name || planet.name).toUpperCase()}${batNote} • WASD + MOUSE • Q/SHIFT ACTIVE • R-CLICK ORDERS • TAB SWAP`);
  combatLog(bombPenalty > 0
    ? `Orbital strike weakened defenders (-${bombPenalty} HP)! Secure relay points for militia support. AI squads use terrain; artillery holds long range.`
    : 'Assault underway! Secure relay points for militia support. AI squads use terrain and formations; artillery holds long range.');
}

export function combatLog(msg) {
  const combat = state.combat;
  if (!combat) return;
  combat.log.unshift(msg);
  if (combat.log.length > 30) combat.log.pop();
  if (combat.headless) return;
  const infoEl = document.getElementById('combatInfo');
  if (infoEl) infoEl.textContent = msg;
}

export function renderCombatRoster() {
  const combat = state.combat;
  if (!combat || combat.headless) return;
  const roster = document.getElementById('combatRoster');
  if (!roster) return;
  roster.innerHTML = '';
  const allies = combat.units.filter(u => u.side === 'P');
  allies.forEach((u, idx) => {
    const chip = document.createElement('button');
    const dead = u.hp <= 0 || u.fled;
    chip.className = 'unit-chip' + (u.id === combat.activeId ? ' active' : '') + (dead ? ' dead' : '');
    chip.disabled = dead;
    const ref = combat.kind === 'NAVAL' ? u.ship : u.reg;
    const name = ref?.name || 'Unit';
    const vRank = ref?.vetRank || 0;
    const vTag = vRank >= 2 ? ' <span style="color:#fbbf24">★★</span>' : vRank === 1 ? ' <span style="color:#38bdf8">★</span>' : '';
    const pct = Math.max(0, Math.min(100, Math.round((u.hp / Math.max(1, u.maxHp)) * 100)));
    chip.innerHTML = `<span>[${idx + 1}] ${name}${vTag}</span><span class="unit-chip-hp"><div style="width:${pct}%"></div></span>`;
    chip.onclick = () => hotSwapUnit(u.id);
    roster.appendChild(chip);
  });
}

export function hotSwapUnit(id) {
  const combat = state.combat;
  if (!combat || combat.winner) return;
  const u = combat.units.find(x => x.id === id && x.side === 'P' && x.hp > 0 && !x.fled);
  if (!u || u.id === combat.activeId) return;
  combat.activeId = u.id;
  sfx.play('swap', 0.65);
  renderCombatRoster();
  combatLog(`Switched command to ${combat.kind === 'NAVAL' ? u.ship.name : u.reg.name}.`);
}

export function cycleHotSwap(dir = 1) {
  const combat = state.combat;
  if (!combat || combat.winner) return;
  const alive = combat.units.filter(u => u.side === 'P' && u.hp > 0 && !u.fled);
  if (alive.length <= 1) return;
  const cur = alive.findIndex(u => u.id === combat.activeId);
  const next = alive[(cur + dir + alive.length) % alive.length];
  if (next) hotSwapUnit(next.id);
}

export function openCombatOverlay(title, sub) {
  sfx.init();
  cInput.keys = {};
  document.getElementById('combat').classList.add('show');
  document.getElementById('combatTitle').textContent = title;
  document.getElementById('combatSub').textContent = sub;
  document.getElementById('btnEndCombat').style.display = 'none';
  document.getElementById('btnAutoResolve').style.display = '';
  const touchEl = document.getElementById('combatTouch');
  if (touchEl) touchEl.classList.add('active');
  renderCombatRoster();
  resizeCombatCanvas();
}

export function resizeCombatCanvas() {
  const cCanvas = document.getElementById('combatCanvas');
  if (!cCanvas || !cCanvas.parentElement) return;
  cCanvas.width = cCanvas.clientWidth || cCanvas.parentElement.clientWidth;
  cCanvas.height = cCanvas.clientHeight || (cCanvas.parentElement.clientHeight - 120);
}

export function combatCamTransform() {
  const combat = state.combat;
  const cCanvas = document.getElementById('combatCanvas');
  const w = cCanvas.width, h = cCanvas.height;
  const zoom = Math.min(w / 920, h / 600, 1.15);
  const cx = clamp(combat.camX, (w / 2) / zoom, ARENA_W - (w / 2) / zoom);
  const cy = clamp(combat.camY, (h / 2) / zoom, ARENA_H - (h / 2) / zoom);
  return {
    w, h, zoom,
    cx: ARENA_W < w / zoom ? ARENA_W / 2 : cx,
    cy: ARENA_H < h / zoom ? ARENA_H / 2 : cy
  };
}

export function combatScreenToWorld(sx, sy) {
  const cam = combatCamTransform();
  return {
    x: cam.cx + (sx - cam.w / 2) / cam.zoom,
    y: cam.cy + (sy - cam.h / 2) / cam.zoom
  };
}

export function spawnCombatParticles(x, y, color, count = 8, speed = 130, life = 0.4) {
  const combat = state.combat;
  if (!combat) return;
  for (let i = 0; i < count; i++) {
    if (combat.particles.length > 160) combat.particles.shift();
    const a = Math.random() * Math.PI * 2;
    const sp = speed * rand(1.1, 0.3);
    combat.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color, r: rand(3.5, 1.5), life, maxLife: life });
  }
}

export function fireCombatUnit(u, ang) {
  const combat = state.combat;
  u.aim = ang;
  u.cd = u.cdMax;
  sfx.play(u.sfx, u.id === combat.activeId ? 0.85 : 0.35, u.side);
  u.muzzleFlash = 0.095;
  u.recoil = 1;

  const count = u.spread || 1;
  const fan = count > 1 ? 0.24 : 0;
  for (let i = 0; i < count; i++) {
    const a = ang + (count > 1 ? ((i / (count - 1)) - 0.5
