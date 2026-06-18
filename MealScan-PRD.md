# MealScan — Product Requirements Document

**Version:** 1.3
**Owner:** Jupitor
**Type:** Personal, single-user iOS web app (PWA)
**Status:** Draft for build

*Changelog*
- *v1.1: added daily weight tracking, a weight trend graph, and a calorie-intake (TDEE) Plan tab.*
- *v1.2: added exercise logging (activity, duration, intensity → calories burned via METs); the daily "remaining" budget now subtracts food and adds back exercise, recalculated live on every entry.*
- *v1.3: added badminton to the MET table; the owner's frequent activities (walking, running, cycling, badminton) surface at the top of the activity picker.*

---

## 1. Summary

MealScan is a private calorie- and macro-tracking app that runs on an iPhone as a Progressive Web App (PWA). It logs meals through four input modes (AI photo recognition, barcode scanning, a saved meal library, manual entry), logs exercise to credit calories back to the daily budget, tracks daily morning weight with a trend graph, and computes a personalized daily calorie target. It has no backend and no accounts; all data stays on the device.

The defining design principle is the separation of **identification** from **quantity**: the AI identifies food and supplies nutrition *per 100 grams*; the user supplies only the weight in grams; the app does the arithmetic.

---

## 2. Goals

- Log a meal in under 15 seconds for the common cases (re-logging a saved meal, scanning a barcode).
- Show **calories remaining** for the day, updated live as food and exercise are logged.
- Track morning weight in one tap and visualize the trend over time.
- Compute a sensible daily calorie target from the user's stats and goal.
- Keep all data local and private; outbound calls limited to the AI request per photo and the barcode lookup.
- Run entirely on the iPhone with no Mac, no App Store, and no maintained server.
- Present a calm, minimal interface that is pleasant to use daily.

## 3. Non-goals

- No multi-user support, sharing, or social features.
- No cloud sync or account system (single device only).
- No streaks, scolding, or behavioral nudging — figures are shown, never enforced.
- No native-only capabilities (LiDAR depth, HealthKit) in v1 — deferred.

---

## 4. Platform and constraints

- **Target:** iPhone, latest two iOS versions, Safari.
- **Form factor:** PWA installed via "Add to Home Screen"; fullscreen with manifest and icon.
- **Build artifact:** a single self-contained HTML file (inline CSS/JS), hostable on GitHub Pages, no build pipeline.
- **Hosting:** GitHub Pages (set up from the phone or a Windows machine — the Mac Mini is never involved).
- **Storage:** browser `localStorage`.
- **AI provider:** Anthropic Messages API, called directly from the browser with the `anthropic-dangerous-direct-browser-access: true` header. API key entered once in Settings, stored locally. Acceptable because single-user, owner's device only.

---

## 5. Core concept: split "what" from "how much"

| Responsibility | Owner | Output |
|---|---|---|
| Identify the food | AI (or barcode DB) | item name |
| Nutrition density | AI (or barcode DB) | calories + macros **per 100g** |
| How much is on the plate | User | weight in grams |
| Final values | App | `value = per_100g × grams ÷ 100` |

The user never types nutrition numbers (except in optional manual mode); their only input is the gram weight.

---

## 6. The daily budget

The headline figure on the Today tab is **calories remaining**, computed as:

```
remaining = dailyTarget − foodConsumed + exerciseBurned
```

It is recalculated **live** on every add, edit, or delete of a food or exercise entry. The breakdown (target, food, exercise) is shown beneath the headline number. Display only — no warnings, no scolding. If no daily target is set, the Today tab shows consumed and exercise totals without a remaining figure.

---

## 7. Navigation

Three primary tabs in a bottom navigation bar with text labels (no emojis):

- **Today** — food log, exercise log, the live daily budget, and the "+" entry button. Library and Settings reached from here.
- **Weight** — morning weight logging and the trend graph.
- **Plan** — the calorie-intake calculator.

---

