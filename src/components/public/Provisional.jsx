/**
 * Amber means: this figure is not computed from the inventory.
 *
 * Most of what these pages show is DYNAMIC — counted from the tagged trees
 * every time the page loads, and already right the moment a new tree is
 * tagged. Some of it is not, and the difference matters to anybody planning
 * what to build next, because the second kind needs somebody to go and do
 * something before it becomes true.
 *
 * Amber is reserved for that second kind, and it has to stay reserved or it
 * stops meaning anything. In particular these are NOT amber, even though they
 * read like caveats:
 *
 *   "From 103 of 110 trees measured"      — live; it moves as heights are recorded
 *   "No tagged trees in Pila yet"         — live; it moves as trees are tagged
 *   "14 species, 2 not yet identified"    — live
 *   "Barangays with nothing tagged are left out"  — live
 *
 * Those clear themselves as the inventory grows. The four kinds below do not:
 * each one names a thing somebody has to go and do.
 */

/**
 * The four ways a figure can fail to be live, in rising order of how much work
 * it takes to fix.
 *
 * `means` is written for whoever is planning the next build, which is who asks
 * this question. It says what has to happen, not what is wrong.
 */
export const PROVISIONAL_KINDS = {
  assumed: {
    label: 'Assumed',
    means:
      'A constant this system chose rather than measured. It does not move with the data — ' +
      'only somebody changing it moves it.',
  },
  borrowed: {
    label: 'Borrowed',
    means:
      'A real published measurement, but taken somewhere else and applied here. It holds until ' +
      'an equivalent is measured in Laguna.',
  },
  placeholder: {
    label: 'Placeholder',
    means: 'Invented, standing in for real data. It will be replaced outright, not corrected.',
  },
  awaiting: {
    label: 'Awaiting data',
    means: 'No figure at all until another system supplies one. Nothing here can derive it.',
  },
};

const kindOf = (kind) => PROVISIONAL_KINDS[kind] ?? PROVISIONAL_KINDS.awaiting;

/**
 * The amber block: a heading and the reason, set apart from the figures around
 * it so that nobody has to go looking for the weak link.
 */
export function ProvisionalNote({ kind = 'awaiting', title, children, className = '' }) {
  const { label } = kindOf(kind);
  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 ${className}`}
      data-provisional={kind}
    >
      <p className="text-[11px] font-bold text-amber-900">
        {/* The kind is said in words, not by the colour alone — amber tells a
            reader who can see it that something is up, and nothing at all to
            a reader who cannot. */}
        <span className="uppercase tracking-wide">{label}</span>
        {title ? <span className="normal-case tracking-normal"> — {title}</span> : null}
      </p>
      {children ? (
        <div className="mt-0.5 text-[10.5px] leading-snug text-amber-800">{children}</div>
      ) : null}
    </div>
  );
}

/**
 * The amber marker for one figure in a list or a table, where a block would be
 * louder than the thing it is marking.
 *
 * `compact` is the dot on its own, for a row that already has four of these
 * beside it; the label still reaches a screen reader and the pointer.
 */
export function ProvisionalTag({ kind = 'awaiting', note = '', compact = false, className = '' }) {
  const { label, means } = kindOf(kind);
  const title = note ? `${label} — ${note}` : `${label} — ${means}`;

  if (compact) {
    return (
      <span className={`inline-flex items-center ${className}`} data-provisional={kind}>
        <span
          aria-hidden="true"
          title={title}
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 ring-2 ring-amber-200"
        />
        <span className="sr-only">{title}</span>
      </span>
    );
  }

  return (
    <span
      title={title}
      data-provisional={kind}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-inset ring-amber-200 ${className}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      {label}
    </span>
  );
}

/**
 * What the amber means, said once on the page that uses it most.
 *
 * Without this the colour is a mood. With it, a reader can tell at a glance
 * which figures would change if the inventory grew tonight and which would sit
 * exactly where they are until somebody does some work.
 */
export function ProvisionalKey({ className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white px-4 py-3 ${className}`}>
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
        Reading the figures
      </h3>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">
        Everything on this page is counted from the tagged trees each time it loads, and moves the
        moment a tree is tagged or a measurement is recorded —{' '}
        <span className="font-semibold text-slate-700">except where it is marked in amber.</span>{' '}
        Those four do not move with the data:
      </p>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {Object.entries(PROVISIONAL_KINDS).map(([kind, { label, means }]) => (
          <div key={kind} className="flex items-start gap-2">
            <ProvisionalTag kind={kind} className="mt-0.5" />
            <dd className="text-[10.5px] leading-snug text-slate-500">
              <span className="sr-only">{label}: </span>
              {means}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
