# FW Gatekeeper — Product & UI Review

Full product review of the dashboard UI and the Pi kiosk boxes: issues, improvements,
and what to remove. Complements `REMEDIATION.md` (security work order) — this review is
about product truthfulness, UX, and surface area, and repeats security items only where
they are also product-visible.

**Verdict:** the operational core (kiosk → offline log → sync → exceptions → corrections
→ closeout) is the right product and the loop is real. But the product currently makes
several claims its code doesn't back, the kiosk's worker-facing screen is engineer-facing,
the dashboard renders the same information 3–5 times, and roughly a quarter of the repo
is removable scaffolding.

---

## 1. Trust gaps — the product says things that aren't true

These matter most because this is a *truth system*. Each is a claim the UI or docs make
that the shipped code does not honor.

1. **Liveness does not exist in the shipped kiosk.** The HDMI screen permanently reads
   "Blink verification required before recognition" (`pi-kiosk/templates/index.html:536`)
   and the README promises blink anti-spoofing, but `pi-kiosk/main.py` never invokes
   `LivenessChecker`; `liveness_confirmed` is hardcoded `False` (`main.py:418`). A printed
   photo clocks a worker in. The `WAITING_FOR_BLINK` UI state is dead code — never emitted.
   Either wire liveness into the main loop or remove the claim from screen and docs today.
   (REMEDIATION P0-6, still open.)

2. **The sidebar's "System Online" badge is hardcoded** (`src/components/Sidebar.tsx:229-234`,
   `:307`) — a pulsing green dot with no data behind it, shown even while the dashboard
   reports kiosks offline / face service down. Remove it or wire it to `/api/system-health`.

3. **A kiosk with a dead camera looks healthy on the dashboard.** The only health signal is
   the worker-sync timestamp side effect (`src/app/api/sync/route.ts:22`). Camera failure,
   missing ONNX model, empty roster, and encoding-dimension mismatch (which rejects 100% of
   workers) are all invisible remotely. The kiosk's own `/health` is hardcoded
   `{"status":"ok"}` (`pi-kiosk/app.py:177-179`). Fix: send
   `{camera_ok, model_ok, known_workers, queued_logs, degraded_reason}` with each sync.

4. **The match threshold is 0.30 cosine** (`pi-kiosk/config.py:26`) — far below the usable
   0.45–0.55 band for ArcFace-family embeddings — and **five competing threshold values**
   exist across the tree. Worse, the README's documented tuning fix
   (`--threshold`, root `README.md:344`) is an argument `main.py` doesn't have: following
   the docs puts the service in a crash-restart loop.

5. **Two product names ship in one UI.** "FW Gateway" in the layout title, sidebar, login,
   404, closeout export, and credential emails; "Gatekeeper" in the repo, vision doc, and
   CSV filenames. Pick one.

6. **The two READMEs contradict each other on the OS image** (root says Desktop,
   `pi-kiosk/README.md:25` says Lite — and on Lite the HDMI display never launches, because
   autostart is desktop-session XDG while auto-login is tty1). `pi-kiosk/README.md` largely
   documents the *legacy* kiosk (`kiosk.py`: JSON files, terminal UI, euclidean thresholds,
   5-min sync) rather than the shipped one (`main.py`: SQLite, browser UI, cosine, 30-s sync).

---

## 2. The boxes — worker-facing kiosk UX

What a worker sees at the door today: a small, single-line, ellipsis-truncated status
message next to a debug strip (`State: NOT_RECOGNIZED · ID: — · EAR: 0.00 · Workers: 43 ·
Liveness: No`), an unmirrored camera feed with a bounding box lagging 2–3 seconds behind
their face, and a permanent supervisor-controls button.

Issues, in impact order:

