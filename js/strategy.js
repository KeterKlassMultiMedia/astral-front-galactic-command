
// ============================================================================
// STRATEGIC CAMPAIGN LAYER, ACTIONS, AI TURN & SAVE/LOAD
// ============================================================================
import { state, irand, pick, uid, log, showCycleToast } from './state.js';
import {
  SHIP_TYPES, REG_TYPES, BUILDING_TYPES, FACTIONS, DOCTRINES,
  PLANET_THEMES, ADMIRAL_POOL, MARSHAL_POOL
} from './data.js';
import { sfx } from './audio.js';
import {
  hasDoctrine, playerFactionCfg, enemyFactionCfg, transportCapacity,
  getRegCost, refreshIncome, applyIncome, canAfford, pay, findPlanet,
  fleetPower, armyPower, gravityLockedBy, getFleetsAt, updateSystemOwner,
  summarizeShips, selectAllUnitsForCurrent, summarizeRegs, fleetCargoRegs,
  refreshSystemIntel, performCycleRefit, fleetRepairCost, armyRepairCost,
  transportFreeSlots
} from './economy.js';

let uiHooks = {
  render: () => {},
  startNavalCombat: () => {},
  startGroundCombat: () => {}
};

export function registerStrategyHooks(hooks) {
  uiHooks = { ...uiHooks, ...hooks };
}

export const SAVE_KEY = 'astralFrontSaveV2';

// ============================================================================
// GENERATORS
// ============================================================================
export function makeShip(type, owner) {
  const G = state.G;
  const t = SHIP_TYPES[type];
  const isP = owner === 'P';
  const cfg = isP ? playerFactionCfg() : FACTIONS[G?.faction === 'IRON_HEGEMONY' ? 'SOLAR_VANGUARD' : 'IRON_HEGEMONY'];
  const prefix = isP ? cfg.shipPrefix : (G?.faction === 'IRON_HEGEMONY' ? 'SNS ' : 'IHS ');
  const hp = Math.round(t.hp * cfg.hullMult);
  const shdMult = cfg.shieldMult * (isP && hasDoctrine('N_SHIELDS') ? 1.20 : 1.0);
  const shields = Math.round(t.shields * shdMult);
  return {
    id: uid('ship'),
    type,
    name: prefix + t.name,
    hp, maxHp: hp,
    shields, maxShields: shields,
    fire: t.fire,
    kills: 0,
    battles: 0,
    vetRank: 0,
    cargo: []
  };
}

export function makeRegiment(type, owner) {
  const G = state.G;
  const t = REG_TYPES[type];
  const isP = owner === 'P';
  const cfg = isP ? playerFactionCfg() : FACTIONS[G?.faction === 'IRON_HEGEMONY' ? 'SOLAR_VANGUARD' : 'IRON_HEGEMONY'];
  const hullBonus = (type === 'MECH' ? cfg.hullMult : 1.0) * (isP && hasDoctrine('G_ARMOR') ? 1.20 : 1.0);
  const hp = Math.round(t.hp * hullBonus);
  const def = t.def + (isP && hasDoctrine('G_ARMOR') ? 3 : 0);
  return {
    id: uid('reg'),
    type,
    name: t.name,
    owner,
    hp, maxHp: hp,
    atk: t.atk, def, range: t.range,
    kills: 0,
    battles: 0,
    vetRank: 0
  };
}

export function makeFleet(owner, systemId, ships) {
  const cfg = owner === 'P' ? playerFactionCfg() : enemyFactionCfg();
  return {
    id: uid('fleet'),
    name: cfg.fleetName,
    owner,
    systemId,
    ships: ships || [],
    moved: false,
    acted: false
  };
}

