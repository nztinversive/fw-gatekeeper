# FW Gatekeeper — Remediation Guide

This is a work order for an engineering agent. It is the output of a full review of the
Next.js dashboard, Convex backend, Python Pi kiosk, and FastAPI face service.

**Read this first:**

- The product is a working v1, but it is **not safe to run against real workers or real
  physical access control** until the CRITICAL section is done. Two themes dominate:
  (1) the auth model is bypassable end to end, and (2) the physical-access safeguards
  (liveness, match threshold) do not actually run in the shipped kiosk.
- Work top-down: **P0 (Critical) → P1 (High) → P2 (Medium) → P3 (Low)**. Do not skip ahead;
  several P1/P2 items assume P0 groundwork (e.g. server-side auth on Convex) is in place.
- The reference for "how auth should look" already exists in this repo:
  `convex/portalMembers.ts` (server-side identity + role checks) and the fail-closed kiosk
  check in `src/lib/auth.ts:105`. Copy those patterns; don't invent new ones.
- After each task, run `npm run lint` and `npm test`, and add a real test where noted.
- **Do not** commit secrets, `.env` files, or `tmp_args.json`/`outputs/` artifacts.
- Ask the human before: rotating live credentials, deleting production data, or changing the
  Render deployment topology. Everything else in here you can just do.

Legend: each task has an ID, the files involved, what to do, and **Done when** (acceptance
criteria). Check the box when complete.

---

## P0 — CRITICAL (blockers; do all of these before any real deployment)

### P0-1 — Add server-side auth to every Convex function
**Files:** all of `convex/*.ts` except `_generated/`; template is `convex/portalMembers.ts`.

The Convex deployment URL ships to the browser (`NEXT_PUBLIC_CONVEX_URL`), so every exported
`query`/`mutation`/`action` is callable by anyone, bypassing the Next.js middleware entirely.
Today only `portalMembers.ts` checks identity.

Do this:
- For each public function that serves the dashboard/admin UI, add a `getAuthUserId(ctx)` +
  role check at the top (mirror `assertAdminUser` / the role checks in `portalMembers.ts`).
- For functions that only the kiosk calls (see P0-2), convert them to authenticate via a
  kiosk credential instead of a portal session.
- Anything that should never be called from the client (seeding, internal maintenance)
  must be `internalMutation` / `internalQuery`, not `mutation` / `query`.
- **`attendance.clearAll` (`convex/attendance.ts:164`)** is a no-arg public mutation that
  deletes the entire attendance table. Make it `internalMutation` (or delete it). This is the
  single most dangerous function in the repo — do it first.
- The biometric-exposing reads — `workers.list({includeEncodings:true})` (`convex/workers.ts:39`),
  `workers.get` (`:64`), `workers.listForSync` (`:198`) — must require auth (admin/enrollment for
  the first two; kiosk credential for `listForSync`).

**Done when:** an unauthenticated direct call to any data-mutating or encoding-returning Convex
function fails; `portalMembers`-style checks are present in every public function; seed/maintenance
functions are `internal*`. Add a Convex test (see P1-9) that calls a representative mutation with no
identity and asserts it throws.

### P0-2 — Authenticate the kiosk → Convex path
**Files:** `convex/attendance.ts` (`create`, `bulkCreate`), `convex/recognitionAttempts.ts`
(`bulkIngest`), `convex/kiosks.ts` (`updateLastSync`), `convex/kioskLookup.ts`; `pi-kiosk/sync.py`,
`pi-kiosk/config.py`.

The Next.js routes check `KIOSK_API_KEY`, but the Convex mutations the kiosk ultimately writes
through accept no kiosk credential, so forged clock-ins/recognition records can be injected
directly. Decide on and implement one of:
- (Preferred) Route all kiosk writes through the Next.js API routes only, and make the
  corresponding Convex mutations `internalMutation` invoked server-side after the route validates
  `KIOSK_API_KEY`. This keeps a single trust boundary.
- Or pass a kiosk secret into the Convex mutation args and verify it there.

