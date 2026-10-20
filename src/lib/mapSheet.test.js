import { describe, it, expect } from 'vitest';
import { municipalityNamed } from './lagunaBoundaries.js';
import {
  PAPERS,
  SHEET_BASEMAPS,
  defaultTitle,
  dmsLabel,
  fitView,
  graticule,
  headingOf,
  lngLatOf,
  scaleBar,
  scaleLabel,
  sheetLayout,
  sourcesOf,
  tilesFor,
  treeClassOf,
  worldOf,
} from './mapSheet.js';

const SANTA_CRUZ = municipalityNamed('Santa Cruz').geometry;

describe('the sheet', () => {
  it('leaves the map the paper the column does not need', () => {
    const { frame, column } = sheetLayout(PAPERS.a4);
    expect(column.x + column.width).toBe(297 - 8);
    expect(frame.x + frame.width).toBeLessThan(column.x);
    expect(frame.height).toBeGreaterThan(180);
  });

  it('shows Santa Cruz at a standard scale, all of it in the frame', () => {
    const { frame } = sheetLayout(PAPERS.a4);
    const view = fitView(SANTA_CRUZ, frame);
    // Santa Cruz is about 11 km across: just over 1:50,000 on A4 with a margin,
    // so the next standard scale; on A3, the CDRA plate's own 1:50,000.
    expect(view.scale).toBe(60000);
    expect(scaleLabel(view.scale)).toBe('1:60,000');
    expect(fitView(SANTA_CRUZ, sheetLayout(PAPERS.a3).frame).scale).toBe(50000);
    const points = SANTA_CRUZ.coordinates.flat(2).map(view.toPaper);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(frame.x);
      expect(x).toBeLessThanOrEqual(frame.x + frame.width);
      expect(y).toBeGreaterThanOrEqual(frame.y);
      expect(y).toBeLessThanOrEqual(frame.y + frame.height);
    }
  });

  it('is true to its scale: a kilometre of ground is 1,000,000 ÷ N mm at 1:N', () => {
    const { frame } = sheetLayout(PAPERS.a4);
    const view = fitView(SANTA_CRUZ, frame);
    // A kilometre east at 14.27°N is 1/(111.32·cos φ) of a degree.
    const degrees = 1 / (111.32 * Math.cos((14.27 * Math.PI) / 180));
    const [x1] = view.toPaper([121.4, 14.27]);
    const [x2] = view.toPaper([121.4 + degrees, 14.27]);
    expect(x2 - x1).toBeCloseTo(1e6 / view.scale, 1);
  });

  it('goes to and from Web Mercator', () => {
    const back = lngLatOf(worldOf([121.41, 14.28]));
    expect(back[0]).toBeCloseTo(121.41, 9);
    expect(back[1]).toBeCloseTo(14.28, 9);
  });
});

describe('the words round the frame', () => {
  it('writes degrees, minutes and seconds as CDRA sheets do', () => {
    expect(dmsLabel(121 + 21 / 60 + 10 / 3600, 'E', 'W')).toBe('121°21′10″E');
    expect(dmsLabel(14.2645, 'N', 'S')).toBe('14°15′52″N');
  });

  it('puts two to four round values on each side', () => {
    const { frame } = sheetLayout(PAPERS.a4);
    const { longitudes, latitudes } = graticule(fitView(SANTA_CRUZ, frame), frame);
    expect(longitudes.length).toBeGreaterThanOrEqual(2);
    expect(longitudes.length).toBeLessThanOrEqual(5);
    expect(latitudes.length).toBeGreaterThanOrEqual(2);
    for (const tick of longitudes) expect(tick.at).toBeGreaterThan(frame.x);
  });

  it('draws a scale bar of a round length', () => {
    expect(scaleBar(50000, 40)).toMatchObject({ km: 2, mm: 40, ticks: [0, 1, 2], unit: 'km' });
    expect(scaleBar(10000, 40)).toMatchObject({ km: 0.25, unit: 'm', ticks: [0, 125, 250] });
  });

  it('heads the column as the LGU is — a city, a municipality, or the province', () => {
    expect(headingOf({ label: 'Santa Cruz', isCity: false })[0]).toBe('MUNICIPALITY OF SANTA CRUZ');
    expect(headingOf({ label: 'Calamba', isCity: true })[0]).toBe('CITY OF CALAMBA');
    expect(headingOf(null)).toEqual(['PROVINCE OF LAGUNA', 'REGION IV-A CALABARZON']);
  });

  it('titles the sheet after what is on it, and credits it', () => {
    expect(defaultTitle({ survey: 'landslide' })).toBe('RAIN-INDUCED LANDSLIDE SUSCEPTIBILITY MAP');
    expect(defaultTitle({ survey: null, trees: true })).toBe('TREE INVENTORY MAP');
    expect(sourcesOf({ survey: 'flood', trees: true, basemap: 'light' })).toBe(
      'PSA / NAMRIA boundaries, UP NOAH, Green Tag tree inventory, Esri World Light Gray'
    );
  });
});

describe('tilesFor', () => {
  it('covers the frame in tiles fine enough to print, and not too many', () => {
    const { frame } = sheetLayout(PAPERS.a4);
    const view = fitView(SANTA_CRUZ, frame);
    const tiles = tilesFor(view, frame, SHEET_BASEMAPS[0]);
    expect(tiles.length).toBeGreaterThan(4);
    expect(tiles.length).toBeLessThanOrEqual(160);
    expect(tiles[0].url).toMatch(/World_Light_Gray_Base\/MapServer\/tile\/\d+\/\d+\/\d+$/);
    expect(Math.min(...tiles.map((t) => t.x))).toBeLessThanOrEqual(frame.x);
    expect(Math.max(...tiles.map((t) => t.x + t.size))).toBeGreaterThanOrEqual(frame.x + frame.width);
    expect(tilesFor(view, frame, SHEET_BASEMAPS.find((b) => b.id === 'none'))).toEqual([]);
  });
});

describe('treeClassOf', () => {
  it('bands a tree by the CO₂ it stores, for the GHG report (20 October)', () => {
    expect(treeClassOf({ species: 'Kakawate', dbh: 8, total_height: 4 }, 'carbon')).toBe('under100');
    expect(treeClassOf({ species: 'Narra', dbh: 37, total_height: 14 }, 'carbon')).toBe('to1000');
    expect(treeClassOf({ species: 'Acacia', dbh: 50, total_height: 18 }, 'carbon')).toBe('over1000');
    expect(treeClassOf({ species: 'Narra', dbh: 37 }, 'carbon')).toBe('unmeasured');
  });

  it('reads origin as native or invasive, and use as fruit, timber or ornamental', () => {
    expect(treeClassOf({ biodiversity_status: 'Endemic' }, 'origin')).toBe('native');
    expect(treeClassOf({ species_type: 'Invasive' }, 'origin')).toBe('invasive');
    expect(treeClassOf({}, 'origin')).toBe('unrecorded');
    expect(treeClassOf({ tree_category: 'Fruit Tree' }, 'use')).toBe('fruit');
    expect(treeClassOf({ tree_category: 'timber' }, 'use')).toBe('timber');
    expect(treeClassOf({ tree_category: '' }, 'use')).toBe('unrecorded');
    expect(defaultTitle({ trees: true, treeColour: 'use' })).toBe('FRUIT, TIMBER AND ORNAMENTAL TREES MAP');
  });
});
