import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePlatformer, normalizePlatformerRequest, PLATFORMER_REQUEST_TEMPLATE as template, analyzePlatformer, validatePlatformer, platformerFingerprint, exportMapTiles, exportMap, importMap, createPlatformerModel, simulatePlatformerAction} from '../engine/api/index.mjs';
import * as v1 from '../engine/api/platformer-v1.mjs';
const build = patch => generatePlatformer({...template, ...patch});

test('three physical gates unlock rooms in order and permit backtracking', () => {
  const map = build({}), a = map.analysis;
  assert.equal(map.schemaVersion, 2); assert.equal(a.ok, true); assert.equal(a.safety.trappedStates, 0); assert.equal(a.safety.returnToStart, true);
  assert.deepEqual(map.grants.map(g => g.ability), ['double-jump', 'dash', 'wall-jump']);
  assert.ok(a.progression.checks.every(c => c.blockedBefore && c.reachableAfter && c.returnable));
  const counts = a.progression.stages.map(s => s.reachableRooms.length);
  assert.equal(counts.at(-1), map.rooms.length); for (let i = 1; i < counts.length; i++) assert.ok(counts[i] > counts[i - 1]);
  assert.equal(analyzePlatformer(map, map.request.physics, {collectAbilities: false}).reachable, false);
  assert.equal(analyzePlatformer(map, map.request.physics, {initialAbilities: ['double-jump', 'dash', 'wall-jump'], collectAbilities: false}).reachable, true);
});

test('verified route replays movement, touches walls for kicks, respects body collisions and air resources', () => {
  const map = build({rooms: 6}), model = createPlatformerModel(map);
  for (const type of ['double-jump', 'dash', 'wall-jump']) assert.ok(map.analysis.path.segments.some(s => s.type === type));
  for (const segment of map.analysis.path.segments) {
    if (segment.control) {
      const replay = simulatePlatformerAction(model, segment.from, segment.control);
      assert.deepEqual(replay.to, segment.to); assert.deepEqual(replay.trajectory, segment.trajectory);
      for (const type of ['double-jump', 'dash']) assert.ok(segment.events.filter(e => e.type === type).length <= 1);
      for (const e of segment.events.filter(e => e.type === 'wall-jump')) assert.ok(!model.fits(e.x - .03, e.y) || !model.fits(e.x + .03, e.y));
    }
    for (const point of segment.trajectory ?? [segment.from, segment.to]) {assert.equal(model.fits(point.x, point.y), true); assert.equal(model.lethal(point.x, point.y), false);}
  }
});

test('dash cannot tunnel through a one-tile solid wall even at maximum speed', () => {
  const map = build({rooms: 1, platforms: 0, gaps: 0, physics: {...template.physics, dashSpeed: 32, dashDuration: .5}}), floor = map.spawn.y + map.request.physics.height;
  for (let y = map.rooms[0].y; y < floor; y++) map.board.walls.push({x: map.spawn.x + 2, y, type: 'rock'});
  const edge = simulatePlatformerAction(createPlatformerModel(map), map.spawn, {direction: 1, launch: false, dashAt: 0});
  assert.ok(!edge || edge.to.x < map.spawn.x + 2);
  for (const point of edge?.trajectory ?? []) assert.ok(point.x + map.request.physics.width <= map.spawn.x + 2.000001);
});

test('re-sealing fake ok, cyclic acquisition, bypassed gates and blocked exits does not pass validation', () => {
  const original = build({rooms: 6});
  for (const mutation of [
    m => {m.grants[0].position = {...m.challenges[0].to};},
    m => {m.board.walls.push({...m.exit, type: 'rock'});},
    m => {const c = m.challenges[0], room = m.rooms.find(r => r.id === c.roomId); m.ladders.push(...Array.from({length: room.height}, (_, i) => ({x: c.barrierX - 1, y: room.y + i})));},
    m => {m.grants[1].ability = 'typo';}
  ]) {
    const m = structuredClone(original); mutation(m); m.analysis = {ok: true}; m.fingerprint = platformerFingerprint(m);
    assert.equal(validatePlatformer(m).ok, false);
  }
});

