import {LabError, API_VERSION, GENERATOR_VERSION} from './config.mjs';
import {fingerprint} from './identity.mjs';
import {hash2} from '../core/atlas-math.mjs';
import {deriveStageSeed} from '../core/streams.mjs';
import * as legacy from './platformer-v1.mjs';
import {ABILITY_IDS, abilityMask, maskAbilities, poseKey, createPlatformerModel, platformerEdges} from '../core/platformer-physics.mjs';

export const PLATFORMER_VERSION = '2.0.0';
export const PLATFORMER_ABILITIES = Object.freeze({
  'double-jump': {name: 'Двойной прыжок', color: '#eed36f', obstacle: 'Высокий уступ'},
  dash: {name: 'Рывок', color: '#74d9ec', obstacle: 'Тоннель с провалом'},
  'wall-jump': {name: 'Прыжки от стен', color: '#d09aef', obstacle: 'Вертикальная шахта'}
});
export const PLATFORMER_REQUEST_TEMPLATE = Object.freeze({
  schema: 'vland.platformer.request', schemaVersion: 2, seed: 42, preset: 'metroidvania', rooms: 10,
  roomWidth: {min: 14, max: 22}, roomHeight: {min: 12, max: 18}, branches: .35, platforms: .6, gaps: .4,
  physics: {width: 1, height: 2, speed: 5, jumpSpeed: 11, gravity: 28, climbSpeed: 3,
    doubleJumpSpeed: 11, dashSpeed: 18, dashDuration: .25, wallJumpSpeed: 11, wallJumpPush: 5},
  abilities: {initial: [], unlockOrder: [...ABILITY_IDS]}
});
const only = (v, keys) => {if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k))) throw new LabError('INVALID_PLATFORMER', 'Неизвестное поле платформера.');};
const range = (n, min, max, int = false) => Number.isFinite(n) && n >= min && n <= max && (!int || Number.isInteger(n));
const idsValid = ids => Array.isArray(ids) && ids.length <= 3 && ids.every(id => ABILITY_IDS.includes(id)) && new Set(ids).size === ids.length;
export function normalizePlatformerRequest(input) {
  if (input?.schemaVersion === 1) return legacy.normalizePlatformerRequest(input);
  only(input, Object.keys(PLATFORMER_REQUEST_TEMPLATE));
  if (input.schema !== 'vland.platformer.request' || input.schemaVersion !== 2) throw new LabError('INVALID_PLATFORMER', 'Нужен platformer.request версии 2 (версия 1 поддерживается отдельно).');
  const r = {...structuredClone(PLATFORMER_REQUEST_TEMPLATE), ...structuredClone(input)};
  for (const key of ['roomWidth', 'roomHeight', 'physics', 'abilities']) {
    if (input[key] !== undefined) only(input[key], Object.keys(PLATFORMER_REQUEST_TEMPLATE[key]));
    r[key] = {...structuredClone(PLATFORMER_REQUEST_TEMPLATE[key]), ...input[key]};
  }
  if (input.abilities?.initial && input.abilities.unlockOrder === undefined) r.abilities.unlockOrder = ABILITY_IDS.filter(id => !r.abilities.initial.includes(id));
  if (!range(r.seed, 0, 0xffffffff, true) || !range(r.rooms, 1, 30, true) || !['metroidvania', 'roguelite', 'vertical'].includes(r.preset) || !['branches', 'platforms', 'gaps'].every(k => range(r[k], 0, 1))) throw new LabError('INVALID_PLATFORMER', 'Seed uint32; комнат 1–30; частоты 0–1.');
  for (const [key, min, max] of [['roomWidth', 12, 28], ['roomHeight', 9, 22]]) if (!range(r[key].min, min, max, true) || !range(r[key].max, r[key].min, max, true)) throw new LabError('INVALID_PLATFORMER', 'Неверный диапазон ' + key);
  for (const [key, min, max, int] of [['width', 1, 2, true], ['height', 1, 3, true], ['speed', 2, 8], ['jumpSpeed', 8, 18], ['gravity', 16, 40], ['climbSpeed', 1, 6], ['doubleJumpSpeed', 8, 18], ['dashSpeed', 8, 32], ['dashDuration', .1, .5], ['wallJumpSpeed', 8, 18], ['wallJumpPush', 2, 12]]) if (!range(r.physics[key], min, max, int)) throw new LabError('INVALID_PLATFORMER', 'Неверная физика: ' + key);
  if (!idsValid(r.abilities.initial) || !idsValid(r.abilities.unlockOrder) || r.abilities.unlockOrder.some(id => r.abilities.initial.includes(id))) throw new LabError('INVALID_PLATFORMER', 'initial / unlockOrder: уникальные double-jump, dash, wall-jump без пересечения.');
  return r;
}

