# Accounts and Mapping

The LGU accounts, and the map they draw land cover on. Written 14 October 2026
from the spec and the answers to the questions on it, so that every decision
below is one that was made, not one that was assumed. Where something is still
mine rather than yours, it says so.

## What was decided

| # | Question | Decision |
|---|---|---|
| 1 | Who creates accounts | **PGENRO.** It issues an account code; the MENRO/CENRO officer enters the code and sets up their own account remotely. No code, no LGU account. |
| 1a | What PGENRO can do to an account | Reset password, update email, change password, **lock**, **archive**. Never delete. |
| 2 | Drawing outside one's own LGU | **Not allowed.** Everything outside the LGU is masked and untouchable, the same way everything outside Laguna is on the public map. |
| 3 | Review before areas go public | **None.** The map is for planning. It is never a land title, survey plan or proof of ownership — those belong to the Assessor's Office — and the page says so. |
| 4 | Who edits a saved area | The MENRO/CENRO of that LGU edits and deletes its own. PGENRO edits what PGENRO drew. When PGENRO edits a MENRO's area, the change is **held as a proposal** and the MENRO approves or declines it. |
| 5 | Land cover classes | **NAMRIA's national classes**, each matched to a published MAI where one exists — see below. Land *cover*, not land *classification*. |
| 6 | The classification suggestion | No existing PGENRO or MENRO rule. Built from the draft below: a mix of different trees reads as secondary forest. |
| 7 | Supporting documents | Required only when the area claims a **legal designation**. Optional for land cover alone. |
| 8 | Build order | Accounts → the MENRO map → drawing → PGENRO layer uploads → reports. |
| 9 | The old Command Center | Its **Dispatch, Issue Permit, Re-assign** and **centre-the-map** controls and its **pin colours** move into the MENRO map. The **Biodiversity Map / Action Map** toggle goes. |
| 10 | Panels on a phone | One at a time. *Done, `ae8c963`.* |

Still open: whether the field app's pending work in
`C:\dev\projects\tree_inventory` can be committed as it is before anything
touches it. Nothing in phase 1 needs the mobile app to change (see below), so
this blocks nothing yet.

## Roles

| | PGENRO | MENRO / CENRO | Field officer |
|---|---|---|---|
| Web app | ✓ | ✓ | — |
| Mobile app | ✓ | ✓ | ✓ |
| Sees | all of Laguna | all of Laguna, read-only outside its LGU | its assignments |
| Draws land cover | anywhere in Laguna | inside its own LGU | — |
| Edits a MENRO's area | proposes; MENRO decides | its own LGU's | — |
| Issues account codes | for LGU admins | — | — |
| Approves field officers | — | its own LGU's | — |
| Manages accounts | all of them | — | — |
| Seats | as many as needed | **5 per LGU** | per LGU, no cap |

"CENRO" here is the City ENRO of an LGU, not DENR's Community ENRO. On screen
it is always written **MENRO / CENRO** or **City ENRO** so the two are never
mistaken for each other.

The database calls these `pgenro`, `lgu_admin` and `field_officer`. The two
roles that exist today map across: `admin` → `pgenro` (it is your account, the
only one), `arborist` → `field_officer`.

## Accounts

### The account code

- PGENRO picks an LGU and issues a code. **One code is one seat**: five admins
  means five codes, each used once. A code shared around the office cannot
  quietly become six accounts.
- A code expires after **14 days** unused, and PGENRO can revoke one before
  then.
- An LGU can never hold more than five active admins **plus** outstanding
  codes. The database refuses the sixth; it is not a rule the page enforces.
- Codes look like `SCZ-7K2P-9QXM`: the LGU's short name, then eight characters
  from an alphabet with no 0/O or 1/I/L, so one read over the phone arrives
  intact. Only a hash is stored. Somebody reading the table cannot redeem it.

### Activating

The officer opens **Activate account**, types the code, and is told which
account it unlocks — "Santa Cruz · MENRO" — before typing anything else. Then
name, email and password. Supabase sends the usual confirmation email; after
that they sign in.

The code is checked twice: once by the page, so a mistyped code says so
straight away, and again by the database as the account is created, so a page
that skips the first check still gets nowhere.

### Field officers — unchanged

The field app already registers arborists with their municipality and holds
them for approval. That stays. The only difference is *who* approves: the
MENRO/CENRO of that municipality, not a single global admin. **No change to the
mobile app.**

### What PGENRO can do to an account

| Action | How |
|---|---|
| Reset password | Supabase sends the officer a reset email. They choose the new one. |
| Change password | PGENRO sets one directly. For a locked-out officer with no access to their email. |
| Update email | PGENRO sets the new address. |
| Lock | The account still exists, every record it made still stands, it cannot sign in. Reversible. |
| Archive | For someone who has left. Cannot sign in, frees the seat, keeps every record and its name on everything it did. Reversible. |

Lock and archive are enforced by the database's access rules, not just by the
page, so a locked officer with a session still open can read and write nothing.

