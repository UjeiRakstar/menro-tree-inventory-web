const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ORIGIN = {
  endemic: 'Endemic — found naturally only in the Philippines',
  native: 'Native — found naturally in the Philippines and elsewhere',
  exotic: 'Exotic — brought in from abroad',
  invasive: 'Invasive — brought in, and spreading at the cost of native plants',
};

const text = (value) => String(value ?? '').trim();
const months = (value) => (Array.isArray(value) ? value.map(Number).filter((m) => m >= 1 && m <= 12) : []);

/** "June to August", "March, May": a run of months said as a range. */
export function monthsInWords(list) {
  const sorted = [...new Set(months(list))].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  if (sorted.length === 12) return 'all year';
  const runs = [];
  for (const month of sorted) {
    const last = runs.at(-1);
    if (last && month === last[1] + 1) last[1] = month;
    else runs.push([month, month]);
  }
  return runs
    .map(([from, to]) => (from === to ? MONTH_NAMES[from - 1] : `${MONTH_NAMES[from - 1]} to ${MONTH_NAMES[to - 1]}`))
    .join(', ');
}

/** What the species needs of a site, in figures (species_site_needs.sql), as one line each. */
export function siteNeedsLines(profile) {
  const range = (min, max, unit) => {
    const a = min ?? null;
    const b = max ?? null;
    if (a == null && b == null) return '';
    if (a != null && b != null) return `${Number(a).toLocaleString('en-US')}–${Number(b).toLocaleString('en-US')} ${unit}`;
    return a != null ? `from ${Number(a).toLocaleString('en-US')} ${unit}` : `up to ${Number(b).toLocaleString('en-US')} ${unit}`;
  };
  return [
    ['Elevation', range(profile.elevation_min_m, profile.elevation_max_m, 'm above sea level')],
    ['Rainfall', range(profile.rainfall_min_mm, profile.rainfall_max_mm, 'mm a year')],
    ['Temperature', range(profile.temperature_min_c, profile.temperature_max_c, '°C')],
    ['Soil', Array.isArray(profile.soil_textures) ? profile.soil_textures.filter(Boolean).join(', ') : ''],
    ['Flooding', text(profile.flood_tolerance)],
  ].filter(([, value]) => value);
}

function Fact({ label, children }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-slate-700">{children}</dd>
    </div>
  );
}

/** Flowering and fruiting through the year, one cell a month. */
function Calendar({ flowering, fruiting }) {
  return (
    <div>
      <div className="grid grid-cols-12 gap-0.5" role="img"
        aria-label={[flowering.length ? `Flowers ${monthsInWords(flowering)}` : '', fruiting.length ? `Fruits ${monthsInWords(fruiting)}` : ''].filter(Boolean).join('; ')}>
        {MONTHS.map((letter, i) => {
          const month = i + 1;
          const flowers = flowering.includes(month);
          const fruits = fruiting.includes(month);
          return (
            <div key={month} className="text-center">
              <div className="text-[10px] text-slate-400">{letter}</div>
              <div className={`h-2 rounded-t-sm ${flowers ? 'bg-pink-400' : 'bg-slate-100'}`} />
              <div className={`h-2 rounded-b-sm ${fruits ? 'bg-amber-500' : 'bg-slate-100'}`} />
            </div>
          );
        })}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-pink-400" aria-hidden="true" />Flowers{flowering.length ? `: ${monthsInWords(flowering)}` : ''}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500" aria-hidden="true" />Fruits{fruiting.length ? `: ${monthsInWords(fruiting)}` : ''}</span>
      </p>
    </div>
  );
}

/**
 * What the RISE library says of a species, beyond its description (decided
 * 18 October: "the inputs from the publication isn't enough"): its family and
 * local names, where it comes from and how rare it is, when it flowers and
 * fruits, what it needs of a site, how it is grown, what it is used for and
 * what troubles it. Only what PGENRO's forester has entered is shown.
 */
export default function SpeciesFacts({ profile }) {
  if (!profile) return null;
  const flowering = months(profile.flowering_months);
  const fruiting = months(profile.fruiting_months);
  const needs = siteNeedsLines(profile);
  const origin = ORIGIN[text(profile.origin).toLowerCase()] ?? text(profile.origin);

  const facts = [
    text(profile.family) && <Fact key="family" label="Family">{text(profile.family)}</Fact>,
    text(profile.local_names) && <Fact key="local" label="Local names">{text(profile.local_names)}</Fact>,
    origin && <Fact key="origin" label="Origin">{origin}</Fact>,
    text(profile.conservation_status) && <Fact key="status" label="Conservation status">{text(profile.conservation_status)}</Fact>,
    text(profile.distribution) && <Fact key="distribution" label="Where it grows">{text(profile.distribution)}</Fact>,
    (flowering.length > 0 || fruiting.length > 0 || text(profile.phenology_note)) && (
      <Fact key="phenology" label="Flowering and fruiting">
        {(flowering.length > 0 || fruiting.length > 0) && <Calendar flowering={flowering} fruiting={fruiting} />}
        {text(profile.phenology_note) && <span className="mt-1 block">{text(profile.phenology_note)}</span>}
      </Fact>
    ),
    (text(profile.site_requirements) || needs.length > 0) && (
      <Fact key="site" label="What it needs of a site">
        {text(profile.site_requirements)}
        {needs.length > 0 && (
          <span className="mt-1 block">
            {needs.map(([label, value]) => (
              <span key={label} className="block text-xs text-slate-600">
                <span className="font-semibold">{label}:</span> {value}
              </span>
            ))}
          </span>
        )}
      </Fact>
    ),
    text(profile.propagation) && <Fact key="propagation" label="Propagation">{text(profile.propagation)}</Fact>,
    text(profile.uses) && <Fact key="uses" label="Uses">{text(profile.uses)}</Fact>,
    text(profile.pests_diseases) && <Fact key="pests" label="Pests and diseases">{text(profile.pests_diseases)}</Fact>,
  ].filter(Boolean);

  if (facts.length === 0 && !text(profile.rise_citation)) return null;
  return (
    <section aria-label="From the RISE library" className="space-y-3 border-t border-slate-100 pt-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-green-800">From the RISE library</h3>
      <dl className="space-y-3">{facts}</dl>
      {text(profile.rise_citation) && (
        <p className="text-[11px] italic leading-relaxed text-slate-500">
          Source: {text(profile.rise_citation)}
          {text(profile.rise_url) && (
            <>
              {' '}
              <a href={text(profile.rise_url)} target="_blank" rel="noreferrer" className="break-all text-blue-600 underline">
                {text(profile.rise_url)}
              </a>
            </>
          )}
        </p>
      )}
    </section>
  );
}
