import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ELEVATION_PALETTE, HAZARD_PALETTES, SOIL_PALETTE } from '../../lib/layers/palette.js';
import { FLUP_ELEVATION_CLASSES, FLUP_SLOPE_CLASSES } from '../../lib/layers/terrain.js';

/**
 * The charts beside the attribute tables, on the A4 pages of the Tables and
 * Report tabs. Each one stretches to fill what its page leaves: the chart sits
 * in a box that grows (flex-1) and is drawn absolutely inside it, because a
 * chart cannot measure a height that only a flex layout gives.
 */

const rgb = ([r, g, b]) => `rgb(${r},${g},${b})`;
const AXIS_TICK = { fontSize: 9 };
const round = (value, places = 2) => (value === null || value === undefined ? null : Math.round(value * 10 ** places) / 10 ** places);

/** A chart's box: a heading, then the chart filling the rest. */
export function ChartBox({ title, minHeight = '60mm', maxHeight = 'none', children }) {
  return (
    <figure aria-label={title} className="flex flex-1 flex-col break-inside-avoid" style={{ minHeight, maxHeight }}>
      <figcaption className="text-[11px] font-bold uppercase tracking-wider text-slate-700">{title}</figcaption>
      <div className="relative mt-1 flex-1">
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
      </div>
    </figure>
  );
}

const nameAxis = (count) => ({
  dataKey: 'name',
  interval: 0,
  tick: AXIS_TICK,
  angle: count > 8 ? -40 : 0,
  textAnchor: count > 8 ? 'end' : 'middle',
  height: count > 8 ? 56 : 24,
});

/** Tagged trees by barangay, endemic or native against invasive. */
export function treesChart(table, props) {
  const rows = (table?.rows ?? [])
    .filter((row) => row.trees > 0)
    .map((row) => ({ name: row.name, native: row.native, invasive: row.invasive, other: row.trees - row.native - row.invasive }));
  if (rows.length === 0) return null;
  return (
    <ChartBox key="trees" title="Tagged trees by barangay" {...props}>
      <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis {...nameAxis(rows.length)} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} width={36} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Bar dataKey="native" name="Endemic / native" stackId="t" fill="#16a34a" isAnimationActive={false} />
        <Bar dataKey="invasive" name="Invasive" stackId="t" fill="#dc2626" isAnimationActive={false} />
        <Bar dataKey="other" name="Origin not recorded" stackId="t" fill="#cbd5e1" isAnimationActive={false} />
      </BarChart>
    </ChartBox>
  );
}

/** Each place's ground in flood and in landslide, by level, side by side. */
export function hazardChart(table, props) {
  const rows = (table?.rows ?? []).filter((row) => (row.floodHa ?? 0) > 0 || (row.landslideHa ?? 0) > 0);
  if (rows.length === 0) return null;
  const hasLandslide = rows.some((row) => row.landslideHa !== null);
  const data = rows.map((row) => ({
    name: row.name,
    floodLow: round(row.floodLow),
    floodMedium: round(row.floodMedium),
    floodHigh: round(row.floodHigh),
    landslideLow: round(row.landslideLow),
    landslideMedium: round(row.landslideMedium),
    landslideHigh: round(row.landslideHigh),
  }));
  const flood = HAZARD_PALETTES.flood;
  const slide = HAZARD_PALETTES.landslide;
  return (
    <ChartBox key="hazards" title="Ground exposed to hazards (ha)" {...props}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis {...nameAxis(data.length)} />
        <YAxis tick={AXIS_TICK} width={44} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Bar dataKey="floodLow" name="Flood, low" stackId="flood" fill={rgb(flood[1])} isAnimationActive={false} />
        <Bar dataKey="floodMedium" name="Flood, medium" stackId="flood" fill={rgb(flood[2])} isAnimationActive={false} />
        <Bar dataKey="floodHigh" name="Flood, high" stackId="flood" fill={rgb(flood[3])} isAnimationActive={false} />
        {hasLandslide && <Bar dataKey="landslideLow" name="Landslide, low" stackId="slide" fill={rgb(slide[1])} isAnimationActive={false} />}
        {hasLandslide && <Bar dataKey="landslideMedium" name="Landslide, medium" stackId="slide" fill={rgb(slide[2])} isAnimationActive={false} />}
        {hasLandslide && <Bar dataKey="landslideHigh" name="Landslide, high" stackId="slide" fill={rgb(slide[3])} isAnimationActive={false} />}
      </BarChart>
    </ChartBox>
  );
}

/** The CO₂ the measured trees hold, and what they take up a year, by place. */
export function carbonChart(table, props) {
  const rows = (table?.rows ?? [])
    .filter((row) => row.co2T)
    .map((row) => ({ name: row.name, co2T: round(row.co2T), sequestrationT: round(row.sequestrationT, 3) }));
  if (rows.length === 0) return null;
  return (
    <ChartBox key="carbon" title="Carbon in the tagged trees (t CO₂)" {...props}>
      <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis {...nameAxis(rows.length)} />
        <YAxis yAxisId="stock" tick={AXIS_TICK} width={44} />
        <YAxis yAxisId="rate" orientation="right" tick={AXIS_TICK} width={44} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Bar yAxisId="stock" dataKey="co2T" name="CO₂ stored (t, left)" fill="#15803d" isAnimationActive={false} />
        <Bar yAxisId="rate" dataKey="sequestrationT" name="CO₂ taken up a year (t, right)" fill="#0d9488" isAnimationActive={false} />
      </BarChart>
    </ChartBox>
  );
}