Changing someone else's password or email needs Supabase's service key, which
must never reach a browser. Those two go through one small server function,
`supabase/functions/manage-account`. **It has to be deployed once** — the
Supabase dashboard's Edge Functions page takes it as a paste. Until then, the
other three actions work and those two say they are unavailable.

### The activity log

PGENRO "monitors" the LGU accounts through a log: who drew, edited, deleted,
uploaded, approved, issued, locked or archived what, when, and in which LGU.
Written by the database as the change happens, not by the page, so nothing can
be done that skips it.

## Land cover

### NAMRIA's classes, and the MAI behind each

NAMRIA's national land cover map has twelve classes. Each is matched below to
the published MAI table you supplied, with how good the match is. "None" is
never zero: it is a class with no published rate, and the page says so in
amber rather than claiming the ground grows nothing.

| NAMRIA class | MAI (t/ha/yr) | From | How good a match |
|---|---|---|---|
| Closed forest | **6.23** | Dipterocarps, Makiling — Racelis, 2000 | **Good, and local.** Makiling is in Laguna, so this is the one rate on the list that is *not* borrowed from elsewhere. Lasco & Pulhin (2006, Table 2) give 3.5–7.4 for 66–80-year dipterocarp stands; 6.23 sits inside it. |
| Open forest | **3.5** | Secondary forest, Leyte — Lasco et al., 1999 | Good. Open forest is mostly the residual and regenerating secondary forest Lasco, Visco & Pulhin (2001) describe. |
| Brush / shrubs | **9.5** | Brushlands, Leyte — Lasco et al., 1999 | Direct. Lasco et al. (2001): "about 20% forest cover or less … relict trees, shrubs and grasses." |
| Perennial crop | **10.6** | Fallow system (agroforestry), Cebu — Lasco & Suson | **Approximate.** NAMRIA puts agroforests, orchards and coconut here; the only agroforestry rate in the table is an improved *Leucaena* fallow. The best available, not a good fit. |
| Grassland | none | — | No woody increment rate in the table. |
| Mangrove forest | none | — | No rate, and Laguna de Bay is fresh water: nothing to classify. |
| Annual crop | not applicable | — | Harvested yearly; no standing woody biomass accumulates. |
| Open / barren · Built-up · Marshland / swamp · Fishpond · Inland water | not applicable | — | Not tree cover. |

What your four words become:

- **Secondary forest** → Open forest (3.5), or Closed forest (6.23) where the
  canopy is closed. Most closed forest in Laguna — Makiling, Banahaw — *is*
  secondary forest; NAMRIA separates by canopy, not by history.
- **Bushland** → Brush / shrubs (9.5).
- **Agroforest** → Perennial crop (10.6), with the caveat above.
- **Dipterocarp** → Closed forest (6.23).

Tree plantations are not a NAMRIA class — they are mapped as forest. The
twenty-five species rows in the table (Gmelina, mahogany, the acacias…) become
an optional "plantation species" on a forest area, which overrides the class
rate. That is the PGENRO unlock from the last ticket, still parked.

**One correction to check.** The table cites the agroforestry fallow as *Lasco
and Suson, 1989*. The Lasco, Visco & Pulhin (2001) paper you sent cites it as
*Lasco, R.D. & Suson, P.D. 1999, "A Leucaena leucocephala-based indigenous
fallow system in central Philippines: the Naalad system", International Tree
Crops Journal 10: 161–174.* Naalad is in Cebu, which matches the table's
location. **1999 looks right and 1989 looks like a typo** — but it is in the
code as written until you confirm.

### The suggestion, as a draft for PGENRO

The page suggests; the officer decides. A suggestion it cannot back is worse
than none, so the rules say nothing more than the tagged trees can support.

What the trees **can** tell us: how many kinds there are, how evenly they are
spread, what they are grown for, whether dipterocarps are among them.

What they **cannot**: canopy cover, or how many trees there really are. A
tagged tree is a tree somebody tagged; ten tags in a hectare is a survey that
has barely started, not a sparse forest. So the suggestion never comes from
tree density, and **never suggests brush, grassland or anything defined by the
*absence* of trees** — those need eyes on the ground.

| When the trees inside the area are… | Suggest | Because |
|---|---|---|
| fewer than **10** | nothing | Too few to say anything. "Choose from what you see on the ground." |
| half or more **fruit** trees | Perennial crop (agroforest) | Lasco et al. (2001) put fruit orchards and tree-based farms with upland farms. |
| **5+ species**, none over **40%**, and dipterocarps **30%+** of them | Closed forest | A mixed stand with a dipterocarp canopy. |
| **5+ species**, none over **40%** | Open forest (secondary) | Your rule: a mix of different trees is secondary forest. |
| one species **60%+** of them | Closed or open forest, **noted as a likely plantation** | A stand that uniform was planted. |
| anything else | nothing | |