Also: `pi-kiosk/sync.py:21` returns empty auth headers when `KIOSK_API_KEY` is unset on the Pi,
so sync silently 401s forever. Add a **loud startup failure/warning** in the kiosk if the key is
missing.

**Done when:** a direct anonymous call to `attendance.create`/`bulkCreate`/`recognitionAttempts.bulkIngest`/`kiosks.updateLastSync`
is rejected; the kiosk still syncs successfully with a configured key; the kiosk logs a clear error
on startup if the key is absent.

### P0-3 — Upgrade Next.js past the middleware auth-bypass CVE
**Files:** `package.json`, `package-lock.json`.

`next@14.2.21` is vulnerable to CVE-2025-29927 (skip middleware via `x-middleware-subrequest`
header). Since this app enforces auth almost entirely in `src/middleware.ts`, this unlocks every
admin API. Bump to the latest `14.2.x` (>= 14.2.25), reinstall, and re-run the build.

**Done when:** `next` is >= 14.2.25 in `package.json` + lockfile; `npm run build` passes; a request
with `x-middleware-subrequest: middleware` to a protected route no longer bypasses auth
(verify manually against a local build).

### P0-4 — Put authentication in front of the face service
**Files:** `face-service/main.py`, `render.yaml`.

`face-service/main.py` has no auth and `allow_origins=["*"]`, deployed publicly. Add a required
API-key header check (e.g. `x-face-service-key` compared against an env var) on `/encode` and
`/match`, and restrict CORS to the dashboard origin. Wire the key into `render.yaml` as
`sync: false` and into any caller (`src/app/api/worker-encode` / `system-health`).

**Done when:** `/encode` and `/match` return 401 without the key; the dashboard enrollment flow still
works with the key set; CORS no longer allows `*`.

### P0-5 — Add authentication to the Flask kiosk UI
**Files:** `pi-kiosk/app.py`, `pi-kiosk/config.py`.

Flask binds `0.0.0.0:5555` with no auth; `/manual-clock` (POST) lets anyone on the LAN punch any
worker, and `/status` dumps the roster with employee IDs. Add a shared-secret/basic-auth check on
all write and PII routes (read the secret from env/config), and consider binding to `127.0.0.1`
if the UI is only used locally. Do the same for the other unauthenticated `0.0.0.0` binders:
`pi-kiosk/encode_service.py` (:5557) and `pi-kiosk/enroll.py`'s preview server.

**Done when:** `/manual-clock` and `/status` require the secret; unauthenticated LAN requests are
rejected; `encode_service.py`/`enroll.py` preview servers are either authenticated or bound to
localhost.

### P0-6 — Actually run liveness in the production kiosk
**Files:** `pi-kiosk/main.py` (detection loop ~288–534), `pi-kiosk/liveness.py`,
`pi-kiosk/recognition.py`.

`main.py` is the shipped entrypoint (via `setup.sh`) and it hardcodes `liveness_confirmed=False`
(`:397`, `:515`) — the blink check is never invoked. Wire the liveness checker into `main.py`'s
loop so a clock event requires a passed liveness challenge, and set `liveness_confirmed`
truthfully.

Be honest about limits (document in code/README): the current EAR blink check
(`liveness.py`) latches "alive" after one blink with no replay/depth/texture defense, so it
stops a flat printed photo but not a phone video. If real anti-spoofing matters, note it as a
follow-up (e.g. challenge-response prompt, passive depth/texture model) — but at minimum the
existing check must run.

**Done when:** a clock event in `main.py` requires liveness; a static printed photo is rejected;
`liveness_confirmed` reflects the real result; the README's liveness claim matches what the code does.

### P0-7 — Raise the face-match threshold
**Files:** `pi-kiosk/config.py:26`, `pi-kiosk/main.py:345,370`.

`RECOGNITION_MATCH_THRESHOLD = 0.30` is far too permissive for ArcFace cosine similarity
(typical accept range 0.4–0.6). Combined with sliding-window embedding averaging (`main.py:345`,
which blurs toward a generic face), lookalikes get accepted.

