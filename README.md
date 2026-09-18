# Akku — recall what to cook

A cooking-memory PWA for one person and one phone. It answers "what should I cook tonight?" from the dishes you already make. Spec: `akku-spec_1.md`.

Built to milestones M1 + M2 + M3 of the spec: batch dish entry with a shipped ingredient/form lexicon, rule-based proposals, tags, notes, tweaks with versions, ranking with reasons, Cook this + undo, one Next-up slot, fresh-ingredient chips with decay, pin, retire/bring back, Not tonight, base preparations and variation linking (incl. suggested bases), the 11-of-54 scoreboard, search across names/ingredients/tags/notes/tweaks, and .sqlite/JSON export + import.

## Run

```
npm install
npm run dev          # http://localhost:5173  — add ?demo=1 for a seeded repertoire (dev only)
npm test             # engine unit tests (lexicon, buckets, ranking, search, bases, proposals)
npm run build        # dist/ with service worker
```

Node ≥ 20. Vite is pinned to 6.x because this machine's Node is 20.15 (Vite 7+ needs 20.19+).

## Layout

- `src/db/` — SQLocal (SQLite in OPFS), numbered `.sql` migrations, export/import.
- `src/domain/` — pure engines: `lexicon` (name → ingredients + form), `expansion` (proposals), `buckets` + `ranking` (variety engine), `baseSuggest`, `search`.
- `src/repo/repo.ts` — the one data-access module. Every screen talks to this and nothing else.
- `src/ui/` — screens and the shell. No router; a small screen stack in `context.tsx`.
- `src/seed/` — `lexicon.json`, `plausibility.json`, and the dev-only `demo.ts`.

Adding a migration: drop `NNN_name.sql` in `src/db/migrations/` and register it in `migrate.ts`. One statement per `;`, no triggers.

## Deploy

Static hosting only. The database lives in the browser's origin-private file system, so the app must be served cross-origin isolated:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`vercel.json` sets these for Vercel; `public/_headers` does the same for Cloudflare Pages and Netlify. Because of `require-corp`, everything the page loads must be same-origin — fonts are bundled; don't add third-party scripts.

## iPhone

Open the site in Safari, Share → **Add to Home Screen**, and always open Akku from that icon. Safari and the installed app keep separate databases. Export from Settings regularly; export is the backup.
