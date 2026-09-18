# Akku — Cooking Memory PWA · Product Specification

**v1.1 · 2 September 2026**

Revision 1.1 incorporates: notes and user tags (§7, §9), tag filtering (§8), variation linking (§10), pin and retire semantics with restore (§13), Next up settable from anywhere (§6), and the revised home-screen order (§6).

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

Added in revision 1.1:

| Question | Decision | Consequence |
|---|---|---|
| Notes vs tweaks | Two separate fields | A tweak versions the recipe; a note is free text about the dish. See §9 |
| Tags | User-invented, optional, filterable | Reverses the earlier "no category table" — a tag is a word you may invent, not a dropdown you must fill |
| Next up | One slot, settable from anywhere | Stays a parked decision rather than becoming a meal plan |
| Home order | I have → suggestion → Next up | Needs the pantry pre-filled and a Next up line in the header, or it costs the three-second decide |

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

Order, revised on feedback:

1. **I have…** — the fresh-ingredient chip row, pre-populated from the pantry; tapping refines and re-ranks in place.
2. **Today's suggestion** — one visually dominant card with its reason, then four alternates, each drawn from a different bucket with its own reason.
3. **Next up** — the parked dish, rendered only when set.

Header states what it's answering (`Thu · Dinner`); one tap overrides. Weekend relaxes the effort weighting automatically.

**Risk of this order, and the two rules that keep it honest.** Leading with an input row works against the three-second decide: the first thing on screen becomes something to fill in rather than an answer. So (a) the chips arrive **already reflecting the pantry**, making the default state zero-interaction — they read as context, not a question, and suggestions render immediately below whether or not they're touched; and (b) when Next up is set, a slim line sits in the header (`Next up · Vaal ni dal`) so it stays visible without scrolling to the bottom. Next up's entire job is surviving from last night, and a section below the fold cannot do that on its own.

Deliberately absent: search bar, greeting, photo grid, infinite scroll, "for everyone" section.

### Next up

