# Rebuilding the BioDashboard

A working plan. Five items, each one independent — stop after any of them and
the page is still coherent.

---

## Why

The page is called a **Biodiversity** dashboard and not one of its six figures
measures biodiversity. Trees, invasive trees, cover, growth, carbon, emissions
are forestry and climate figures. Species richness, dominance and native share
are the diversity ones, they are all computable from columns already in
`public.trees`, and none is shown.

Three other things work against it:

- **Half the headline is empty.** Three of six cards read "Not available yet"
  while occupying the most valuable space on the page.
- **The numbers have nothing to be compared against.** "112 trees" — is that a
  lot? Growing? Behind a target? A number with no reference is raw data.
- **No freshness.** Nothing says when the inventory was last added to.

## Who it is for

One dashboard cannot be operational, analytical and strategic at once.

| | Public BioDashboard | Officer DSS (behind login) |
| --- | --- | --- |
| Type | **Strategic** | **Operational + Analytical** |
| Reader | Residents, LGU leaders, researchers | MENRO/CENRO staff, arborists |
| Horizon | Cumulative, annual | This week, this season |
| Answers | *What is Laguna's urban forest, and why should I care?* | *What needs attention, and what do we plant next?* |

This plan is for the **public** one. The admin `BiodiversityDashboard` becomes
the DSS later; it is not in scope here.

## The shape it is heading towards

```
  ┌─ as of 25 Aug 2026 ──────────────────────────────────────────────┐
  │  Trees tagged    Species recorded    Carbon stored               │
  │      112              27              1,240 kg CO₂               │
  │   +4 this month    across 2 LGUs    ≈ 1 car off the road         │
  ├──────────────────────────────────────────────────────────────────┤
  │  WHAT IS GROWING HERE                                            │
  │  Top 10 species ▁▂▃▅▇  │ Native/introduced/invasive │ Fruit…     │
  ├──────────────────────────────────────────────────────────────────┤
  │  WHERE          Barangay leaderboard   │   the map               │
  ├──────────────────────────────────────────────────────────────────┤
  │  HOW OLD        Diameter classes 10/20/30…                       │
  ├──────────────────────────────────────────────────────────────────┤
  │  CLIMATE        Sequestration per year │ MAI AGB │ (cover, …)    │
  └──────────────────────────────────────────────────────────────────┘
```

---

## 1. The species layer — DONE

**Why.** It is the missing half of the page's own name, and it needs no data
that is not already there.

**Shows**
- **Species recorded** — a count of distinct species. A headline figure.
- **Top 10 species**, horizontal bars, longest first.
- **Native / introduced / invasive** share, from `biodiversity_status`.
- **Fruit / timber / ornamental** mix, from `tree_category`.

**The part that makes it actionable.** Draw a line on the top-species chart at
10% and flag anything above it:

> Mango is 14% of Santa Cruz's tagged trees — above the 10% guideline.
> Consider other species for new planting.

That is **Santamour's 10-20-30 rule**, the standard urban-forestry guideline:
no more than 10% of an urban forest in one species, 20% in one genus, 30% in
one family. Exceed it and one pest can take out a large share of the canopy.
A chart of top species is informative; a chart measured against a standard is
a recommendation.

**Data.** `species`, `scientific_name`, `biodiversity_status`, `species_type`,
`tree_category` — all already in `PUBLIC_DASHBOARD_COLUMNS` except the last
two, which need adding.

**Done when** the page says how many species there are, which ten are
commonest, and names any that are over-planted.

**Built.** `src/lib/speciesMetrics.js` and
`src/components/public/SpeciesSection.jsx`. The family threshold of the
10-20-30 rule is deliberately not checked: it needs a species-to-family list
this system has not got, and inventing one would be worse than checking two of
the three honestly. The page says so.

---

## 2. Where the trees are, and where they are not

**Why.** "Which barangay has the most trees" is worth answering. **Which has
the fewest is worth more** — that is where the next planting should go.

**Shows**
- **Barangay leaderboard**, top 10 by count, inside the selected LGU.
- A toggle to invert it: *fewest tagged trees*, with the barangays that have
  **none at all** listed first. `public.barangays` knows every barangay of
  every LGU, so a barangay with zero trees can be named — which a `GROUP BY`
  over `trees` alone can never do.