export function analyzePlatformer(map, physics = map.request.physics, options = {}) {
  if (map.platformerVersion === '1.0.0') return legacy.analyzePlatformer(map, physics);
  const p = normalizePlatformerRequest({...map.request, physics}).physics;
  only(options, ['initialAbilities', 'collectAbilities', 'from', 'to']);
  const initial = options.initialAbilities ?? map.request.abilities.initial, collect = options.collectAbilities ?? true, from = options.from ?? map.spawn, to = options.to ?? map.exit;
  if (!idsValid(initial) || typeof collect !== 'boolean') throw new LabError('INVALID_PLATFORMER', 'initialAbilities: список; collectAbilities: boolean.');
  for (const point of [from, to]) if (!range(point?.x, 0, map.board.width - 1, true) || !range(point?.y, 0, map.board.height - 1, true)) throw new LabError('INVALID_PLATFORMER', 'from / to: целая позиция тела внутри карты.');
  const model = createPlatformerModel(map, p), cache = new Map(), touchedGrants = new Set();
  const edges = point => {
    const key = poseKey(point);
    if (!cache.has(key)) {
      if (cache.size >= 6000) throw new LabError('PLATFORMER_SEARCH_LIMIT', 'Превышен бюджет физических опор (6000).');
      cache.set(key, platformerEdges(model, point));
    }
    return cache.get(key);
  };
  const touch = (point, grant) => point.x < grant.position.x + 1 && point.x + p.width > grant.position.x && point.y < grant.position.y + p.height && point.y + p.height > grant.position.y;
  const acquire = (mask, point, edge) => {
    for (const grant of map.grants) if (touch(point, grant) || edge?.trajectory?.some(point => touch(point, grant))) {touchedGrants.add(grant.id); if (collect) mask |= abilityMask([grant.ability]);}
    return mask;
  };
  const stateKey = (point, mask) => `${poseKey(point)}:${mask}`;
  const startMask = acquire(abilityMask(initial), from), q = [{point: from, mask: startMask}], seen = new Map([[stateKey(from, startMask), 0]]), previous = new Map(), reverse = [], exitStates = [];
  const stable = point => model.fits(point.x, point.y) && !model.lethal(point.x, point.y) && (model.grounded(point.x, point.y) || model.onLadder(point.x, point.y));
  if (!stable(from)) return {ok: false, reachable: false, path: null, reachableRooms: [], positions: 0, errors: ['Старт перекрыт, опасен или не имеет опоры.'], physics: p};
  for (let i = 0; i < q.length; i++) {
    const {point, mask} = q[i];
    if (poseKey(point) === poseKey(to)) exitStates.push(i);
    for (const edge of edges(point)) {
      const need = abilityMask(edge.requires); if ((need & mask) !== need) continue;
      const newMask = acquire(mask, edge.to, edge), key = stateKey(edge.to, newMask); let j = seen.get(key);
      if (j === undefined) {
        if (q.length >= 24000) throw new LabError('PLATFORMER_SEARCH_LIMIT', 'Превышен бюджет состояний (24000).');
        j = q.length; q.push({point: edge.to, mask: newMask}); seen.set(key, j); previous.set(j, {index: i, edge});
      }
      (reverse[j] ??= []).push(i);
    }
  }
  let path = null;
  if (exitStates.length) {
    const segments = [];
    for (let i = exitStates[0]; previous.has(i);) {
      const {index, edge} = previous.get(i); segments.push({from: q[index].point, ...edge, acquired: maskAbilities(q[i].mask & ~q[index].mask)}); i = index;
    }
    path = {segments: segments.reverse(), steps: segments.length, finalAbilities: maskAbilities(q[exitStates[0]].mask)};
  }
  const safe = new Set(exitStates), back = [...exitStates];
  for (let i = 0; i < back.length; i++) for (const prev of reverse[back[i]] ?? []) if (!safe.has(prev)) {safe.add(prev); back.push(prev);}
  const trapped = q.filter((_, i) => !safe.has(i));
  const inside = (point, room) => point.x >= room.x && point.y >= room.y && point.x < room.x + room.width && point.y < room.y + room.height;
  const reachableRooms = map.rooms.filter(room => q.some(s => inside(s.point, room))).map(room => room.id);
  const reachedGrants = [...touchedGrants];
  const reachableSites = map.sites.filter(site => q.some(s => touch(s.point, site))).map(site => site.id);
  function fixedSearch(start, mask) {
    const queue = [start], visited = new Set([poseKey(start)]);
    if (!stable(start)) return {queue: [], visited: new Set()};
    for (let i = 0; i < queue.length; i++) for (const edge of edges(queue[i])) {
      const need = abilityMask(edge.requires), id = poseKey(edge.to);
      if ((need & mask) !== need || visited.has(id)) continue;
      visited.add(id); queue.push(edge.to);
    }
    return {queue, visited};
  }
  const stages = [], checks = []; let prefix = abilityMask(initial);
  for (const ability of [null, ...map.grants.map(g => g.ability)]) {
    if (ability) prefix |= abilityMask([ability]); const reach = fixedSearch(from, prefix);
    stages.push({after: ability ?? 'start', abilities: maskAbilities(prefix), reachableRooms: map.rooms.filter(room => reach.queue.some(point => inside(point, room))).map(room => room.id), exitReachable: reach.visited.has(poseKey(to))});
  }
  prefix = abilityMask(map.request.abilities.initial);
  for (const challenge of map.challenges) {
    const before = fixedSearch(challenge.from, prefix), afterMask = prefix | abilityMask([challenge.ability]), after = fixedSearch(challenge.from, afterMask);
    const blockedBefore = !before.visited.has(poseKey(challenge.to)), reachableAfter = after.visited.has(poseKey(challenge.to)), returnable = fixedSearch(challenge.to, afterMask).visited.has(poseKey(challenge.from));
    checks.push({id: challenge.id, ability: challenge.ability, blockedBefore, reachableAfter, returnable, ok: blockedBefore && reachableAfter && returnable}); prefix = afterMask;
  }
  const returnToStart = fixedSearch(to, prefix).visited.has(poseKey(from));
  return {ok: !!path && reachableRooms.length === map.rooms.length && reachedGrants.length === map.grants.length && reachableSites.length === map.sites.length && trapped.length === 0 && returnToStart && checks.every(c => c.ok), reachable: !!path, path, reachableRooms, reachedGrants, reachableSites, positions: q.length,
    physics: {...p}, jumpHeight: p.jumpSpeed ** 2 / (2 * p.gravity), jumpRange: 2 * p.speed * p.jumpSpeed / p.gravity,
    progression: {initialAbilities: initial, collectAbilities: collect, stages, checks}, safety: {ok: trapped.length === 0 && returnToStart, returnToStart, trappedStates: trapped.length, examples: trapped.slice(0, 8).map(s => ({...s.point, abilities: maskAbilities(s.mask)}))},
    search: {anchors: cache.size, states: q.length, tickMs: 25, maxSweep: .2, controller: 'bounded-macro-v2'},
    note: 'AABB, опора, лестницы, второй прыжок, рывок, контактные прыжки от стен; 25мс, проход коллизии ≤0.2 клетки. Ограниченный набор управляющих последовательностей: найденный путь доказан для этой модели; отсутствие пути не доказывает невозможность для произвольного контроллера.'};
}

