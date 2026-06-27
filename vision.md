# FW Gatekeeper Vision

FW Gatekeeper is the factory access and attendance truth system for Fading West. It starts at the physical door: a worker stands in front of a kiosk, the kiosk recognizes the face, records an entry or exit event, and keeps working even when the network is unreliable. The web app exists to make that physical evidence useful to supervisors, not to replace the source of truth with manual dashboard activity.

This file is the product guardrail. Read it before changing product flows, adding major features, or assigning agents to build in this repo.

## Product Center

FW Gatekeeper answers one operational question:

> Who is physically present in the factory, how reliable is that signal, and what does a supervisor need to do about it before the shift is trusted?

The product is not just a time clock. It is a physical gatekeeper plus a supervisor command layer. The valuable core is the connection between:

- Raspberry Pi kiosks at real entry and exit points.
- Face enrollment and recognition quality.
- Offline-safe attendance events.
- Schedules and department coverage.
- Kiosk health and sync confidence.
- Exceptions, corrections, briefings, and closeout workflows.

Every meaningful feature should strengthen that chain.

## Primary Users

- Workers: need a fast, clear, low-friction entry and exit experience at the kiosk.
- Supervisors: need to know who is present, who is missing or late, what exceptions need action, whether kiosks are trustworthy, and whether the shift can be closed.
- Admins: need safe enrollment, worker management, kiosk registration, schedules, and access control.
- Operators or implementers: need straightforward Pi setup, health checks, deployment clarity, and conservative failure modes.

## Current Product Shape

The current repo already defines the product as a hardware-backed operations system:

- Pi kiosk scanner: local face matching, liveness, local logging, offline operation, and periodic sync.
- Face encoding service: turns enrollment photos into usable recognition vectors.
- Web command center: live dashboard, workers, enrollment, activity log, reports, schedules, kiosks, accounts, and onboarding.
- Recognition quality loop: recognition attempts, confidence bands, review backlog, and calibration lab.
- Supervisor workflows: shift briefing, shift exceptions, attendance corrections, and shift closeout.
- Operational health: system health, kiosk readiness, sync freshness, and deployment-pending fallbacks where appropriate.
- Verification contracts: focused scripts for auth, worker UI, enrollment permissions, kiosk readiness, recognition attempts, shift exceptions, shift briefing, shift closeout, and attendance corrections.

This is the foundation to preserve.

## Product Principles

1. The door is the source of truth.
   Kiosk scans, liveness, face quality, timestamps, kiosk identity, and sync state matter more than dashboard decoration. Manual changes are corrections to the record, not silent replacements for it.

2. Offline operation is a product requirement.
   Factory access cannot depend on perfect WiFi. Kiosks should continue scanning, logging, and later syncing. Changes that make the kiosk fragile, cloud-only, or hard to recover are against the product.

3. Supervisors need action, not noise.
   Pages should reduce the shift into clear next actions: who is missing, what kiosk is stale, what recognition attempts need review, what exception is open, and whether closeout is blocked.

4. Every correction needs an audit trail.
   Attendance corrections should capture who, what, when, why, and which source event or exception they relate to. Do not add shortcuts that erase history.

5. Recognition quality is operational quality.
   False accepts, false rejects, low margins, stale encodings, bad photos, missing liveness, and kiosk-specific issues should be visible and reviewable.

6. Health signals should be read-only unless the user is intentionally operating the system.
   Monitor and diagnostic flows must avoid mutating the very signal they measure. For example, do not call sync endpoints just to make a health check look fresh.

7. Build small, connected workflow slices.
   A good feature usually touches the data model, API route, page, navigation, fallback behavior, and contract test together. Avoid broad UI-only additions that do not improve the operational loop.

## What To Build Toward

The next durable product direction is a complete shift-trust loop:

1. Workers are enrolled with reliable face data.
2. Kiosks scan entry and exit events through the day.
3. The dashboard shows live attendance, kiosk confidence, and recent operational risk.
4. Shift Briefing tells supervisors how coverage looks.
5. Shift Exceptions turns suspicious or incomplete records into a queue.
6. Recognition Lab helps tune and review face-recognition quality.
7. Attendance Corrections allow explicit, audited fixes.
8. Shift Closeout records that the day was reviewed, blockers were handled or acknowledged, and the shift record can be trusted.

Features that deepen this loop are on-strategy.

## Anti-Goals

Do not drift FW Gatekeeper into:

- A generic HR, payroll, or employee engagement platform.
- A passive analytics dashboard with charts but no operational action.
- A generic camera surveillance product.
- A broad security suite unrelated to factory attendance and access evidence.
- A manual spreadsheet replacement where supervisors type the truth instead of reviewing kiosk evidence.
- A fragile demo that works only when every cloud service and network connection is perfect.
- A feature pile where briefing, exceptions, recognition review, corrections, and closeout do not connect.

## Agent Rules

When an agent changes this product:

- Start by reading this file, `README.md`, `package.json`, the relevant app route, the relevant Convex module, and the matching contract script.
- Preserve unrelated dirty worktree changes.
- Prefer the smallest shippable improvement that reinforces the physical attendance truth loop.
- Keep kiosk behavior, offline sync, and health checks conservative.
- Add or update a contract script when a workflow contract changes.
- Run focused verification first, then `npm run build` when the change can affect Next.js page-data collection.
- Be precise about what is code-complete, what was verified locally, what was deployed, and what remains blocked by credentials or external services.

## Definition Of Done

A product change is done when:

- It makes factory attendance or shift trust clearer, safer, or easier to operate.
- The source of truth remains physical kiosk evidence or an explicit audited correction.
- The supervisor can see the next action without interpreting raw data.
- Failure states are honest and recoverable.
- The relevant contract or build checks pass, or any blocker is named clearly.

Keep the product narrow enough to be sharp: FW Gatekeeper should be the place Fading West trusts to know who came through the door, whether the record is reliable, and what needs supervisor attention before the shift is closed.