Raise the threshold (start ~0.45–0.55, then tune with real enrolled data), and reconsider the
averaging (prefer best-single-frame match or median over a naive mean). Reconcile the conflicting
thresholds elsewhere (`recognition.py` uses 0.5 cosine; `kiosk.py` uses 0.6 euclidean) so there is
one authoritative value.

**Done when:** the production threshold is set to a defensible value with a code comment explaining
it; there is a single source of truth for the threshold; a smoke test confirms a known non-match
scores below it.

### P0-8 — Biometric consent / retention / deletion
**Files:** `convex/workers.ts` (`remove` at :190), `convex/schema.ts` (`faceEncoding` :23,
`photoStorageIds` :22); new: a deletion mutation + a consent/retention doc.

There is no way to honor a deletion request today: `workers.remove` only sets `active:false` and
never deletes the face encoding or the stored photos. For a real factory this is a BIPA-style
launch blocker.

Do this:
- Add an authenticated `workers.purgeBiometrics` (or extend `remove`) that deletes the
  `faceEncoding`, deletes the Convex storage objects referenced by `photoStorageIds`, and records
  an audit entry.
- Add a short `RETENTION.md` (or a README section) documenting: what biometric data is stored,
  where, for how long, the legal basis/consent step at enrollment, and how deletion works.
- Add a consent acknowledgement to the enrollment flow (even a checkbox + timestamp stored on the
  worker record is a meaningful start).

**Done when:** an admin can fully delete a worker's biometric data (encoding + photos) and it's
gone from Convex storage; a retention/consent doc exists; enrollment captures consent.

### P0-9 — Remove the committed admin PIN and rotate secrets
**Files:** `README.md:433` (and the surrounding env table), git history.

The admin PIN (`4729`) is documented in the README next to the live dashboard URL. Remove the
literal value from the README (replace with a placeholder + "set via env"). **Flag to the human**
to rotate `ADMIN_PIN`, and on principle `AUTH_SECRET` and `KIOSK_API_KEY`, since they've been in a
repo. Do not attempt to scrub git history without the human's sign-off.

**Done when:** no real secret values remain in tracked files; the human has been given a rotate list.

---

## P1 — HIGH (fix soon)

### P1-1 — Make dev auth fallbacks fail closed
**Files:** `src/lib/auth.ts` (`getAuthSecret`, `hasValidKioskKey`),
`src/app/api/auth/login/route.ts` (`getAdminPin`).

Today the kiosk key fails *open*, and `AUTH_SECRET`/`ADMIN_PIN` fall back to public constants
(`dev-fw-gatekeeper-secret`, `1234`) whenever `NODE_ENV !== 'production'`. Any staging/preview box,
or a prod process started without `NODE_ENV=production`, is trivially forgeable. Gate all dev
fallbacks behind an **explicit opt-in env var** (e.g. `FW_ALLOW_DEV_AUTH=true`), not `NODE_ENV`,
and refuse to start / reject requests otherwise.

**Done when:** with no env opt-in, missing secrets cause a hard failure (no silent public defaults),
regardless of `NODE_ENV`.

### P1-2 — Add in-handler auth to write API routes
**Files:** `src/app/api/worker-encode/route.ts`, `worker-photos/route.ts`, `attendance/route.ts`,
`attendance/bulk/route.ts`, `schedules/route.ts`, `stats/route.ts`, `sync/*`.

These rely entirely on middleware for auth (defense-in-depth gap; fully exploitable together with
the CVE). Re-check the role server-side in each handler using `portal-auth.ts`/`portal-member.ts`.
`worker-encode` is worst — no auth and no ownership check; it can silently overwrite any worker's
face encoding.

**Done when:** each listed handler independently rejects unauthorized roles even if middleware is
bypassed.

### P1-3 — Fix bundled dependency CVEs
**Files:** `package.json`, `package-lock.json`, `.npmrc`.

