import { describe, it, expect } from 'vitest';
import { boundsOfCluster, clusterPins, projectAt } from './clusterPins.js';

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
