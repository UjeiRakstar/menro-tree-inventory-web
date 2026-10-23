# Going live — the checklist

Everything needed to put version 2 of Green Tag on `greentag.laguna.gov.ph`
and switch on "Continue with Google" for everyone. Parked on 20 October 2026
until the IT team that uploads the site can be reached. Parts A and B can be
done now, without them.

**For now it goes up for testing** (23 October): open to anyone given the
address, and kept out of search results — part E. Nothing in parts A–D
changes that; publishing on Google sign-in (part D) is about who may sign
in, not about search.

Each step says who does it: **you** (the developer, in the Supabase and
Google dashboards) or **IT** (whoever uploads to the website).

---

## A. Before anything goes up — you, now

1. **The database is up to date.** Version 2 calls database parts that
   version 1 never needed. Run, in order, every step in PARKED.md's run order
   not yet run (steps 13–23; run community.sql and closing_gaps.sql again,
   and super_admin.sql last).
   Then paste `supabase/health_check.sql` into the SQL editor: every row with
   a true/false must say **true**.
2. **The server functions are deployed under their exact names.** A function
   made by pasting gets a random address unless named right when created;
   renaming it later changes only its label. In Edge Functions, each of these
   must exist with exactly this name:

   | Function | File | Secrets it needs |
   |---|---|---|
   | `identify-tree` | `supabase/functions/identify-tree/index.ts` | `GEMINI_API_KEY` |
   | `manage-account` | `supabase/functions/manage-account/index.ts` | (Supabase's own) |
   | `rise-extract` | `supabase/functions/rise-extract/index.ts` | `GEMINI_API_KEY` |
   | `ai-key-test` | `supabase/functions/ai-key-test/index.ts` | `GEMINI_API_KEY` |
   | `improve-report` | `supabase/functions/improve-report/index.ts` | `GEMINI_API_KEY` |
   | `send-reply` | `supabase/functions/send-reply/index.ts` | `BREVO_API_KEY`, `MAIL_FROM` |

   On 19 October, `identify-tree` and `manage-account` were live as
   `clever-processor` and `swift-action`: make new ones with the right names,
   then delete those two.
3. **Email replies (optional, for `send-reply`).** A free Brevo account
   (brevo.com) → Senders → verify the sending address → SMTP & API → make an
   API key. In Supabase → Edge Functions → Secrets: `BREVO_API_KEY` and
   `MAIL_FROM`. Without them the Inbox opens the office's own email app.
4. **The privacy page's contact.** Done 20 October: privacy requests go to
   PGENRO through the Contact Us form ("PGENRO — data privacy request"); run
   inbox.sql again for it. A named Data Protection Officer can be added to
   `public/privacy.html` under "Your rights, and whom to ask".

## B. Google sign-in, in testing — you, now

Already done on 20 October: the Google Cloud project "Green Tag", External
audience, in Testing. While in Testing, only the test users listed under
Audience can sign in (up to 100).

1. **Data Access**: the scopes `openid`, `.../auth/userinfo.email`,
   `.../auth/userinfo.profile` — nothing more (more would need Google's
   review).
2. **Clients → Create client**: Web application.
   - Authorized JavaScript origins: `https://localhost:5173` and
     `https://greentag.laguna.gov.ph`
   - Authorized redirect URIs:
     `https://angtbjbzcmskbrlsreiy.supabase.co/auth/v1/callback`
   - Keep the Client ID and Client secret somewhere safe.
3. **Supabase → Authentication → Sign In / Providers → Google**: on, with the
   Client ID and secret.
4. **Supabase → Authentication → URL Configuration → Redirect URLs**, all
   four:
   - `https://localhost:5173/community`
   - `https://localhost:5173/public-map`
   - `https://greentag.laguna.gov.ph/community`
   - `https://greentag.laguna.gov.ph/public-map`
5. Try "Continue with Google" on `https://localhost:5173/community` with a
   test user.

## C. Putting version 2 on the website — IT

1. **The build.** In this repository, with a `.env` holding:

   ```
   VITE_SUPABASE_URL=https://angtbjbzcmskbrlsreiy.supabase.co
   VITE_SUPABASE_ANON_KEY=<the project's anon public key>
   VITE_CLOUDINARY_CLOUD_NAME=<the Cloudinary cloud name>
   ```

   run `npm ci` then `npm run build` (Node 20.19 or later). Upload everything inside `dist/` to
   the site's root, replacing version 1. The anon key is meant to be public;
   **never** put the service role key or any AI key in `.env`.
2. **The server answers every unknown address with `index.html`**, as it
   does for version 1 (so `/community`, `/public-map` and the rest open the
   app). Real files, such as `privacy.html` and `/assets/…`, are served as
   they are.
3. **Every file is sent with `X-Robots-Tag: noindex, nofollow`**, which
   keeps it out of search results. Apache does it from the `.htaccess` in
   `dist/` (it needs `mod_headers`), Netlify from `_headers`, Vercel from
   `vercel.json`. On nginx, IT adds to the site's `server` block:
   `add_header X-Robots-Tag "noindex, nofollow" always;`
4. **Check after uploading:**
   - `https://greentag.laguna.gov.ph/privacy.html` opens the privacy policy
     (not the app);
   - `https://greentag.laguna.gov.ph/community` opens the Community page;
   - a hard refresh on `/public-map` still opens the map;
   - `https://greentag.laguna.gov.ph/robots.txt` opens a short text file
     (not the app);
   - the browser's developer tools → Network → the page → Response Headers
     show `x-robots-tag: noindex, nofollow`. (Or, from a terminal:
     `curl -I https://greentag.laguna.gov.ph/`.)

If version 2 cannot go up yet, IT can upload **only** `public/privacy.html`
to the site's root, beside version 1. That alone is enough for part D.

## D. Google sign-in, for everyone — you, once C (or the privacy page) is up

1. **Supabase → URL Configuration → Site URL**:
   `https://greentag.laguna.gov.ph` (only once version 2 is live there).
2. **Google → Branding**:
   - Application home page: `https://greentag.laguna.gov.ph`
   - Application privacy policy link:
     `https://greentag.laguna.gov.ph/privacy.html`
   - Terms of service: leave empty.
   - Authorized domains: `laguna.gov.ph` and
     `angtbjbzcmskbrlsreiy.supabase.co`
   - No app logo (a logo makes Google review the branding first).
   - Save.
3. **Google → Audience → Publish app**, and confirm. With only the basic
   scopes, no review is needed. The Google screen will say "to continue to
   angtbjbzcmskbrlsreiy.supabase.co"; that is normal without a custom
   domain.
4. Ask PGENRO or the provincial IT office to note that `laguna.gov.ph` is on
   Green Tag's Google sign-in. If Google ever asks to verify the domain
   (Google Search Console), whoever runs the `laguna.gov.ph` DNS adds one TXT
   record.
5. Try "Continue with Google" on the live site with an account that is
   **not** a test user.

## E. In testing: reachable, not searchable — and when to publish

While in testing, anyone with the address opens the site, and search engines
leave it out of their results. Two things do it, both in the repository:

- `<meta name="robots" content="noindex, nofollow">` on every page:
  `index.html` (so every page of the app), `public/privacy.html`,
  `public/terms.html` and `public/training/practice-document.html`;
- the `X-Robots-Tag: noindex, nofollow` header on every file, images and
  PDFs included (part C, step 3).

`public/robots.txt` blocks nothing, on purpose: a search engine kept out by
robots.txt never reads the noindex, and can still list the bare address if
it finds a link to it somewhere.

This is not a lock. Anyone given the address can open the site, and the
public pages (the map, the tree database) show what they would show when
published. What needs signing in still needs signing in. If version 1 is
already in Google's results, it drops out once Google crawls the site again;
the Removals tool in Google Search Console (whoever holds the
`laguna.gov.ph` verification) makes it faster.

**To publish**, once PGENRO says so: take the robots meta out of the four
pages, the header out of `public/.htaccess`, `public/_headers` and
`vercel.json` (and IT's nginx line), rebuild and upload. Then, if wanted, add
the site in Google Search Console and ask for it to be indexed.
