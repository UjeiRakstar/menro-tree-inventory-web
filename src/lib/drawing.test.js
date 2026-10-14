import { describe, it, expect } from 'vitest';
import {
  EMPTY_SHAPE,
  addPoint,
  areaM2,
  canClose,
  clickPoint,
  closeShape,
  distanceM,
  drawingHint,
  formatLength,
  insertPoint,
  labelAngle,
  lengthM,
  movePoint,
  removePoint,
  segments,
  selfIntersects,
  toGeoJSON,
  undoLast,
} from './drawing.js';

// A square about 100 m on a side at Santa Cruz's latitude.
const SW = [14.2823, 121.4163];
const SE = [14.2823, 121.417227];
const NE = [14.283198, 121.417227];
const NW = [14.283198, 121.4163];

const drawn = (...points) => points.reduce((shape, p) => addPoint(shape, p), EMPTY_SHAPE);
const square = () => closeShape(drawn(SW, SE, NE, NW));

describe('distanceM', () => {
  it('measures a hundred metres as a hundred metres', () => {
    expect(distanceM(SW, SE)).toBeGreaterThan(99);
    expect(distanceM(SW, SE)).toBeLessThan(101);
    expect(distanceM(SW, NW)).toBeGreaterThan(99);
    expect(distanceM(SW, NW)).toBeLessThan(101);
  });

  it('is nothing between a point and itself', () => {
    expect(distanceM(SW, SW)).toBe(0);
  });
});

describe('drawing', () => {
  it('adds points in order', () => {
    expect(drawn(SW, SE).points).toEqual([SW, SE]);
  });

  it('closes only once there is an area to close', () => {
    expect(canClose(drawn(SW, SE))).toBe(false);
    expect(closeShape(drawn(SW, SE)).closed).toBe(false);
    expect(square().closed).toBe(true);
  });

  it('adds nothing to a closed shape', () => {
    // Clicking the map after closing is not a new point on the area.
    expect(addPoint(square(), [14.29, 121.42]).points).toHaveLength(4);
  });

  it('closes when the first point is clicked, and removes any other', () => {
    expect(clickPoint(drawn(SW, SE, NE), 0).closed).toBe(true);
    expect(clickPoint(drawn(SW, SE, NE), 1).points).toEqual([SW, NE]);
    // The first point of a line too short to close is just removed.
    expect(clickPoint(drawn(SW, SE), 0).points).toEqual([SE]);
  });

  it('opens a closed shape that loses its third point, rather than keeping a closed line', () => {
    const triangle = closeShape(drawn(SW, SE, NE));
    const two = removePoint(triangle, 1);
    expect(two.points).toHaveLength(2);
    expect(two.closed).toBe(false);
    // Four points down to three stays an area.
    expect(removePoint(square(), 0).closed).toBe(true);
  });

  it('moves a point without touching the rest', () => {
    const moved = movePoint(square(), 2, [14.2835, 121.4175]);
    expect(moved.points[2]).toEqual([14.2835, 121.4175]);
    expect(moved.points[0]).toEqual(SW);
    expect(moved.closed).toBe(true);
  });

  it('bends an edge by inserting a point into it', () => {
    const bent = insertPoint(square(), 0, [14.2820, 121.4168]);
    expect(bent.points).toHaveLength(5);
    expect(bent.points[1]).toEqual([14.2820, 121.4168]);
  });

  it('undoes the last point placed', () => {
    expect(undoLast(drawn(SW, SE, NE)).points).toEqual([SW, SE]);
    expect(undoLast(EMPTY_SHAPE)).toBe(EMPTY_SHAPE);
  });

  it('ignores an index that is not there', () => {
    const shape = drawn(SW, SE);
    expect(removePoint(shape, 7)).toBe(shape);
    expect(movePoint(shape, -1, NE)).toBe(shape);
  });
});

describe('measuring', () => {
  it('measures the line while drawing, and the perimeter once closed', () => {
    const open = drawn(SW, SE, NE);
    expect(segments(open)).toHaveLength(2);
    expect(lengthM(open)).toBeGreaterThan(198);
    expect(lengthM(open)).toBeLessThan(202);

    // Closing adds the edge back to the start.
    expect(segments(square())).toHaveLength(4);
    expect(lengthM(square())).toBeGreaterThan(398);
    expect(lengthM(square())).toBeLessThan(402);
  });

  it('gives an area only once the shape is closed', () => {
    expect(areaM2(drawn(SW, SE, NE, NW))).toBeNull();
    const area = areaM2(square());
    // A hectare, near enough.
    expect(area).toBeGreaterThan(9900);
    expect(area).toBeLessThan(10100);
  });

  it('refuses an area for an outline that crosses itself', () => {
    // A figure-eight has no single area; the formula would return the
    // difference between its two loops and call it the answer.
    const bowtie = closeShape(drawn(SW, NE, SE, NW));
    expect(selfIntersects(bowtie)).toBe(true);
    expect(areaM2(bowtie)).toBeNull();
    expect(selfIntersects(square())).toBe(false);
  });
});

describe('labelAngle', () => {
  it('lays a label along its edge, and never upside down', () => {
    expect(labelAngle(SW, SE)).toBeCloseTo(0, 5);
    // East to west is the same line read the other way: still upright.
    expect(labelAngle(SE, SW)).toBeCloseTo(0, 5);
    // A vertical edge stands the label on end, at a quarter-turn at most.
    expect(Math.abs(labelAngle(SW, NW))).toBeCloseTo(90, 5);
  });
});

describe('toGeoJSON', () => {
  it('turns a closed shape into a GeoJSON polygon, in GeoJSON order', () => {
    const geometry = toGeoJSON(square());
    expect(geometry.type).toBe('Polygon');
    // [lng, lat], and the ring closes on itself.
    expect(geometry.coordinates[0][0]).toEqual([SW[1], SW[0]]);
    expect(geometry.coordinates[0][4]).toEqual(geometry.coordinates[0][0]);
  });

  it('has nothing to save while the shape is still open', () => {
    expect(toGeoJSON(drawn(SW, SE, NE))).toBeNull();
  });
});

describe('formatLength', () => {
  it('writes metres under a kilometre and kilometres over it', () => {
    expect(formatLength(850.4)).toBe('850 m');
    expect(formatLength(2310)).toBe('2.31 km');
    expect(formatLength(NaN)).toBe('—');
  });
});

describe('drawingHint', () => {
  it('always says what to do next', () => {
    expect(drawingHint(EMPTY_SHAPE)).toMatch(/first point/);
    expect(drawingHint(drawn(SW))).toMatch(/Keep clicking/);
    expect(drawingHint(drawn(SW, SE, NE))).toMatch(/Click the first point to close/);
    expect(drawingHint(square())).toMatch(/Drag a point/);
    expect(drawingHint(closeShape(drawn(SW, NE, SE, NW)))).toMatch(/crosses itself/);
  });
});