`npm audit --omit=dev` reports `@auth/core` (critical, via `@convex-dev/auth@^0.0.92`), `ws`
(high, via `convex`), plus transitive `postcss`/`nanoid`/`lodash`. Run `npm audit fix`, bump
`@convex-dev/auth` to a release off the vulnerable `@auth/core`, and flip `.npmrc` `audit=false`
back on (or remove that line) so future installs surface vulns.

**Done when:** `npm audit --omit=dev` shows no critical/high; `.npmrc` no longer silences audit.

### P1-4 — Delete the legacy Pi setup path
**Files:** `pi-kiosk/setup_pi.sh`, `pi-kiosk/kiosk.py` (legacy dlib/JSON kiosk), `setup.sh`.

Two setup scripts install divergent stacks: `setup.sh` → current `main.py` (ONNX/SQLite);
`setup_pi.sh` → obsolete `kiosk.py` (dlib 128-dim, JSON store, UTC, chromium not on current Pi OS,
0.6 euclidean threshold). Provisioning with the wrong one yields a kiosk that never works. Delete
`setup_pi.sh` and `kiosk.py` (and its data-format helpers if unused), leaving `setup.sh` as the one
path. If any logic in `kiosk.py` is still needed, port it into `main.py` first.

**Done when:** there is exactly one setup script and one kiosk entrypoint; no references to the
deleted files remain.

### P1-5 — Fix the systemd watchdog loop
**Files:** `pi-kiosk/setup_pi.sh:80` (or its replacement service unit).

`WatchdogSec=60` is set but the app never calls `sd_notify`, so systemd kills/restarts the kiosk
every ~60s forever. Either remove `WatchdogSec` or implement `sd_notify` pings from the kiosk main
loop. (If P1-4 deletes `setup_pi.sh`, make sure the surviving unit in `setup.sh` doesn't have the
same bug.)

**Done when:** the kiosk service stays up indefinitely under systemd; watchdog, if present, is fed.

### P1-6 — Pin Python dependencies
**Files:** `pi-kiosk/requirements.txt`, `face-service/requirements.txt`.

Nothing is pinned; a fresh install pulls NumPy 2.x and breaks the dlib/face_recognition/onnxruntime
ABI. Pin exact (or `~=`) versions known to work together, especially `numpy<2` where dlib/
face_recognition require it. Verify the face-service image still builds.

**Done when:** both files have pinned versions; `face-service` Docker build succeeds; a clean Pi
install imports all modules without ABI errors.

### P1-7 — Complete the Render/env config
**Files:** `render.yaml`, new `.env.example`.

`AUTH_SECRET`, `ADMIN_PIN`, `KIOSK_API_KEY` (and the P0-4 face-service key) are required in prod but
not declared in `render.yaml`, so a fresh blueprint deploy crashes at first login with no hint. Add
them as `sync: false` placeholders, add `healthCheckPath: /api/health` for the web service (and a
health path for the face service), and create a `.env.example` listing every required var with dummy
values.

**Done when:** `render.yaml` declares all required secrets and health checks; `.env.example` exists
and is complete; a from-scratch deploy has clear config requirements.

### P1-8 — Make idempotency real
**Files:** `convex/attendance.ts` (`create` :143, `bulkCreate` :175), `convex/schema.ts:34`,
`pi-kiosk/sync.py:36`.

`idempotencyKey` is stored but never used for dedup; `bulkCreate` dedups only on exact
`workerId:timestamp` string equality, so a retry off by 1 ms creates a duplicate clock-in. Add an
index on `idempotencyKey`, dedup against it in both `create` and `bulkCreate`, and include the local
log id in the key builder in `sync.py` so two legitimate same-second events don't collapse.

**Done when:** re-sending an already-synced batch (including near-duplicate timestamps) creates no
duplicate rows; a test covers the retry case.

### P1-9 — Add real tests + CI
**Files:** `scripts/test-*.mjs` (all 14), new test files, new `.github/workflows/`.