test('a survivable deep fall without an escape is rejected even when another route reaches the exit', () => {
  const map = build({rooms: 6}); map.hazards = [];
  const a = analyzePlatformer(map); assert.equal(a.reachable, true); assert.equal(a.safety.ok, false); assert.ok(a.safety.trappedStates > 0);
  map.fingerprint = platformerFingerprint(map); assert.equal(validatePlatformer(map).ok, false);
});

test('wide and tall actors keep clearance at shafts, ladders, rewards and gates', () => {
  for (const width of [1, 2]) for (const height of [1, 2, 3]) {
    const map = build({rooms: 10, physics: {...template.physics, width, height}});
    assert.equal(validatePlatformer(map).ok, true); assert.equal(map.analysis.reachableSites.length, map.sites.length);
  }
});

test('all acquisition orders and initial ability subsets are supported', () => {
  const ids = ['double-jump', 'dash', 'wall-jump'];
  for (const first of ids) for (const second of ids.filter(id => id !== first)) {
    const unlockOrder = [first, second, ...ids.filter(id => id !== first && id !== second)];
    assert.equal(build({rooms: 6, abilities: {initial: [], unlockOrder}}).analysis.ok, true);
  }
  for (let mask = 0; mask < 8; mask++) assert.equal(build({rooms: 6, abilities: {initial: ids.filter((_, i) => mask & (1 << i))}}).analysis.ok, true);
});

test('new seeds, presets, small levels and 30-room bounds remain deterministic and explicit', () => {
  for (const preset of ['metroidvania', 'roguelite', 'vertical']) for (const rooms of [1, 3, 10, 30]) for (const seed of [0, 73]) {
    const map = build({preset, rooms, seed}); assert.equal(map.analysis.ok, true); assert.equal(map.rooms.length, rooms);
    assert.ok(map.connectors.every(c => c.length >= 1 && c.length <= 3));
    assert.equal(map.grants.length + map.omitted.length, 3); assert.equal(map.grants.length, Math.min(3, rooms - 1));
  }
  assert.deepEqual(build({rooms: 4}), build({rooms: 4}));
});

test('clear invalid physics/order errors instead of silently returning an unproven map', () => {
  for (const patch of [{physics: {dashSpeed: 8, dashDuration: .1}}, {physics: {doubleJumpSpeed: 0}}, {abilities: {initial: ['dash'], unlockOrder: ['dash']}}, {abilities: {unlockOrder: ['fly']}}, {roomHeight: {min: 9, max: 9}, physics: {jumpSpeed: 18, gravity: 16}}]) assert.throws(() => build(patch));
  assert.throws(() => normalizePlatformerRequest({...template, abilities: {typo: true}}));
  assert.throws(() => analyzePlatformer(build({rooms: 1}), template.physics, {collectAbilities: 'yes'}));
});

test('legacy generation and snapshot identity stay exact; v2 exports all semantic layers', () => {
  const request = {schema: 'vland.platformer.request', schemaVersion: 1, seed: 0, rooms: 4};
  assert.deepEqual(generatePlatformer(request), v1.generatePlatformer(request));
  const old = v1.generatePlatformer(request), restored = importMap(exportMap(old)); assert.equal(restored.fingerprint, old.fingerprint); assert.deepEqual(restored.board, old.board);
  const map = build({rooms: 6}), tiles = exportMapTiles(map); assert.equal(tiles.schemaVersion, 2);
  for (const key of ['grants', 'challenges', 'hazards', 'abilities']) assert.deepEqual(tiles[key], map[key] ?? map.request[key]);
  const fresh = importMap(exportMap(map)); assert.equal(fresh.fingerprint, map.fingerprint); assert.deepEqual(fresh.board, map.board);
});
