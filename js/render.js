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
  ctx.ellipse(r * 0.24, 0, r * 0.19, r * 0.12, 0, 0, Math.PI
    