The current suite is `readFileSync` + regex against source text — it asserts source *contains
strings*, not that anything works. Add behavioral tests for: the Convex auth checks from P0-1/P0-2
(anonymous call rejected), the idempotency dedup (P1-8), `event_type` validation (P2-2), and the
kiosk sync happy path. Add a `.github/workflows/ci.yml` that runs `npm run lint`, `npm test`, and
`npm run build` on push/PR. Fold `pi-kiosk/e2e_test.py` into CI if feasible.

**Done when:** at least the P0/P1 behavioral cases have executing tests; CI runs them on every PR and
is green.

### P1-10 — Add a LICENSE
**Files:** new `LICENSE`.

Ask the human which license (proprietary vs. open); add the file. Blocks any distribution/
contribution story until present.

**Done when:** a `LICENSE` file exists reflecting the human's choice.

---

## P2 — MEDIUM (should address)

- **P2-1 — Bound the unbounded `.collect()` scans.** `convex/attendance.ts:33`
  (`listAttendanceByTimestampRange`), `stats.get`, `buildShiftBriefing`, `buildShiftExceptions`,
  `workers.listForSync` (`workers.ts:201`), `findWorkerByName` (`workers.ts:35`), `kioskLookup`
  (`kioskLookup.ts:22`) all `.collect()` whole tables/windows and will hit Convex read limits as
  data grows. Add a `by_worker_timestamp` composite index (schema has `by_worker` and `by_timestamp`
  but the query filters instead), paginate, and cap results.
  **Done when:** hot-path queries use indexes + limits and don't scan full tables.

- **P2-2 — Validate `event_type`.** `convex/attendance.ts:146,182` and
  `src/app/api/attendance/route.ts:36` accept free-text; a typo like `clockin` silently never matches
  `clock_in`/`clock_out` logic. Use `v.union(v.literal("clock_in"), v.literal("clock_out"))` in
  Convex and an allow-list in the route. Also change `workerId` from `v.string()` to
  `v.id("workers")` (`schema.ts:30`) for referential integrity.
  **Done when:** invalid event types and worker IDs are rejected at the boundary.

- **P2-3 — Lock down `seed.ts`.** `convex/seed.ts:3` `run` is a public mutation; make it
  `internalMutation` (it's guarded against overwriting existing data but will still seed an empty
  prod DB).
  **Done when:** seeding is not callable from the client.

- **P2-4 — Fix `stats.ts` time math.** `convex/stats.ts:5-16` uses naive `slice(0,10)`/`getDay()`
  instead of the DST-safe `convex/localDate.ts` helpers used by briefing/exceptions → off-by-a-day/
  DST errors around midnight. Route all date math through `localDate.ts`.
  **Done when:** `stats.ts` uses the shared timezone helpers; a midnight/DST case is tested.

- **P2-5 — Fix kiosk clock/timezone handling.** `pi-kiosk/database.py:384,417` and `main.py:153`
  write naive local time; `kiosk.py:283` writes UTC (removed by P1-4, but confirm). Standardize on
  UTC ISO-8601 with offset, and handle the Pi having no RTC (queue events, stamp/validate against
  server time on sync, or refuse to clock until NTP has synced).
  **Done when:** all events use one unambiguous timezone convention; a wrong-clock-at-boot scenario
  doesn't corrupt times.

- **P2-6 — Add SQLite `busy_timeout`.** `pi-kiosk/database.py:43` opens thread-local connections
  (detection, Flask, sync threads all write) with WAL but no `busy_timeout` → `SQLITE_BUSY` can
  silently drop a clock event. Set `PRAGMA busy_timeout` and add a retry on the detection-loop insert.
  **Done when:** concurrent writes don't drop events under load.

- **P2-7 — Recover from mid-run camera disconnect.** `pi-kiosk/main.py:414` only logs + sleeps 1s
  forever on capture failure; the camera is never re-initialized. Add re-init/reconnect logic.
  **Done when:** unplugging/replugging the USB camera recovers without a manual restart.

- **P2-8 — Face-service port + user.** `face-service/Dockerfile` hardcodes `--port 5557` and runs as
  root with no healthcheck. Respect Render's `$PORT`, add a non-root user, add a `HEALTHCHECK`.
  **Done when:** the container binds `$PORT`, runs non-root, and has a healthcheck.