export function generatePlatformer(input) {
  if (input?.schemaVersion === 1) return legacy.generatePlatformer(input);
  const r = normalizePlatformerRequest(input), p = r.physics, seed = deriveStageSeed(r.seed, 'platformer', 'geometry', PLATFORMER_VERSION);
  const order = r.abilities.unlockOrder.slice(0, Math.max(0, r.rooms - 1));
  const mainCount = Math.max(order.length + 1, r.rooms - Math.round((r.rooms - 1) * (r.preset === 'vertical' ? .65 : r.branches)));
  const rooms = [], connectors = [], challenges = [], grants = [], platforms = [], hazards = [], omitted = r.abilities.unlockOrder.slice(order.length).map(ability => ({ability, reason: 'Недостаточно комнат для отдельного испытания и следующего зала.'}));
  const rand = (key, min, max) => min + Math.floor(hash2(seed, key, 3) * (max - min + 1));
  const stageAt = new Map(order.map((ability, i) => [Math.floor(i * (mainCount - 1) / Math.max(1, order.length)), ability]));
  let x = 2, floor = 0, prefix = abilityMask(r.abilities.initial);
  for (let i = 0; i < mainCount; i++) {
    const ability = stageAt.get(i), width = rand(i, r.roomWidth.min, r.roomWidth.max), height = rand(i + 80, r.roomHeight.min, r.roomHeight.max); let rise = 0;
    if (ability === 'double-jump') rise = Math.ceil(p.jumpSpeed ** 2 / (2 * p.gravity) + .35);
    if (ability === 'wall-jump') rise = Math.ceil((p.jumpSpeed ** 2 + (prefix & 1 ? p.doubleJumpSpeed ** 2 : 0)) / (2 * p.gravity) + .6);
    if (rise && rise > height - p.height - 2 || ability === 'double-jump' && rise >= (p.jumpSpeed ** 2 + p.doubleJumpSpeed ** 2) / (2 * p.gravity) - .1 || ability === 'dash' && p.dashSpeed * p.dashDuration < p.width + 2.5) throw new LabError('PLATFORMER_CHALLENGE_SIZE', `Испытание «${PLATFORMER_ABILITIES[ability]?.name}» не помещается / не проходится при заданной физике. Увеличьте высоту комнаты или параметры способности.`, {ability, room: i + 1, rise});
    const room = {id: 'room-' + (i + 1), x, y: floor - height, width, height, role: i === 0 ? 'start' : i === mainCount - 1 ? 'exit' : 'traverse'};
    if (i) {const prev = rooms.at(-1); connectors.push({id: 'door-' + i, kind: 'passage', length: x - prev.x - prev.width, from: prev.id, to: room.id, x: prev.x + prev.width, y: floor - p.height, width: x - prev.x - prev.width, height: p.height});}
    rooms.push(room);
    if (ability) {
      const barrierX = ability === 'wall-jump' ? room.x + 7 : ability === 'dash' ? room.x + 5 : room.x + Math.floor(width * .55);
      const from = {x: room.x + 1, y: floor - p.height}, to = {x: ability === 'dash' ? barrierX + 3 : barrierX + 1, y: floor - rise - p.height};
      challenges.push({id: 'challenge-' + (challenges.length + 1), ability, roomId: room.id, nextRoomId: 'room-' + (i + 2), kind: ability === 'double-jump' ? 'high-ledge' : ability === 'dash' ? 'low-tunnel-gap' : 'wall-shaft', from, to, barrierX, rise});
      grants.push({id: 'grant-' + ability, ability, roomId: room.id, position: {x: room.x + p.width + 1, y: from.y}}); prefix |= abilityMask([ability]);
    }
    floor -= rise; x += width + rand(i + 140, 1, 3);
  }
  const parents = rooms.filter(room => !challenges.some(c => c.roomId === room.id));
  for (let i = mainCount; i < r.rooms; i++) {
    const parentIndex = (i - mainCount) % parents.length, parent = parents[parentIndex], height = rand(i + 200, r.roomHeight.min, r.roomHeight.max), width = Math.max(r.roomWidth.min, parent.width - 2), gap = rand(i + 300, 1, 3);
    const room = {id: 'room-' + (i + 1), x: parent.x + Math.floor((parent.width - width) / 2), y: parent.y - gap - height, width, height, role: 'reward'};
    rooms.push(room); parents[parentIndex] = room;
    connectors.push({id: 'shaft-' + i, kind: 'ladder', length: gap, from: parent.id, to: room.id, x: room.x + Math.floor(width / 2), y: room.y + height - 1, width: p.width, height: parent.y - room.y - height + 3});
  }
  const shift = 2 - Math.min(...rooms.map(room => room.y));
  for (const room of rooms) room.y += shift; for (const c of connectors) c.y += shift;
  for (const c of challenges) {c.from.y += shift; c.to.y += shift;} for (const grant of grants) grant.position.y += shift;
  const width = Math.max(x + 1, ...rooms.map(room => room.x + room.width + 2)), height = Math.max(...rooms.map(room => room.y + room.height)) + 4;
  if (width * height > 100000) throw new LabError('PLATFORMER_TOO_LARGE', 'Платформер превышает 100000 клеток.');
  const solid = new Uint8Array(width * height).fill(1), ladders = new Set();
  const rect = (x, y, w, h, value) => {for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (xx >= 0 && yy >= 0 && xx < width && yy < height) solid[yy * width + xx] = value;};
  for (const room of rooms) rect(room.x, room.y, room.width, room.height, 0);
  for (const c of challenges) {
    const room = rooms.find(room => room.id === c.roomId), base = room.y + room.height;
    if (c.ability === 'dash') {
      rect(c.barrierX, base, 2, height - base - 1, 0); rect(c.barrierX - 1, room.y, p.width + 4, room.height - p.height, 1);
      hazards.push({id: c.id + '-void', kind: 'void', x: c.barrierX, y: height - 2, width: 2, height: 1});
    } else {
      rect(c.barrierX, base - c.rise, room.x + room.width - c.barrierX, c.rise, 1);
      if (c.ability === 'wall-jump') rect(c.barrierX - p.width - 3, base - c.rise - 1, 1, c.rise + 1 - p.height, 1);
    }
  }
  for (const c of connectors) {
    if (c.kind === 'passage') rect(c.x, c.y, c.width, c.height, 0);
    else {
      const lower = rooms.find(room => room.id === c.from), upper = rooms.find(room => room.id === c.to), bottom = lower.y + lower.height - p.height;
      for (let yy = upper.y + upper.height - p.height; yy <= bottom; yy++) for (let dx = 0; dx < p.width; dx++) {rect(c.x + dx, yy, 1, 1, 0); ladders.add(`${c.x + dx}:${yy}`);}
    }
  }
  for (const room of rooms.filter(room => !challenges.some(c => c.roomId === room.id))) {
    const base = room.y + room.height;
    if (hash2(seed, room.x, 40) < r.platforms) {
      const platform = {x: room.x + 3, y: base - 4, width: 4, height: 1}; rect(platform.x, platform.y, 4, 1, 1); platforms.push(platform);
      for (let yy = platform.y - p.height; yy <= base - p.height; yy++) for (let dx = 0; dx < p.width; dx++) {rect(platform.x + dx, yy, 1, 1, 0); ladders.add(`${platform.x + dx}:${yy}`);}
    }
    if (room.role !== 'reward' && hash2(seed, room.x, 70) < r.gaps && 2 * p.speed * p.jumpSpeed / p.gravity >= 4) {
      const pit = room.x + Math.floor(room.width / 2); rect(pit, base, 2, height - base - 1, 0); hazards.push({id: room.id + '-void', kind: 'void', x: pit, y: height - 2, width: 2, height: 1});
    }
  }
  const first = rooms[0], last = rooms[mainCount - 1];
  const map = {schema: 'vland.platformer', schemaVersion: 2, apiVersion: API_VERSION, generatorVersion: GENERATOR_VERSION, platformerVersion: PLATFORMER_VERSION, seed: r.seed, request: r,
    board: {width, height, walls: []}, rooms, connectors, platforms, ladders: [...ladders].map(k => {const [x, y] = k.split(':').map(Number); return {x, y};}),
    spawn: {x: first.x + 1, y: first.y + first.height - p.height}, exit: {x: last.x + last.width - p.width - 1, y: last.y + last.height - p.height},
    grants, challenges, hazards, omitted, sites: rooms.filter(room => room.role === 'reward').map(room => ({id: room.id + '-reward', kind: 'reward', roomId: room.id, position: {x: room.x + 1, y: room.y + room.height - p.height}}))};
  for (let i = 0; i < solid.length; i++) if (solid[i]) map.board.walls.push({x: i % width, y: Math.floor(i / width), type: 'rock'});
  map.analysis = analyzePlatformer(map);
  if (!map.analysis.ok) throw new LabError('PLATFORMER_UNREACHABLE', 'Не подтверждены маршрут, способности или возврат; непроверенная карта не возвращается.', {reachableRooms: map.analysis.reachableRooms, safety: map.analysis.safety, checks: map.analysis.progression.checks});
  map.fingerprint = platformerFingerprint(map); return map;
}