export function makePlanet(id, name, owner) {
  const biome = (PLANET_THEMES[id] && PLANET_THEMES[id].biome) || 'BARREN';
  let sectors = [], links = {};

  if (biome === 'BARREN' || biome === 'ICE') {
    sectors = [
      { id: id + '-land', name: name + ' Dropzone', type: 'LANDING',   owner, x: 28, y: 52, fort: 1, armyId: null },
      { id: id + '-port', name: name + ' Starport', type: 'SPACEPORT', owner, x: 48, y: 28, fort: 2, armyId: null },
      { id: id + '-hive', name: name + ' Forge',    type: 'HIVE',      owner, x: 50, y: 72, fort: 1, armyId: null },
      { id: id + '-cap',  name: name + ' Citadel',  type: 'CAPITAL',   owner, x: 74, y: 48, fort: 3, armyId: null }
    ];
    links = {
      [id + '-land']: [id + '-port', id + '-hive'],
      [id + '-port']: [id + '-land', id + '-hive', id + '-cap'],
      [id + '-hive']: [id + '-land', id + '-port', id + '-cap'],
      [id + '-cap']:  [id + '-port', id + '-hive']
    };
  } else if (biome === 'DESERT' || biome === 'JUNGLE' || biome === 'DARK') {
    sectors = [
      { id: id + '-land', name: name + ' Dropzone', type: 'LANDING',   owner, x: 24, y: 50, fort: 1, armyId: null },
      { id: id + '-port', name: name + ' Starport', type: 'SPACEPORT', owner, x: 42, y: 28, fort: 2, armyId: null },
      { id: id + '-sh',   name: name + ' Dome',     type: 'SHIELD',    owner, x: 44, y: 72, fort: 2, armyId: null },
      { id: id + '-hive', name: name + ' Forge',    type: 'HIVE',      owner, x: 64, y: 62, fort: 1, armyId: null },
      { id: id + '-cap',  name: name + ' Citadel',  type: 'CAPITAL',   owner, x: 76, y: 36, fort: 3, armyId: null }
    ];
    links = {
      [id + '-land']: [id + '-port', id + '-sh'],
      [id + '-port']: [id + '-land', id + '-sh', id + '-cap'],
      [id + '-sh']:   [id + '-land', id + '-port', id + '-hive'],
      [id + '-hive']: [id + '-sh', id + '-cap'],
      [id + '-cap']:  [id + '-port', id + '-hive']
    };
  } else if (biome === 'URBAN') {
    sectors = [
      { id: id + '-land', name: name + ' Dropzone', type: 'LANDING',   owner, x: 20, y: 52, fort: 2, armyId: null },
      { id: id + '-port', name: name + ' Starport', type: 'SPACEPORT', owner, x: 36, y: 28, fort: 3, armyId: null },
      { id: id + '-sh',   name: name + ' Dome',     type: 'SHIELD',    owner, x: 38, y: 74, fort: 3, armyId: null },
      { id: id + '-bat',  name: name + ' Battery',  type: 'BATTERY',   owner, x: 55, y: 36, fort: 4, armyId: null },
      { id: id + '-bat2', name: name + ' Bastion',  type: 'BATTERY',   owner, x: 56, y: 66, fort: 4, armyId: null },
      { id: id + '-hive', name: name + ' Forge',    type: 'HIVE',      owner, x: 70, y: 50, fort: 3, armyId: null },
      { id: id + '-cap',  name: name + ' Citadel',  type: 'CAPITAL',   owner, x: 82, y: 48, fort: 5, armyId: null }
    ];
    links = {
      [id + '-land']: [id + '-port', id + '-sh'],
      [id + '-port']: [id + '-land', id + '-bat'],
      [id + '-sh']:   [id + '-land', id + '-bat2'],
      [id + '-bat']:  [id + '-port', id + '-bat2', id + '-hive'],
      [id + '-bat2']: [id + '-sh', id + '-bat', id + '-hive'],
      [id + '-hive']: [id + '-bat', id + '-bat2', id + '-cap'],
      [id + '-cap']:  [id + '-hive']
    };
  } else {
    sectors = [
      { id: id + '-land', name: name + ' Dropzone', type: 'LANDING',   owner, x: 24, y: 54, fort: 1, armyId: null },
      { id: id + '-port', name: name + ' Starport', type: 'SPACEPORT', owner, x: 40, y: 30, fort: 2, armyId: null },
      { id: id + '-bat',  name: name + ' Battery',  type: 'BATTERY',   owner, x: 60, y: 26, fort: 2, armyId: null },
      { id: id + '-sh',   name: name + ' Dome',     type: 'SHIELD',    owner, x: 48, y: 70, fort: 2, armyId: null },
      { id: id + '-hive', name: name + ' Forge',    type: 'HIVE',      owner, x: 70, y: 60, fort: 1, armyId: null },
      { id: id + '-cap',  name: name + ' Citadel',  type: 'CAPITAL',   owner, x: 78, y: 40, fort: 3, armyId: null }
    ];
    links = {
      [id + '-land']: [id + '-port', id + '-sh'],
      [id + '-port']: [id + '-land', id + '-bat', id + '-sh'],
      [id + '-bat']:  [id + '-port', id + '-hive', id + '-cap'],
      [id + '-sh']:   [id + '-land', id + '-port', id + '-hive'],
      [id + '-hive']: [id + '-sh', id + '-bat', id + '-cap'],
      [id + '-cap']:  [id + '-bat', id + '-hive']
    };
  }
  sectors.forEach(s => { s.links = links[s.id] || []; });

  const armies = {};
  const garrison = {
    id: uid('army'),
    name: name + ' Garrison',
    owner,
    sectorId: id + '-cap',
    moved: false,
    regs: [
      makeRegiment('INFANTRY', owner),
      makeRegiment('INFANTRY', owner),
      makeRegiment('SKIRMISHER', owner),
      makeRegiment('ARTILLERY', owner)
    ]
  };
  armies[garrison.id] = garrison;
  sectors.find(s => s.id === id + '-cap').armyId = garrison.id;

  return {
    id, name,
    orbital: owner,
    blockaded: false,
    bombardment: 0,
    sectors,
    armies,
    turn: 1
  };
}

