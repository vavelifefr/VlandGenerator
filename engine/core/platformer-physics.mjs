// Platformer2: tile units, Y down, fixed 25ms tick; swept AABB substeps <= .2 tile.
export const PLATFORMER_TICK = .025;
export const ABILITY_IDS = Object.freeze(['double-jump', 'dash', 'wall-jump']);
export const abilityMask = ids => ids.reduce((mask, id) => mask | (1 << ABILITY_IDS.indexOf(id)), 0);
export const maskAbilities = mask => ABILITY_IDS.filter((_, i) => mask & (1 << i));
const EPS = 1e-6;
export const poseKey = p => `${p.x}:${p.y}`;

export function createPlatformerModel(map, physics = map.request.physics) {
  const {width, height} = map.board, solid = new Uint8Array(width * height);
  for (const p of map.board.walls) solid[p.y * width + p.x] = 1;
  const ladders = new Set(map.ladders.map(poseKey));
  function fits(x, y) {
    if (x < 0 || y < 0 || x + physics.width > width || y + physics.height > height) return false;
    for (let yy = Math.floor(y + EPS); yy < Math.ceil(y + physics.height - EPS); yy++)
      for (let xx = Math.floor(x + EPS); xx < Math.ceil(x + physics.width - EPS); xx++)
        if (solid[yy * width + xx]) return false;
    return true;
  }
  const lethal = (x, y) => (map.hazards ?? []).some(h => x + physics.width > h.x + EPS && x < h.x + h.width - EPS && y + physics.height > h.y + EPS && y < h.y + h.height - EPS);
  const grounded = (x, y) => fits(x, y) && !fits(x, y + .025);
  const onLadder = (x, y) => {
    for (let yy = Math.floor(y + EPS); yy < Math.ceil(y + physics.height - EPS); yy++)
      for (let xx = Math.floor(x + EPS); xx < Math.ceil(x + physics.width - EPS); xx++)
        if (ladders.has(`${xx}:${yy}`)) return true;
    return false;
  };
  function sweep(x, y, dx, dy) {
    const count = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / .2));
    let hitX = false, hitY = false;
    for (let i = 0; i < count; i++) {
      if (!hitX && dx) {
        const target = x + dx / count;
        if (fits(target, y)) x = target;
        else { // Resolve to the exact tile face, without crossing it.
          const face = dx > 0 ? Math.floor(target + physics.width - EPS) - physics.width : Math.ceil(target + EPS);
          if (fits(face, y) && Math.abs(face - x) <= Math.abs(dx / count) + EPS) x = face;
          hitX = true;
        }
      }
      if (!hitY && dy) {
        const target = y + dy / count;
        if (fits(x, target)) y = target;
        else {
          const face = dy > 0 ? Math.floor(target + physics.height - EPS) - physics.height : Math.ceil(target + EPS);
          if (fits(x, face) && Math.abs(face - y) <= Math.abs(dy / count) + EPS) y = face;
          hitY = true;
        }
      }
      if (lethal(x, y)) return {x, y, hitX, hitY, dead: true};
    }
    return {x, y, hitX, hitY, dead: false};
  }
  return {width, height, physics, fits, grounded, onLadder, lethal, sweep};
}