export const platformerFingerprint = map => fingerprint({...map, analysis: undefined, fingerprint: undefined});
export function validatePlatformer(map) {
  if (map?.platformerVersion === '1.0.0') return legacy.validatePlatformer(map);
  try {
    const r = normalizePlatformerRequest(map?.request);
    only(map, ['schema', 'schemaVersion', 'apiVersion', 'generatorVersion', 'platformerVersion', 'seed', 'request', 'board', 'rooms', 'connectors', 'platforms', 'ladders', 'spawn', 'exit', 'grants', 'challenges', 'hazards', 'omitted', 'sites', 'analysis', 'fingerprint']);
    if (map.schema !== 'vland.platformer' || map.schemaVersion !== 2 || r.schemaVersion !== 2 || map.apiVersion !== 1 || map.platformerVersion !== PLATFORMER_VERSION || map.seed !== r.seed || !range(map.board?.width, 1, 4096, true) || !range(map.board?.height, 1, 4096, true) || map.board.width * map.board.height > 100000) throw new Error('Неверный snapshot Platformer2.');
    const point = p => p && range(p.x, 0, map.board.width - 1, true) && range(p.y, 0, map.board.height - 1, true);
    const rect = p => point(p) && range(p.width, 1, map.board.width, true) && range(p.height, 1, map.board.height, true) && p.x + p.width <= map.board.width && p.y + p.height <= map.board.height;
    const id = value => typeof value === 'string' && value.length >= 1 && value.length <= 96;
    if (!Array.isArray(map.rooms) || map.rooms.length !== r.rooms || new Set(map.rooms.map(room => room.id)).size !== r.rooms || map.rooms.some(room => !id(room.id) || !['start', 'exit', 'traverse', 'reward'].includes(room.role) || !rect(room) || !range(room.width, r.roomWidth.min, r.roomWidth.max) || !range(room.height, r.roomHeight.min, r.roomHeight.max))) throw new Error('Неверные комнаты.');
    for (let i = 0; i < map.rooms.length; i++) for (let j = i + 1; j < map.rooms.length; j++) {
      const a = map.rooms[i], b = map.rooms[j]; if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) throw new Error('Комнаты перекрываются.');
    }
    for (const list of [map.board.walls, map.ladders]) if (!Array.isArray(list) || list.length > 100000 || list.some(p => !point(p)) || new Set(list.map(poseKey)).size !== list.length) throw new Error('Неверная геометрия.');
    const roomIds = new Set(map.rooms.map(room => room.id));
    if (!point(map.spawn) || !point(map.exit) || !Array.isArray(map.connectors) || map.connectors.length !== r.rooms - 1 || new Set(map.connectors.map(c => c.id)).size !== map.connectors.length || map.connectors.some(c => !['passage', 'ladder'].includes(c.kind) || !range(c.length, 1, 3, true) || !rect(c) || !roomIds.has(c.from) || !roomIds.has(c.to) || c.from === c.to)) throw new Error('Неверные связи / проходы 1–3.');
    for (const name of ['sites', 'platforms', 'grants', 'challenges', 'hazards', 'omitted']) if (!Array.isArray(map[name]) || map[name].length > 1000) throw new Error('Неверный список ' + name);
    if (map.hazards.some(h => !id(h.id) || !rect(h) || h.kind !== 'void') || map.platforms.some(p => !rect(p)) || map.board.walls.some(p => p.type !== 'rock')) throw new Error('Неверная опасная область / платформа / материал.');
    const model = createPlatformerModel(map), stable = p => model.fits(p.x, p.y) && !model.lethal(p.x, p.y) && (model.grounded(p.x, p.y) || model.onLadder(p.x, p.y));
    const wallCells = new Set(map.board.walls.map(poseKey));
    if (map.ladders.some(p => wallCells.has(poseKey(p)))) throw new Error('Лестница пересекает стену.');
    for (const c of map.connectors) {
      const a = map.rooms.find(room => room.id === c.from), b = map.rooms.find(room => room.id === c.to);
      if (c.kind === 'passage' ? c.x !== a.x + a.width || c.x + c.width !== b.x || c.width !== c.length || c.height !== r.physics.height || c.y + c.height !== b.y + b.height : c.width !== r.physics.width || b.y + b.height + c.length !== a.y || c.y !== b.y + b.height - 1 || c.height !== c.length + 3 || c.x < Math.max(a.x, b.x) || c.x + c.width > Math.min(a.x + a.width, b.x + b.width)) throw new Error('Связь не соответствует границам комнат.');
    }
    if (new Set(map.sites.map(s => s.id)).size !== map.sites.length || map.sites.some(s => !id(s.id) || !point(s.position) || !stable(s.position) || s.kind !== 'reward' || !roomIds.has(s.roomId))) throw new Error('Неверная площадка награды.');
    const order = r.abilities.unlockOrder.slice(0, Math.max(0, r.rooms - 1));
    if (map.grants.length !== order.length || map.challenges.length !== order.length || new Set(map.grants.map(g => g.id)).size !== order.length || new Set(map.challenges.map(c => c.id)).size !== order.length) throw new Error('Неверное число способностей / испытаний.');
    for (let i = 0; i < order.length; i++) {
      const g = map.grants[i], c = map.challenges[i], room = map.rooms.find(room => room.id === c.roomId);
      if (!id(g.id) || !id(c.id) || g.ability !== order[i] || c.ability !== order[i] || !point(g.position) || !point(c.from) || !point(c.to) || !stable(g.position) || !stable(c.from) || !stable(c.to) || !room || !roomIds.has(c.nextRoomId) || g.roomId !== c.roomId || c.kind !== ({'double-jump': 'high-ledge', dash: 'low-tunnel-gap', 'wall-jump': 'wall-shaft'})[c.ability] || !range(c.barrierX, room.x, room.x + room.width - 1, true) || !range(c.rise, 0, room.height, true)) throw new Error('Неверные зависимости способности.');
      for (const p of [g.position, c.from, c.to]) if (p.x < room.x || p.x + r.physics.width > room.x + room.width || p.y < room.y || p.y + r.physics.height > room.y + room.height) throw new Error('Испытание / получение вне комнаты.');
      if (!map.connectors.some(link => link.from === c.roomId && link.to === c.nextRoomId && link.kind === 'passage')) throw new Error('После испытания не указан связанный следующий зал.');
    }
    if (map.omitted.length !== r.abilities.unlockOrder.length - order.length || map.omitted.some((o, i) => o.ability !== r.abilities.unlockOrder[order.length + i] || typeof o.reason !== 'string' || !o.reason.length)) throw new Error('Неверный отчёт неразмещённых этапов.');
    if (map.fingerprint !== platformerFingerprint(map)) throw new Error('Отпечаток не совпадает.');
    const a = analyzePlatformer(map); if (!a.ok) throw new Error('Не подтверждены физика, все способности, зависимости или отсутствие достижимой ловушки.');
    return {ok: true, errors: [], rooms: r.rooms, positions: a.positions, abilities: map.grants.length, safety: a.safety};
  } catch (e) {return {ok: false, errors: [e.message], code: e.code ?? 'INVALID_PLATFORMER'};}
}
export function exportPlatformerTiles(map) {
  if (map.platformerVersion === '1.0.0') return legacy.exportPlatformerTiles(map);
  const {width, height} = map.board, solid = new Array(width * height).fill(0); for (const p of map.board.walls) solid[p.y * width + p.x] = 1;
  return {schema: 'vland.platformer.tiles', schemaVersion: 2, platformerVersion: PLATFORMER_VERSION, sourceFingerprint: map.fingerprint, width, height, solid,
    ...Object.fromEntries(['ladders', 'spawn', 'exit', 'rooms', 'connectors', 'sites', 'grants', 'challenges', 'hazards'].map(k => [k, structuredClone(map[k])])), physics: structuredClone(map.request.physics), abilities: structuredClone(map.request.abilities)};
}