## 8. Functional requirements

### 8.1 Input mode — Photo scan
1. Capture or select a meal photo; guidance suggests a reference object (credit card, coin, fork) for scale.
2. Image base64-encoded and sent to the Anthropic vision API with the identification prompt (§10).
3. Model returns per item: name, nutrition per 100g, a rough starting weight estimate, confidence, hidden-calorie assumptions.
4. User sees an **editable confirmation screen** with estimated grams pre-filled, adjusts the weight per item.
5. On confirm, the app computes calories/macros and writes the entry to today's log.

### 8.2 Input mode — Barcode
1. Camera stream scanned with a JS barcode library (`zxing-js` or `html5-qrcode`). Do **not** rely on the native `BarcodeDetector` API — unreliable in iOS Safari.
2. Look up the barcode via the Open Food Facts API for exact per-100g nutrition.
3. User enters weight in grams; app computes and logs.
4. If not found, fall back to manual entry with the barcode noted.

### 8.3 Input mode — From library
1. User picks a saved meal; stored per-100g values reused.
2. User enters weight (defaulting to last used) and logs. No AI call.

### 8.4 Input mode — Manual
1. User types an item name and nutrition, then a weight if applicable. Only mode where nutrition is entered directly; optional/fallback.

### 8.5 Meal library
- After any logged meal, offer "Save to library."
- Library items store name, nutrition per 100g, last-used weight. Browsable, searchable, editable, deletable.

### 8.6 Daily log, totals, and remaining budget (Today tab)
- Today's food entries as a clean list: name, weight, calories per row.
- A small **Activity** section listing today's exercise entries: activity, duration, calories burned.
- The live daily budget per §6: prominent **remaining** number with target / food / exercise breakdown beneath, plus protein / carbs / fat totals.
- History view groups past days; tapping a day shows entries, exercise, and totals.
- All entries editable and deletable; the budget recalculates immediately.

### 8.7 Exercise logging (Today tab)
- Opened from the Today "+" button ("Add food" / "Add exercise").
- **Inputs:** activity (from the built-in list or "Other"), intensity (light / moderate / vigorous), duration in minutes. Body weight is pulled from the latest weight entry (editable).
- **Quick picks:** the owner's frequent activities — walking, running, cycling, badminton — appear at the top of the picker for one-tap selection. Social badminton corresponds to the moderate intensity (~5.5 MET).
- **Calculation (METs):**
  ```
  caloriesBurned = MET × weight_kg × (minutes ÷ 60)
  ```
  where MET is looked up from the activity + intensity below.
- **Built-in MET table (approximate):**

  | Activity | Light | Moderate | Vigorous |
  |---|---|---|---|
  | Walking | 2.8 | 3.5 | 5.0 |
  | Running | — | 8.0 | 11.0 |
  | Cycling | 4.0 | 6.8 | 10.0 |
  | Swimming | 4.5 | 6.0 | 9.5 |
  | Weight training | 3.0 | 5.0 | 6.0 |
  | Cardio machine (elliptical) | 4.5 | 6.0 | 8.0 |
  | Rowing | 4.5 | 7.0 | 8.5 |
  | HIIT | — | 8.0 | 10.0 |
  | Yoga / stretching | 2.5 | 3.0 | 4.0 |
  | Hiking | 4.0 | 5.3 | 7.0 |
  | Badminton | 4.5 | 5.5 | 7.0 |
  | Sports (general) | 4.0 | 6.0 | 8.0 |
  | Other (generic) | 3.0 | 5.0 | 8.0 |

- The computed burn is shown and is **editable** before saving (a manual override field), since estimated burns are imprecise.
- Saved exercise entries add to `exerciseBurned` for the day and update the remaining budget live.

### 8.8 Weight tracking (Weight tab)
- One-tap "Log this morning's weight" with numeric entry.
- One entry per day; re-logging overwrites (with confirmation). Stored as date, weight, unit (kg default for SG; lb optional).
- Entries editable and deletable from a list beneath the graph.