export function makeSystem(id, name, x, y, owner) {
  const planet = makePlanet(id + '-p', name + ' Prime', owner);
  return {
    id, name, x, y,
    owner,
    intel: owner === 'P' ? 'VISIBLE' : (Math.random() < 0.4 ? 'SURVEYED' : 'UNKNOWN'),
    lanes: [],
    planets: [planet],
    lastEnemyPower: null,
    lastSeenTurn: owner === 'P' ? 1 : null
  };
}

export function createCampaign(quick = false, faction = 'SOLAR_VANGUARD') {
  const isHeg = faction === 'IRON_HEGEMONY';
  const wOwn = isHeg ? 'E' : 'P';
  const eOwn = isHeg ? 'P' : 'E';
  state.G = { faction, doctrines: [] };

  const systems = [
    makeSystem('s0', 'Helios',   18, 48, wOwn),
    makeSystem('s1', 'Aurelia',  32, 28, wOwn),
    makeSystem('s2', 'Kestrel',  48, 18, 'N'),
    makeSystem('s3', 'Ferrum',   68, 32, eOwn),
    makeSystem('s4', 'Veridia',  55, 52, 'N'),
    makeSystem('s5', 'Obsidian', 78, 58, eOwn),
    makeSystem('s6', 'Nyx',      40, 72, 'N'),
    makeSystem('s7', 'Vulkite',  22, 78, 'N'),
    makeSystem('s8', 'Citadel',  88, 40, eOwn),
    makeSystem('s9', 'Outpost',  12, 30, wOwn)
  ];

  const lanePairs = [
    ['s0', 's1'], ['s0', 's9'], ['s0', 's4'], ['s1', 's2'], ['s1', 's4'],
    ['s2', 's3'], ['s2', 's4'], ['s3', 's5'], ['s3', 's8'], ['s4', 's5'],
    ['s4', 's6'], ['s5', 's8'], ['s6', 's7'], ['s6', 's5'], ['s7', 's0']
  ];
  lanePairs.forEach(([a, b]) => {
    const A = systems.find(s => s.id === a), B = systems.find(s => s.id === b);
    if (A && B) { A.lanes.push(b); B.lanes.push(a); }
  });

  if (quick) {
    systems.forEach(s => { if (s.intel === 'UNKNOWN') s.intel = 'SURVEYED'; });
  }

  const pHome = isHeg ? 's8' : 's0';
  const pSec  = isHeg ? 's3' : 's1';
  const eHome = isHeg ? 's0' : 's8';
  const eSec  = isHeg ? 's1' : 's3';

  const fleets = {};
  const pf1 = makeFleet('P', pHome, [
    makeShip('CRUISER', 'P'), makeShip('CORVETTE', 'P'), makeShip('TRANSPORT', 'P')
  ]);
  pf1.name = isHeg ? 'Iron Armada' : 'Solar Squadron';
  pf1.commander = { ...ADMIRAL_POOL[0] };
  pf1.ships[2].cargo = [makeRegiment('INFANTRY', 'P'), makeRegiment('MECH', 'P')];
  fleets[pf1.id] = pf1;

  const pf2 = makeFleet('P', pSec, quick
    ? [makeShip('CRUISER', 'P'), makeShip('CORVETTE', 'P'), makeShip('CORVETTE', 'P')]
    : [makeShip('CORVETTE', 'P'), makeShip('CORVETTE', 'P')]
  );
  fleets[pf2.id] = pf2;

  const ef1 = makeFleet('E', quick ? 's4' : eSec, [
    makeShip('CRUISER', 'E'), makeShip('CORVETTE', 'E')
  ]);
  fleets[ef1.id] = ef1;

  const ef2 = makeFleet('E', eHome, [
    makeShip('CARRIER', 'E'), makeShip('CRUISER', 'E'), makeShip('TRANSPORT', 'E')
  ]);
  ef2.ships[2].cargo = [makeRegiment('INFANTRY', 'E'), makeRegiment('INFANTRY', 'E')];
  fleets[ef2.id] = ef2;

  const homeSys = systems.find(s => s.id === pHome);
  const homePlanet = homeSys.planets[0];
  homePlanet.sectors.forEach(s => { s.owner = 'P'; });
  homePlanet.orbital = 'P';
  updateSystemOwner(homeSys);

  const enemyHomeSys = systems.find(s => s.id === eHome);
  const enemyHomePlanet = enemyHomeSys.planets[0];
  enemyHomePlanet.sectors.forEach(s => { s.owner = 'E'; });
  enemyHomePlanet.orbital = 'E';
  updateSystemOwner(enemyHomeSys);

  const exp = {
    id: uid('army'),
    name: isHeg ? 'Hegemony Legion' : 'Vanguard Expedition',
    commander: { ...MARSHAL_POOL[0] },
    owner: 'P',
    sectorId: homePlanet.sectors.find(s => s.type === 'SPACEPORT').id,
    moved: false,
    regs: [
      makeRegiment('INFANTRY', 'P'),
      makeRegiment('INFANTRY', 'P'),
      makeRegiment('SKIRMISHER', 'P'),
      makeRegiment('MECH', 'P'),
      makeRegiment('ARTILLERY', 'P')
    ]
  };
  homePlanet.armies[exp.id] = exp;
  homePlanet.sectors.find(s => s.type === 'SPACEPORT').armyId = exp.id;
  homePlanet.orbital = 'P';

  return {
    turn: 1,
    faction,
    difficulty: state.chosenDifficulty,
    doctrines: [],
    stats: { battlesWon: 0, shipsSunk: 0, sectorsCaptured: 0, doctrinesUnlocked: 0 },
    resources: quick
      ? { P: { c: 280, a: 200, m: 140 }, E: { c: 240, a: 180, m: 120 } }
      : { P: { c: 140, a: 90,  m: 70  }, E: { c: 160, a: 110, m: 80  } },
    income: { P: { c: 0, a: 0, m: 0 }, E: { c: 0, a: 0, m: 0 } },
    systems,
    fleets,
    activePlanetId: homePlanet.id,
    selectedSystemId: homeSys.id
  };
}

