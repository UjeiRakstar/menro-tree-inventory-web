import { describe, it, expect } from 'vitest';
import {
  boundsOfCluster,
  clusterPins,
  crowdGroups,
  projectAt,
  spiderPositions,
  unprojectAt,
} from './clusterPins.js';

const pin = (id, lat, lng) => ({ id, position: [lat, lng] });

// Santa Cruz, where every tagged tree currently stands.
const SANTA_CRUZ = [14.2823, 121.4163];

describe('projectAt', () => {
  it('agrees with Web Mercator, which is what Leaflet draws with', () => {
    // The prime meridian at the equator is the middle of the world square.
    const origin = projectAt([0, 0], 0);
    expect(origin.x).toBeCloseTo(128);
    expect(origin.y).toBeCloseTo(128);

    // Each zoom level doubles the scale.
    expect(projectAt([0, 0], 1).x).toBeCloseTo(256);
    expect(projectAt([0, 180], 0).x).toBeCloseTo(256);
  });

  it('keeps the poles finite rather than letting them run to infinity', () => {
    expect(Number.isFinite(projectAt([90, 0], 10).y)).toBe(true);
    expect(Number.isFinite(projectAt([-90, 0], 10).y)).toBe(true);
  });
});

describe('clusterPins', () => {
  it('groups pins that would be drawn on top of each other', () => {
    // Three trees within about 20 metres, seen from across the province.
    const pins = [
      pin('1', SANTA_CRUZ[0], SANTA_CRUZ[1]),
      pin('2', SANTA_CRUZ[0] + 0.0001, SANTA_CRUZ[1]),
      pin('3', SANTA_CRUZ[0], SANTA_CRUZ[1] + 0.0001),
    ];

    const clusters = clusterPins(pins, 10);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(3);
    // The bubble sits among its members, not on one of them.
    expect(clusters[0].position[0]).toBeCloseTo(14.28233, 4);
  });

  it('lets them stand alone once the map has zoomed in far enough', () => {
    const pins = [
      pin('1', SANTA_CRUZ[0], SANTA_CRUZ[1]),
      pin('2', SANTA_CRUZ[0] + 0.0005, SANTA_CRUZ[1] + 0.0005),
    ];

    expect(clusterPins(pins, 11)).toHaveLength(1);
    expect(clusterPins(pins, 18)).toHaveLength(2);
  });

  it('keeps distant pins apart at every zoom', () => {
    // Santa Cruz and Biñan, opposite ends of the province.
    const pins = [pin('1', 14.2823, 121.4163), pin('2', 14.3333, 121.0833)];

    expect(clusterPins(pins, 9)).toHaveLength(2);
  });

  it('carries a lone pin through as itself, keyed by its own id', () => {
    const clusters = clusterPins([pin('only', ...SANTA_CRUZ)], 12);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(1);
    expect(clusters[0].key).toBe('only');
    expect(clusters[0].position).toEqual(SANTA_CRUZ);
    expect(clusters[0].pins[0].id).toBe('only');
  });

  it('loses no pin, whatever the zoom', () => {
    const pins = Array.from({ length: 50 }, (_, i) =>
      pin(String(i), SANTA_CRUZ[0] + i * 0.0004, SANTA_CRUZ[1] + (i % 7) * 0.0004)
    );

    for (const zoom of [8, 11, 14, 17, 20]) {
      const total = clusterPins(pins, zoom).reduce((sum, c) => sum + c.count, 0);
      expect(total).toBe(50);
    }
  });

  it('ignores a pin with no position rather than placing it at nowhere', () => {
    const clusters = clusterPins([pin('1', ...SANTA_CRUZ), { id: '2' }, null], 12);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(1);
  });

  it('survives an empty or missing set', () => {
    expect(clusterPins([], 12)).toEqual([]);
    expect(clusterPins(undefined, 12)).toEqual([]);
  });
});

describe('boundsOfCluster', () => {
  it('corners everything in the cluster', () => {
    const cluster = { pins: [pin('1', 14.1, 121.1), pin('2', 14.3, 121.5), pin('3', 14.2, 121.2)] };

    expect(boundsOfCluster(cluster)).toEqual([
      [14.1, 121.1],
      [14.3, 121.5],
    ]);
  });

  it('has nothing to corner when the cluster is empty', () => {
    expect(boundsOfCluster({ pins: [] })).toBeNull();
    expect(boundsOfCluster(undefined)).toBeNull();
  });
});

