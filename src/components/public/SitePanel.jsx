import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import areaIcon from '../../assets/Total_Area_icon.png';
import maiIcon from '../../assets/Total_MAI_icon.png';
import elevationIcon from '../../assets/Elevation_Type_icon.png';
import soilIcon from '../../assets/Soil_Type_icon.png';
import rainfallIcon from '../../assets/Average_Rainfall_icon.png';
import temperatureIcon from '../../assets/Average_Temperature_icon.png';
import floodIcon from '../../assets/Flood.png';
import landslideIcon from '../../assets/Landslide.png';
import { formatArea } from '../../lib/areaGeometry.js';
import {
  annualBiomassTonnes,
  formatTonnesPerYear,
  landCoverById,
  maiSourceNote,
} from '../../lib/landCover.js';
import {
  SITES_ARE_SAMPLE,
  hazardAreaM2,
  hazardShare,
  placeLine,
  seedlingCapacity,
  siteAreaHa,
  siteAreaM2,
  siteTitle,
  statusOf,
} from '../../lib/mapSites.js';
import { DATA_SOURCES, DATA_SOURCE_INTRO } from '../../lib/dataSources.js';
import InfoHint from './InfoHint.jsx';
import { ProvisionalNote, ProvisionalTag } from './Provisional.jsx';

/** In step with the slide class below, and with the other two panels'. */
const SLIDE_MS = 300;

/** One line of what to do at a planting site, with its amber dot while it is invented. */
function ActionRow({ label, sample = false, children }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="shrink-0 font-bold text-slate-700">{label}</dt>
      <dd className="flex-1 text-slate-600">{children}</dd>
      {sample && <ProvisionalTag kind="placeholder" compact className="mt-1.5" />}
    </div>
  );
}

/** The thin green rule the mockup puts under every section heading. */
function SectionHeading({ children }) {
  return (
    <h3 className="border-b-2 border-green-600/70 pb-1 text-sm font-bold text-slate-700">
      {children}
    </h3>
  );
}

/** A headline figure: icon on the left, label above, number below. */
function FigureBlock({ icon, label, value, tone = 'slate', hint = null, note = '', provisional = null }) {
  const colour = tone === 'red' ? 'text-red-600' : 'text-slate-600';
  return (
    <div className="flex items-start gap-3 py-2.5">
      <img src={icon} alt="" aria-hidden="true" className="mt-0.5 h-9 w-9 shrink-0 object-contain" />
      <div className="min-w-0 flex-1">
        <p className="flex items-start gap-1 text-[12px] font-bold leading-snug text-slate-700">
          <span>{label}</span>
          {hint && <InfoHint label={`Where ${label} comes from`} text={hint} size={13} />}
          {provisional && <ProvisionalTag kind={provisional} className="ml-auto" />}
        </p>
        <p className={`text-xl font-extrabold leading-tight ${colour}`}>{value}</p>
        {note && <p className="text-[11px] leading-tight text-slate-400">{note}</p>}
      </div>
    </div>
  );
}

/** A quieter one-line fact: icon, name, value on the same line. */
function FactRow({ icon, label, value, provisional = null }) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <img src={icon} alt="" aria-hidden="true" className="h-7 w-7 shrink-0 object-contain" />
      <p className="min-w-0 text-[12.5px] leading-snug text-slate-600">
        <span className="font-semibold text-slate-700">{label}:</span>{' '}
        <span>{value}</span>
      </p>
      {provisional && <ProvisionalTag kind={provisional} compact className="ml-auto" />}
    </li>
  );
}

/**
 * Square metres or hectares, the visitor's choice.
 *
 * A hectare is the unit a forester plans in and a square metre is the unit a
 * resident can picture, and the same panel is read by both.
 */