// ============================================================================
// DOCTRINES, REPAIRS & COMMANDERS
// ============================================================================
export function unlockDoctrine(id) {
  const G = state.G;
  if (!G || hasDoctrine(id)) return;
  const all = [...DOCTRINES.NAVAL, ...DOCTRINES.GROUND, ...DOCTRINES.LOGISTICS];
  const doc = all.find(d => d.id === id);
  if (!doc) return;
  if (!canAfford('P', doc.cost)) { log('Insufficient resources for doctrine.'); return; }
  pay('P', doc.cost);
  G.doctrines.push(id);
  if (G.stats) G.stats.doctrinesUnlocked++;
  if (id === 'N_SHIELDS') {
    Object.values(G.fleets).filter(f => f.owner === 'P').forEach(f => {
      f.ships.forEach(sh => {
        const add = Math.round(sh.maxShields * 0.20);
        sh.maxShields += add;
        sh.shields += add;
      });
    });
  }
  if (id === 'G_ARMOR') {
    G.systems.forEach(sys => sys.planets.forEach(p => {
      Object.values(p.armies).filter(a => a.owner === 'P').forEach(a => {
        a.regs.forEach(r => {
          const add = Math.round(r.maxHp * 0.20);
          r.maxHp += add;
          r.hp += add;
          r.def = (r.def || 10) + 3;
        });
      });
    }));
  }
  refreshIncome();
  log(`Doctrine unlocked: ${doc.name} (${doc.desc}).`);
  uiHooks.render();
}

