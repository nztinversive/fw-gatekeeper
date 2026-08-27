#!/usr/bin/env python3
"""
FW Gatekeeper - Pi Kiosk Main Entry Point
Camera feed on main thread. Face detection on background thread.
Uses dlib for face DETECTION, MobileFaceNet ONNX for face ENCODING (512-dim).
"""

import argparse
import logging
import os
import time
import threading
import urllib.request
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path

import cv2
import numpy as np
import face_recognition as fr

import config
import database
from recognition import FaceRecognizer
from sync import SyncWorker
from sync_auth import require_kiosk_api_key
from kiosk_ui_auth import require_kiosk_ui_key
import app as web_app

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")

# --- MobileFaceNet ONNX for 512-dim encoding (matches server) ---
REC_MODEL_URL = "https://huggingface.co/immich-app/buffalo_s/resolve/main/recognition/model.onnx"
REC_MODEL_PATH = Path("data/models/mobilefacenet.onnx")
_rec_session = None
_rec_session_error = None


def ensure_rec_model():
    REC_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not REC_MODEL_PATH.exists():
        try:
            logger.info("Downloading MobileFaceNet model (13MB)...")
            urllib.request.urlretrieve(REC_MODEL_URL, str(REC_MODEL_PATH))
            logger.info("Downloaded MobileFaceNet to %s", REC_MODEL_PATH)
        except Exception as exc:
            logger.error("Failed to download MobileFaceNet model: %s", exc)
            return False
    return True


def get_rec_session():
    global _rec_session, _rec_session_error
    if _rec_session is None:
        import onnxruntime as ort
        if not ensure_rec_model():
            _rec_session_error = "download_failed"
            raise RuntimeError("Recognition model unavailable")
        try:
            _rec_session = ort.InferenceSession(str(REC_MODEL_PATH), providers=["CPUExecutionProvider"])
            logger.info("MobileFaceNet ONNX session loaded")
            _rec_session_error = None
        except Exception as exc:
            _rec_session_error = str(exc)
            raise RuntimeError(f"Recognition model failed to initialize: {exc}") from exc
    return _rec_session


def get_512_embedding(face_crop_bgr):
    """Get 512-dim MobileFaceNet embedding from a BGR face crop."""
    session = get_rec_session()
    face = cv2.resize(face_crop_bgr, (112, 112))
    face_rgb = cv2.cvtColor(face, cv2.COLOR_BGR2RGB)
    face_float = face_rgb.astype(np.float32) / 255.0
    face_float = (face_float - 0.5) / 0.5
    face_chw = np.transpose(face_float, (2, 0, 1))
    batch = np.expand_dims(face_chw, axis=0)
    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: batch})
    emb = outputs[0][0]
    norm = np.linalg.norm(emb)
    if norm > 0:
        emb = emb / norm
    return emb


class Camera:
    def __init__(self, mode="auto"):
        self._cam = None
        self._mode = mode
        self._is_rgb = False  # True if camera returns RGB (picamera2)

    def start(self):
        if self._mode in ("pi", "auto"):
            try:
                from picamera2 import Picamera2
                self._cam = Picamera2()
                cam_config = self._cam.create_video_configuration(
                    main={"size": (config.CAMERA_WIDTH, config.CAMERA_HEIGHT), "format": "RGB888"}
                )
                self._cam.configure(cam_config)
                self._cam.start()
                time.sleep(1)
                self._mode = "pi"
                self._is_rgb = True
                logger.info("Pi Camera initialized (RGB mode)")
                return
            except Exception as e:
                if self._mode == "pi":
                    raise RuntimeError(f"Pi Camera failed: {e}")
                logger.info(f"Pi Camera not available ({e}), trying USB...")

        self._cam = cv2.VideoCapture(config.CAMERA_INDEX)
        self._cam.set(cv2.CAP_PROP_FRAME_WIDTH, config.CAMERA_WIDTH)
        self._cam.set(cv2.CAP_PROP_FRAME_HEIGHT, config.CAMERA_HEIGHT)
        if not self._cam.isOpened():
            raise RuntimeError("No camera available")
        self._mode = "usb"
        self._is_rgb = False
        logger.info("USB Camera initialized (BGR mode)")

    def capture(self):
        """Returns (bgr_frame, rgb_frame)"""
        if self._mode == "pi":
            rgb = self._cam.capture_array()
            bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
            return bgr, rgb
        else:
            ret, bgr = self._cam.read()
            if not ret:
                raise RuntimeError("Failed to capture frame")
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            return bgr, rgb

    def stop(self):
        if self._cam is None:
            return
        if self._mode == "pi":
            self._cam.stop()
        else:
            self._cam.release()