function UnitToggle({ unit, onChange }) {
  const options = [
    ['m2', 'm²'],
    ['ha', 'ha'],
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-200" role="group" aria-label="Area unit">
      {options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={unit === value}
          className={`px-2 py-0.5 text-[11px] font-bold transition ${
            unit === value ? 'bg-green-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** How much of the area a hazard reaches, or that nobody has checked. */
function HazardBlock({ icon, label, feature, unit }) {
  const exposed = hazardAreaM2(feature, label === 'Flooding' ? 'flood' : 'landslide');
  const share = hazardShare(feature, label === 'Flooding' ? 'flood' : 'landslide');

  if (exposed === null) {
    return (
      <FigureBlock
        icon={icon}
        label={`Area Exposed to ${label}`}
        value="Not assessed"
        provisional="awaiting"
        note="No hazard layer has been uploaded for this area yet."
      />
    );
  }

  // Zero is a finding, not an absence, and it should not be read in alarm red.
  const none = exposed <= 0;
  return (
    <FigureBlock
      icon={icon}
      label={`Area Exposed to ${label}`}
      value={none ? 'None mapped' : formatArea(exposed, unit)}
      tone={none ? 'slate' : 'red'}
      // The share is invented while the records are samples; the NOAH layer
      // will hand over square metres and this stops being a placeholder.
      provisional={SITES_ARE_SAMPLE ? 'placeholder' : null}
      note={none ? 'None of this area falls inside the hazard extent.' : `${Math.round(share * 100)}% of the area`}
    />
  );
}

/** The seals of the agencies the ground truth belongs to. */
function SourceCredits() {
  return (
    <section className="mt-5 border-t border-slate-200 pt-3">
      <p className="text-[11px] italic leading-snug text-slate-500">{DATA_SOURCE_INTRO}</p>
      <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-3">
        {DATA_SOURCES.map((source) => (
          <li key={source.id} className="group relative">
            <img
              src={source.logo}
              alt={`${source.name} — ${source.supplies}`}
              title={`${source.name} — ${source.supplies}`}
              className="h-8 w-auto max-w-[72px] object-contain opacity-80 transition group-hover:opacity-100"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The side panel the public map opens for a SPACE rather than a point.
 *
 * It sits on the right because the left is spoken for: a tree and the city it
 * stands in both open there, and a visitor who taps a forest while a tree is
 * open should see both at once rather than watch one shove the other out. The
 * two sides also say something true about what they hold — what is at this
 * point on the left, what is across this ground on the right.
 *
 * Both kinds answer the same four questions in the same order, so somebody who
 * has read one already knows where to look in the other:
 *   what is here · how big is it · what is the ground like · what can go wrong
 * The planting site then adds the thing it exists for — what to plant.
 */
export default function SitePanel({ feature, onClose, onCollapsedChange }) {
  const [collapsed, setCollapsed] = useState(false);
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [unit, setUnit] = useState('m2');
  const closeTimer = useRef(null);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Tapping another area swaps the contents rather than re-animating the panel,
  // and brings it back if it had been collapsed.
  const collapsedRef = useRef(false);
  const id = feature?.properties?.id;
  useEffect(() => {
    clearTimeout(closeTimer.current);
    setLeaving(false);
    if (collapsedRef.current) {
      collapsedRef.current = false;
      setCollapsed(false);
      onCollapsedChange?.(false);
    }
    // onCollapsedChange is not a dependency: it is a fresh function every
    // render of the map, and re-running this on every render would fight the
    // collapse button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function handleClose() {
    if (leaving) return;
    setLeaving(true);
    onCollapsedChange?.(true);
    closeTimer.current = setTimeout(() => onClose?.(), SLIDE_MS);
  }

  function toggleCollapsed() {
    const next = !collapsed;
    collapsedRef.current = next;
    setCollapsed(next);
    onCollapsedChange?.(next);
  }

  const showing = entered && !collapsed && !leaving;

  if (!feature) return null;

  const props = feature.properties ?? {};
  const isPlantingSite = props.kind === 'planting-site';
  const title = siteTitle(feature);
  const areaM2 = siteAreaM2(feature);
  const cover = landCoverById(props.coverId);
  const mai = isPlantingSite ? null : annualBiomassTonnes(props.coverId, siteAreaHa(feature));
  const status = statusOf(feature);
  const seedlings = isPlantingSite ? seedlingCapacity(areaM2, props.spacingM) : null;

  const statusTone =
    status.tone === 'green'
      ? 'bg-green-100 text-green-800'
      : status.tone === 'amber'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-slate-100 text-slate-600';

  return (
    <>
      <aside
        role="complementary"
        aria-label={title}
        aria-hidden={collapsed}
        className={`absolute inset-y-0 right-0 z-[600] flex w-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] sm:w-[380px] sm:rounded-l-2xl ${
          showing ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* What this is, and where */}
        <div className="flex items-start gap-2 border-b border-slate-200 px-4 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold leading-tight text-slate-900">{title}</h2>
            <p className="mt-0.5 text-[12px] italic leading-snug text-slate-500">
              {isPlantingSite ? `Verified by the ${props.verifiedBy}` : cover?.label ?? 'Land cover not yet classified'}
            </p>
            <p className="text-[12px] italic leading-snug text-slate-500">{placeLine(feature)}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={`Close ${title}`}
            className="shrink-0 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* Nothing below the geometry is a measurement yet, and saying so is
              not optional: these are figures about somebody's land. */}
          {SITES_ARE_SAMPLE && (
            <ProvisionalNote kind="placeholder" title="everything but the area" className="mb-3">
              The boundary is drawn inside the right barangay and the area is measured from it, so
              that figure is real. Everything carrying an amber dot below is invented, and stays so
              until the PGENRO uploads the survey layers.
            </ProvisionalNote>
          )}

          {isPlantingSite && (
            <p className={`mb-3 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${statusTone}`}>
              {status.label}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <SectionHeading>Details</SectionHeading>
            <UnitToggle unit={unit} onChange={setUnit} />
          </div>

          <div className="divide-y divide-slate-100">
            <FigureBlock
              icon={areaIcon}
              label={isPlantingSite ? 'Total Area of Tree Planting Site' : 'Total Area'}
              value={formatArea(areaM2, unit)}
              hint="Measured from the boundary drawn on the map, not from a stored figure — correct the boundary and this figure follows."
            />

            {!isPlantingSite && (
              <FigureBlock
                icon={maiIcon}
                label="Estimated Total MAI AGB"
                value={mai === null ? '—' : `${formatTonnesPerYear(mai)} t/yr`}
                provisional="borrowed"
                hint={maiSourceNote(props.coverId)}
                note={
                  cover
                    ? `${siteAreaHa(feature).toFixed(2)} ha × ${cover.maiTPerHaYear} t/ha/yr`
                    : 'No land cover classified for this area yet.'
                }
              />
            )}
          </div>

          {/* What the ground is like */}
          <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-200 pt-1">
            <FactRow
              icon={elevationIcon}
              label="Elevation Type"
              provisional={SITES_ARE_SAMPLE ? 'placeholder' : null}
              value={
                props.elevationM != null
                  ? `${props.elevationType} — ${props.elevationM} m asl`
                  : (props.elevationType ?? 'Not recorded')
              }
            />
            <FactRow
              icon={soilIcon}
              label="Soil Type"
              value={props.soilType ?? 'Not recorded'}
              provisional={SITES_ARE_SAMPLE ? 'placeholder' : null}
            />
            <FactRow
              icon={rainfallIcon}
              label="Average Rainfall"
              provisional={SITES_ARE_SAMPLE ? 'placeholder' : null}
              value={
                props.rainfallMmPerYear != null
                  ? `${props.rainfallMmPerYear.toLocaleString('en-US')} mm a year`
                  : 'Not recorded'
              }
            />
            <FactRow
              icon={temperatureIcon}
              label="Average Temperature"
              provisional={SITES_ARE_SAMPLE ? 'placeholder' : null}
              value={props.temperatureC != null ? `${props.temperatureC} °C` : 'Not recorded'}
            />
          </ul>

          {/* What can go wrong with it */}
          <div className="mt-2 divide-y divide-slate-100 border-t border-slate-200">
            <HazardBlock icon={landslideIcon} label="Landslide" feature={feature} unit={unit} />
            <HazardBlock icon={floodIcon} label="Flooding" feature={feature} unit={unit} />
          </div>

          {/* The thing a planting site exists for */}
          {isPlantingSite && (
            <section className="mt-4">
              <div className="flex items-end justify-between gap-2">
                <SectionHeading>Recommended Trees to Plant in the Area</SectionHeading>
                {/* Hand-written, not matched: DENR RISE is not encoded yet. */}
                {SITES_ARE_SAMPLE && <ProvisionalTag kind="placeholder" />}
              </div>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {(props.recommended ?? []).map((tree) => (
                  <li key={tree.common}>
                    <span
                      title={tree.why ? `${tree.scientific} — ${tree.why}` : tree.scientific}
                      className="inline-block cursor-help rounded-md bg-green-50 px-2.5 py-1.5 text-[12px] font-bold text-green-900 ring-1 ring-inset ring-green-200"
                    >
                      {tree.common}
                    </span>
                  </li>
                ))}
              </ul>
              {(props.recommended ?? []).length === 0 && (
                <p className="mt-2 text-[11.5px] text-slate-500">
                  No species have been matched to this site yet.
                </p>
              )}
              <p className="mt-2 text-[11px] leading-snug text-slate-400">
                Matched to this site&apos;s elevation, soil, rainfall and hazard exposure from the
                DENR RISE species list. Hover a name for why it suits the ground here.
              </p>

              {/* What to do about it. A site nobody can act on is a map pin.
                  Every row is invented while the sites are samples — including
                  the seedling count, which is real arithmetic on a real area
                  divided by a spacing somebody made up. */}
              <dl className="mt-3 space-y-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] leading-snug">
                {props.plantingWindow && (
                  <ActionRow label="When:" sample={SITES_ARE_SAMPLE}>
                    {props.plantingWindow}
                  </ActionRow>
                )}
                {seedlings !== null && (
                  <ActionRow label="Room for:" sample={SITES_ARE_SAMPLE}>
                    about {seedlings.toLocaleString('en-US')} seedlings at {props.spacingM} m spacing
                  </ActionRow>
                )}
                {props.accessNote && (
                  <ActionRow label="Getting there:" sample={SITES_ARE_SAMPLE}>
                    {props.accessNote}
                  </ActionRow>
                )}
                {props.contact && (
                  <ActionRow label="Ask:" sample={SITES_ARE_SAMPLE}>
                    {props.contact}
                  </ActionRow>
                )}
              </dl>
            </section>
          )}

          <SourceCredits />

          {props.updatedAt && (
            <p className="mt-3 flex items-center gap-1.5 text-[10.5px] text-slate-400">
              Record last updated {props.updatedAt}.
              {SITES_ARE_SAMPLE && <ProvisionalTag kind="placeholder" compact />}
            </p>
          )}
        </div>
      </aside>

      {/* Collapse handle, riding the panel's edge so it moves with it. */}
      <button
        type="button"
        onClick={toggleCollapsed}
        className={`absolute right-0 top-1/2 z-[600] hidden -translate-y-1/2 items-center rounded-l-lg border border-r-0 border-slate-200 bg-white py-4 pl-1.5 pr-1 text-slate-500 shadow-lg transition-[transform,color] duration-300 ease-[cubic-bezier(0.2,0,0,1)] hover:text-green-700 sm:flex ${
          showing ? '-translate-x-[380px]' : 'translate-x-0'
        }`}
        aria-label={collapsed ? `Show ${title}` : `Hide ${title}`}
        title={collapsed ? `Show ${title}` : `Hide ${title}`}
      >
        {collapsed ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>
    </>
  );
}