**Data.** `barangayForTree` already groups them. The zero-tree list is a left
join against `public.barangays`, which exists now.

**Done when** a reader can see both the best-covered and the least-covered
barangays, and the least-covered list includes the ones with nothing.

---

## 3. How old the forest is

**Why.** The single most decision-relevant thing in the data, and it is shown
nowhere. If most trees sit in the smallest diameter class, **there is no
mature canopy coming in twenty years** — and that is a planting-policy
conclusion a mayor can act on.

**Shows** a distribution across the DENR's own diameter classes from FMB
Technical Bulletin No. 3 page 7 — class 10 is 5–14 cm, 20 is 15–24, 30 is
25–34, and so on in tens.

**Data.** `dbh`, on every tree. The class table goes in `treeVolume.js`
beside the volume equation it belongs with.

**Done when** the page shows the size structure and says in a line what it
means — young and establishing, mixed, or mature.

---

## 4. Freshness

**Why.** Quality #6 asks for "appropriately timely" and nothing on the page
says when any of it was true.

**Shows**
- **As of <date>** at the top, from the newest `dateCaptured`.
- **+N this month** under the tree count.
- Optionally a cumulative tagging curve — the inventory growing over time,
  which is a good strategic visual and nearly free.

**Data.** `dateCaptured`, which needs adding to the dashboard's column list.

**Done when** no figure on the page is undated.

---

## 5. The climate figures

**Why.** Cities report against climate commitments, and the public looks for
these. Two of the three "Not available yet" cards do not have to stay that way.

### Sequestration per year — buildable now

Carbon **stored** is a stock: how much is held today. **Sequestration** is a
rate: how much is taken up per year. Climate commitments are written in rates,
so this is the figure that is actually being looked for.

It comes from the DENR volume equation applied twice — the tree as it is, and
the tree one year of growth later:

```
  AGB(now)      from V = c × D² × H           (FMB Technical Bulletin No. 3)
  AGB(+1 year)  from the same equation with D + one year's diameter growth
  sequestration = (AGB(+1) − AGB(now)) × carbon fraction × 44/12
```

Everything there is already in `src/lib/treeVolume.js` except **one year's
diameter growth**, which is the new assumption. Take it from the best source
available, in this order:

1. **Measured.** Two diameter readings of the same tree at different dates is
   the real increment, and no assumption at all. The field app does not
   re-measure trees yet, but `dateCaptured` means it could.
2. **Published, per species.** A small table PGENRO or ERDB fills in — this is
   where Lasco et al. belongs.
3. **One conservative default**, named and stated on the page, exactly as
   `WOOD_DENSITY` and `BIOMASS_EXPANSION_FACTOR` already are.

### MAI AGB — buildable now, with a caveat

Mean Annual Increment of Above Ground Biomass is the same arithmetic, stopping
one step earlier: the biomass added per year rather than the CO₂.

It was marked unavailable because the mockup wanted **Mg per hectare** per
year, and hectares need the mapping feature. But **Mg per year for the tagged
trees needs no area at all** — it is the sum of the per-tree increments. Show
that now, labelled for what it is, and divide by hectares when the mapping
work lands.

### Still genuinely pending

- **Forest / Tree Cover Area** — needs the mapping feature. No way round it.
- **Total Carbon Emission** — comes from outside this system entirely
  (Greenhouse Gases Quantification Sheet, CCC).

These two get a small strip at the foot of the page, clearly labelled, rather
than a quarter of the headline.

**Done when** sequestration per year and MAI AGB are real figures with their
assumptions stated, and only two cards remain pending.

---

## Rules for all five

- **Every figure says what it is measured against** — a guideline, a previous
  month, the other LGUs. A number alone is raw data.
- **Every figure says how much of the inventory it speaks for** when it cannot
  speak for all of it. The carbon cards already do this.
- **Nothing is encoded in colour alone.** Red for invasive gets a word too.
- **Progressive disclosure**: headline → one breakdown → detail on demand. Not
  three levels on one screen.
- **It has to work at 112 trees and at 112,000.** A chart that needs volume
  the inventory does not have yet should say so rather than look broken.
- **No invented numbers.** An assumption gets a named constant, a stated
  source, and a label on the page.
