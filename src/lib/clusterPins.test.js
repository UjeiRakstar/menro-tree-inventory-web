import { describe, it, expect } from 'vitest';
import { anchorOf, boundsOfCluster, clusterPins } from './clusterPins.js';

const pin = (id, lat, lng) => ({ id, position: [lat, lng] });

// Santa Cruz, where the tagged trees stand.
const SANTA_CRUZ = [14.2823, 121.4163];

describe('clusterPins', () => {
  it('groups pins that would be drawn on top of each other', () => {
    // Three trees within about 20 metres, seen from across the province.
    const pins = [
      pin('1', SANTA_CRUZ[0], SANTA_CRUZ[1]),
      pin('2', SANTA_CRUZ[0] + 0.0001, SANTA_CRUZ[1]),
      pin('3', SANTA_CRUZ[0], SANTA_CRUZ[1] + 0.0001),
    ];
    const clusters = clusterPins(pins, 11);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].count).toBe(3);
  });

  it('lets them come apart as the map is zoomed in', () => {
    const pins = [pin('1', 14.2823, 121.4163), pin('2', 14.2827, 121.4167)];
    expect(clusterPins(pins, 11)).toHaveLength(1);
    expect(clusterPins(pins, 19)).toHaveLength(2);
  });

  it('draws a group on one of its own trees, never on empty ground', () => {
    // The average of these four is a point nobody tagged. The bubble stands
    // on the tree nearest it instead.
    const pins = [
      pin('a', 14.28, 121.41),
      pin('b', 14.282, 121.41),
      pin('c', 14.28, 121.412),
      pin('d', 14.2811, 121.4109), // nearest the middle
    ];
    const [cluster] = clusterPins(pins, 11);
    expect(cluster.count).toBe(4);
    expect(cluster.position).toEqual([14.2811, 121.4109]);
    expect(pins.map((p) => p.position)).toContainEqual(cluster.position);
  });

  it('keeps a lone tree exactly where it is, under its own id', () => {
    const [only] = clusterPins([pin('solo', 14.3, 121.5)], 15);
    expect(only).toMatchObject({ key: 'solo', count: 1, position: [14.3, 121.5] });
  });

  it('ignores pins with nowhere to be', () => {
    expect(clusterPins([{ id: 'x' }, null], 11)).toEqual([]);
    expect(clusterPins(undefined, 11)).toEqual([]);
  });
});

describe('anchorOf', () => {
  it('picks the member nearest the middle', () => {
    expect(anchorOf([pin('a', 0, 0), pin('b', 0, 10), pin('c', 0, 4)])).toEqual([0, 4]);
  });
});

describe('boundsOfCluster', () => {
  it('spans every tree in the group, for zooming into it', () => {
    const bounds = boundsOfCluster({ pins: [pin('a', 14.28, 121.41), pin('b', 14.29, 121.42)] });
    expect(bounds).toEqual([
      [14.28, 121.41],
      [14.29, 121.42],
    ]);
  });

  it('has nothing to corner when the cluster is empty', () => {
    expect(boundsOfCluster({ pins: [] })).toBeNull();
    expect(boundsOfCluster(undefined)).toBeNull();
  });
});
