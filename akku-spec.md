# Akku — Cooking Memory PWA · Product Specification (v1 draft, Sept 2026)

Companion artifact (full formatted version): published to Rahul's artifact gallery as "Akku Cooking Memory".

## 1. Vision and core problem

The problem is **recall, not storage**. Rahul knows ~40–70 dishes; at the decision moment only 4 surface. The product is a prosthetic for that one moment — not a cookbook, planner, or pantry system.

Single user, single device, no accounts, no sharing, no sync.

**Test for every feature:** does this make deciding what to cook easier, or does it just create more data to manage?

## 2. Principles

- Silence is the default input — the app never asks "how was it?"
- Every suggestion states its reason ("Not made in 3 months").
- User history outranks any recommendation; inferred/AI data is visually and structurally distinct.
- Deterministic first — if a rule can do it, a rule does it. v1 has **no AI at all**.
- The database is a file the user owns; exportable, readable without the app.
- Every milestone ships something usable that evening.

## 3. Decisions taken (from discovery, 2026-09-01)

| Question | Decision | Consequence |
|---|---|---|
| Decision moment | All three: in the kitchen, night before, when asked | Requires a **Next up** slot; home screen must work at 3s and 30s depth |
| Repertoire | 40–70 dishes | Recall genuinely fails; variety gap is measurable |
| Cold start | Brain dump first, then proposals to tick | Proposals calibrated to his vocabulary, not generic cuisine lists |
| Ingredients | Staples assumed, fresh tracked | Kills fake blockers ("needs wheat flour" never appears) |
| Who cooks | Mostly him, most days | Dense history; no attribution, accounts or sync in v1 |
| Feedback | One tap, only when something changed | **Ratings cut entirely**; quality inferred from repeat behaviour |
| Family | Not yet | People/suitability leave MVP; schema stays ready |
| Meals | Breakfast, lunch, dinner | App reads the clock, never asks which |
| Recipe depth | Thin for his dishes, full for new/imported | Dish is the unit; recipe body is an optional versioned attachment |
| Platform | iPhone | No Web Share Target on iOS → import is paste, not share sheet |
| Effort | Quick matters most days | Effort is a primary ranking signal, not a buried filter |
| AI in v1 | None | Forced the expansion engine to be rule-based — which works |

## 4. Core workflows

1. **Decide** (seconds, daily) — open → one suggestion + reason, four alternates, ingredient row.
2. **Log** (one tap) — "Cook this" writes an event and dismisses. Undo strip for a few seconds.
3. **Remember** (occasional) — "Note a tweak" → one line of text → joins the current version.
4. **Capture** (bursty) — typed batch, ticked proposal, or pasted URL.

## 5. Navigation — three tabs, not six

`Cook` · `Add` (centre) · `Dishes`. Settings is a gear icon.

- **Saved** folded into Dishes — it's a status filter, not a place.
- **History** folded into the dish screen (per-dish) plus one stats card (aggregate).
- **Profile** removed — single user.

## 6. Home screen

Top to bottom: **Next up** (only if set) → **one visually dominant suggestion** with its reason → **four alternates**, each drawn from a different bucket with its own reason → **ingredient chip row** ("I have…") that re-runs ranking in place.

Header states what it's answering (`Thu · Dinner`); one tap overrides. Weekend relaxes the effort weighting automatically.

Deliberately absent: search bar, greeting, photo grid, infinite scroll, "for everyone" section.

## 7. Other screens

- **Dishes** — searchable list, horizontal ingredient chip row ordered by dishes unlocked, stats card ("11 of 54 cooked this month"), filters behind one control.
- **Dish detail** — name, ingredients (missing fresh ones marked), current version as ~5 tweak lines, quiet history line, two actions (Cook this / Next up). Variations and version history below the fold.
- **Cook flow** — none. One tap + undo. No timers, no step mode.
- **Note a tweak** — one text line, no fields, no rating.
- **Add** — three modes: type a list (one dish per line), review proposals, paste a link (clipboard read on tap; v1 stores URL + title only).
- **Settings** — staples, decay windows, export, import.

## 8. Search