### 8.9 Weight graph (Weight tab)
- Line chart over time as lightweight inline SVG (preferred) styled to the design tokens.
- Range toggle: 7 / 30 / 90 days / all.
- Optional **7-day moving-average trend line** in a lighter accent (daily weight is noisy; the trend is what matters). Toggleable.
- Styling: thin accent line, hairline grey axes/gridlines, soft-grey labels, **no gradient fill**, square or no point markers.

### 8.10 Calorie-intake calculator (Plan tab)
- **Inputs:** sex (male/female, required by the formula), age, height (cm; in optional), current weight (auto-filled from latest weight entry, editable), activity level, goal (Maintain / Lose). If Lose: rate — Gentle (~0.25 kg/week, −250 kcal) or Standard (~0.5 kg/week, −500 kcal).
- **BMR (Mifflin–St Jeor):** Male `10×kg + 6.25×cm − 5×age + 5`; Female `10×kg + 6.25×cm − 5×age − 161`.
- **TDEE** = BMR × activity multiplier: Sedentary ×1.2, Lightly active ×1.375, Moderately active ×1.55, Very active ×1.725, Extra active ×1.9.
- **Target** = TDEE (Maintain) or TDEE − deficit (Lose).
- **Safety floor:** the displayed target never drops below ≈1200 kcal (female) / ≈1500 kcal (male); if the deficit would go lower, clamp and show a brief neutral note suggesting a smaller deficit. Standard practice for such calculators.
- **Note on exercise:** because exercise calories are credited separately on the Today tab, the calculator should use the user's *baseline* activity level (not double-counting planned workouts). A short hint explains this.
- **Output:** maintenance calories and goal target; "Set as daily target" writes `settings.dailyTarget`, feeding the Today budget. Recalculates live as inputs change.

### 8.11 Settings
- Anthropic API key (stored locally).
- Units: weight (kg/lb), height (cm/in).
- Daily calorie target (set here or via Plan; editable).
- Data export (JSON download) and clear-all-data.

---

## 9. Key user flows

**Scan a new meal:** Today → "+" → Add food → Photo → capture (with reference object) → AI returns items → adjust grams → confirm → entry added; remaining updates; offer "Save to library."

**Log exercise:** Today → "+" → Add exercise → pick activity + intensity + minutes → see/adjust burn → save → remaining increases.

**Log morning weight:** Weight tab → "Log this morning's weight" → enter number → graph updates.

**Plan a target:** Plan tab → enter stats, pick Lose + rate → see target → "Set as daily target" → appears on Today.

---

## 10. AI vision prompt (request content)

> You are a nutrition identification assistant. The user sends a meal photo, possibly with a reference object (credit card, coin, or fork) for scale.
>
> 1. Identify each distinct food item.
> 2. For each item give nutrition **per 100 grams**: calories, protein, carbs, fat.
> 3. Using the reference object, give a rough starting weight in grams for each item (the user will correct it).
> 4. Note hidden-calorie assumptions (oil, butter, dressing).
>
> Respond with ONLY valid JSON, no markdown, in this shape:
> ```json
> {
>   "items": [
>     {"name": "", "per_100g": {"calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}, "estimated_grams": 0, "confidence": "low|medium|high"}
>   ],
>   "assumptions": ""
> }
> ```
> If no food is visible, return an empty items array and explain in assumptions.

Parse robustly: strip markdown fences, attempt JSON parse, on failure show an error with retry or switch-to-manual.

---

## 11. Data model (localStorage)

```
settings   = { apiKey, weightUnit, heightUnit, dailyTarget? }
entries    = [ { id, date, name, grams, calories, protein_g, carbs_g, fat_g, source } ]
exercise   = [ { id, date, activity, intensity, minutes, met, caloriesBurned } ]
library    = [ { id, name, per_100g:{calories,protein_g,carbs_g,fat_g}, lastGrams } ]
weights    = [ { date, weight, unit } ]
profile    = { sex, age, height, activity, goal, lossRate }
```