**One dish, settable from anywhere.** Setting a new one replaces it. Set it from any suggestion card, from any dish screen, or from a manual picker on the home screen (search-and-pick, for when the answer isn't on screen). Cooking it clears it; so does Clear. It is deliberately not a queue — a second parked dish makes it a meal plan, which is not what this product is.

## 7. Other screens

- **Dishes** — top to bottom: stats card ("11 of 54 cooked this month") · **Pinned** row (only if any) · horizontal ingredient chip row ordered by dishes unlocked · **tag chip row** · the searchable list · a closing `Retired (7)` line. Filters behind one control.
- **Dish detail** — name, **tags**, ingredients (missing fresh ones marked), **notes** (free text, always editable), current version as ~5 tweak lines, quiet history line. Actions: Cook this · Next up · Pin · Retire. Below the fold: the base it's built on, sibling variations, its own variations, version history.
- **Cook flow** — none. One tap + undo. No timers, no step mode.
- **Note a tweak** — one text line, no fields, no rating.
- **Add** — three modes: type a list (one dish per line, ingredients auto-tagged, `#tag` inline and autocompleted), review proposals, paste a link (clipboard read on tap; v1 stores URL + title only).
- **Settings** — staples, decay windows, export, import.

## 8. Search

Matches dish names, ingredients, **tags**, **notes** and tweak text — so *kasuri methi* finds every dish it was ever noted against, and *mum* finds everything you learned from her. Typo tolerance matters more than natural language: the realistic failure is typing `panner`, not asking a complex question.

`quick dinner` = two structured filters. `#guests` = a tag. `paneer but not paneer gravy` = long-press a chip to exclude (typed negation later). `child friendly` needs people — not in v1.

**Filters**, all behind one control and never all shown at once: ingredient · **tag** · meal · effort · status (never cooked / not cooked recently / saved-untried / **pinned** / **retired**) · base preparation.

## 9. Data model

**Dish and Recipe are one entity.** A dish is the unit of recall; a recipe body is an optional versioned attachment.

```
dish            id, name, status(known|idea|retired), form, base_id→dish, is_base,
                effort(1-3), meal_slots, pinned, notes, retired_at,
                origin(typed|expansion|import|ai), confirmed_at, created_at
ingredient      id, name, kind(fresh|staple), aliases
dish_ingredient dish_id, ingredient_id, role(defining|main|optional), origin, confirmed
cook_event      id, dish_id, cooked_at, version_id, meal_slot
dish_version    id, dish_id, n, body(nullable), tweaks, is_current, created_at
pantry          ingredient_id, state(have|low|out), updated_at
source          id, dish_id, kind(url|photo|verbal), ref, raw
tag             id, name, created_at
dish_tag        dish_id, tag_id
-- held for later --
person          id, name, stage
dish_person     suitability, modification
```

**Omitted deliberately:** no rating table (cut with ratings); no modification entity (a modification is a text line inside a version).

**Tags vs. the taxonomy I refused earlier.** The first draft argued against a category/cuisine table. Tags are the right version of that idea and the earlier objection doesn't apply to them, for one reason: **a taxonomy is a dropdown you must fill in; a tag is a word you may invent.** Tags are user-created, never required, never suggested at entry time, and no screen is blank without them. `form` and ingredients still do all the automatic clustering — tags carry the things a rule can never infer: *#guests*, *#mum*, *#winter*, *#tiffin*, *#one-pot*. If a dish never gets a tag, nothing about the app degrades. That is the test a taxonomy fails.

**Notes vs. tweaks — two fields, on purpose.** A **tweak** changes how you make it (*less oil, more tomato*) and creates a new version; it is about the recipe. A **note** is everything else (*mum's version*, *good when guests come*, *serve with plain rice*) and just sits on the dish, freely editable, never versioned. Collapsing them would either version your trivia or flatten your recipe history — both worse than one extra text field.

**Provenance in one column:** every dish and ingredient link carries `origin` + `confirmed_at`. Unconfirmed rows can be suggested but never enter history claims or counts. AI later writes `origin='ai'` with no schema change.

## 10. Base preparations and variations

One self-reference: `dish.base_id`. A base prep is a dish with `is_base=1`; a variation points at it and adds its own ingredients.

`Onion-tomato gravy → + paneer / + mushroom / + corn, capsicum / + mixed veg / + kofta`

**Ingredients are inherited at query time, not copied** — one recursive CTE finds every dish touching tomato, including variations that never mention it. Fix the base once, every variation is fixed. The user never sees the word "base"; the dish screen reads "Built on your onion-tomato gravy".

### How variations actually get linked

The first draft defined `base_id` and never said how it gets set. Four paths, in order of how often they'll be used:

1. **Add a variation, from the base.** On a base dish: *Add a variation* → type only the addition (`mushroom`) → creates *Mushroom gravy* with `base_id` set and the base's ingredients inherited. One field, two seconds. This is the expansion engine's base × addition generator, surfaced as a manual action.
2. **Link to a base, from the variation.** On any dish: *Built on…* → pick an existing dish → sets `base_id`. This is the path for dishes entered before you noticed they shared a base — which will be most of them, since the brain dump produces flat names.
3. **Mark as a base.** Any dish → *This is a base preparation* (`is_base = 1`). A dish can be both: onion-tomato gravy is a base you also cook on its own.
4. **Suggested links — deterministic, no AI.** When two or more known dishes share the same `form` and ≥3 defining ingredients, the app proposes the base: *"Paneer gravy, mushroom gravy and corn capsicum gravy look like one base plus three additions. Create it?"* Accepting creates the base with the shared ingredients, relinks the three children, and strips the now-inherited ingredients from each. This is the single highest-value automation in the product and it's a `GROUP BY`.

**Unlinking is safe.** Removing `base_id` copies the inherited ingredients down onto the child first, so nothing is lost and the dish stands alone.

### Where links appear

- **On a base:** *Variations (5)* — a tappable list, plus *Add a variation*.
- **On a variation:** *Built on your onion-tomato gravy* — the base name is a link — plus a row of siblings, also tappable. This turns the dish screen into a lateral browse: from paneer gravy you are one tap from every other thing you make with that gravy, which is the original problem in miniature.
- **In search:** ingredient matches resolve through inheritance, so *tomato* returns the variations too.

### Recency, when you only ever cook the children

A base cooked exclusively through its variations would otherwise look forgotten and get suggested constantly. Two rules:

- A base's effective recency is `max(its own cooks, its children's cooks)`.
- A base with **no cook events of its own** is excluded from suggestions entirely — it's an organising node, not a dinner. Cooking it once on its own makes it eligible from then on.

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

### Pin — what it does and where it shows

**What it means:** *this is a favourite, regardless of what the numbers say.* Pinning forces the dish into the Favourite bucket and gives it a modest score boost.

**What it does not mean:** *suggest this more often.* Rut suppression still applies to a pinned dish — otherwise pinning would defeat the variety engine, which is the product. Pinning raises **eligibility**, not frequency.

**Where pinned dishes appear:**
- A **Pinned** row at the top of the Dishes tab, above the list.
- A pin glyph on the dish card wherever it appears.
- A `Pinned` status filter.
- The Favourite bucket, which feeds one of the five home-screen slots.

**Pinning is toggled from the dish screen.** No cap, but the UI notes past ~10 pins that pins stop carrying information when everything is pinned. That's a nudge, not a limit.

### Retired — and how to bring one back

**What it means:** *tried it, didn't work, stop offering it.* Explicit and rare. Set from the dish screen only — never auto-inferred from you skipping a suggestion, because skipping usually means "not tonight", not "never again".

**Effects:**
- Excluded from all suggestions and from every bucket.
- Hidden from the default Dishes list.
- **Removed from the scoreboard denominator** — retiring 6 dishes changes *11 of 54* to *11 of 48*, so retiring never flatters your variety score.
- Nothing is deleted. History, notes, tags, tweaks and versions all stay.

**Bringing one back:**
- A `Retired (7)` line closes the Dishes list; tapping it lists them.
- A `Retired` status filter reaches the same set.
- On the dish: **Bring back** — one tap, restores `status = known`, keeps everything. Reversible in both directions, always.

**And a lighter action alongside it: *Not tonight*.** Dismissing a suggestion suppresses that dish for 7 days and nothing more. Without it, retire becomes the only way to say "stop showing me this", and dishes get retired that shouldn't be.

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

**Must:** batch dish entry · lexicon ingredient tagging · expansion proposals · ingredient browse · **notes on a dish** · **user tags + tag filtering** · home screen with reasons · Cook this + undo · Next up (one slot, settable from anywhere) · fresh chips with decay · **retire + bring back** · **Not tonight (7-day suppression)** · search across names, ingredients, tags, notes, tweaks · export.

**Should:** tweaks and versions · base preparations, **variation linking and suggested links** · the 11-of-54 scoreboard · effort and meal inference · saved-untried from link · per-dish history · **pin, with the Pinned row** · import.

**Later:** AI URL/screenshot import · Capacitor wrap + share extension · people and suitability · weekly plan · shopping list · photos · preference insights.

**Do not build:** ratings · quantities/units/expiry/inventory · nutrition · step-by-step mode or timers · accounts/sync/sharing · **imposed** cuisine/category taxonomies (user-invented tags are a different thing — see §9) · notifications asking how dinner went.

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
- **M1 Get the repertoire in** — batch entry, lexicon tagging, expansion proposals, Dishes list + ingredient chip row, notes, user tags and tag filtering, search, export. *Usable alone: the original problem, solved.*
- **M2 The daily answer** — home screen in the revised order (I have → suggestion → Next up), reasons, ranking + buckets, Cook this, Next up, fresh chips, retire + bring back, Not tonight. *Habit loop closes; history starts accumulating, so ship early.*
- **M3 Memory that compounds** — tweaks/versions, per-dish history, scoreboard, pins and the Pinned row, base preps, variation linking and suggested links.
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