Matches dish names, ingredients, and tweak text. Typo tolerance matters more than natural language. `quick dinner` = two structured filters. `paneer but not paneer gravy` = long-press chip to exclude (typed negation later). `child friendly` needs people — not in v1.

## 9. Data model

**Dish and Recipe are one entity.** A dish is the unit of recall; a recipe body is an optional versioned attachment.

```
dish            id, name, status(known|idea|retired), form, base_id→dish, is_base,
                effort(1-3), meal_slots, pinned, origin(typed|expansion|import|ai),
                confirmed_at, created_at
ingredient      id, name, kind(fresh|staple), aliases
dish_ingredient dish_id, ingredient_id, role(defining|main|optional), origin, confirmed
cook_event      id, dish_id, cooked_at, version_id, meal_slot
dish_version    id, dish_id, n, body(nullable), tweaks, is_current, created_at
pantry          ingredient_id, state(have|low|out), updated_at
source          id, dish_id, kind(url|photo|verbal), ref, raw
-- held for later --
person          id, name, stage
dish_person     suitability, modification
```

**Omitted deliberately:** no rating table (cut with ratings); no modification entity (a modification is a text line inside a version); no category/cuisine table (`form` + ingredients do the clustering).

**Provenance in one column:** every dish and ingredient link carries `origin` + `confirmed_at`. Unconfirmed rows can be suggested but never enter history claims or counts. AI later writes `origin='ai'` with no schema change.

## 10. Base preparations and variations

One self-reference: `dish.base_id`. A base prep is a dish with `is_base=1`; a variation points at it and adds its own ingredients.

`Onion-tomato gravy → + paneer / + mushroom / + corn, capsicum / + mixed veg / + kofta`

**Ingredients are inherited at query time, not copied** — one recursive CTE finds every dish touching tomato, including variations that never mention it. Fix the base once, every variation is fixed. The user never sees the word "base"; the dish screen reads "Built on your onion-tomato gravy".

## 11. Recipe evolution

Append-only versions, created on tweak (not on cook). `n=1` is the original (collapsed); `is_current` shows as "how you make it" — five lines under the dish name. `cook_event.version_id` records which version was actually cooked.

## 12. The expansion engine (makes no-AI v1 viable)

Works because **Indian dish names describe themselves**: ingredient + form, almost every time.

- **Reading:** token match against a shipped ingredient lexicon and form list. "Spinach aloo paratha" → spinach + potato, form=paratha, effort and meal slots inferred from form.
- **Writing:** propose unentered combinations, filtered by a shipped plausibility table. Three generators in yield order: base × addition; ingredient × form; form × his ingredients.
- Presented 10 at a time: **Yes I make this** → known dish · **No** → never re-offered · **Never tried it** → idea (fills the New bucket).

This solves cold start *with* the recall problem, not around it — he can't type what he's forgotten, but recognises it instantly. Same mechanism = data model + cold start + discovery UI.

## 13. Variety engine

Six derived buckets (no fields to fill in):

| Bucket | Rule |
|---|---|
| Favourite | pinned, or ≥6 cooks spread across ≥6 months |
| In a rut | ≥3 cooks in 30 days → suppressed |
| Forgotten | gap > 2× its own median interval, or > 60 days |
| New | cook_count = 0 |
| Retired | explicit, rare, reversible |
| Needs work | tweak added since last cook |

**Favourite vs rut without ratings** = time spread. 20 cooks over 2 years is loved; 4 cooks this month and never before is a habit. Pin exists for the cases the heuristic misses.

**Ranking:** fresh-ingredient match (strongest term) + recency gap vs the dish's own rhythm + effort fit for day/hour + bucket balance; hard suppression of anything cooked in the last 5 days or in a rut. **The five slots are filled from different buckets by construction**, not by score alone.

**Scoreboard:** "You cooked 11 different dishes this month, out of 54 you know." If that number doesn't climb over three months, the app has failed.

## 14. Where AI goes later

Behind a single `enrich()` boundary with a deterministic fallback always present.

- **Best use:** parse a recipe URL. Then screenshots.
- **Unreliable, be honest:** Reels/YouTube — often login-walled with no transcript. Save link + title, extract if possible, never pretend.
- **Nice not needed:** free-text entry (lexicon already handles it).
- **Later:** expansion supplements, preference patterns ("you usually reduce chilli, add kasuri methi").
- **Never:** ranking. Must stay instant, offline, explainable.

