// ============================================================================
// CANVAS RENDERING (GALAXY, PLANET, DOCTRINE, COMBAT SPRITES) & SIDE INSPECTOR
// ============================================================================
import { state, clamp } from './state.js';
import {
  SHIP_TYPES, REG_TYPES, SECTOR_TYPES, BUILDING_TYPES, DOCTRINES,
  PLANET_THEMES, ARENA_W, ARENA_H
} from './data.js';
import {
  hasDoctrine, playerFactionCfg, transportCapacity, getRegCost,
  canAfford, findPlanet, fleetPower, armyPower, getFleetsAt,
  summarizeShipsCompact, summarizeShips, selectAllUnitsForCurrent,
  summarizeRegs, summarizeRegsCompact, fleetCargoRegs, ownerBadgeClass,
  fleetRepairCost, armyRepairCost, transportFreeSlots
} from './economy.js';
import {
  unlockDoctrine, repairFleet, repairArmy, assignFleetCommander,
  assignArmyCommander, mergePlayerFleets, buildShip, toggleBlockade,
  bombard, dropForces, embarkForces, buildSectorStructure, recruit
} from './strategy.js';
import { combatCamTransform, getUnitActiveInfo } from './combat.js';

const STARS = Array.from({ length: 160 }, () => ({
  x: Math.random(),
  y: Math.random(),
  r: Math.random() * 1.4 + 0.3,
  a: Math.random() * 0.6 + 0.2,
  speed: Math.random() * 0.8 + 0.2
}));

// ============================================================================
// SCI-FI UNIT SPRITES
// ============================================================================
function spriteFaction(side) {
  return side === 'P'
    ? { glow: '#38d9ff', trim: '#9beeff', dark: '#12344a', hull: '#315b73' }
    : { glow: '#ff536f', trim: '#ffb0bd', dark: '#491b2b', hull: '#743044' };
}

