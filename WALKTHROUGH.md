# Live walk-through — 15 October 2026

Everything built on 14–15 October passes its tests, but none of it has been
used on the live site. This is one pass through it, about 30–40 minutes.

**Note what goes wrong, not only what works.** For each failure: what you
clicked, what you expected, what happened, and a screenshot. Paste them back as
they come — there is no need to finish first.

Tick boxes as you go (`[x]`). In VS Code's Markdown preview they are clickable.

---

## Before you start

- [ ] A **desktop** browser. The office pages are built for one.
- [ ] A **second, private window** for the second account. The two accounts
      must not share a session.
- [ ] An email address you can open for the trainee, other than your PGENRO
      one. A `+` alias usually works: `you+snl@lspu.edu.ph`.
- [ ] Optional: one short RISE issue as a PDF, under 8 MB.

Everything the trainee does stays behind the training wall: the public, PGENRO
and real offices never see it, and `supabase/training_purge.sql` clears it all
afterwards. That is why most of this is done as a trainee.

---

## 1. PGENRO — a training code  *(your PGENRO account)*

- [ ] Seal menu → **Accounts**. The page loads, every LGU listed.
- [ ] Find **Siniloan** → **Training code** → **Issue training code**.
- [ ] The code is shown once, with a Copy button. Copy it.
- [ ] Close the dialog. Siniloan lists the code with a violet **Training** tag,
      and its seat count did **not** go up.

## 2. Activating it  *(private window)*

- [ ] Go to `/login` → **Have an account code?**
- [ ] Enter the code. It names **Siniloan**.
- [ ] If asked to pin the hall, pin anywhere — a training account's pin is
      dropped on purpose (the hall is the real one).
- [ ] Create the account with the second email. Confirm it from the inbox if
      asked, then sign in.
- [ ] A violet **TRAINING MODE** bar shows across the top of every page.

## 3. The trainee's map  *(trainee)*

- [ ] **Map**: only Siniloan is open; everything outside it is greyed over.
- [ ] Pins in Siniloan's town centre — the 150 dummy trees. Zoomed out they
      group into **bubbles with no numbers**; a bubble with a hazard in it is
      **red**.
- [ ] Click a bubble: the map zooms in and it comes apart, pins growing in.
- [ ] Zoom all the way in: every pin stands alone, nothing fanned out.
- [ ] Open a **red** tree → **Dispatch** → one of the three *Trainee
      Arborist* names → it turns **orange**.
- [ ] Open a green tree → **Issue permit** → fill it in → it turns **yellow**.
- [ ] The centre button flies to Siniloan, and there is **no** "pin your hall"
      prompt.

## 4. Saving an area  *(trainee)*

- [ ] **Draw** (bottom right) → click 4–5 points around a block of pins →
      click the first point to close it.
- [ ] The measure box shows the area and **Save this area**. Click it.
- [ ] The form on the right shows: area, perimeter, barangay, and how many
      tagged trees are inside. With 10+ trees inside, a **Suggested** class and
      its reason.
- [ ] While the form is open, drag a point on the map: the figures change.
- [ ] Save with no name → it says what is missing, and saves nothing.
- [ ] Name it, pick a class (try **Use this**) → **Save the area**. The form
      closes and the area's panel opens, saying *For planning purposes only*.
- [ ] Draw another → **Tree planting site** → status, spacing, a few species →
      save. Its panel says how many seedlings fit.
- [ ] Draw a third → a **Legal designation** → **Attach the PDF**: a notice says
      it will be published for anyone. Attach any small PDF → save. The panel
      links to the document, and it opens.
- [ ] Open the first area → **Edit** → its boundary is back on the map → move a
      point, rename it → save.
- [ ] Open one → **Delete** → confirm. It is gone.

## 5. The wall holds  *(any window, signed out)*

- [ ] Open `/public-map` signed out (a third window, or sign out the private one).
- [ ] Siniloan shows **none** of the trainee's areas and none of the 150 dummy
      trees.
- [ ] In your PGENRO window, the **Map** shows none of them either.

## 6. PGENRO's Action Board  *(PGENRO)*

- [ ] **Action Board**: *Read-only* under the title; no Dispatch or Permit
      buttons anywhere.
- [ ] Tiles across the top — hazards not sent, sent, tags, Code 3, Code 2,
      Code 1, permits — and a row per LGU. **No Siniloan dummy data** in it.
- [ ] Click a number → the trees behind it → **View on map** opens that tree.
- [ ] **Permit logs** tab: permits grouped under each LGU.
- [ ] **Archive** one → it leaves the list; tick **Show archived** → it is back,
      greyed, with **Restore**.
- [ ] Pick dates → **Download Excel report** → the file has a *Summary* sheet
      by LGU and a *Permits* sheet.

## 7. RISE species  *(PGENRO, optional — needs the PDF)*

- [ ] **Trees** → **Species (RISE)** tab. Species tagged with no write-up are
      listed in amber.
- [ ] Click one → **Choose a RISE PDF** → **Read it**. Up to a minute.
- [ ] Fields fill in, each marked *From the PDF — check it*. Compare a few with
      the PDF.
- [ ] **Save** asks you to tick that you checked them. Tick, save.
- [ ] Public map → open a tree of that species → its description shows.
- [ ] If it fails: the exact message it shows.

## 8. The public map  *(signed out)*

- [ ] Bubbles with no numbers; pins grow in as you zoom.
- [ ] Open a land cover area: the right-hand column of tools **hides** while
      its panel is open, and comes back when it closes.
- [ ] Click a town while a tree or area is open: the other panels close.
- [ ] `/login` has **← Back to the public map**.

## 9. Proposals  *(optional — needs a real MENRO account)*

The only part that cannot be done as a trainee, because PGENRO cannot see
training areas. Skip it unless you have a spare email.

- [ ] PGENRO issues a normal code for **Santa Cruz**; activate it with a third
      email in a private window.
- [ ] As that MENRO: draw and save an area.
- [ ] As PGENRO: open it → **Propose a change** → change the class, add a note
      → **Send the proposal**.
- [ ] As the MENRO: open the area → an amber box lists the change → **Approve
      and apply** → the area now has the new class.
- [ ] Clean up: the MENRO deletes the area; PGENRO **archives** the account
      (the seat frees).

## 10. Expected, not bugs

- **Update email / Change password** on the Accounts page say the server
  function is not deployed. True — `manage-account` is the one piece not up.
- Elevation, soil, rainfall, temperature and hazards on a saved area read
  *Not recorded* in amber: they wait on PGENRO's layers (phase 4).
- Until a real office saves an area, the public map still shows the **sample**
  areas, marked as samples.

## When you are done

- Keep the training data for the next batch, or run
  `supabase/training_purge.sql` to clear it (the accounts stay).
- Send me the failures. Anything that works needs no write-up.