The suggestion is always shown with its reason in words ("12 trees, 7 species,
none over 30% — a mixed stand"), and the thresholds live in one file so PGENRO
can change them without anyone touching the logic.

## Documents

- An area has a land cover (required) and, optionally, a **legal designation**:
  protected area · forest land under a DENR land classification map · a zone in
  the LGU's zoning ordinance · a Forest Land Use Plan area.
- **A legal designation requires its document.** Land cover alone does not.
- Before an upload, a modal says: the system does not check what is uploaded;
  the file will be published on the website for anyone to read; upload only
  public documents — laws, ordinances, proclamations, plans.
- PDF only, with a document type, number and title typed in ("Municipal
  Ordinance No. 2019-012, Zoning Ordinance of Santa Cruz"), so the public can
  find it without opening it.
- Every area, everywhere it is shown, carries: **"For planning purposes only.
  Not a land title, survey plan or proof of ownership."**

## The MENRO map

*Built — phase 2.* The public map itself (`TreeMap` in
`src/pages/public/PublicMap.jsx`), so the two cannot drift apart, with:

- the **pin colours** from the Command Center — red hazard needing action,
  orange dispatched, grey crowdsourced awaiting a field check, yellow
  permitted, green healthy. A group bubble takes the colour of its **most
  urgent** tree, so one hazard among forty healthy trees is not hidden in a
  green bubble;
- **Dispatch / Re-assign** and **Issue Permit** at the foot of the tree panel,
  with the Command Center's rules: only a hazard is dispatched, a hazard
  somebody is on is re-assigned, a permit is issued once;
- a **centre the map** button;
- **street and satellite as picture buttons**, bottom right, under the
  **draw** button;
- **draw and measure**: Google Maps' gestures, with every edge's length laid
  along it and a live box giving the area (m² or ha) and the perimeter. A
  point outside the officer's LGU is refused, and the box says why;
- outside the officer's LGU covered over, its trees not shown — inaccessible,
  as asked;
- "View on map" from the Action Board opens the tree.

The header and footer follow the public site: Green Tag, then **BioDashboard,
Action Board, Map, Trees**. Action Board carries a red count of hazards nobody
has been sent to; the office's seal carries a red "!" when field officers are
waiting for approval, and opens Field officers, Permit logs, Accounts (PGENRO)
and Sign out.

The Command Center page, its pin popup and its Biodiversity / Action toggle
are retired.

In the database, `supabase/lgu_fence.sql` replaces "any signed-in account may
change any tree": PGENRO any tree; a MENRO / CENRO their own LGU's; a field
officer their own LGU's and any tree they were dispatched to.

## Phases

1. **Accounts and roles.** The database (roles, LGUs, codes, account status,
   activity log, access rules), the server function, activation, PGENRO's
   account management, sign-in that knows the role. *Built and tested; waits
   on `accounts.sql` being run.*
2. **The MENRO map.** The public map plus the Command Center's controls,
   masked to the LGU — and tree changes fenced to the LGU in the database.
   *Built and tested; the fence waits on `lgu_fence.sql` being run.*
3. **Saving what is drawn.** *Built and tested; waits on `map_areas.sql`
   being run.* After drawing, **Save this area** opens a form: what the map
   measured (area, perimeter, barangay, the tagged trees inside), the
   suggestion with its reason, the NAMRIA class, an optional legal designation
   with its PDF (warned first that it is published), or a planting site's
   details. Saved areas replace the samples on both maps. The office that drew
   an area edits it, moving its points on the map, or deletes it. PGENRO's
   change to an office's area is a proposal, shown to that MENRO / CENRO in
   the area's panel with what would change, to approve or decline.
4. **PGENRO's layers.** Elevation, soil, CLIRAM climate, NOAH hazards —
   replacing the amber placeholders the review step will show until then.
5. **Reports.** The GHG inventory table first (trees, DBH, barangay,
   sequestered carbon — all already in the data); then hazard maps, STANDL map
   export, and the City Biodiversity Index.

## For you to run, when phase 1 lands

1. `supabase/accounts.sql` in the SQL editor. Read its first section before
   running — it turns your `admin` account into the first PGENRO account.
2. Deploy `supabase/functions/manage-account` from the dashboard (Edge
   Functions → Deploy a new function → paste). Optional until a password or
   email needs changing for someone.

## Sources

- Lasco, R.D., Visco, R.G. & Pulhin, J.M. (2001). Secondary forests in the
  Philippines: formation and transformation in the 20th century. *Journal of
  Tropical Forest Science* 13(4): 652–670.
- Lasco, R.D. & Pulhin, J.M. (2006). Environmental impacts of community-based
  forest management in the Philippines. *Int. J. Environment and Sustainable
  Development* 5(1): 46–56. Table 2, MAI of above-ground biomass.
- NAMRIA national land cover classes, via UN-REDD:
  https://www.un-redd.org/sites/default/files/2021-10/01_02_03_Wevina_Manuel_RS_LU_Philippines.pdf
- Land classification and A&D proof: G.R. No. 218269 (2018); DENR DAO 98-37.
- RA 6967 (1990), Makiling Forest Reserve; RA 9847 (2009), Mts. Banahaw–San
  Cristobal Protected Landscape; RA 7160 §447/458 (zoning); DENR–DILG JMC
  2003-01 (FLUP).