/** Mapped land cover, by NAMRIA class. */
export function coverChart(table, props) {
  const byClass = new Map();
  for (const row of table?.rows ?? []) byClass.set(row.cover ?? 'Unclassified', (byClass.get(row.cover ?? 'Unclassified') ?? 0) + row.areaHa);
  if (byClass.size === 0) return null;
  const data = [...byClass].map(([name, area]) => ({ name, area: round(area) }));
  return (
    <ChartBox key="cover" title="Land cover by class (ha)" {...props}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis {...nameAxis(data.length)} />
        <YAxis tick={AXIS_TICK} width={44} />
        <Tooltip />
        <Bar dataKey="area" name="Hectares" fill="#15803d" isAnimationActive={false} />
      </BarChart>
    </ChartBox>
  );
}

/** Each soil series' area. */
export function soilChart(table, props) {
  const rows = (table?.rows ?? []).filter((row) => row.areaHa > 0).map((row) => ({ name: row.name, area: round(row.areaHa) }));
  if (rows.length === 0) return null;
  const colour = (i) => {
    const c = SOIL_PALETTE[i % SOIL_PALETTE.length];
    return Array.isArray(c) ? rgb(c) : c;
  };
  return (
    <ChartBox key="soil" title="Soil series by area (ha)" {...props}>
      <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis {...nameAxis(rows.length)} />
        <YAxis tick={AXIS_TICK} width={44} />
        <Tooltip />
        <Bar dataKey="area" name="Hectares" isAnimationActive={false} fill={colour(0)} />
      </BarChart>
    </ChartBox>
  );
}

/** Each place's ground in the FLUP classes, stacked: elevation or slope. */
function classChart(table, props, { classes, title, colourOf }) {
  const rows = (table?.rows ?? []).filter((row) => classes.some((cls) => row[cls.id]));
  if (rows.length === 0) return null;
  const data = rows.map((row) => ({ name: row.name, ...Object.fromEntries(classes.map((cls) => [cls.id, round(row[cls.id])])) }));
  return (
    <ChartBox key={table.key} title={title} {...props}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis {...nameAxis(data.length)} />
        <YAxis tick={AXIS_TICK} width={44} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        {classes.map((cls, i) => (
          <Bar key={cls.id} dataKey={cls.id} name={cls.label} stackId="c" fill={colourOf(cls, i)} isAnimationActive={false} />
        ))}
      </BarChart>
    </ChartBox>
  );
}

export const elevationChart = (table, props) =>
  classChart(table, props, {
    classes: FLUP_ELEVATION_CLASSES,
    title: 'Ground by elevation class (ha)',
    colourOf: (cls, i) => {
      const c = ELEVATION_PALETTE[Math.min(ELEVATION_PALETTE.length - 1, i * 2 + 1)];
      return Array.isArray(c) ? rgb(c) : c?.colour ? rgb(c.colour) : '#a16207';
    },
  });

export const slopeChart = (table, props) =>
  classChart(table, props, {
    classes: FLUP_SLOPE_CLASSES,
    title: 'Ground by slope class (ha)',
    colourOf: (cls) => rgb(cls.colour),
  });

/** The CLIRAM months: rainfall as bars, temperature as a line on its own axis. */
export function climateChart(table, props) {
  const rows = (table?.rows ?? []).filter((row) => row.rainfall !== null || row.temperature !== null);
  if (rows.length === 0) return null;
  const data = rows.map((row) => ({ name: row.name.slice(0, 3), rainfall: round(row.rainfall, 1), temperature: round(row.temperature, 1) }));
  return (
    <ChartBox key="climate" title="Rainfall (mm) and mean temperature (°C) by month" {...props}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={AXIS_TICK} interval={0} />
        <YAxis yAxisId="rain" tick={AXIS_TICK} width={44} />
        <YAxis yAxisId="temp" orientation="right" tick={AXIS_TICK} width={36} domain={['dataMin - 1', 'dataMax + 1']} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Bar yAxisId="rain" dataKey="rainfall" name="Rainfall (mm, left)" fill="#3182bd" isAnimationActive={false} />
        <Line yAxisId="temp" dataKey="temperature" name="Temperature (°C, right)" stroke="#dc2626" strokeWidth={2} dot isAnimationActive={false} />
      </ComposedChart>
    </ChartBox>
  );
}

/** The ten most common species. */
export function speciesChart(table, props) {
  const rows = (table?.rows ?? []).slice(0, 10).map((row) => ({ name: row.name, trees: row.count }));
  if (rows.length === 0) return null;
  return (
    <ChartBox key="species" title="The most common species (trees)" {...props}>
      <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis {...nameAxis(rows.length)} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} width={36} />
        <Tooltip />
        <Bar dataKey="trees" name="Trees" fill="#15803d" isAnimationActive={false} />
      </BarChart>
    </ChartBox>
  );
}

/** The chart that goes with a table, or null. */
export function chartFor(table, props) {
  if (table.key === 'barangays') return treesChart(table, props);
  if (table.key === 'hazards') return hazardChart(table, props);
  if (table.key === 'carbon') return carbonChart(table, props);
  if (table.key === 'land-cover') return coverChart(table, props);
  if (table.key === 'soil-series') return soilChart(table, props);
  if (table.key === 'elevation') return elevationChart(table, props);
  if (table.key === 'slope') return slopeChart(table, props);
  if (table.key === 'climate') return climateChart(table, props);
  if (table.key === 'species') return speciesChart(table, props);
  return null;
}
