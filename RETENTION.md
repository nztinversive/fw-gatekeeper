# Biometric Data Retention Policy

FW Gatekeeper recognizes workers at the factory door using a facial template. This page states exactly what biometric data the system stores, where it lives, how consent is captured, how long it is kept, and how to delete it.

## What is stored

For each enrolled worker:

| Data | Description |
| --- | --- |
| Facial template | A 512-dimension floating-point vector (MobileFaceNet embedding) derived from the enrollment photos. This is the only thing the kiosk matches against. It cannot be turned back into a photo. |
| Enrollment photos | Up to 3 JPEG frames captured during enrollment (640x480). Used to (re)generate the template and to show a thumbnail on the kiosk. |
| Identity metadata | Name, employee ID, department, enrollment timestamp, consent timestamp. |

Attendance events (clock in/out, kiosk ID, timestamp, match confidence) reference the worker by ID but do not contain biometric data.

## Where it is stored

- **Convex database** (`workers` table): the template (`faceEncoding`), the identity metadata, `consentAt`, and references to the photos (`photoStorageIds`).
- **Convex file storage**: the JPEG enrollment photos.
- **Each kiosk's local SQLite database** (`pi-kiosk`): a cached copy of the template, name, and one photo so the door keeps working offline. Kiosks refresh this cache from the server on every sync cycle (about 30 seconds when online).

The web dashboard never downloads raw templates to the browser; portal API responses only expose readiness metadata (`has_face_encoding`, `encoding_status`).

## How consent is captured

Before photo capture can start, the enrolling operator must confirm a required checkbox stating that the worker has been told a facial template will be stored for attendance and has agreed. The enrollment API rejects requests without this acknowledgement (HTTP 400). The acknowledgement time is stored on the worker record as `consentAt` and is refreshed on every re-enrollment.

## How long it is kept

- Biometric data is kept only while the worker is **active** in the system.
- It is **purged on request or on termination** using the admin "Purge face data" action (below). There is no automatic time-based expiry; purge is an explicit, audited action.
- Kiosks drop their cached copy **within one sync cycle** after the worker is deactivated: the sync feed marks the worker inactive and each kiosk removes the local row.
- Attendance history (non-biometric) is retained for operational and payroll reconciliation and is not deleted by a purge.

## How to purge a worker's face data

1. Sign in with an **admin** account and open **Workers**.
2. Find the worker and click **Purge face data** (next to Deactivate).
3. Enter a reason (for example, "Terminated 2026-09-01" or "Worker requested deletion"). The reason is required.
4. Confirm. The system then, in one transaction:
   - deletes every enrollment photo from Convex file storage,
   - removes the template and photo references from the worker record,
   - marks the worker inactive and sets `biometricsPurgedAt`,
   - writes an `auditLog` row recording who purged, which worker, when, and why.
5. Wait one sync cycle (about 30 seconds per online kiosk). Offline kiosks purge on their next successful sync. Check the Kiosks page to confirm every kiosk has synced since the purge time.

Purging is irreversible. If the person later returns to work, enroll them again from scratch (new consent, new photos, new template).

Deactivating a worker without purging keeps the template and photos in Convex (the kiosks still drop it). Use Purge when the biometric data itself must be deleted.

## Who to contact

Questions or deletion requests: contact the Fading West system administrator responsible for FW Gatekeeper (the admin account owner listed on the Accounts page). Deletion requests from workers should be actioned through the purge steps above and the audit row retained as evidence.
