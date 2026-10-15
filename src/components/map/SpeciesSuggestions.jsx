import { Check, Plus, Sprout } from 'lucide-react';
import { ORIGINS } from '../../lib/siteNeeds.js';

const originLabel = (id) => ORIGINS.find((origin) => origin.id === id)?.label ?? null;

/**
 * The species library's trees that suit the ground being saved as a planting
 * site (speciesMatch.recommendSpecies), each with why — for the office to add
 * to the recommended list, or not. A suggestion, never a decision.
 *
 *   result    recommendSpecies(), or null while there is nothing to match
 *   why       when result is null: what is missing ('layers' | 'library')
 *   chosen    the names already in the list, lower-cased
 *   onAdd     (name)
 */
export default function SpeciesSuggestions({ result, why = null, chosen, onAdd }) {
  if (!result) {
    return (
      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11.5px] leading-snug text-slate-500 ring-1 ring-inset ring-slate-200">
        {why === 'library'
          ? 'Suggestions come from the species library (Trees → Species (RISE)), which could not be read.'
          : 'Suggestions need PGENRO’s layers for this ground — soil, elevation, flooding — and none is uploaded yet.'}
      </p>
    );
  }

  const { suited, unsuited, invasive, noNeeds } = result;
  const setAside = [
    unsuited > 0 && `${unsuited} do not fit this ground`,
    noNeeds > 0 && `${noNeeds} have no site needs recorded yet`,
    invasive > 0 && `${invasive} invasive, never suggested`,
  ].filter(Boolean);

  return (
    <section aria-label="Suited to this ground" className="mt-2 rounded-xl border border-green-200 bg-green-50/40 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-green-900">
        <Sprout size={13} aria-hidden="true" /> Suited to this ground
      </p>
      {suited.length === 0 ? (
        <p className="mt-1.5 text-[11.5px] leading-snug text-slate-600">
          No species in the library fits what the layers say about this ground yet.
        </p>
      ) : (
        <ul className="mt-1.5 space-y-2">
          {suited.map(({ profile, fits }) => {
            const added = chosen.has(profile.species.toLowerCase());
            return (
              <li key={profile.species} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-bold leading-tight text-slate-800">
                    {profile.species}
                    {profile.scientific_name && (
                      <span className="ml-1 font-normal italic text-slate-500">{profile.scientific_name}</span>
                    )}
                  </p>
                  {originLabel(profile.origin) && (
                    <p className="text-[10.5px] font-semibold text-green-800">{originLabel(profile.origin)}</p>
                  )}
                  <ul className="mt-0.5 space-y-0.5">
                    {fits.map((fit) => (
                      <li key={fit} className="text-[10.5px] leading-snug text-slate-500">· {fit}</li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(profile.species)}
                  disabled={added}
                  aria-label={added ? `${profile.species} is in the list` : `Add ${profile.species}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-green-800 ring-1 ring-green-300 hover:bg-green-50 disabled:text-slate-400 disabled:ring-slate-200"
                >
                  {added ? <Check size={12} aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}
                  {added ? 'Added' : 'Add'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {setAside.length > 0 && (
        <p className="mt-2 border-t border-green-100 pt-1.5 text-[10.5px] leading-snug text-slate-500">
          Set aside from the library: {setAside.join('; ')}.
        </p>
      )}
    </section>
  );
}