export function repairFleet(fleetId) {
  const f = state.G.fleets[fleetId];
  if (!f || f.owner !== 'P') return;
  const cost = fleetRepairCost(f);
  if (!cost) return;
  if (!canAfford('P', cost)) { log('Insufficient resources for fleet repair.'); return; }
  pay('P', cost);
  f.ships.forEach(sh => { sh.hp = sh.maxHp; sh.shields = sh.maxShields; });
  log(`${f.name} repaired to full hull and shield integrity.`);
  uiHooks.render();
}

export function repairArmy(planetId, armyId) {
  const found = findPlanet(planetId);
  if (!found) return;
  const army = found.planet.armies[armyId];
  if (!army || army.owner !== 'P') return;
  const cost = armyRepairCost(army);
  if (!cost) return;
  if (!canAfford('P', cost)) { log('Insufficient resources for field repair.'); return; }
  pay('P', cost);
  army.regs.forEach(r => { r.hp = r.maxHp; });
  log(`${army.name} reinforced to full strength.`);
  uiHooks.render();
}

export function assignFleetCommander(fleetId) {
  const f = state.G.fleets[fleetId];
  if (!f || f.owner !== 'P' || f.commander) return;
  const cost = { c: 50, a: 0, m: 0 };
  if (!canAfford('P', cost)) { log('Need 50 CRD to commission a Fleet Admiral.'); return; }
  pay('P', cost);
  f.commander = { ...pick(ADMIRAL_POOL) };
  log(`${f.commander.name} (${f.commander.aura}) took command of ${f.name}.`);
  uiHooks.render();
}

export function assignArmyCommander(planetId, armyId) {
  const found = findPlanet(planetId);
  if (!found) return;
  const army = found.planet.armies[armyId];
  if (!army || army.owner !== 'P' || army.commander) return;
  const cost = { c: 50, a: 0, m: 0 };
  if (!canAfford('P', cost)) { log('Need 50 CRD to commission a Ground Marshal.'); return; }
  pay('P', cost);
  army.commander = { ...pick(MARSHAL_POOL) };
  log(`${army.commander.name} (${army.commander.aura}) took command of ${army.name}.`);
  uiHooks.render();
}

// ============================================================================
// SPACE ACTIONS
// ============================================================================
export function mergePlayerFleets(systemId) {
  const G = state.G;
  const pFleets = getFleetsAt(systemId).filter(f => f.owner === 'P');
  if (pFleets.length < 2) return;
  const main = pFleets[0];
  for (let i = 1; i < pFleets.length; i++) {
    main.ships.push(...pFleets[i].ships);
    if (!main.commander && pFleets[i].commander) main.commander = pFleets[i].commander;
    if (pFleets[i].moved) main.moved = true;
    if (pFleets[i].acted) main.acted = true;
    delete G.fleets[pFleets[i].id];
  }
  state.selected = { type: 'fleet', id: main.id };
  selectAllUnitsForCurrent();
  log(`Merged squadrons into ${main.name} (${main.ships.length} ships).`);
  uiHooks.render();
}