// Macro controls are explicit and reproducible, not an exhaustive continuous controller.
// Resources reset only on landing: one extra jump, one dash. Wall kicks require contact.
export function simulatePlatformerAction(model, start, control) {
  const p = model.physics, dt = PLATFORMER_TICK;
  let x = start.x, y = start.y, vx = control.direction * p.speed * (control.factor ?? 1);
  let vy = control.launch === false ? 0 : -p.jumpSpeed, doubleUsed = false, dashUsed = false;
  let dashUntil = -1, wallKicks = 0, lastWallAt = -1, air = false;
  const trajectory = [{x, y, timeMs: 0}], events = [];
  const record = t => trajectory.push({x: +x.toFixed(6), y: +y.toFixed(6), timeMs: Math.round(t * 1000)});
  for (let step = 0; step < 240; step++) {
    const t = step * dt;
    if (!doubleUsed && control.doubleAt !== undefined && t + EPS >= control.doubleAt) {
      vy = -p.doubleJumpSpeed; doubleUsed = true;
      events.push({type: 'double-jump', timeMs: Math.round(t * 1000), x, y});
    }
    if (!dashUsed && control.dashAt !== undefined && t + EPS >= control.dashAt) {
      dashUntil = t + p.dashDuration; dashUsed = true; vy = 0;
      events.push({type: 'dash', timeMs: Math.round(t * 1000), x, y});
    }
    const dashing = t < dashUntil - EPS;
    const dx = (dashing ? control.direction * p.dashSpeed : vx) * dt;
    const dy = dashing ? 0 : vy * dt + .5 * p.gravity * dt * dt;
    const hit = model.sweep(x, y, dx, dy); x = hit.x; y = hit.y;
    if (hit.dead) return null;
    if (!dashing) vy += p.gravity * dt;
    if (hit.hitX && control.wall && !model.grounded(x, y) && !model.fits(x + Math.sign(dx) * .025, y) && t - lastWallAt >= .125 && wallKicks < 16) {
      vx = -(Math.sign(dx) || control.direction) * p.wallJumpPush;
      vy = -p.wallJumpSpeed; lastWallAt = t; wallKicks++;
      events.push({type: 'wall-jump', timeMs: Math.round((t + dt) * 1000), x, y});
    }
    if (hit.hitY && dy < 0) vy = 0;
    if (hit.hitY && dy > 0 && !air && control.launch !== false) return null;
    if (hit.hitY && dy > 0 && !air) vy = 0;
    if (!model.grounded(x, y)) air = true;
    record(t + dt);
    if ((hit.hitY && dy > 0 || dashing && t + dt >= dashUntil - EPS) && model.grounded(x, y) && (air || dashUsed)) {
      const xx = Math.round(x), yy = Math.round(y);
      if (Math.abs(y - yy) > .001 || !model.grounded(xx, yy) || model.lethal(xx, yy)) return null;
      // Settle at an integer anchor using collision-checked motion, never teleport .5 tile.
      const settle = model.sweep(x, y, xx - x, yy - y);
      if (settle.dead || Math.abs(settle.x - xx) > EPS || Math.abs(settle.y - yy) > EPS) return null;
      const duration = Math.ceil(((t + dt) + Math.abs(xx - x) / p.speed) * 1000);
      if (Math.abs(xx - x) > EPS) trajectory.push({x: xx, y: yy, timeMs: duration});
      return {to: {x: xx, y: yy}, type: events.some(e => e.type === 'wall-jump') ? 'wall-jump' : doubleUsed ? 'double-jump' : dashUsed ? 'dash' : control.launch === false ? 'fall' : 'jump', requires: [...new Set(events.map(e => e.type))], control: {...control}, trajectory, events, duration};
    }
  }
  return null;
}

export function platformerEdges(model, start) {
  const p = model.physics, result = [], unique = new Set();
  const add = edge => {
    if (!edge || poseKey(edge.to) === poseKey(start)) return;
    const key = poseKey(edge.to) + ':' + abilityMask(edge.requires ?? []);
    if (unique.has(key)) return; unique.add(key); result.push(edge);
  };
  for (const direction of [-1, 1]) {
    const to = {x: start.x + direction, y: start.y}, hit = model.sweep(start.x, start.y, direction, 0);
    if (!hit.dead && Math.abs(hit.x - to.x) < EPS && Math.abs(hit.y - to.y) < EPS && (model.grounded(to.x, to.y) || model.onLadder(to.x, to.y))) add({to, type: 'walk', requires: [], duration: Math.round(1000 / p.speed)});
    else if (!model.grounded(to.x, to.y) && model.fits(to.x, to.y)) add(simulatePlatformerAction(model, start, {direction, launch: false}));
  }
  if (model.onLadder(start.x, start.y)) for (const dy of [-1, 1]) {
    const to = {x: start.x, y: start.y + dy}, hit = model.sweep(start.x, start.y, 0, dy);
    if (!hit.dead && Math.abs(hit.y - to.y) < EPS && (model.onLadder(to.x, to.y) || model.grounded(to.x, to.y))) add({to, type: 'climb', requires: [], duration: Math.round(1000 / p.climbSpeed)});
  }
  if (!model.grounded(start.x, start.y)) return result;
  const apex = p.jumpSpeed / p.gravity;
  for (const direction of [-1, 1]) {
    for (const factor of [.5, 1]) {
      add(simulatePlatformerAction(model, start, {direction, factor}));
      for (const timing of [.8, 1.15]) add(simulatePlatformerAction(model, start, {direction, factor, doubleAt: apex * timing}));
    }
    add(simulatePlatformerAction(model, start, {direction, launch: false, dashAt: 0}));
    add(simulatePlatformerAction(model, start, {direction, dashAt: apex}));
    add(simulatePlatformerAction(model, start, {direction, doubleAt: apex, dashAt: apex * 2.1}));
    add(simulatePlatformerAction(model, start, {direction, wall: true}));
  }
  // A vertical extra jump permits rising in a narrow launch bay.
  add(simulatePlatformerAction(model, start, {direction: 0, doubleAt: apex}));
  return result;
}