- **P2-9 — Fix dashboard polling churn.** `src/app/page.tsx:503` `fetchData` depends on
  `attendanceEvents`, so the 10s `setInterval` at `:530` is torn down/recreated every poll. Use a ref
  for the latest events so the interval is stable.
  **Done when:** the poll interval is created once and refresh cadence is regular.

- **P2-10 — Admin token revocation.** `src/lib/auth.ts` issues stateless 12h HMAC JWTs with no
  denylist; `logout` only drops the cookie client-side, so a captured token stays valid. Add a
  server-side revocation/session check (matters on shared factory terminals).
  **Done when:** logout invalidates the token server-side.

---

## P3 — LOW (cleanup / polish)

- **P3-1 — Remove stray artifacts & tighten `.gitignore`.** Delete tracked `tmp_args.json`
  (contains a live Convex doc ID) and `outputs/*.xlsx`; add `.env`, `outputs/`, `*.xlsx`,
  `.DS_Store`, editor dirs to `.gitignore`.
- **P3-2 — Verify the dlib model download.** `setup.sh` (and legacy `setup_pi.sh` if not yet
  deleted) fetch `shape_predictor_68_face_landmarks.dat` (~99 MB) from a random third-party GitHub
  mirror with no checksum. Pin a trusted source and verify a SHA-256 checksum after download.
- **P3-3 — Delete dead code.** `src/lib/db.ts` throws on import (deprecated SQLite stub);
  `pi-kiosk/recognition.py`/`demo.py` mix 128-vs-512-dim encodings and inconsistent thresholds so
  `demo.py` never matches. Remove or reconcile; don't ship demo/test files (`demo.py`,
  `quick_demo.py`, `quick_test.py`, `e2e_test.py`) to `/opt` in `setup.sh`.
- **P3-4 — Replace `alert()` in `WebcamCapture`.** `src/components/WebcamCapture.tsx:20` uses a
  blocking `alert()` for camera-denied; use the app's existing `Toast` system.
- **P3-5 — Fix README drift.** Sync interval is stated as 5 min but `config.py` says 30s and
  `kiosk.py` says 300s; `/boot/config.txt` paths are stale for Pi OS Bookworm (`/boot/firmware/...`).
  Reconcile docs with code after the P0/P1 changes land.
- **P3-6 — Right-size feature naming.** "Live Shift Sentinel" is a 10s in-tab poll
  (`src/app/page.tsx:532`) that does nothing if no supervisor has the tab open; "Closeout Autopilot"
  generates a draft, nothing autonomous runs. Either rename to match reality or implement a real
  server-side trigger (out of scope for a bugfix pass — flag to product).

---

## Suggested execution order (fastest path to "safe to pilot")

1. **P0-1, P0-2, P0-3** — close the auth bypass (Convex + Next CVE). Nothing else matters until this
   is done.
2. **P0-6, P0-7** — make the kiosk's access decision real (liveness on, threshold sane).
3. **P0-4, P0-5, P0-9, P1-1** — lock the remaining open surfaces and dev fallbacks.
4. **P0-8** — biometric deletion/consent (compliance gate for real workers).
5. **P1-3, P1-4, P1-5, P1-6, P1-7** — deploy/runtime correctness.
6. **P1-8, P1-9, P1-10** — data integrity, tests/CI, license.
7. **P2**, then **P3**.

## What's already solid (don't "fix" these)

- `convex/portalMembers.ts` — the correct auth pattern; use it as the template.
- `convex/localDate.ts` — DST-safe timezone handling.
- `convex/attendanceCorrections.ts` — careful integrity checks + preserves raw kiosk events for audit.
- Offline durability in the kiosk (SQLite WAL, synced only on HTTP 200) — no data loss over a day
  offline. Preserve this behavior through any sync refactor.
- Demo write mode is correctly inert in production.
- `vision.md` is a good product guardrail — keep changes consistent with it.