`source` is one of `photo | barcode | library | manual`. Data leaves the device only in the AI request body (one photo) and the barcode lookup (one barcode string).

---

## 12. UI / design specification

Calm, minimal, Notion-like: lots of white space, restrained type, one soft accent.

### Principles
- Black and white base with **one** soft accent color.
- **No gradients. No rounded corners** (`border-radius: 0`). **No emojis.**
- Light grey hairline dividers instead of boxes, shadows, or cards. Generous whitespace.

### Design tokens
```
--font: 'Inter', -apple-system, system-ui, sans-serif;
--bg:        #FFFFFF;   /* page background */
--text:      #191919;   /* primary text */
--text-soft: #6B6B6B;   /* secondary text, labels */
--divider:   #ECECEC;   /* light grey 1px dividers */
--accent:    #5E81AC;   /* single soft accent — muted slate blue; swap to retheme */
--accent-bg: #EEF2F7;   /* faint accent tint for selected states */
```

### Typography
- Inter throughout, system sans fallback. Hierarchy by weight and size, not color. Comfortable line height; left-aligned.

### Components
- **Dividers:** 1px solid `--divider` between rows/sections. No cards or shadows.
- **Buttons:** flat, square. Primary uses `--accent` text or thin `--accent` border; no fill heavier than `--accent-bg`.
- **Inputs:** square, hairline border, accent border on focus.
- **List rows:** generous vertical padding, divider beneath, name left / value right.
- **Remaining budget:** the most prominent element on Today — large number, soft-grey breakdown (target / food / exercise) and macros beneath.
- **Tab bar:** bottom, text labels, hairline top divider; active tab in `--accent`.
- **Graph:** thin `--accent` line, hairline axes/gridlines, soft-grey labels, no gradient fill, square or no markers; trend line in lighter accent.
- **Selected/active states:** `--accent` text or faint `--accent-bg`; never pills or shadows.

---

## 13. Accuracy and known limitations

- Weight-based food logging removes the dominant photo-estimation error; barcode lookups are effectively exact.
- Photo ID can misjudge cooking fats; the AI's "assumptions" field surfaces these to correct.
- **Exercise burn is an estimate and tends to run high.** MET figures are population averages, not personal measurements; the burn is editable, and "eating back" exercise calories is optional by design.
- The calorie target uses Mifflin–St Jeor and standard multipliers — a starting point, not a medical prescription; the safety floor prevents unsafely low targets.
- Consistency (same plate and camera height, honest weights, same weigh-in time) makes week-over-week trends reliable even where absolute figures drift.

---

## 14. Privacy

- All data persists locally in `localStorage`; nothing syncs to a third party beyond the AI request and barcode lookup.
- API key stored locally, sent only to Anthropic in the request header.
- Export and clear-all-data controls give full control.

---

## 15. Out of scope / future

- Native iOS app (Xcode) to unlock **HealthKit** (read weight from a smart scale, write calories/workouts) and **LiDAR** depth-based volume estimation.
- Multi-angle photo capture to improve the AI's starting weight estimate.
- Grounding AI nutrition values against a database (e.g. USDA FoodData Central).

---

## 16. Success criteria (v1 done)

- Runs as an installed PWA on the iPhone with no server and no Mac involvement.
- All four food input modes log a correct entry end to end.
- Exercise logs with a MET-based burn that is editable and credits the daily budget.
- The **remaining** figure updates live on every food or exercise add/edit/delete.
- Morning weight logs in one tap; the graph, range toggle, and trend line work.
- The Plan calculator computes maintenance and target correctly, respects the safety floor, and can set the Today target.
- Food, exercise, history, weights, and profile persist across restarts.
- UI matches the spec: Inter, black-and-white-plus-one-accent, square corners, hairline dividers, no gradients or emojis.
