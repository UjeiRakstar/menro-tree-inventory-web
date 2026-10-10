# Running the SQL

Everything in this folder, in the order it has to go, with what to look for
when it comes back. Each file is safe to run twice.

Paste each one into the Supabase **SQL editor** and run it whole. The editor
shows only the **last** result set, so every file reports once, at the end.

---

## 1. `species_profiles.sql`

Adds the species write-ups and `trees.source`. If you have already run this,
skip it — but nothing below works without it.

**Look for:** no error. Nothing else to read.

---

## 2. `crowdsource_promotion.sql`

The last link in the crowdsourcing chain: publishes a verified community tag
to the map.

**Look for:** no error. If it stops with *"public.trees is missing …"*, it is
telling you a column it depends on does not exist — run step 1 first and try
again. It checks before it creates anything, so a failure here has not left
half a function behind.

---

## 3. `tree_phenology.sql`

Drops `trees.leaf_status`, `trees.flower_status` and `trees.fruit_status`.
Nothing writes them; the real observations are in `phenology_records`.

**Look for:** no error.

---

## 4. `barangays.sql`

Creates `public.barangays` — the 681 barangays of Laguna with their PSGC
codes, generated from the NAMRIA/PSA boundaries.

**Look for:** a table of your barangay names with a `reads_as` column. This is
the before picture. Expect to see `official`, plus some rows reading
*"no barangay of this name in Laguna"* — the subdivisions — and
*"official, missing the word Barangay"* for the ones stripped down to `V`.

---

## 5. `barangay_link.sql`

Adds `trees.barangay_psgc`, `trees.municipality` and `trees.landmark`, and a
trigger that keeps the barangay text in step with the code. Then it touches
every row so the trigger cleans up what it can.

**Look for:** a `status` column.

| status | what it means |
| --- | --- |
| `settled — linked to the barangay list` | Done. Nothing more to do with these. |
| `ambiguous — this name is used by more than one town` | A real barangay name that several towns share, like San Jose. Step 6 settles these. |
| `no barangay of this name in Laguna` | A subdivision or a typo. Step 6 settles most; the rest need a person. |
| `placeholder — needs the coordinates` | `Unknown Barangay`. Step 6. |

Nothing is rejected and nothing is deleted. There is **no** CHECK constraint
yet, on purpose: the field app is still writing free text today, and a
rejected row fails inside a sync on a phone after a day of field work. The
constraint is written out at the foot of that file for later.

---

## 6. `node tools/backfill-barangays.mjs` — in the terminal, not the editor

Works out every tree's barangay from its **coordinates** and writes the SQL for
you to read.

```
node tools/backfill-barangays.mjs
```

It only reads from Supabase, with the same public key the website uses, and
writes nothing to the database. It produces `supabase/barangay_backfill.sql`.

**Read that file**, then run it in the editor. Every line says what it is
changing and why, like:

```
update public.trees set barangay_psgc = 403425013 where id = '...';
  -- Santa Cruz: "Villa Silangan Subdivision" -> Barangay III
```

At the bottom it lists any tree coordinates cannot place — the Mahogany at
0,0 is one. Those need a field visit, not a query.

**Look for:** the final report, one row per barangay with its municipality.
Every tree should now be under a name the PSA recognises.

---

## 7. `rls_audit.sql`

Read-only. **Do this before launch.** It was five queries and you only saw the
last one; it is one query now.

**Look for:** the `verdict` column. Rows reading `look_at` sort to the top.
Send me the output and we can read it together — in particular:

- any table with **RLS OFF** that the anon key can reach
- any policy granted to `anon` or `public` that is not a plain SELECT
- any `SECURITY DEFINER` function **anon may execute**
- who may write to the `tree_images` bucket (it is public, which is right for
  photos on a public map — what matters is who can put files in it)

---

## 8. The field app — `C:\dev\projects\tree_inventory`

Not SQL. The app no longer asks OpenStreetMap what barangay a tree is in; it
reads the boundaries bundled in `assets/geo`. It also sends the municipality
now, which is what step 5's trigger uses to tell one "Barangay I" from
another.

`dart analyze` is clean, but **this has never run on a device.** When you test
it:

1. Capture a tree somewhere you know the barangay of, and check the location
   line on the details screen names it correctly.
2. Sync, then look at that row in Supabase: `barangay`, `municipality` and
   `barangay_psgc` should all be filled and agree.
3. Try it in airplane mode. It should still name the barangay — that is the
   whole point of not using a network geocode.

The changes sit uncommitted alongside other in-flight work in that repo.

---

## What changed in the database

| | |
| --- | --- |
| `public.barangays` | new. The 681 official barangays with PSGC codes. Readable by anyone. |
| `trees.barangay_psgc` | new. Which barangay, by code. Null until something fills it. |
| `trees.municipality` | new. The city or municipality, from the field app. |
| `trees.landmark` | new, unused for now. Where the OSM answer goes — "Villa Silangan Subdivision" is not a barangay, but it is the only clue to where that tree is. |
| `trees.barangay` | unchanged in meaning, but now kept in step with the code by a trigger rather than typed. |
| `trees.leaf_status` and friends | dropped. |