- **All failures collapse to "Face not recognized"** (`main.py:485`) — including kiosk
  faults: model failed to load, zero workers synced, dimension mismatch. Workers are told
  to see a manager for a broken box. Add a distinct `SERVICE_DEGRADED` state ("Scanner
  unavailable — use the sign-in sheet"); the `decision` field already distinguishes these.
- **Offline state is invisible.** `SyncWorker.server_online` is tracked and surfaced
  nowhere. A kiosk can queue three days of scans with no indicator. Add a footer chip:
  "Synced 2 min ago" / "Offline — 214 scans queued" (data already in
  `database.get_unsynced_logs()`).
- **Stale-result bug** (`main.py:458` reads `current_result[0]` without clearing it):
  the "Hold steady…" coaching state flashes past in ~100 ms, an unknown person writes a
  `rejected_unknown` telemetry row every 5 s forever, and a lingering recognized worker
  writes `accepted_already_clocked` every 5 s — spamming the SD card and polluting the
  calibration dataset the Recognition Lab depends on. One consume-and-clear fixes all three.
- **Throughput:** ~8–12 s per worker on a Pi 3B (HOG detection × 3-frame embedding window
  × hard 5-s display hold that halts scanning). At shift change on 4 kiosks that's a queue
  at the door. Cut success hold to ~2 s; accept a high-confidence single frame.
- **Debounce is wrong for real shifts:** `CLOCK_DEBOUNCE_MINUTES = 60` (spec said 5) means
  nobody can clock out within an hour of clocking in; exit kiosks say "Already clocked
  *in*" (`main.py:513`); the debounce map is in-memory so every service restart re-arms
  double-clocking.
- **Display craft:** text maxes at 1.2rem with `nowrap`/ellipsis vs. the "readable from
  3 feet" requirement — go full-width banner, ≥4rem, wrapping; drop the confidence % and
  raw timestamp from the worker line; mirror the preview (`cv2.flip`); add a large ✓/✗
  glyph (color-only red/green fails the most common color-blindness axis) and optional
  sound; hide the debug strip and supervisor button behind the existing PIN flow.

Operational issues at the box:

- **There is no working upgrade path.** `setup.sh:131-140` appends to the *tracked*
  `config.py`, so every subsequent `git pull` (including the README's documented fleet
  update loop) fails on a dirty tree. Ship the `config_local` import in-repo; never mutate
  tracked files from the installer.
- Secrets written world-readable (`config_local.py`, no `chmod 600`); recognition model
  downloaded at first boot from Hugging Face unpinned/unchecksummed (breaks offline-first
  provisioning); Bookworm boot paths (`/boot/firmware/`) silently no-op so **screen
  blanking is never disabled** — the display goes black after ~10 min idle;
  `StartLimitBurst=0` is in the wrong systemd section, so the restart-forever intent
  doesn't hold.
- Persistence: no `PRAGMA busy_timeout`; `log_attendance` (`main.py:534`) is uncaught, so
  one `SQLITE_BUSY` kills the kiosk; synced rows are never pruned (slow-motion disk-full);
  timestamps are naive local time (a Pi booting before NTP writes 1970 attendance);
  a mid-run camera disconnect is unrecoverable without a manual restart.

---

## 3. Dashboard UI

The shift-loop pages (Briefing → Exceptions → Closeout) are the right product. The main
problems are duplication, inconsistency, and a few pages that fight the vision doc.

- **`/` and `/briefing` are the same page twice.** Both read `shift_trust_brief`, both
  render a readiness status, a gold "next action" callout, blocker lists, a kiosk quad,
  and review-link grids. The dashboard alone stacks **three competing "next action"
  components** plus an open-exceptions list, and **12 stat tiles in 3 visual treatments**
  ("Kiosks online" appears twice; "Expected" and "Total Workers" are the same number).
  Collapse to one live view with one prioritized queue — `src/lib/proactive-actions.ts`
  already ranks everything; render it once.
- **Mobile nav buries the actual workflow.** The bottom tab bar is hardcoded to
  `['/', '/workers', '/enroll']` (`Sidebar.tsx:137`); Briefing/Exceptions/Closeout are two
  taps deep behind "More" (which itself can overflow off-screen). Swap in Exceptions and
  Closeout; badge Exceptions with the open count.
- **Loading/empty conflation:** `/workers`, `/log`, `/schedules`, `/reports` have *no*
  loading state and flash false empty states ("No records for this date") while fetching —
  worse than a spinner on a truth system. `/workers`, `/log`, `/schedules`, `/reports`
  also swallow fetch errors entirely (console-only), so "roster failed to load" is
  indistinguishable from "no workers".
- **Role gating is middleware-only on `/workers` and `/schedules`:** viewers get a blank
  grid with live-looking Edit/Deactivate/Delete buttons and silent 401s. Both pages need
  the `/api/portal-role` review-only treatment the other pages already have.
- **Accessibility:** the correction modal — the audited-correction gate — has no dialog
  semantics, focus trap, or Escape (`exceptions/page.tsx:687`); toasts have no `aria-live`
  and collide with the mobile tab bar; most form labels aren't associated with inputs;
  no `aria-current` on nav.
- **Two definitions of "late":** `/reports` uses a free-typed threshold input, independent
  of the Schedules the rest of the app uses — the same worker can be "On Time" in Reports
  and "Late arrival" in Exceptions.
- **Correctness:** the dashboard's poll interval tears itself down and re-arms on every
  fetch (`page.tsx:345,530`), and polls 7 endpoints every 10 s per tab with no
  `document.hidden` check; destructive actions (deactivate worker, delete schedule) use
  native `confirm()` with no audit note, against vision principle 4.
- Filter state never writes back to the URL (views unshareable, Back silently resets
  filters); sign-out is gated on a legacy endpoint that can strand users signed in
  (`Sidebar.tsx:159-174`); the 404 page double-renders inside the app shell.

---

## 4. Remove list

Ordered so deletions unblock each other. Steps 1–5 are mechanical: ~900 lines of app code,
~90 KB of scripts, and five whole files on the Pi.

**First — the tests that pin dead code in place:**
- `scripts/test-convex-auth-scaffold.mjs` (asserts the dead PIN login still exists),
  `test-launch-readiness-contract.mjs` (asserts two orphan routes exist),
  `test-dashboard-demo-mode-contract.mjs` (pins the demo scaffold). More broadly, 14 of
  17 contract scripts are source-regex assertions (they match headings and decorator
  spellings, not behavior); keep the 3 that execute real code (`test-date`,
  `test-convex-local-date`, `test-proactive-actions`) and move coverage to vitest, which
  is already installed and running two real test files.

**Pi kiosk:**
- `kiosk.py` + `setup_pi.sh` — the entire legacy dlib/JSON kiosk stack; provisioning with
  the wrong script yields a box that recognizes no one (REMEDIATION P1-4).
- `demo.py` — broken on three independent counts (references config keys that don't exist,
  writes confidence into the liveness column, needs non-headless OpenCV). Cannot run.
- `quick_demo.py` — self-contained laptop toy; carries a fifth competing threshold.
- `quick_test.py` — useful diagnostic but binds `0.0.0.0:5555` with **no auth** and
  collides with the kiosk's own port; move to `tools/`, bind loopback, or delete.
- `e2e_test.py` — module-level side effects **delete the live `data/attendance.db`** if
  run on a kiosk (its `DB_PATH` env override is never read by `config.py`). Move to
  `tests/` and fix, or delete.
- `encode_service.py` — duplicate encoder producing 128-dim dlib encodings the 512-dim
  kiosk can never match; nothing starts it. Keep `face-service/` as the one encoder.
- Dead half of `recognition.py` (the entire `recognize_with_liveness`/`recognize_face`
  matching engine — `main.py` reimplements matching inline), `database.py`'s never-called
  `auto_clockout_overdue` and `was_recently_clocked`, and 7 unused config keys.

**Dashboard:**
- `/reports` — a named anti-goal in `vision.md` ("passive analytics dashboard with charts
  but no operational action"), with its own conflicting late definition, an unbounded
  serial fetch loop (a 1-year range fires 365 sequential requests), and the app's only
  `recharts` usage. Move worker-hours to a `/log` or `/closeout` export; drop the dep.
- `/onboarding` — 155 lines of static prose with a hardcoded onrender.com URL occupying a
  top-level nav slot; fold into a help panel on `/enroll`.
- `StatsBar` + `useAnimatedCounter` (tweening numbers on a 10-s poll means displayed
  values that were never true, plus a real stale-target bug), `WebcamCapture.tsx`
  (imported by nothing), `SkeletonTable` (no consumer; `DashboardSkeleton` models the old
  page layout), the fake "System Online" badge, unused CSS (`glow-border`, `scan`/`glow`/
  `slide-in-left` keyframes, `slate-750`, `glow-radial`), and dead dashboard state
  (`absentWorkers`, `scheduleWarning`, unused `readinessCopy.title` strings).

**Backend / repo:**
- Throwing legacy stubs `src/lib/db.ts` and `src/lib/seed.ts` (zero importers — the
  Convex migration is complete; these only exist to crash).
- Dead routes: `POST /api/worker-encode`, `GET /api/worker-photos`, `POST /api/auth/login`,
  `POST /api/auth/logout` (with them, ~100 of 132 lines of the PIN-token stack in
  `src/lib/auth.ts`), `GET /api/kiosks` (strict subset of `/api/system-health`),
  `POST /api/workers` (unreachable; its own error message says to use `/api/enroll`), and
  `/api/portal-role` once its 5 callers use the existing `useQuery(portalMembers.current)`.
- Unreferenced Convex functions: `attendance.clearAll` (a no-arg public mutation that
  deletes the whole attendance table — also REMEDIATION P0-1's top item),
  `kiosks.findByKioskId`, `recognitionAttempts.listForReview`/`listRange`, `seed.run`
  (deployed to prod, runnable from the Convex dashboard, inserts fake workers).
- 14 orphaned types in `src/lib/types.ts` (the whole `ShiftCloseoutDraft*` family).
- Committed artifacts: `tmp_args.json` (a leaked Convex doc ID), `outputs/` (tracked
  binary spreadsheet); gitignore both.
- `src/lib/employee-directory.ts` — ~120 real named employees with IDs baked into the JS
  bundle shipped to every browser (PII + redeploy-to-update). Move to a Convex table.
- **Demo write mode** — the single largest simplification: a 284-line in-memory shadow
  database on `globalThis`, branches in **18 of 21 API routes** (including three
  real+demo merge paths), an auth bypass in `portal-auth.ts`, a fake Convex URL helper,
  and **three inconsistent definitions of "am I in demo mode"** across two env vars.
  ~450+ lines total. Replace with a scratch Convex deployment seeded by `seed.run`
  (which then earns its keep). If it must stay: one flag, one banner mounted once in
  `AppShell` (today it appears on 5 pages and is missing on 4 others), no merge paths.

---

## 5. Prioritized plan

**P0 — truth and safety (do before real workers rely on it)**
1. Wire liveness or delete the claim (screen, README, footer).
2. Real kiosk health → dashboard (`camera_ok, model_ok, known_workers, queued_logs,
   degraded_reason`); make kiosk `/health` truthful; remove the fake "System Online" badge.
3. Fix the upgrade path (`setup.sh` must not mutate tracked `config.py`).
4. Calibrate the threshold (one value, ~0.45–0.55 cosine), fix the `--threshold` docs.
5. Consume-and-clear `current_result` (fixes coaching state, telemetry spam, calibration
   pollution).
6. Distinguish "kiosk broken" from "face not recognized" at the box; show sync/queue state.

**P1 — one legible loop**
7. Merge `/` and `/briefing`; one prioritized action queue; 12 stat tiles → 4.
8. Sidebar grouped by loop (Shift / Evidence / Setup); Exceptions badge; mobile tabs →
   Dashboard, Exceptions, Closeout.
9. Role-aware `/workers` and `/schedules`; real loading and error states on the four pages
   missing them; accessible correction modal.
10. Kiosk display worker-grade: big wrapping banner, mirrored feed, ✓/✗ glyph, debug strip
    removed; success hold 2 s; debounce 5 min and exit-aware messaging.

**P2 — shrink the surface**
11. Execute the remove list (§4): legacy kiosk stack, demo/test scripts, dead routes and
    functions, `/reports`, `/onboarding`, demo-write-mode, regex contract tests.
12. Unify naming (Gatekeeper), the two kiosk-status implementations, the single/bulk
    ingest pair (one batch endpoint, one wire format), and the duplicated route→role
    tables in `src/proxy.ts` vs per-route helpers.
13. Rewrite `pi-kiosk/README.md` to describe the shipped kiosk; resolve the Lite/Desktop
    contradiction; fix Bookworm boot paths and the systemd unit.