GOLD = (11, 134, 184)
GREEN = (0, 200, 0)
RED = (0, 0, 220)


def _now_iso():
    return datetime.now().isoformat(timespec="seconds")


def draw_box(frame_bgr, face_loc, color, label=None):
    out = frame_bgr.copy()
    if face_loc is None:
        return out
    top, right, bottom, left = face_loc
    cv2.rectangle(out, (left, top), (right, bottom), color, 2)
    if label:
        cv2.putText(out, label, (left, max(20, top - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
    return out


def format_worker_display_id(worker, local_worker_id=None):
    """Prefer the portal employee ID; fall back to the kiosk local id if absent."""
    if worker:
        employee_id = str(worker.get("employee_id") or "").strip()
        if employee_id:
            return employee_id
    if local_worker_id is not None:
        return str(local_worker_id)
    return ""


def cosine_sim(a, b):
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def normalize_embedding(embedding):
    norm = np.linalg.norm(embedding)
    if norm > 0:
        return embedding / norm
    return embedding


def largest_face(face_locations):
    return max(face_locations, key=lambda loc: (loc[2] - loc[0]) * (loc[1] - loc[3]))


def _empty_recognition_result(face_loc, decision="rejected_unknown"):
    return {
        "face_loc": face_loc,
        "name": None,
        "confidence": 0.0,
        "candidate_worker_id": None,
        "candidate_worker_name": None,
        "best_score": None,
        "second_best_score": None,
        "score_margin": None,
        "decision": decision,
        "threshold": config.RECOGNITION_MATCH_THRESHOLD,
        "liveness_confirmed": False,
        "model_version": config.RECOGNITION_MODEL_VERSION,
    }


def _log_recognition_attempt(result, decision):
    try:
        _write_recognition_attempt(result, decision)
    except Exception as e:
        # Telemetry writes must never take the scan loop down.
        logger.error("Failed to log recognition attempt (%s): %s", decision, e)


def _write_recognition_attempt(result, decision):
    database.log_recognition_attempt(
        timestamp=_now_iso(),
        kiosk_id=config.KIOSK_ID,
        face_detected=bool(result and result.get("face_loc") is not None),
        candidate_worker_id=result.get("candidate_worker_id") if result else None,
        candidate_worker_name=result.get("candidate_worker_name") if result else None,
        best_score=result.get("best_score") if result else None,
        second_best_score=result.get("second_best_score") if result else None,
        score_margin=result.get("score_margin") if result else None,
        decision=decision,
        threshold=result.get("threshold") if result else config.RECOGNITION_MATCH_THRESHOLD,
        liveness_confirmed=bool(result and result.get("liveness_confirmed")),
        model_version=result.get("model_version") if result else config.RECOGNITION_MODEL_VERSION,
    )


def run(args):
    if args.server:
        config.SERVER_URL = args.server
    if args.kiosk_id:
        config.KIOSK_ID = args.kiosk_id

    sync_enabled = True
    try:
        require_kiosk_api_key()
    except RuntimeError as exc:
        sync_enabled = False
        logger.critical(
            "%s Server synchronization is disabled; local attendance and recognition records will remain queued.",
            exc,
        )

    try:
        require_kiosk_ui_key()
    except RuntimeError as exc:
        logger.critical(
            "%s Protected kiosk web routes will remain unavailable; face scanning and local logging will continue.",
            exc,
        )

    os.makedirs(config.DATA_DIR, exist_ok=True)
    os.makedirs(config.FACES_DIR, exist_ok=True)
    os.makedirs(config.MODEL_DIR, exist_ok=True)
    database.init_db()

    # Pre-download MobileFaceNet model, but continue booting if offline.
    model_ready = ensure_rec_model()
    if not model_ready:
        logger.warning("Recognition model unavailable at startup; kiosk will keep retrying in the background.")

    logger.info("Starting web UI on port %d...", config.KIOSK_PORT)
    web_app.start_server()

    recognizer = FaceRecognizer()
    recognizer.load_faces()
    logger.info("Loaded %d known faces", recognizer.known_count)

    # Blink verification. If the shape predictor is missing, keep the door
    # working but record events as unverified and report the kiosk degraded —
    # never claim liveness we don't have.
    liveness = recognizer.liveness_checker if config.LIVENESS_REQUIRED else None
    if config.LIVENESS_REQUIRED and liveness is None:
        logger.critical(
            "Liveness model missing: clock events will be recorded WITHOUT blink "
            "verification and this kiosk will report itself degraded."
        )

    web_app.update_health(
        model_ok=model_ready,
        liveness_available=liveness is not None,
        known_workers=recognizer.known_count,
        degraded_reason="liveness_unavailable" if config.LIVENESS_REQUIRED and liveness is None else None,
    )

    def kiosk_health():
        snapshot = web_app.get_health_snapshot()
        snapshot["known_workers"] = recognizer.known_count
        return snapshot

    def base_degraded_reason():
        """The standing degradation, if any, once transient faults clear."""
        if config.LIVENESS_REQUIRED and liveness is None:
            return "liveness_unavailable"
        return None

    sync_worker = (
        SyncWorker(
            recognizer=recognizer,
            health_provider=kiosk_health,
            health_reporter=web_app.update_health,
        )
        if sync_enabled
        else None
    )
    if sync_worker:
        sync_worker.start()

    camera = Camera(mode=args.camera)
    camera_attempts = 0
    critical_logged = False
    while True:
        try:
            camera.start()
            web_app.update_health(camera_ok=True, degraded_reason=base_degraded_reason())
            if camera_attempts:
                logger.info("Camera initialized after %d retry attempt(s)", camera_attempts)
            break
        except RuntimeError as e:
            camera.stop()
            camera_attempts += 1
            logger.error("Camera error during startup (attempt %d): %s", camera_attempts, e)
            if camera_attempts >= 10 and not critical_logged:
                logger.critical("Camera failed to initialize after %d attempts; continuing to retry every 30 seconds", camera_attempts)
                critical_logged = True
            web_app.update_health(camera_ok=False, degraded_reason="camera_error")
            web_app.update_status(state="ERROR", message=f"Camera error: {e}. Retrying in 30s", worker_id=None, face_detected=False)
            time.sleep(30)

    # Shared state
    detect_lock = threading.Lock()
    pending_frame = [None]  # (bgr, rgb) tuple
    current_result = [None]
    detect_count = [0]

    last_clocks = {}
    display_until = [0.0]
    box_loc = None
    box_color = GOLD
    box_label = None
    unknown_streak = 0

    def detection_loop():
        logger.info("Detection thread started")
        embedding_history = deque(maxlen=config.RECOGNITION_EMBEDDING_WINDOW)
        while True:
            with detect_lock:
                frames = pending_frame[0]
                pending_frame[0] = None

            if frames is None:
                time.sleep(0.1)
                continue

            bgr_frame, rgb_frame = frames

            try:
                # Use dlib for face DETECTION (finding where the face is)
                small_rgb = cv2.resize(rgb_frame, (0, 0), fx=0.5, fy=0.5)
                locs = fr.face_locations(small_rgb, model="hog")

                detect_count[0] += 1
                if detect_count[0] % 20 == 1:
                    logger.info("Detection #%d: found %d faces", detect_count[0], len(locs))

                if not locs:
                    embedding_history.clear()
                    current_result[0] = None
                    continue

                # Scale to full resolution
                top, right, bottom, left = largest_face(locs)
                face_loc = (top * 2, right * 2, bottom * 2, left * 2)

                # Crop face from BGR frame for MobileFaceNet encoding
                ft, fr_, fb, fl = face_loc
                h, w = bgr_frame.shape[:2]
                pad = int(max(fb - ft, fr_ - fl) * 0.25)
                y1 = max(0, ft - pad)
                y2 = min(h, fb + pad)
                x1 = max(0, fl - pad)
                x2 = min(w, fr_ + pad)
                face_crop = bgr_frame[y1:y2, x1:x2]

                if face_crop.size == 0:
                    embedding_history.clear()
                    current_result[0] = _empty_recognition_result(face_loc, decision="rejected_no_embedding")
                    continue

                # Get 512-dim MobileFaceNet embedding (matches server encoding)
                try:
                    embedding = get_512_embedding(face_crop)
                except Exception as e:
                    logger.error("ONNX encoding error: %s", e)
                    embedding_history.clear()
                    current_result[0] = _empty_recognition_result(face_loc, decision="rejected_model_error")
                    continue

                embedding_history.append(embedding)
                smoothed_embedding = normalize_embedding(np.mean(np.stack(embedding_history), axis=0))

                # Match against known workers
                known_encs, known_ids, known_names = recognizer._snapshot_known_faces()
                matched = None
                conf = 0.0
                best_idx = None
                second_score = None

                if known_encs:
                    enc_dim = len(known_encs[0])
                    cand_dim = len(smoothed_embedding)

                    if enc_dim != cand_dim:
                        # Server-side encodings don't match this kiosk's model:
                        # every worker would be silently rejected. Surface it as
                        # a kiosk fault, not a failed recognition.
                        logger.warning("Dim mismatch: known=%d vs live=%d", enc_dim, cand_dim)
                        embedding_history.clear()
                        current_result[0] = _empty_recognition_result(face_loc, decision="rejected_dim_mismatch")
                        continue

                    if enc_dim == cand_dim:
                        # Both 512-dim - cosine similarity
                        scores = []
                        for i, known in enumerate(known_encs):
                            sim = cosine_sim(np.array(known), smoothed_embedding)
                            scores.append((sim, i))
                        scores.sort(reverse=True, key=lambda item: item[0])
                        best_sim, best_idx = scores[0]
                        if len(scores) > 1:
                            second_score = scores[1][0]
                        conf = best_sim
                        logger.info("Match: sim=%.3f name=%s window=%d", conf, known_names[best_idx], len(embedding_history))
                        if conf >= config.RECOGNITION_MATCH_THRESHOLD:
                            matched = known_names[best_idx]

                margin = conf - second_score if second_score is not None else None
                candidate_worker_id = known_ids[best_idx] if best_idx is not None else None
                candidate_worker_name = known_names[best_idx] if best_idx is not None else None
                decision = "accepted" if matched else "rejected_unknown"
                if (
                    matched is None
                    and best_idx is not None
                    and conf >= config.RECOGNITION_MATCH_THRESHOLD - config.RECOGNITION_NEAR_MISS_MARGIN
                ):
                    decision = "near_miss"

                current_result[0] = {
                    "face_loc": face_loc,
                    "name": matched,
                    "confidence": conf,
                    "candidate_worker_id": candidate_worker_id,
                    "candidate_worker_name": candidate_worker_name,
                    "best_score": conf if best_idx is not None else None,
                    "second_best_score": second_score,
                    "score_margin": margin,
                    "decision": decision,
                    "threshold": config.RECOGNITION_MATCH_THRESHOLD,
                    "liveness_confirmed": False,
                    "model_version": config.RECOGNITION_MODEL_VERSION,
                }

            except Exception as e:
                logger.error("Detection error: %s", e, exc_info=True)
                current_result[0] = None

    det_thread = threading.Thread(target=detection_loop, daemon=True, name="face-detect")
    det_thread.start()

    web_app.update_status(state="IDLE", message="Step toward camera",
                          worker_id=None, known_workers=recognizer.known_count, face_detected=False)
    logger.info("Kiosk ready")

    # Liveness wait state: set when a matched worker still needs to blink.
    pending_clock = [None]

    def record_clock(result, worker_id, display_name, display_id, confidence, liveness_confirmed):
        """Log the clock event + telemetry, update the display. Returns True on success."""
        if config.KIOSK_TYPE == "entry":
            action = "clock_in"
        elif config.KIOSK_TYPE == "exit":
            action = "clock_out"
        else:
            last_action = database.get_last_action(worker_id)
            action = "clock_out" if last_action == "clock_in" else "clock_in"

        result["liveness_confirmed"] = liveness_confirmed
        try:
            database.log_attendance(
                worker_id=worker_id, worker_name=display_name,
                action=action, liveness_confirmed=liveness_confirmed, confidence=confidence,
            )
            _log_recognition_attempt(result, "accepted")
        except Exception as e:
            # A busy/locked SQLite must never take the kiosk down.
            logger.error("Failed to record attendance for %s: %s", display_name, e, exc_info=True)
            web_app.update_status(state="ERROR", message="Could not record scan - please try again",
                                  worker_name=display_name, worker_id=display_id, face_detected=True,
                                  confidence=confidence, known_workers=recognizer.known_count)
            return False

        last_clocks[worker_id] = datetime.now()
        web_app.update_health(last_scan_at=_now_iso(), degraded_reason=base_degraded_reason())

        time_str = datetime.now().strftime("%I:%M %p")
        pct = int(confidence * 100)
        id_text = f" ID: {display_id}" if display_id else ""
        msg = (
            f"Welcome, {display_name}!{id_text} ({pct}%) - {time_str}"
            if action == "clock_in"
            else f"Goodbye, {display_name}!{id_text} ({pct}%) - {time_str}"
        )
        web_app.update_status(state="CLOCKED_IN", message=msg,
                              worker_name=display_name, worker_id=display_id, action=action,
                              confidence=confidence, face_detected=True,
                              liveness_confirmed=liveness_confirmed,
                              known_workers=recognizer.known_count)
        logger.info("%s: %s id=%s (confidence: %.2f, liveness=%s)",
                    action.replace("_", " ").title(), display_name, display_id or "n/a",
                    confidence, liveness_confirmed)
        return True

    camera_healthy = True
    try:
        while True:
            try:
                bgr_frame, rgb_frame = camera.capture()
            except Exception as e:
                logger.error("Capture error: %s", e)
                if camera_healthy:
                    camera_healthy = False
                    web_app.update_health(camera_ok=False, degraded_reason="camera_error")
                time.sleep(1)
                continue

            if not camera_healthy:
                camera_healthy = True
                web_app.update_health(camera_ok=True, degraded_reason=base_degraded_reason())

            now = time.time()

            # 1. Push BGR frame to MJPEG stream (always, never blocks)
            web_app.set_frame(draw_box(bgr_frame, box_loc, box_color, box_label))

            # 2. Feed to detection thread
            with detect_lock:
                if pending_frame[0] is None:
                    pending_frame[0] = (bgr_frame.copy(), rgb_frame.copy())

            # 3. Skip during display hold; drop results that land mid-hold so a
            #    lingering face can't re-trigger off stale data every cycle.
            if now < display_until[0]:
                current_result[0] = None
                time.sleep(0.05)
                continue

            # 4. Blink verification window for an already-matched worker
            pending = pending_clock[0]
            if pending is not None:
                fresh = current_result[0]
                if fresh is not None:
                    current_result[0] = None
                    if fresh.get("face_loc") is not None:
                        box_loc = fresh.get("face_loc")

                confirmed = liveness.update(bgr_frame, box_loc) if box_loc is not None else False
                if confirmed:
                    pending_clock[0] = None
                    recorded = record_clock(
                        pending["result"], pending["worker_id"], pending["display_name"],
                        pending["display_id"], pending["confidence"], liveness_confirmed=True,
                    )
                    liveness.reset()
                    display_until[0] = now + (config.DISPLAY_TIME_SEC if recorded else 2)
                elif now > pending["deadline"]:
                    pending_clock[0] = None
                    _log_recognition_attempt(pending["result"], "rejected_liveness_timeout")
                    web_app.update_status(state="NOT_RECOGNIZED",
                                          message="Blink not detected - please try again",
                                          worker_name=pending["display_name"], worker_id=pending["display_id"],
                                          face_detected=True, confidence=pending["confidence"],
                                          ear=liveness.get_ear(), known_workers=recognizer.known_count)
                    liveness.reset()
                    display_until[0] = now + 2
                else:
                    web_app.update_status(state="WAITING_FOR_BLINK",
                                          message=f"Blink to verify, {pending['display_name']}",
                                          worker_name=pending["display_name"], worker_id=pending["display_id"],
                                          face_detected=True, confidence=pending["confidence"],
                                          ear=liveness.get_ear(), known_workers=recognizer.known_count)
                    time.sleep(0.03)
                continue

            # 5. Consume the detection result exactly once (a result must never
            #    be reprocessed across loop ticks).
            result = current_result[0]
            if result is not None:
                current_result[0] = None

            if result is None:
                if box_loc is not None:
                    unknown_streak = 0
                    box_loc = None
                    box_label = None
                    web_app.update_status(state="IDLE", message="Step toward camera",
                                          worker_id=None, face_detected=False, known_workers=recognizer.known_count)
                time.sleep(0.05)
                continue

            face_loc = result.get("face_loc")
            name = result.get("name")
            confidence = result.get("confidence") or 0.0
            decision = result.get("decision")
            box_loc = face_loc

            # 6. Kiosk faults are not the worker's fault: say the scanner is
            #    down instead of blaming their face.
            degraded_fault = None
            if decision == "rejected_model_error":
                degraded_fault = "model_error"
                web_app.update_health(model_ok=False, degraded_reason=degraded_fault)
            elif decision == "rejected_dim_mismatch":
                degraded_fault = "encoding_mismatch"
                web_app.update_health(degraded_reason=degraded_fault)
            elif recognizer.known_count == 0:
                degraded_fault = "no_workers_synced"
                web_app.update_health(degraded_reason=degraded_fault)

            if degraded_fault:
                box_color = RED
                box_label = None
                _log_recognition_attempt(result, decision or "rejected_unknown")
                web_app.update_status(state="SERVICE_DEGRADED",
                                      message="Scanner unavailable - please use the sign-in sheet",
                                      worker_id=None, face_detected=True,
                                      known_workers=recognizer.known_count)
                display_until[0] = now + config.DISPLAY_TIME_SEC
                continue

            if name is None:
                # unknown_streak counts consumed detection results, so this is
                # N real recognition attempts, not N camera frames.
                unknown_streak += 1
                box_color = GOLD if unknown_streak < config.RECOGNITION_UNKNOWN_STREAK else RED
                box_label = None
                if unknown_streak < config.RECOGNITION_UNKNOWN_STREAK:
                    web_app.update_status(state="IDLE", message="Hold steady...",
                                          worker_id=None, face_detected=True, confidence=confidence,
                                          known_workers=recognizer.known_count)
                else:
                    unknown_streak = 0
                    _log_recognition_attempt(result, decision or "rejected_unknown")
                    web_app.update_status(state="NOT_RECOGNIZED", message="Face not recognized",
                                          worker_id=None, face_detected=True, confidence=confidence,
                                          known_workers=recognizer.known_count)
                    display_until[0] = now + config.DISPLAY_TIME_SEC
                continue

            unknown_streak = 0
            box_color = GREEN

            _, known_ids, known_names = recognizer._snapshot_known_faces()
            worker_id = None
            if name in known_names:
                idx = known_names.index(name)
                worker_id = known_ids[idx]

            if worker_id is None:
                continue

            worker = database.get_worker_by_id(worker_id)
            display_id = format_worker_display_id(worker, worker_id)
            display_name = worker["name"] if worker else name
            id_suffix = f" | ID: {display_id}" if display_id else ""
            box_label = f"{display_name}{id_suffix}"

            last = last_clocks.get(worker_id)
            if last and datetime.now() - last < timedelta(minutes=config.CLOCK_DEBOUNCE_MINUTES):
                pct = int(confidence * 100)
                already_msg = (
                    f"Already clocked in, {display_name}! ID: {display_id} ({pct}%)"
                    if display_id
                    else f"Already clocked in, {display_name}! ({pct}%)"
                )
                web_app.update_status(state="ALREADY_CLOCKED",
                                      message=already_msg,
                                      worker_name=display_name, worker_id=display_id, face_detected=True,
                                      confidence=confidence,
                                      known_workers=recognizer.known_count)
                _log_recognition_attempt(result, "accepted_already_clocked")
                display_until[0] = now + config.DISPLAY_TIME_SEC
                continue

            if liveness is not None:
                # Matched - now require a blink before the event is recorded.
                liveness.reset()
                pending_clock[0] = {
                    "result": result,
                    "worker_id": worker_id,
                    "display_name": display_name,
                    "display_id": display_id,
                    "confidence": confidence,
                    "deadline": now + config.LIVENESS_WAIT_SEC,
                }
                web_app.update_status(state="WAITING_FOR_BLINK",
                                      message=f"Blink to verify, {display_name}",
                                      worker_name=display_name, worker_id=display_id,
                                      face_detected=True, confidence=confidence,
                                      ear=liveness.get_ear(), known_workers=recognizer.known_count)
                continue

            recorded = record_clock(result, worker_id, display_name, display_id, confidence,
                                    liveness_confirmed=False)
            display_until[0] = now + (config.DISPLAY_TIME_SEC if recorded else 2)

    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        camera.stop()
        if sync_worker:
            sync_worker.stop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FW Gatekeeper Pi Kiosk")
    parser.add_argument("--server", default=None)
    parser.add_argument("--kiosk-id", default=None)
    parser.add_argument("--camera", choices=["auto", "pi", "usb"], default="auto")
    run(parser.parse_args())