describe('unprojectAt', () => {
  it('undoes projectAt, at every zoom', () => {
    for (const zoom of [0, 11, 18, 21]) {
      const [lat, lng] = unprojectAt(projectAt(SANTA_CRUZ, zoom), zoom);
      expect(lat).toBeCloseTo(SANTA_CRUZ[0], 9);
      expect(lng).toBeCloseTo(SANTA_CRUZ[1], 9);
    }
  });
});

describe('crowdGroups', () => {
  it('groups by how far apart the pins are drawn, not which cell they fall in', () => {
    // Two trees about a metre and a half apart: at zoom 21 that is 21 pixels
    // between centres. The grid would separate them whenever a cell boundary
    // happened to fall between the two, and then draw them on top of each
    // other — which is the bug this exists to close.
    const close = [pin('a', 14.2823, 121.4163), pin('b', 14.28231, 121.41631)];
    const grouped = crowdGroups(close, 21);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].count).toBe(2);
  });

  it('leaves pins alone once they have room to stand', () => {
    // Fifty metres apart: at zoom 21 that is hundreds of pixels. Fanning these
    // into a ring would bring them CLOSER together.
    const apart = [pin('a', 14.2823, 121.4163), pin('b', 14.2827, 121.4167)];
    expect(crowdGroups(apart, 21)).toHaveLength(2);
    // ...though at province scale the same two are one dot.
    expect(crowdGroups(apart, 11)).toHaveLength(1);
  });

  it('keeps a chain of close pins together', () => {
    // Single linkage: a and b overlap, b and c overlap, a and c do not. Fanning
    // out half a huddle leaves the other half huddled.
    const chain = [
      pin('a', 14.2823, 121.4163),
      pin('b', 14.28231, 121.41631),
      pin('c', 14.28232, 121.41632),
    ];
    const grouped = crowdGroups(chain, 21);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].count).toBe(3);
  });

  it('puts a group where its members average out', () => {
    const [group] = crowdGroups([pin('a', 14.2823, 121.4163), pin('b', 14.28231, 121.41631)], 21);
    expect(group.position[0]).toBeCloseTo(14.282305, 6);
    expect(group.position[1]).toBeCloseTo(121.416305, 6);
  });

  it('survives nothing to group', () => {
    expect(crowdGroups([], 21)).toEqual([]);
    expect(crowdGroups(null, 21)).toEqual([]);
    expect(crowdGroups([{ id: 'x' }], 21)).toEqual([]);
  });
});

describe('spiderPositions', () => {
  const groupOf = (n) => ({
    pins: Array.from({ length: n }, (_, i) => pin(`t${i}`, 14.2823, 121.4163)),
    position: SANTA_CRUZ,
    count: n,
  });

  it('moves every pin off the point they were stacked on', () => {
    const fanned = spiderPositions(groupOf(4), 21);
    expect(fanned).toHaveLength(4);
    for (const { position } of fanned) {
      expect(position).not.toEqual(SANTA_CRUZ);
    }
  });

  it('spreads them far enough apart to tap', () => {
    // Every pin at least a pin's width from every other, on screen.
    const fanned = spiderPositions(groupOf(6), 21);
    const points = fanned.map(({ position }) => projectAt(position, 21));
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const apart = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
        expect(apart).toBeGreaterThan(16);
      }
    }
  });

  it('keeps spreading them once a ring would be too wide', () => {
    const fanned = spiderPositions(groupOf(25), 21);
    expect(fanned).toHaveLength(25);
    const points = fanned.map(({ position }) => projectAt(position, 21));
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const apart = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
        expect(apart).toBeGreaterThan(14);
      }
    }
  });

  it('hands back a leg to draw, from where the group stood', () => {
    for (const { anchor } of spiderPositions(groupOf(3), 21)) {
      expect(anchor).toEqual(SANTA_CRUZ);
    }
  });

  it('leaves a single pin exactly where it was tagged', () => {
    const only = pin('a', 14.2823, 121.4163);
    const [fanned] = spiderPositions({ pins: [only], position: only.position, count: 1 }, 21);
    expect(fanned.position).toEqual(only.position);
  });

  it('does not move the trees, only how they are drawn', () => {
    // The fan is a drawing. Nothing is written back, and the pins it is handed
    // keep the coordinates they were tagged at.
    const group = groupOf(5);
    const before = group.pins.map((p) => [...p.position]);
    spiderPositions(group, 21);
    expect(group.pins.map((p) => p.position)).toEqual(before);
  });

  it('has nothing to fan in an empty group', () => {
    expect(spiderPositions({ pins: [], count: 0 }, 21)).toEqual([]);
    expect(spiderPositions(null, 21)).toEqual([]);
  });
});