export function moveFleet(fleetId, targetSysId) {
  const G = state.G;
  const f = G.fleets[fleetId];
  if (!f || f.owner !== 'P' || f.moved) return;
  const home = G.systems.find(s => s.id === f.systemId);
  if (!home || !home.lanes.includes(targetSysId)) return;
  const pinnedBy = gravityLockedBy(f);
  if (pinnedBy) { log(`${f.name} is held by ${pinnedBy} and cannot jump out.`); return; }

  const chosen = f.ships.filter(sh => state.selectedUnitIds.has(sh.id));
  let movingFleet = f;
  if (chosen.length > 0 && chosen.length < f.ships.length) {
    f.ships = f.ships.filter(sh => !state.selectedUnitIds.has(sh.id));
    movingFleet = makeFleet('P', targetSysId, chosen);
    movingFleet.name = 'Solar Task Force';
    movingFleet.moved = true;
    G.fleets[movingFleet.id] = movingFleet;
    state.selected = { type: 'fleet', id: movingFleet.id };
    selectAllUnitsForCurrent();
    log(`Detached ${chosen.length} ship(s) (${summarizeShips(chosen)}) from ${f.name}.`);
  } else {
    f.systemId = targetSysId;
    f.moved = true;
  }
  const target = G.systems.find(s => s.id === targetSysId);
  if (target.intel === 'UNKNOWN') {
    target.intel = 'SURVEYED';
    log(`Fleet surveyed ${target.name}.`);
  }
  if (target.intel === 'SURVEYED') {
    target.intel = 'VISIBLE';
  }
  refreshSystemIntel();

  sfx.play('jump');
  state.jumpTrails.push({ x1: home.x, y1: home.y, x2: target.x, y2: target.y, life: 1.5, maxLife: 1.5, color: '#38bdf8' });
  G.selectedSystemId = targetSysId;
  if (target.planets.length) G.activePlanetId = target.planets[0].id;
  const enemies = getFleetsAt(targetSysId).filter(ef => ef.owner === 'E');
  if (enemies.length) {
    uiHooks.startNavalCombat(movingFleet, enemies[0]);
  } else {
    log(`${movingFleet.name} jumped to ${target.name} (${movingFleet.ships.length} ships).`);
    uiHooks.render();
  }
}

export function buildShip(systemId, type) {
  const G = state.G;
  const sys = G.systems.find(s => s.id === systemId);
  if (!sys) return;
  const hasPort = sys.planets.some(p => !p.blockaded && p.sectors.some(s => s.type === 'SPACEPORT' && s.owner === 'P'));
  if (!hasPort) { log('Need a friendly unblocked Spaceport.'); return; }
  if (getFleetsAt(systemId).some(f => f.owner === 'E')) { log('Cannot build while enemy fleet present.'); return; }
  const cost = SHIP_TYPES[type].cost;
  if (!canAfford('P', cost)) { log('Insufficient resources.'); return; }
  pay('P', cost);
  let fleet = getFleetsAt(systemId).find(f => f.owner === 'P');
  if (!fleet) {
    fleet = makeFleet('P', systemId, []);
    G.fleets[fleet.id] = fleet;
  }
  fleet.ships.push(makeShip(type, 'P'));
  log(`Built ${SHIP_TYPES[type].name} at ${sys.name}.`);
  uiHooks.render();
}

export function toggleBlockade(fleetId, planetId) {
  const f = state.G.fleets[fleetId];
  const found = findPlanet(planetId);
  if (!f || !found || f.systemId !== found.sys.id) return;
  if (getFleetsAt(found.sys.id).some(ef => ef.owner === 'E')) {
    log('Enemy fleet prevents orbital supremacy.');
    return;
  }
  found.planet.blockaded = !found.planet.blockaded;
  refreshIncome();
  log(found.planet.blockaded
    ? `Blockade established over ${found.planet.name}.`
    : `Blockade lifted over ${found.planet.name}.`);
  uiHooks.render();
}

export function bombard(fleetId, planetId) {
  const f = state.G.fleets[fleetId];
  const found = findPlanet(planetId);
  if (!f || !found || f.acted || f.systemId !== found.sys.id) return;
  if (getFleetsAt(found.sys.id).some(ef => ef.owner === 'E')) return;
  f.acted = true;
  sfx.play('bombard');
  const hasShield = found.planet.sectors.some(s => s.type === 'SHIELD' && s.owner !== 'P');
  const charges = hasShield ? 1 : 2;
  found.planet.bombardment += charges;
  found.planet.bombardmentFresh = true;
  log(`Orbital bombardment of ${found.planet.n
