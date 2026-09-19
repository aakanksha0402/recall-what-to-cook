# Akku — recall what to cook

A cooking-memory PWA for one person. It answers "what should I cook tonight?" from the dishes you already make. Spec: `akku-spec_1.md`.

Built to milestones M1 + M2 + M3 of the spec: batch dish entry with a shipped ingredient/form lexicon, rule-based proposals, tags, notes, tweaks with versions, ranking with reasons, Cook this + undo, one Next-up slot, fresh-ingredient chips with decay, pin, retire/bring back, Not tonight, base preparations and variation linking (incl. suggested bases), the 11-of-54 scoreboard, search across names/ingredients/tags/notes/tweaks, and JSON export/import.

Data lives in **Supabase** (Postgres + Auth) under your email, behind row-level security, so the same dishes show up on every device you sign in on. Sign-in is a six-digit code sent by email — no password. The app itself is static and needs a connection (offline is not a goal right now).

## Run

```
npm install
cp .env.example .env.local   # then fill in the two values from Supabase → Project Settings → API
npm run dev                  # http://localhost:5173  — add ?demo=1 for a seeded repertoire (dev only, empty accounts only)
npm test                     # engine + facts unit tests
npm run build                # dist/ with service worker
```

Node ≥ 20. Vite is pinned to 6.x because this machine's Node is 20.15 (Vite 7+ needs 20.19+).

## Layout

- `supabase/migrations/` — the Postgres schema (all tables per-user, RLS on). Apply with `npx supabase db push` after `npx supabase link`.
- `src/lib/supabase.ts` — the client; `src/auth/session.ts` — session hook + code sign-in.
- `src/domain/` — pure engines: `lexicon` (name → ingredients + form), `expansion` (proposals), `buckets` + `ranking` (variety engine), `baseSuggest`, `search`.
- `src/repo/repo.ts` — the one data-access module. Every screen talks to this and nothing else. Reads come from one cached snapshot of your rows (`facts.ts` assembles it); writes go through supabase-js and invalidate the snapshot.
- `src/repo/backup.ts` — JSON export/import (also reads the older on-device export format).
- `src/ui/` — screens and the shell. No router; a small screen stack in `context.tsx`.
- `src/seed/` — `lexicon.json`, `plausibility.json`, and the dev-only `demo.ts`.

Adding a migration: `npx supabase migration new <name>`, write the SQL, `npx supabase db push`.

## Supabase setup (once)

1. Create a free project. Copy Project URL and the publishable key into `.env.local` and into Vercel (`vercel env add VITE_SUPABASE_URL production`, same for `VITE_SUPABASE_PUBLISHABLE_KEY`).
2. `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`.
3. Dashboard → Authentication → Email Templates → *Magic Link*: make sure the body includes `{{ .Token }}` so the mail carries the six-digit code (the link can stay; typing the code is what works from the installed iPhone app, where a tapped link would open Safari instead).
4. Dashboard → Authentication → URL Configuration: Site URL `https://recall-what-to-cook.vercel.app`; Redirect URLs `http://localhost:5173/**` and `https://recall-what-to-cook.vercel.app/**`.

Free-tier facts worth knowing: the built-in mailer allows ~2 auth emails per hour project-wide (one per address per minute; codes last an hour) — fine for one person, and a custom SMTP lifts it. Free projects pause after a week without database activity; *Resume* in the dashboard brings everything back.

## Deploy

Static hosting on Vercel (`vercel.json`), env vars set in the project. `npx vercel deploy --prod`, or push to GitHub once the repo is connected in the Vercel dashboard.

## iPhone

Open the site in Safari, Share → **Add to Home Screen**, launch from the icon and sign in there with the emailed code.