## 15. Scope

**Must:** batch dish entry · lexicon tagging · expansion proposals · ingredient browse · home screen with reasons · Cook this + undo · Next up · fresh chips with decay · search · export.

**Should:** tweaks and versions · base/variations · the 11-of-54 scoreboard · effort and meal inference · saved-untried from link · per-dish history · pin · import.

**Later:** AI URL/screenshot import · Capacitor wrap + share extension · people and suitability · weekly plan · shopping list · photos · preference insights.

**Do not build:** ratings · quantities/units/expiry/inventory · nutrition · step-by-step mode or timers · accounts/sync/sharing · cuisine taxonomies · notifications asking how dinner went.

## 16. Architecture

| Layer | Choice | Why |
|---|---|---|
| Build | Vite + TypeScript | Boring, fast, types earn keep in a schema-heavy app |
| UI | React (or Preact) | Capacitor reuses it unchanged; Svelte if he wants less code |
| **Database** | **SQLite in OPFS** (SQLocal / wa-sqlite) | He thinks in SQL; base→variation is one recursive CTE; export is one portable file; Capacitor native SQLite takes the same schema. IndexedDB would mean rewriting the data layer at the wrap. |
| Schema | Numbered `.sql` migrations | Matches his working habits |
| SW | vite-plugin-pwa (Workbox) | App-shell precache, fully offline |
| Backend | None | No accounts, cost, or lock-in |
| Hosting | Cloudflare Pages / Netlify | Static over HTTPS |
| Backup | Manual export | `.sqlite` + JSON mirror to Files/iCloud Drive |

**Two iOS facts (verified Sept 2026):**

1. **No Web Share Target.** WebKit bug 194593, open since Feb 2019, still unresolved with no assignee as of May 2026. A PWA cannot appear in the iOS share sheet — import is copy → open app → paste. Strongest argument for the Capacitor wrap.
2. **Safari and the installed home-screen app do not share storage.** Any link opening outside the installed app writes to an invisible copy of the DB. All import paths must run through the installed app.

Storage durability: the common "50MB, wiped after 7 days" claim is outdated. Per WebKit's storage policy, a home-screen web app gets the same quota as the browser (up to 60% of disk per origin) and origins in persistent mode are excluded from eviction. Call `navigator.storage.persist()` on first run; export is the real safety net.

**Mobile path: Capacitor, not React Native/Expo.** Same web app, gains share extension + native SQLite + durable storage. Keep the door open with: all persistence through one data-access module, no browser-only API called outside a thin platform shim.

## 17. Roadmap

- **M0 Skeleton** — Vite, SQLite/OPFS, migrations, service worker, installs to home screen, persistent storage requested. Proves storage before anything is built on it.
- **M1 Get the repertoire in** — batch entry, lexicon tagging, expansion proposals, Dishes list + ingredient chip row, export. *Usable alone: the original problem, solved.*
- **M2 The daily answer** — home screen with reasons, ranking + buckets, Cook this, Next up, fresh chips. *Habit loop closes; history starts accumulating, so ship early.*
- **M3 Memory that compounds** — tweaks/versions, per-dish history, scoreboard, pins, base preps and variations.
- **M4 Capture from the world** — paste link, saved-untried queue, then AI extraction behind `enrich()`. First point an API key is needed; works without one.
- **M5 Native wrap** — Capacitor, iOS share extension, native SQLite, TestFlight to his own device.

M1 + M2 together are the product.

## 18. Open questions

1. Does breakfast belong in the engine, or does it add noise?
2. What happens when his partner cooks — an unlogged cook makes recency wrong.
3. Is a shopping list a natural extension or the doorway to the inventory system he doesn't want?
4. How aggressively should a rut be suppressed — nudge or hide?
5. Seed the ingredient/form lexicons or grow them from his entries?

## Status

Spec-only for now — Rahul chose "spec only", not implementation. Preferred first milestone if building resumes: **capture + a daily suggestion** (M1 + M2).