function spritePolygon(ctx, pts, fill, stroke = '#07111f', line = 1.5) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = line;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function spriteDetailLine(ctx, x1, y1, x2, y2, color, width = 1, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function spriteRivet(ctx, x, y, radius, color) {
  ctx.save();
  ctx.fillStyle = '#07111a';
  ctx.beginPath();
  ctx.arc(x, y, radius * 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x - radius * 0.2, y - radius * 0.2, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function spriteVent(ctx, x, y, w, h, color, count = 3) {
  ctx.save();
  ctx.fillStyle = 'rgba(3,10,18,.78)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.65, h * 0.12);
  for (let i = 1; i <= count; i++) {
    const xx = x + w * i / (count + 1);
    ctx.beginPath();
    ctx.moveTo(xx, y + h * 0.18);
    ctx.lineTo(xx, y + h * 0.82);
    ctx.stroke();
  }
  ctx.restore();
}

function spriteArmorPanel(ctx, pts, fill, edge) {
  spritePolygon(ctx, pts, fill, 'rgba(4,12,22,.9)', 0.9);
  ctx.save();
  ctx.strokeStyle = edge;
  ctx.globalAlpha = 0.58;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(pts[0][0] * 0.88 + pts[1][0] * 0.12, pts[0][1] * 0.88 + pts[1][1] * 0.12);
  ctx.lineTo(pts[1][0] * 0.72 + pts[2][0] * 0.28, pts[1][1] * 0.72 + pts[2][1] * 0.28);
  ctx.stroke();
  ctx.restore();
}

export function drawNavalSprite(ctx, u) {
  const f = spriteFaction(u.side), r = u.radius, type = u.ship?.type || 'CORVETTE';
  ctx.save();
  ctx.shadowColor = f.glow;
  ctx.shadowBlur = 11;
  ctx.fillStyle = f.glow;
  ctx.globalAlpha = 0.72;
  for (const yy of [-r * 0.34, r * 0.34]) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.72, yy - r * 0.12);
    ctx.lineTo(-r * 1.48, yy - r * 0.22);
    ctx.lineTo(-r * 1.48, yy + r * 0.22);
    ctx.lineTo(-r * 0.72, yy + r * 0.12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  if (type === 'CARRIER') {
    spritePolygon(ctx, [[-r * 1.12, -r * 0.52], [-r * 0.48, -r * 0.9], [r * 0.88, -r * 0.72], [r * 1.25, 0], [r * 0.88, r * 0.72], [-r * 0.48, r * 0.9], [-r * 1.12, r * 0.52]], f.dark);
    spritePolygon(ctx, [[-r * 0.68, -r * 0.57], [r * 0.72, -r * 0.48], [r * 1.02, 0], [r * 0.72, r * 0.48], [-r * 0.68, r * 0.57]], f.hull);
    ctx.fillStyle = '#091827';
    ctx.fillRect(-r * 0.55, -r * 0.27, r * 1.45, r * 0.54);
    ctx.strokeStyle = f.trim;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-r * 0.55, -r * 0.27, r * 1.45, r * 0.54);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = f.glow; ctx.fillRect(-r * 0.38 + i * r * 0.34, -r * 0.16, r * 0.18, r * 0.32); }
    spritePolygon(ctx, [[-r * 0.18, -r * 0.25], [r * 0.28, -r * 0.25], [r * 0.48, 0], [r * 0.28, r * 0.25], [-r * 0.18, r * 0.25]], '#a8d5e5');
    ctx.strokeStyle = f.glow;
    ctx.beginPath();
    ctx.moveTo(-r * 0.42, 0);
    ctx.lineTo(r * 0.82, 0);
    ctx.stroke();
  } else if (type === 'CRUISER') {
    spritePolygon(ctx, [[-r * 1.12, -r * 0.58], [-r * 0.38, -r * 0.92], [r * 0.88, -r * 0.66], [r * 1.28, 0], [r * 0.88, r * 0.66], [-r * 0.38, r * 0.92], [-r * 1.12, r * 0.58]], f.dark);
    spritePolygon(ctx, [[-r * 0.82, -r * 0.48], [r * 0.72, -r * 0.5], [r * 1.08, 0], [r * 0.72, r * 0.5], [-r * 0.82, r * 0.48], [-r * 0.5, 0]], f.hull);
    spritePolygon(ctx, [[-r * 0.2, -r * 0.62], [r * 0.48, -r * 0.42], [r * 0.72, 0], [r * 0.48, r * 0.42], [-r * 0.2, r * 0.62], [-r * 0.42, 0]], '#7f9eaf');
    for (const yy of [-r * 0.66, r * 0.66]) { ctx.fillStyle = f.trim; ctx.fillRect(-r * 0.1, yy - r * 0.08, r * 0.72, r * 0.16); }
    ctx.fillStyle = f.glow;
    ctx.fillRect(r * 0.58, -r * 0.09, r * 0.48, r * 0.18);
  } else if (type === 'TRANSPORT') {
    spritePolygon(ctx, [[-r * 1.05, -r * 0.62], [-r * 0.52, -r * 0.82], [r * 0.86, -r * 0.58], [r * 1.12, 0], [r * 0.86, r * 0.58], [-r * 0.52, r * 0.82], [-r * 1.05, r * 0.62]], f.dark);
    spritePolygon(ctx, [[-r * 0.78, -r * 0.5], [r * 0.7, -r * 0.44], [r * 0.96, 0], [r * 0.7, r * 0.44], [-r * 0.78, r * 0.5]], f.hull);
    ctx.fillStyle = '#0b1c2a';
    ctx.fillRect(-r * 0.38, -r * 0.29, r * 0.92, r * 0.58);
    ctx.strokeStyle = f.trim;
    ctx.lineWidth = 1;
    ctx.strokeRect(-r * 0.38, -r * 0.29, r * 0.92, r * 0.58);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = f.glow; ctx.fillRect(-r * 0.22 + i * r * 0.25, -r * 0.12, r * 0.1, r * 0.24); }
  } else if (type === 'INTERDICTOR') {
    spritePolygon(ctx, [[-r * 0.9, -r * 0.34], [r * 0.3, -r * 0.4], [r * 0.9, 0], [r * 0.3, r * 0.4], [-r * 0.9, r * 0.34], [-r * 0.5, 0]], f.hull);
    ctx.strokeStyle = f.glow;
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(r * 0.55, 0, r * 0.34, r * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(r * 0.55, 0, r * 0.55, r * 0.95, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = f.glow;
    ctx.fillRect(r * 0.45, -r * 0.08, r * 0.2, r * 0.16);
  } else {
    spritePolygon(ctx, [[-r * 1.05, -r * 0.55], [-r * 0.25, -r * 0.92], [r * 0.72, -r * 0.62], [r * 1.22, 0], [r * 0.72, r * 0.62], [-r * 0.25, r * 0.92], [-r * 1.05, r * 0.55], [-r * 0.62, 0]], f.dark);
    spritePolygon(ctx, [[-r * 0.7, -r * 0.42], [r * 0.58, -r * 0.43], [r * 1.02, 0], [r * 0.58, r * 0.43], [-r * 0.7, r * 0.42], [-r * 0.38, 0]], f.hull);
    for (const yy of [-r * 0.56, r * 0.56]) {
      ctx.fillStyle = '#101f30';
      ctx.fillRect(-r * 0.25, yy - r * 0.13, r * 0.58, r * 0.26);
      ctx.fillStyle = f.trim;
      ctx.fillRect(-r * 0.05, yy - r * 0.06, r * 0.25, r * 0.12);
    }
    ctx.fillStyle = f.glow;
    ctx.fillRect(r * 0.48, -r * 0.1, r * 0.46, r * 0.2);
  }

  ctx.save();
  spriteDetailLine(ctx, -r * 0.62, -r * 0.34, r * 0.48, -r * 0.34, '#b8d4df', Math.max(0.7, r * 0.035), 0.52);
  spriteDetailLine(ctx, -r * 0.62, r * 0.34, r * 0.48, r * 0.34, '#b8d4df', Math.max(0.7, r * 0.035), 0.52);
  spriteDetailLine(ctx, -r * 0.34, -r * 0.4, -r * 0.12, -r * 0.18, f.trim, Math.max(0.7, r * 0.035), 0.8);
  spriteDetailLine(ctx, -r * 0.34, r * 0.4, -r * 0.12, r * 0.18, f.trim, Math.max(0.7, r * 0.035), 0.8);
  spriteVent(ctx, -r * 0.48, -r * 0.12, r * 0.3, r * 0.24, '#91aab8', 3);
  spriteVent(ctx, r * 0.58, -r * 0.23, r * 0.22, r * 0.12, f.trim, 2);
  spriteVent(ctx, r * 0.58, r * 0.11, r * 0.22, r * 0.12, f.trim, 2);
  for (const yy of [-r * 0.48, r * 0.48]) {
    for (const xx of [-r * 0.62, -r * 0.18, r * 0.3]) spriteRivet(ctx, xx, yy, Math.max(0.65, r * 0.025), f.trim);
  }
  spriteArmorPanel(ctx, [[-r * 0.12, -r * 0.2], [r * 0.18, -r * 0.27], [r * 0.42, -r * 0.12], [r * 0.22, -r * 0.06]], '#8da5b1', f.trim);
  ctx.strokeStyle = f.trim;
  ctx.lineWidth = Math.max(0.8, r * 0.035);
  ctx.beginPath();
  ctx.moveTo(-r * 0.42, 0);
  ctx.lineTo(-r * 0.55, -r * 0.18);
  ctx.lineTo(-r * 0.55, -r * 0.34);
  ctx.stroke();
  ctx.fillStyle = f.glow;
  ctx.fillRect(-r * 0.59, -r * 0.39, r * 0.08, r * 0.08);
  ctx.fillStyle = '#d5b65a';
  ctx.globalAlpha = 0.9;
  for (let i = 0; i < 3; i++) ctx.fillRect(r * 0.78 + i * r * 0.055, -r * 0.055, r * 0.028, r * 0.11);
  ctx.restore();

  ctx.shadowColor = f.glow;
  ctx.shadowBlur = 7;
  ctx.fillStyle = f.glow;
  ctx.beginPath();
  ctx.ellipse(r * 0.24, 0, r * 0.19, r * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(220,245,255,.58)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-r * 0.48, -r * 0.25);
  ctx.lineTo(r * 0.38, -r * 0.25);
  ctx.moveTo(-r * 0.48, r * 0.25);
  ctx.lineTo(r * 0.38, r * 0.25);
  ctx.stroke();
  ctx.restore();
}

export function drawGroundSprite(ctx, u) {
  const f = spriteFaction(u.side), r = u.radius, type = u.reg?.type || 'INFANTRY';
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.42)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.62, r * 0.95, r * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = f.glow;
  ctx.shadowBlur = 6;

  if (type === 'MECH') {
    spritePolygon(ctx, [[-r * 0.48, -r * 0.5], [0, -r * 0.78], [r * 0.48, -r * 0.5], [r * 0.38, r * 0.2], [r * 0.2, r * 0.42], [-r * 0.2, r * 0.42], [-r * 0.38, r * 0.2]], f.hull);
    spritePolygon(ctx, [[-r * 0.68, -r * 0.42], [-r * 0.25, -r * 0.62], [-r * 0.12, -r * 0.2], [-r * 0.55, r * 0.02]], f.dark);
    spritePolygon(ctx, [[r * 0.25, -r * 0.62], [r * 0.68, -r * 0.42], [r * 0.55, r * 0.02], [r * 0.12, -r * 0.2]], f.dark);
    ctx.fillStyle = f.glow;
    ctx.beginPath();
    ctx.arc(0, -r * 0.12, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    spritePolygon(ctx, [[r * 0.32, -r * 0.18], [r * 0.92, -r * 0.28], [r * 1.02, r * 0.02], [r * 0.35, r * 0.12]], '#718b9c');
    ctx.fillStyle = '#172a3a';
    ctx.fillRect(-r * 0.34, r * 0.28, r * 0.25, r * 0.52);
    ctx.fillRect(r * 0.1, r * 0.28, r * 0.25, r * 0.52);
    ctx.fillStyle = f.trim;
    ctx.fillRect(-r * 0.28, r * 0.66, r * 0.17, r * 0.12);
    ctx.fillRect(r * 0.12, r * 0.66, r * 0.17, r * 0.12);
  } else if (type === 'ARTILLERY') {
    ctx.fillStyle = f.dark;
    ctx.fillRect(-r * 0.92, r * 0.12, r * 1.82, r * 0.48);
    ctx.fillStyle = '#172b3c';
    ctx.fillRect(-r * 0.78, r * 0.2, r * 1.55, r * 0.28);
    for (let x = -3; x <= 3; x++) { ctx.fillStyle = f.trim; ctx.beginPath(); ctx.arc(x * r * 0.22, r * 0.34, r * 0.07, 0, Math.PI * 2); ctx.fill(); }
    spritePolygon(ctx, [[-r * 0.55, -r * 0.32], [r * 0.32, -r * 0.38], [r * 0.55, r * 0.18], [-r * 0.68, r * 0.18]], f.hull);
    ctx.fillStyle = '#9cb4c2';
    ctx.fillRect(r * 0.02, -r * 0.48, r * 1.02, r * 0.16);
    ctx.fillStyle = f.glow;
    ctx.fillRect(r * 0.78, -r * 0.52, r * 0.24, r * 0.24);
    ctx.strokeStyle = f.trim;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.72, -r * 0.1);
    ctx.lineTo(-r * 1.08, -r * 0.38);
    ctx.moveTo(-r * 0.72, r * 0.1);
    ctx.lineTo(-r * 1.08, r * 0.38);
    ctx.stroke();
  } else if (type === 'SKIRMISHER') {
    spritePolygon(ctx, [[-r * 0.45, -r * 0.58], [r * 0.12, -r * 0.72], [r * 0.48, -r * 0.24], [r * 0.34, r * 0.48], [-r * 0.28, r * 0.52], [-r * 0.52, -r * 0.05]], f.hull);
    ctx.fillStyle = '#101f30';
    ctx.beginPath();
    ctx.ellipse(r * 0.02, -r * 0.48, r * 0.28, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = f.glow;
    ctx.fillRect(r * 0.08, -r * 0.52, r * 0.22, r * 0.09);
    ctx.strokeStyle = f.trim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(r * 0.3, -r * 0.12);
    ctx.lineTo(r * 0.92, -r * 0.3);
    ctx.moveTo(r * 0.26, r * 0.08);
    ctx.lineTo(r * 0.82, r * 0.28);
    ctx.stroke();
    ctx.fillStyle = f.dark;
    ctx.fillRect(-r * 0.42, r * 0.35, r * 0.22, r * 0.42);
    ctx.fillRect(r * 0.12, r * 0.35, r * 0.22, r * 0.42);
  } else {
    ctx.fillStyle = f.dark;
    ctx.fillRect(-r * 0.4, -r * 0.05, r * 0.8, r * 0.78);
    ctx.fillStyle = f.hull;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.38, r * 0.43, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a1927';
    ctx.beginPath();
    ctx.ellipse(r * 0.08, -r * 0.39, r * 0.29, r * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = f.glow;
    ctx.fillRect(r * 0.12, -r * 0.43, r * 0.22, r * 0.08);
    ctx.fillStyle = '#9cb5c5';
    ctx.fillRect(r * 0.32, -r * 0.08, r * 0.18, r * 0.42);
    ctx.fillStyle = f.trim;
    ctx.fillRect(r * 0.36, -r * 0.16, r * 0.7, r * 0.1);
    ctx.fillStyle = f.dark;
    ctx.fillRect(-r * 0.32, r * 0.55, r * 0.22, r * 0.36);
    ctx.fillRect(r * 0.1, r * 0.55, r * 0.22, r * 0.36);
    ctx.fillStyle = f.glow;
    ctx.fillRect(-r * 0.48, r * 0.02, r * 0.12, r * 0.28);
  }
  ctx.shadowBlur = 0;

  ctx.save();
  if (type === 'MECH') {
    spriteArmorPanel(ctx, [[-r * 0.3, -r * 0.36], [0, -r * 0.53], [r * 0.3, -r * 0.36], [r * 0.22, -r * 0.12], [-r * 0.22, -r * 0.12]], '#7893a2', f.trim);
    spriteVent(ctx, -r * 0.48, -r * 0.02, r * 0.22, r * 0.18, '#a8bac4', 2);
    spriteVent(ctx, r * 0.27, -r * 0.02, r * 0.22, r * 0.18, '#a8bac4', 2);
    for (const x of [-r * 0.47, r * 0.47]) spriteRivet(ctx, x, -r * 0.34, Math.max(0.7, r * 0.035), f.trim);
    spriteDetailLine(ctx, -r * 0.18, r * 0.36, -r * 0.18, r * 0.72, '#b5c6cf', Math.max(0.8, r * 0.04), 0.8);
    spriteDetailLine(ctx, r * 0.18, r * 0.36, r * 0.18, r * 0.72, '#b5c6cf', Math.max(0.8, r * 0.04), 0.8);
    ctx.fillStyle = '#d0a94f';
    ctx.fillRect(-r * 0.1, r * 0.31, r * 0.2, r * 0.08);
  } else if (type === 'ARTILLERY') {
    spriteArmorPanel(ctx, [[-r * 0.52, -r * 0.22], [-r * 0.22, -r * 0.34], [r * 0.3, -r * 0.3], [r * 0.48, r * 0.05], [-r * 0.42, r * 0.08]], '#8298a5', f.trim);
    spriteVent(ctx, -r * 0.62, r * 0.2, r * 0.35, r * 0.18, '#9fb2bd', 3);
    spriteVent(ctx, r * 0.18, r * 0.2, r * 0.35, r * 0.18, '#9fb2bd', 3);
    for (const x of [-r * 0.72, -r * 0.42, r * 0.38, r * 0.68]) spriteRivet(ctx, x, r * 0.17, Math.max(0.7, r * 0.03), f.trim);
    ctx.fillStyle = '#d1ad54';
    ctx.fillRect(-r * 0.08, -r * 0.55, r * 0.16, r * 0.07);
  } else if (type === 'SKIRMISHER') {
    spriteArmorPanel(ctx, [[-r * 0.28, -r * 0.3], [r * 0.05, -r * 0.53], [r * 0.3, -r * 0.27], [r * 0.18, r * 0.03], [-r * 0.2, r * 0.02]], '#91a6b2', f.trim);
    spriteVent(ctx, -r * 0.34, r * 0.08, r * 0.2, r * 0.13, '#9fb3bf', 2);
    for (const x of [-r * 0.34, r * 0.32]) spriteRivet(ctx, x, -r * 0.12, Math.max(0.65, r * 0.028), f.trim);
    ctx.fillStyle = '#d2ad53';
    ctx.fillRect(-r * 0.08, r * 0.22, r * 0.16, r * 0.07);
  } else {
    spriteArmorPanel(ctx, [[-r * 0.28, -r * 0.1], [r * 0.02, -r * 0.28], [r * 0.3, -r * 0.08], [r * 0.2, r * 0.18], [-r * 0.2, r * 0.18]], '#8199a7', f.trim);
    spriteVent(ctx, -r * 0.3, r * 0.16, r * 0.2, r * 0.16, '#9fb3bf', 2);
    spriteRivet(ctx, -r * 0.29, -r * 0.05, Math.max(0.65, r * 0.03), f.trim);
    spriteRivet(ctx, r * 0.28, -r * 0.05, Math.max(0.65, r * 0.03), f.trim);
    ctx.fillStyle = '#172b3b';
    ctx.fillRect(-r * 0.52, -r * 0.12, r * 0.16, r * 0.48);
    ctx.fillStyle = f.glow;
    ctx.fillRect(-r * 0.5, -r * 0.04, r * 0.12, r * 0.08);
    ctx.fillStyle = '#d2ad53';
    ctx.fillRect(-r * 0.12, r * 0.28, r * 0.24, r * 0.07);
  }
  ctx.restore();

  ctx.strokeStyle = f.trim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-r * 0.28, r * 0.12);
  ctx.lineTo(r * 0.18, r * 0.12);
  ctx.stroke();
  ctx.restore();
}

export function drawBattlefieldAtmosphere(c, battle) {
  const naval = battle.kind === 'NAVAL';
  const seedOffset = (battle.layoutSeed || 0) * 0.000173;
  const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7 + seedOffset) * 43758.5453; return v - Math.floor(v); };
  c.save();
  if (naval) {
    const clouds = [
      [420, 330, 430, 'rgba(23,75,135,0.17)'],
      [1420, 760, 520, 'rgba(91,35,112,0.13)'],
      [2350, 380, 470, 'rgba(20,104,125,0.14)']
    ];
    for (const [x, y, r, col] of clouds) {
      const g = c.createRadialGradient(x, y, 10, x, y, r);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 190; i++) {
      const x = hash(i + 11) * ARENA_W, y = hash(i + 701) * ARENA_H;
      const r = 0.45 + hash(i + 1401) * 1.45;
      c.globalAlpha = 0.22 + hash(i + 1901) * 0.58;
      c.fillStyle = i % 9 === 0 ? '#8bdcff' : '#dbeafe';
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      if (i % 31 === 0) { c.globalAlpha = 0.18; c.fillRect(x - 7, y, 14, 1); c.fillRect(x, y - 7, 1, 14); }
    }
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(104,157,197,0.12)';
    c.lineWidth = 2;
    c.setLineDash([18, 24]);
    c.beginPath();
    c.ellipse(ARENA_W * 0.5, ARENA_H * 0.5, ARENA_W * 0.42, ARENA_H * 0.34, -0.16, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    for (let i = 0; i < 7; i++) {
      const x = 180 + hash(i + 2400) * (ARENA_W - 360), y = 90 + hash(i + 2500) * (ARENA_H - 180), a = hash(i + 2600) * Math.PI;
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.globalAlpha = 0.22;
      c.fillStyle = '#64748b';
      c.beginPath();
      c.moveTo(-24, -7);
      c.lineTo(17, -9);
      c.lineTo(30, 0);
      c.lineTo(12, 8);
      c.lineTo(-22, 6);
      c.closePath();
      c.fill();
      c.strokeStyle = '#94a3b8';
      c.lineWidth = 1;
      c.stroke();
      c.restore();
    }
  } else {
    const theme = battle.theme || { biome: 'BARREN', ground: '#53606b', accent: '#aab8c2', haze: 'rgba(119,147,166,0.15)' };
    const biome = theme.biome || 'BARREN';
    const ground = theme.ground || '#53606b', accent = theme.accent || '#aab8c2';
    const g = c.createLinearGradient(0, 0, ARENA_W, ARENA_H);
    g.addColorStop(0, theme.haze || 'rgba(120,139,151,0.12)');
    g.addColorStop(0.48, 'rgba(12,22,34,0.02)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    c.fillStyle = g;
    c.fillRect(0, 0, ARENA_W, ARENA_H);
    c.globalAlpha = 0.18;
    c.fillStyle = ground;
    c.fillRect(0, 0, ARENA_W, ARENA_H);
    c.globalAlpha = 1;
    for (let i = 0; i < 22; i++) {
      const x = hash(i + 3100) * ARENA_W, y = hash(i + 3200) * ARENA_H, r = 35 + hash(i + 3300) * 105;
      c.globalAlpha = 0.07 + hash(i + 3400) * 0.07;
      c.fillStyle = i % 2 ? accent : ground;
      c.beginPath();
      c.ellipse(x, y, r, r * (0.28 + hash(i + 3500) * 0.25), hash(i + 3600) * Math.PI, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 0.20;
      c.strokeStyle = accent;
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(x, y, r * 0.72, r * 0.2, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.globalAlpha = 0.20;
    c.strokeStyle = accent;
    c.lineWidth = 1;
    for (let i = 0; i < 34; i++) {
      const x = hash(i + 3700) * ARENA_W, y = hash(i + 3800) * ARENA_H, len = 10 + hash(i + 3900) * 42;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + len, y + (hash(i + 4000) - 0.5) * 12);
      c.stroke();
    }
    c.globalAlpha = 1;

    if (biome === 'DESERT' || biome === 'BARREN') {
      c.globalAlpha = 0.13;
      c.strokeStyle = accent;
      c.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        const y = 70 + i * 94 + hash(i + 5100) * 28;
        c.beginPath();
        c.moveTo(0, y);
        c.bezierCurveTo(ARENA_W * 0.28, y - 35, ARENA_W * 0.62, y + 42, ARENA_W, y - 12);
        c.stroke();
      }
    } else if (biome === 'ICE') {
      c.globalAlpha = 0.18;
      c.strokeStyle = '#d9f5ff';
      c.lineWidth = 2;
      for (let i = 0; i < 24; i++) {
        const x = hash(i + 5200) * ARENA_W, y = hash(i + 5300) * ARENA_H;
        c.beginPath();
        c.moveTo(x - 24, y - 9);
        c.lineTo(x, y);
        c.lineTo(x + 38, y + 16);
        c.stroke();
      }
    } else if (biome === 'JUNGLE') {
      c.globalAlpha = 0.12;
      c.fillStyle = '#092d24';
      for (let i = 0; i < 65; i++) {
        const x = hash(i + 5400) * ARENA_W, y = hash(i + 5500) * ARENA_H, r = 8 + hash(i + 5600) * 19;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
    } else if (biome === 'INDUSTRIAL' || biome === 'URBAN') {
      c.globalAlpha = 0.13;
      c.strokeStyle = accent;
      c.lineWidth = 2;
      for (let i = 0; i < 20; i++) {
        const x = hash(i + 5700) * ARENA_W, y = hash(i + 5800) * ARENA_H, w = 28 + hash(i + 5900) * 70, h = 16 + hash(i + 6000) * 35;
        c.strokeRect(x, y, w, h);
      }
    } else if (biome === 'VOLCANIC') {
      c.globalAlpha = 0.22;
      c.strokeStyle = '#ff7138';
      c.lineWidth = 2.5;
      for (let i = 0; i < 15; i++) {
        const x = hash(i + 6100) * ARENA_W, y = hash(i + 6200) * ARENA_H;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + 18, y + 14);
        c.lineTo(x + 9, y + 33);
        c.lineTo(x + 42, y + 48);
        c.stroke();
      }
    } else if (biome === 'CRYSTAL' || biome === 'DARK') {
      c.globalAlpha = 0.18;
      c.strokeStyle = accent;
      c.lineWidth = 1.6;
      for (let i = 0; i < 28; i++) {
        const x = hash(i + 6300) * ARENA_W, y = hash(i + 6400) * ARENA_H, h = 8 + hash(i + 6500) * 23;
        c.beginPath();
        c.moveTo(x - h * 0.35, y);
        c.lineTo(x, y - h);
        c.lineTo(x + h * 0.35, y);
        c.lineTo(x, y + h * 0.6);
        c.closePath();
        c.stroke();
      }
    }
    c.globalAlpha = 1;

    for (let i = 0; i < 12; i++) {
      const x = hash(i + 4100) * ARENA_W, y = hash(i + 4200) * ARENA_H;
      c.save();
      c.translate(x, y);
      c.rotate(hash(i + 4300) * Math.PI);
      c.globalAlpha = 0.24;
      c.fillStyle = '#050b13';
      c.fillRect(-12, -4, 24, 8);
      c.fillRect(-4, -9, 8, 18);
      c.strokeStyle = '#82909c';
      c.lineWidth = 1;
      c.strokeRect(-12, -4, 24, 8);
      c.restore();
    }
    c.globalAlpha = 1;

    for (const d of (battle.decorations || [])) {
      if (d.hazardous) {
        const pulse = 0.5 + 0.5 * Math.sin((battle.elapsed || 0) * 3.2 + d.x * 0.013);
        c.save();
        c.globalAlpha = 0.12 + pulse * 0.12;
        c.strokeStyle = d.kind === 'LAVA_VENT' ? '#ff6538' : d.kind === 'CRYSTAL' ? '#d69aff' : '#ffb36b';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(d.x, d.y, d.hazardRadius * (0.88 + pulse * 0.12), 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 0.045 + pulse * 0.035;
        c.fillStyle = c.strokeStyle;
        c.beginPath();
        c.arc(d.x, d.y, d.hazardRadius, 0, Math.PI * 2);
        c.fill();
        c.restore();
      }
      c.save();
      c.translate(d.x, d.y);
      c.rotate(d.angle || 0);
      c.scale(d.scale || 1, d.scale || 1);
      c.globalAlpha = 0.78;
      if (d.kind === 'ALIEN_FLORA') {
        c.strokeStyle = d.variant % 2 ? '#75b96d' : '#43a98b';
        c.lineWidth = 4;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(0, 12);
        c.lineTo(0, -15);
        c.moveTo(0, -3);
        c.lineTo(-12, -14);
        c.moveTo(0, 2);
        c.lineTo(13, -10);
        c.stroke();
        c.fillStyle = '#9bd18b';
        c.beginPath();
        c.ellipse(-12, -14, 8, 4, -0.5, 0, Math.PI * 2);
        c.ellipse(13, -10, 8, 4, 0.5, 0, Math.PI * 2);
        c.fill();
      } else if (d.kind === 'ICE_SPIRE' || d.kind === 'CRYSTAL' || d.kind === 'OBSIDIAN') {
        c.fillStyle = d.kind === 'ICE_SPIRE' ? 'rgba(174,229,245,.55)' : d.kind === 'CRYSTAL' ? 'rgba(173,126,229,.52)' : 'rgba(112,119,178,.48)';
        c.strokeStyle = d.kind === 'ICE_SPIRE' ? '#d8f5ff' : accent;
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(-9, 12);
        c.lineTo(-4, -12);
        c.lineTo(1, -25);
        c.lineTo(8, -7);
        c.lineTo(12, 12);
        c.closePath();
        c.fill();
        c.stroke();
      } else if (d.kind === 'LAVA_VENT') {
        c.fillStyle = '#281b1b';
        c.strokeStyle = '#a94c2e';
        c.lineWidth = 2;
        c.beginPath();
        c.ellipse(0, 0, 17, 9, 0, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        c.strokeStyle = '#ff7438';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(-8, 0);
        c.lineTo(-2, -5);
        c.lineTo(3, 1);
        c.lineTo(9, -3);
        c.stroke();
      } else if (d.kind === 'INDUSTRIAL_WRECK' || d.kind === 'RUIN' || d.kind === 'SCRAP') {
        c.fillStyle = '#202a34';
        c.strokeStyle = accent;
        c.lineWidth = 1.2;
        c.fillRect(-16, -7, 30, 14);
        c.fillRect(-7, -15, 13, 30);
        c.strokeRect(-16, -7, 30, 14);
        c.strokeStyle = '#d17a55';
        c.beginPath();
        c.moveTo(-12, -5);
        c.lineTo(10, 5);
        c.stroke();
      } else {
        c.fillStyle = '#927044';
        c.strokeStyle = '#d0a66a';
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(-14, 8);
        c.lineTo(-9, -8);
        c.lineTo(2, -14);
        c.lineTo(15, -3);
        c.lineTo(10, 10);
        c.closePath();
        c.fill();
        c.stroke();
      }
      c.restore();
    }
  }
  c.restore();
}

export function drawCombat(longPressState = null) {
  const combat = state.combat;
  if (!combat) return;
  const cCanvas = document.getElementById('combatCanvas');
  const cCtx = cCanvas.getContext('2d');
  const cam = combatCamTransform();
  const { w, h, zoom, cx, cy } = cam;

  cCtx.fillStyle = combat.kind === 'NAVAL' ? '#02050e' : '#080e1a';
  cCtx.fillRect(0, 0, w, h);

  cCtx.save();
  cCtx.translate(w / 2, h / 2);
  cCtx.scale(zoom, zoom);
  cCtx.translate(-cx, -cy);

  cCtx.fillStyle = combat.kind === 'NAVAL' ? 'rgba(6, 12, 26, 0.85)' : (combat.theme ? combat.theme.fill : 'rgba(14, 24, 38, 0.9)');
  cCtx.fillRect(0, 0, ARENA_W, ARENA_H);
  cCtx.strokeStyle = 'rgba(56, 189, 248, 0.07)';
  cCtx.lineWidth = 1;
  for (let gx = 0; gx <= ARENA_W; gx += 70) {
    cCtx.beginPath();
    cCtx.moveTo(gx, 0);
    cCtx.lineTo(gx, ARENA_H);
    cCtx.stroke();
  }
  for (let gy = 0; gy <= ARENA_H; gy += 70) {
    cCtx.beginPath();
    cCtx.moveTo(0, gy);
    cCtx.lineTo(ARENA_W, gy);
    cCtx.stroke();
  }
  drawBattlefieldAtmosphere(cCtx, combat);
  cCtx.strokeStyle = combat.kind === 'GROUND' ? (combat.theme?.stroke || 'rgba(56, 189, 248, 0.4)') : 'rgba(56, 189, 248, 0.4)';
  cCtx.lineWidth = 3;
  cCtx.strokeRect(0, 0, ARENA_W, ARENA_H);

  for (const obj of combat.objectives) {
    const col = obj.owner === 'P' ? '#38bdf8' : obj.owner === 'E' ? '#fb7185' : '#fbbf24';
    cCtx.save();
    cCtx.beginPath();
    cCtx.arc(obj.x, obj.y, obj.r, 0, Math.PI * 2);
    cCtx.fillStyle = obj.owner === 'P' ? 'rgba(56,189,248,0.12)' : obj.owner === 'E' ? 'rgba(251,113,133,0.12)' : 'rgba(251,191,36,0.10)';
    cCtx.fill();
    cCtx.strokeStyle = col;
    cCtx.lineWidth = 2;
    cCtx.setLineDash([8, 6]);
    cCtx.stroke();
    cCtx.setLineDash([]);
    const pct = Math.abs(obj.prog) / 100;
    if (pct > 0.02) {
      cCtx.beginPath();
      cCtx.arc(obj.x, obj.y, obj.r - 6, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
      cCtx.strokeStyle = obj.prog > 0 ? '#38bdf8' : '#fb7185';
      cCtx.lineWidth = 4;
      cCtx.stroke();
    }
    cCtx.fillStyle = col;
    cCtx.font = 'bold 11px ui-monospace, monospace';
    cCtx.textAlign = 'center';
    cCtx.fillText(obj.name.toUpperCase(), obj.x, obj.y - obj.r - 8);
    cCtx.restore();
  }

  for (const o of combat.obstacles) {
    cCtx.save();
    cCtx.translate(o.x, o.y);
    if (o.kind === 'ASTEROID' && o.verts) {
      cCtx.beginPath();
      cCtx.moveTo(o.verts[0].x, o.verts[0].y);
      for (let i = 1; i < o.verts.length; i++) cCtx.lineTo(o.verts[i].x, o.verts[i].y);
      cCtx.closePath();
      const asteroidHp = Math.max(0, o.hp / o.maxHp);
      cCtx.fillStyle = asteroidHp > 0.66 ? '#334155' : asteroidHp > 0.33 ? '#273449' : '#1b2638';
      cCtx.fill();
      cCtx.strokeStyle = asteroidHp > 0.5 ? '#64748b' : '#94a3b8';
      cCtx.lineWidth = 2;
      cCtx.stroke();
      if (asteroidHp < 0.82) {
        cCtx.save();
        cCtx.strokeStyle = `rgba(226,232,240,${0.18 + (1 - asteroidHp) * 0.62})`;
        cCtx.lineWidth = 1.5;
        const crackCount = asteroidHp < 0.38 ? 4 : 2;
        for (let ci = 0; ci < crackCount; ci++) {
          const a = (ci * 2.399 + (o.seed || 0)) % (Math.PI * 2);
          cCtx.beginPath();
          cCtx.moveTo(Math.cos(a) * o.r * 0.12, Math.sin(a) * o.r * 0.12);
          cCtx.lineTo(Math.cos(a + 0.22) * o.r * 0.48, Math.sin(a + 0.22) * o.r * 0.48);
          cCtx.lineTo(Math.cos(a - 0.08) * o.r * 0.86, Math.sin(a - 0.08) * o.r * 0.86);
          cCtx.stroke();
        }
        cCtx.restore();
      }
    } else if (o.kind === 'BARRICADE') {
      cCtx.save();
      cCtx.rotate(o.angle || 0);
      if (o.ttl != null) {
        const pulse = 0.55 + 0.35 * Math.sin(state.animTime * 8);
        cCtx.shadowColor = '#38bdf8';
        cCtx.shadowBlur = 12;
        cCtx.fillStyle = `rgba(56, 189, 248, ${(0.18 + pulse * 0.14).toFixed(2)})`;
        cCtx.strokeStyle = '#38bdf8';
        cCtx.lineWidth = 2.2;
        cCtx.fillRect(-o.r, -o.r * 0.65, o.r * 2, o.r * 1.3);
        cCtx.strokeRect(-o.r, -o.r * 0.65, o.r * 2, o.r * 1.3);
      } else {
        cCtx.fillStyle = 'rgba(251, 191, 36, 0.25)';
        cCtx.strokeStyle = '#fbbf24';
        cCtx.lineWidth = 2.5;
        cCtx.fillRect(-o.r, -o.r * 0.65, o.r * 2, o.r * 1.3);
        cCtx.strokeRect(-o.r, -o.r * 0.65, o.r * 2, o.r * 1.3);
        cCtx.strokeStyle = 'rgba(255,230,160,0.55)';
        cCtx.lineWidth = 1;
        cCtx.beginPath();
        cCtx.moveTo(-o.r * 0.65, -o.r * 0.35);
        cCtx.lineTo(o.r * 0.65, o.r * 0.35);
        cCtx.stroke();
      }
      cCtx.restore();
      if (o.ttl != null) {
        const pct = clamp(o.ttl / 10.0, 0, 1);
        cCtx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        cCtx.fillRect(-16, o.r + 4, 32, 3.5);
        cCtx.fillStyle = '#38bdf8';
        cCtx.fillRect(-16, o.r + 4, 32 * pct, 3.5);
      }
    } else if (o.kind === 'RIDGE' && o.verts) {
      cCtx.beginPath();
      cCtx.moveTo(o.verts[0].x, o.verts[0].y);
      for (let vi = 1; vi < o.verts.length; vi++) cCtx.lineTo(o.verts[vi].x, o.verts[vi].y);
      cCtx.closePath();
      const ridgePalette = {
        DESERT: ['#665039', '#b08b58'], JUNGLE: ['#234b3c', '#63936c'], ICE: ['#456b80', '#b6dce9'],
        INDUSTRIAL: ['#454044', '#a06f60'], CRYSTAL: ['#3d3151', '#9e82c5'], DARK: ['#2c3450', '#7884b6'],
        VOLCANIC: ['#49271f', '#c36a3c'], URBAN: ['#3d3944', '#9b858d'], BARREN: ['#3c4852', '#8795a1']
      };
      const ridgeColors = ridgePalette[combat.theme?.biome || 'BARREN'] || ridgePalette.BARREN;
      cCtx.fillStyle = ridgeColors[0];
      cCtx.fill();
      cCtx.strokeStyle = ridgeColors[1];
      cCtx.lineWidth = 2;
      cCtx.stroke();
      cCtx.strokeStyle = ridgeColors[1] + '88';
      cCtx.lineWidth = 1;
      cCtx.beginPath();
      cCtx.moveTo(-o.r * 0.45, o.r * 0.12);
      cCtx.lineTo(o.r * 0.18, -o.r * 0.3);
      cCtx.stroke();
    } else {
      cCtx.beginPath();
      cCtx.arc(0, 0, o.r, 0, Math.PI * 2);
      cCtx.fillStyle = '#1e293b';
      cCtx.fill();
      cCtx.strokeStyle = '#334155';
      cCtx.lineWidth = 2;
      cCtx.stroke();
    }
    cCtx.restore();
  }

  for (const p of combat.projectiles) {
    cCtx.save();
    if (p.trail && p.trail.length > 1) {
      cCtx.strokeStyle = p.color;
      cCtx.globalAlpha = 0.22;
      cCtx.lineWidth = p.splash ? 7 : 3;
      cCtx.beginPath();
      cCtx.moveTo(p.trail[0].x, p.trail[0].y);
      for (let ti = 1; ti < p.trail.length; ti++) cCtx.lineTo(p.trail[ti].x, p.trail[ti].y);
      cCtx.lineTo(p.x, p.y);
      cCtx.stroke();
    }
    cCtx.translate(p.x, p.y);
    cCtx.rotate(Math.atan2(p.vy, p.vx));
    cCtx.shadowColor = p.color;
    cCtx.shadowBlur = p.splash ? 19 : 12;
    if (p.weapon === 'cannon' || p.splash > 0) {
      cCtx.fillStyle = p.color;
      cCtx.beginPath();
      cCtx.moveTo(9, 0);
      cCtx.lineTo(-5, -4);
      cCtx.lineTo(-12, 0);
      cCtx.lineTo(-5, 4);
      cCtx.closePath();
      cCtx.fill();
      cCtx.fillStyle = '#fff7d6';
      cCtx.fillRect(-3, -1.2, 9, 2.4);
    } else if (p.weapon === 'plasma') {
      cCtx.fillStyle = p.color;
      cCtx.beginPath();
      cCtx.ellipse(1, 0, 9, 4.5, 0, 0, Math.PI * 2);
      cCtx.fill();
      cCtx.fillStyle = '#fff';
      cCtx.beginPath();
      cCtx.arc(3, 0, 2, 0, Math.PI * 2);
      cCtx.fill();
    } else {
      cCtx.strokeStyle = p.color;
      cCtx.lineWidth = 3.2;
      cCtx.beginPath();
      cCtx.moveTo(-17, 0);
      cCtx.lineTo(8, 0);
      cCtx.stroke();
      cCtx.strokeStyle = 'rgba(255,255,255,.9)';
      cCtx.lineWidth = 1.2;
      cCtx.beginPath();
      cCtx.moveTo(-8, 0);
      cCtx.lineTo(7, 0);
      cCtx.stroke();
    }
    cCtx.restore();
                     }
    for (const sw of (combat.shockwaves || [])) {
    cCtx.save();
    cCtx.globalAlpha = clamp(sw.life / sw.maxLife, 0, 1) * 0.72;
    cCtx.strokeStyle = sw.color;
    cCtx.lineWidth = 3;
    cCtx.shadowColor = sw.color;
    cCtx.shadowBlur = 12;
    cCtx.beginPath();
    cCtx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
    cCtx.stroke();
    cCtx.restore();
  }
  for (const wr of (combat.wrecks || [])) {
    cCtx.save();
    cCtx.translate(wr.x, wr.y);
    cCtx.rotate(wr.angle);
    cCtx.globalAlpha = clamp(wr.life / wr.maxLife, 0, 0.78);
    cCtx.fillStyle = '#111827';
    cCtx.strokeStyle = wr.side === 'P' ? '#64748b' : '#9f5360';
    cCtx.lineWidth = 2;
    cCtx.beginPath();
    cCtx.moveTo(-wr.r * 1.3, -wr.r * 0.45);
    cCtx.lineTo(wr.r * 0.65, -wr.r * 0.58);
    cCtx.lineTo(wr.r * 1.15, 0);
    cCtx.lineTo(wr.r * 0.45, wr.r * 0.5);
    cCtx.lineTo(-wr.r * 1.1, wr.r * 0.35);
    cCtx.closePath();
    cCtx.fill();
    cCtx.stroke();
    cCtx.strokeStyle = '#f97316';
    cCtx.globalAlpha *= 0.72;
    cCtx.lineWidth = 2;
    cCtx.beginPath();
    cCtx.moveTo(-wr.r * 0.4, -wr.r * 0.12);
    cCtx.lineTo(wr.r * 0.55, wr.r * 0.18);
    cCtx.stroke();
    cCtx.restore();
  }

  if (combat.strikes && combat.strikes.length) {
    for (const st of combat.strikes) {
      const pct = clamp(1 - st.timer / Math.max(0.01, st.maxTimer), 0, 1);
      const col = st.side === 'P' ? '#38bdf8' : '#fb7185';
      cCtx.save();
      cCtx.strokeStyle = col;
      cCtx.lineWidth = 2;
      cCtx.setLineDash([6, 4]);
      cCtx.beginPath();
      cCtx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      cCtx.stroke();
      cCtx.setLineDash([]);
      cCtx.fillStyle = st.side === 'P' ? 'rgba(56,189,248,0.14)' : 'rgba(251,113,133,0.16)';
      cCtx.beginPath();
      cCtx.arc(st.x, st.y, st.r * pct, 0, Math.PI * 2);
      cCtx.fill();
      cCtx.restore();
    }
  }

  if (combat.orders) {
    for (const u of combat.units) {
      if (u.hp <= 0 || u.fled || u.side !== 'P' || u.id === combat.activeId) continue;
      const ord = combat.orders[u.id];
      if (!ord) continue;
      const dOrd = Math.hypot(ord.targetX - u.x, ord.targetY - u.y);
      if (dOrd > 40) {
        cCtx.save();
        cCtx.strokeStyle = ord.type === 'ADVANCE' ? 'rgba(251,113,133,0.45)' : 'rgba(56,189,248,0.45)';
        cCtx.lineWidth = 1.5;
        cCtx.setLineDash([5, 5]);
        cCtx.beginPath();
        cCtx.moveTo(u.x, u.y);
        cCtx.lineTo(ord.targetX, ord.targetY);
        cCtx.stroke();
        cCtx.setLineDash([]);
        const a = Math.atan2(ord.targetY - u.y, ord.targetX - u.x);
        cCtx.translate(ord.targetX, ord.targetY);
        cCtx.rotate(a);
        cCtx.fillStyle = ord.type === 'ADVANCE' ? '#fb7185' : '#38bdf8';
        cCtx.beginPath();
        cCtx.moveTo(6, 0);
        cCtx.lineTo(-5, -4);
        cCtx.lineTo(-5, 4);
        cCtx.closePath();
        cCtx.fill();
        cCtx.restore();
      }
    }
  }

  for (const u of combat.units) {
    if (u.hp <= 0 || u.fled) continue;
    const isActive = u.id === combat.activeId;
    cCtx.save();
    const movingBob = combat.kind === 'GROUND' && Math.hypot(u.vx || 0, u.vy || 0) > 12 ? Math.sin(state.animTime * 15 + u.x * 0.03) * 1.35 : 0;
    cCtx.translate(u.x, u.y + movingBob);
    const enginePulse = 0.72 + Math.sin(state.animTime * 13 + u.x * 0.01) * 0.22;
    if (combat.kind === 'NAVAL') {
      cCtx.save();
      cCtx.globalAlpha = 0.24 * enginePulse;
      cCtx.fillStyle = u.side === 'P' ? '#38bdf8' : '#fb7185';
      cCtx.shadowColor = cCtx.fillStyle;
      cCtx.shadowBlur = 15;
      cCtx.beginPath();
      cCtx.ellipse(-u.radius * 0.92, 0, u.radius * 0.9, u.radius * 0.24, 0, 0, Math.PI * 2);
      cCtx.fill();
      cCtx.restore();
    }
    if (u.routing) {
      cCtx.beginPath();
      cCtx.arc(0, 0, u.radius + 7 + Math.sin(state.animTime * 10) * 2, 0, Math.PI * 2);
      cCtx.strokeStyle = '#fde047';
      cCtx.lineWidth = 2.5;
      cCtx.stroke();
    } else if (isActive) {
      cCtx.beginPath();
      cCtx.arc(0, 0, u.radius + 9, 0, Math.PI * 2);
      cCtx.strokeStyle = '#fbbf24';
      cCtx.lineWidth = 2;
      cCtx.stroke();
    }
    cCtx.rotate(u.aim);
    if (u.recoil > 0) cCtx.translate(-u.recoil * (combat.kind === 'NAVAL' ? 2.2 : 1.5), 0);
    if (combat.kind === 'NAVAL') drawNavalSprite(cCtx, u);
    else drawGroundSprite(cCtx, u);
    if (u.muzzleFlash > 0) {
      cCtx.save();
      cCtx.globalAlpha = clamp(u.muzzleFlash / 0.095, 0, 1);
      cCtx.fillStyle = '#fff7cc';
      cCtx.shadowColor = u.side === 'P' ? '#38bdf8' : '#fb7185';
      cCtx.shadowBlur = 18;
      cCtx.beginPath();
      cCtx.moveTo(u.radius * 0.8, -4);
      cCtx.lineTo(u.radius * 1.55, 0);
      cCtx.lineTo(u.radius * 0.8, 4);
      cCtx.closePath();
      cCtx.fill();
      cCtx.restore();
    }
    if (u.impactPulse > 0) {
      cCtx.save();
      cCtx.globalAlpha = clamp(u.impactPulse / 0.22, 0, 1) * 0.65;
      cCtx.strokeStyle = '#fff';
      cCtx.lineWidth = 2;
      cCtx.beginPath();
      cCtx.arc(0, 0, u.radius + 5 + (1 - u.impactPulse / 0.22) * 12, 0, Math.PI * 2);
      cCtx.stroke();
      cCtx.restore();
    }
    cCtx.restore();
       const hpPct = u.hp / u.maxHp;
    cCtx.fillStyle = '#0f172a';
    cCtx.fillRect(u.x - 18, u.y + u.radius + 6, 36, 4);
    cCtx.fillStyle = hpPct > 0.5 ? '#34d399' : hpPct > 0.25 ? '#fbbf24' : '#fb7185';
    cCtx.fillRect(u.x - 18, u.y + u.radius + 6, 36 * hpPct, 4);
    if (u.maxShields > 0 && u.shields > 0) {
      cCtx.fillStyle = '#38bdf8';
      cCtx.fillRect(u.x - 18, u.y + u.radius + 11, 36 * (u.shields / u.maxShields), 2.5);
    }
    if (u.routing) {
      cCtx.fillStyle = '#fde047';
      cCtx.font = 'bold 9px ui-monospace, monospace';
      cCtx.textAlign = 'center';
      cCtx.fillText('ROUT', u.x, u.y - u.radius - 7);
    }
    const vetRank = (combat.kind === 'NAVAL' ? u.ship?.vetRank : u.reg?.vetRank) || 0;
    if (vetRank > 0) {
      cCtx.fillStyle = vetRank >= 2 ? '#fbbf24' : '#38bdf8';
      cCtx.font = 'bold 10px ui-monospace, monospace';
      cCtx.textAlign = 'center';
      cCtx.fillText(vetRank >= 2 ? '★★' : '★', u.x, u.y - u.radius - 6);
    }
  }

  for (const pt of combat.particles) {
    cCtx.save();
    cCtx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
    cCtx.fillStyle = pt.color;
    if (pt.r > 2.8) {
      cCtx.beginPath();
      cCtx.moveTo(pt.x - pt.vx * 0.025, pt.y - pt.vy * 0.025);
      cCtx.lineTo(pt.x, pt.y);
      cCtx.lineWidth = Math.max(1, pt.r * 0.55);
      cCtx.strokeStyle = pt.color;
      cCtx.stroke();
    }
    cCtx.beginPath();
    cCtx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
    cCtx.fill();
    cCtx.restore();
  }

  for (const ft of (combat.floatTexts || [])) {
    cCtx.save();
    cCtx.globalAlpha = clamp(ft.life / ft.maxLife, 0, 1);
    cCtx.font = `800 ${ft.size || 12}px ui-monospace, monospace`;
    cCtx.textAlign = 'center';
    cCtx.lineWidth = 3;
    cCtx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
    cCtx.strokeText(ft.text, ft.x, ft.y);
    cCtx.fillStyle = ft.color;
    cCtx.fillText(ft.text, ft.x, ft.y);
    cCtx.restore();
  }

  const halfW = (w / 2) / zoom;
  const halfH = (h / 2) / zoom;
  const offFriendly = combat.units
    .filter(u => u.side === 'P' && u.hp > 0 && !u.fled &&
      (u.x < cx - halfW || u.x > cx + halfW || u.y < cy - halfH || u.y > cy + halfH))
    .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))
    .slice(0, 6);
  const padW = 18 / zoom;
  const chevSize = clamp(11 * zoom, 8, 14) / zoom;
  for (const u of offFriendly) {
    const ix = clamp(u.x, cx - halfW + padW, cx + halfW - padW);
    const iy = clamp(u.y, cy - halfH + padW, cy + halfH - padW);
    const ang = Math.atan2(u.y - cy, u.x - cx);
    cCtx.save();
    cCtx.translate(ix, iy);
    cCtx.rotate(ang);
    cCtx.fillStyle = '#38bdf8';
    cCtx.strokeStyle = '#030712';
    cCtx.lineWidth = 1.5 / zoom;
    cCtx.beginPath();
    cCtx.moveTo(chevSize, 0);
    cCtx.lineTo(-chevSize * 0.7, -chevSize * 0.65);
    cCtx.lineTo(-chevSize * 0.35, 0);
    cCtx.lineTo(-chevSize * 0.7, chevSize * 0.65);
    cCtx.closePath();
    cCtx.fill();
    cCtx.stroke();
    cCtx.restore();
  }
  cCtx.restore();

  const mmSize = 148, mmX = w - mmSize - 12, mmY = 12;
  cCtx.save();
  cCtx.fillStyle = 'rgba(10, 17, 34, 0.88)';
  cCtx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  cCtx.lineWidth = 2;
  cCtx.beginPath();
  if (cCtx.roundRect) cCtx.roundRect(mmX, mmY, mmSize, mmSize, 10);
  else cCtx.rect(mmX, mmY, mmSize, mmSize);
  cCtx.fill();
  cCtx.stroke();

  const sx = mmSize / ARENA_W, sy = mmSize / ARENA_H;
  cCtx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
  cCtx.lineWidth = 1;
  cCtx.strokeRect(mmX + 2, mmY + 2, mmSize - 4, mmSize - 4);
  cCtx.fillStyle = '#475569';
  for (const o of combat.obstacles) {
    cCtx.beginPath();
    cCtx.arc(mmX + o.x * sx, mmY + o.y * sy, 2, 0, Math.PI * 2);
    cCtx.fill();
  }
  for (const obj of combat.objectives) {
    cCtx.strokeStyle = obj.owner === 'P' ? '#38bdf8' : obj.owner === 'E' ? '#fb7185' : '#fbbf24';
    cCtx.lineWidth = 1.5;
    cCtx.beginPath();
    cCtx.arc(mmX + obj.x * sx, mmY + obj.y * sy, Math.max(3.5, obj.r * sx), 0, Math.PI * 2);
    cCtx.stroke();
  }
  for (const u of combat.units) {
    if (u.hp <= 0 || u.fled) continue;
    cCtx.fillStyle = u.side === 'P' ? '#38bdf8' : '#fb7185';
    cCtx.beginPath();
    cCtx.arc(mmX + u.x * sx, mmY + u.y * sy, u.id === combat.activeId ? 3.2 : 2.3, 0, Math.PI * 2);
    cCtx.fill();
  }
  const vx = cx - halfW, vy = cy - halfH, vw = halfW * 2, vh = halfH * 2;
  cCtx.strokeStyle = '#ffffff';
  cCtx.lineWidth = 1;
  cCtx.strokeRect(mmX + vx * sx, mmY + vy * sy, vw * sx, vh * sy);
  cCtx.restore();

  if (combat.winner) {
    cCtx.fillStyle = 'rgba(2, 6, 23, 0.65)';
    cCtx.fillRect(0, h * 0.36, w, 110);
    cCtx.strokeStyle = combat.winner === 'P' ? '#38bdf8' : '#fb7185';
    cCtx.lineWidth = 2;
    cCtx.strokeRect(0, h * 0.36, w, 110);
    cCtx.fillStyle = combat.winner === 'P' ? '#38bdf8' : '#fb7185';
    cCtx.font = '800 28px system-ui, sans-serif';
    cCtx.textAlign = 'center';
    cCtx.fillText(combat.winner === 'P' ? 'VICTORY' : 'DEFEAT', w / 2, h * 0.36 + 46);
    cCtx.fillStyle = '#e2e8f0';
    cCtx.font = 'bold 13px ui-monospace, monospace';
    cCtx.fillText(combat.endReason, w / 2, h * 0.36 + 78);
  }

  const activeUnit = combat.units.find(u => u.id === combat.activeId && u.hp > 0 && !u.fled);
  const cBtn = document.getElementById('cBtnDash');
  if (activeUnit) {
    const aInfo = getUnitActiveInfo(activeUnit);
    if (cBtn) cBtn.textContent = activeUnit.dashCd > 0 ? `${aInfo.name} (${activeUnit.dashCd.toFixed(1)}s)` : aInfo.name;
    const nEl = document.getElementById('cAbilityName');
    const sEl = document.getElementById('cAbilityState');
    const fEl = document.getElementById('cAbilityFill');
    if (nEl && sEl && fEl) {
      const ready = activeUnit.dashCd <= 0;
      const pct = ready ? 100 : Math.round(clamp(1 - activeUnit.dashCd / Math.max(0.1, aInfo.cd), 0, 1) * 100);
      nEl.textContent = `[Q/SHIFT] ${aInfo.name.toUpperCase()}`;
      sEl.textContent = ready ? 'READY' : `${activeUnit.dashCd.toFixed(1)}s`;
      sEl.style.color = ready ? 'var(--emerald)' : 'var(--amber)';
      fEl.style.width = `${pct}%`;
      fEl.style.background = ready ? 'var(--emerald)' : 'var(--amber)';
    }
  }
  if (longPressState) {
    cCtx.save();
    cCtx.strokeStyle = '#38bdf8';
    cCtx.lineWidth = 3;
    cCtx.beginPath();
    cCtx.arc(longPressState.sx, longPressState.sy, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * longPressState.progress);
    cCtx.stroke();
    cCtx.restore();
  }
                                }
                     
    
