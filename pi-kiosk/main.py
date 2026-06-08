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


def run(args):
    if args.server:
        config.SERVER_URL = args.server
    if args.kiosk_id:
        config.KIOSK_ID = args.kiosk_id

    os.makedirs(config.DATA_DIR, exist_ok=True)
    os.makedirs(config.FACES_DIR, exist_ok=True)
    os.makedirs(config.MODEL_DIR, exist_ok=True)
    database.init_db()

    # Pre-download MobileFaceNet model, but continue booting if offline.
    if not ensure_rec_model():
        logger.warning("Recognition model unavailable at startup; kiosk will keep retrying in the background.")

    logger.info("Starting web UI on port %d...", config.KIOSK_PORT)
    web_app.start_server()

    recognizer = FaceRecognizer()
    recognizer.load_faces()
    logger.info("Loaded %d known faces", recognizer.known_count)

    sync_worker = SyncWorker(recognizer=recognizer)
    sync_worker.start()

    camera = Camera(mode=args.camera)
    camera_attempts = 0
    critical_logged = False
    while True:
        try:
            camera.start()
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
                    current_result[0] = (face_loc, None, 0.0)
                    continue

                # Get 512-dim MobileFaceNet embedding (matches server encoding)
                try:
                    embedding = get_512_embedding(face_crop)
                except Exception as e:
                    logger.error("ONNX encoding error: %s", e)
                    embedding_history.clear()
                    current_result[0] = (face_loc, None, 0.0)
                    continue

                embedding_history.append(embedding)
                smoothed_embedding = normalize_embedding(np.mean(np.stack(embedding_history), axis=0))

                # Match against known workers
                known_encs, known_ids, known_names = recognizer._snapshot_known_faces()
                matched = None
                conf = 0.0

                if known_encs:
                    enc_dim = len(known_encs[0])
                    cand_dim = len(smoothed_embedding)

                    if enc_dim == cand_dim:
                        # Both 512-dim - cosine similarity
                        best_sim = -1
                        best_idx = 0
                        for i, known in enumerate(known_encs):
                            sim = cosine_sim(np.array(known), smoothed_embedding)
                            if sim > best_sim:
                                best_sim = sim
                                best_idx = i
                        conf = best_sim
                        logger.info("Match: sim=%.3f name=%s window=%d", conf, known_names[best_idx], len(embedding_history))
                        if conf >= 0.30:  # TODO: raise to 0.45 after re-enrollment with Pi camera
                            matched = known_names[best_idx]
                    else:
                        logger.warning("Dim mismatch: known=%d vs live=%d", enc_dim, cand_dim)

                current_result[0] = (face_loc, matched, conf)

            except Exception as e:
                logger.error("Detection error: %s", e, exc_info=True)
                current_result[0] = None

    det_thread = threading.Thread(target=detection_loop, daemon=True, name="face-detect")
    det_thread.start()

    web_app.update_status(state="IDLE", message="Step toward camera",
                          worker_id=None, known_workers=recognizer.known_count, face_detected=False)
    logger.info("Kiosk ready")

    try:
        while True:
            try:
                bgr_frame, rgb_frame = camera.capture()
            except Exception as e:
                logger.error("Capture error: %s", e)
                time.sleep(1)
                continue

            now = time.time()

            # 1. Push BGR frame to MJPEG stream (always, never blocks)
            web_app.set_frame(draw_box(bgr_frame, box_loc, box_color, box_label))

            # 2. Feed to detection thread
            with detect_lock:
                if pending_frame[0] is None:
                    pending_frame[0] = (bgr_frame.copy(), rgb_frame.copy())

            # 3. Skip during display hold
            if now < display_until[0]:
                time.sleep(0.05)
                continue

            # 4. Process detection result
            result = current_result[0]

            if result is None:
                unknown_streak = 0
                if box_loc is not None:
                    box_loc = None
                    box_label = None
                    web_app.update_status(state="IDLE", message="Step toward camera",
                                          worker_id=None, face_detected=False, known_workers=recognizer.known_count)
                time.sleep(0.05)
                continue

            face_loc, name, confidence = result
            box_loc = face_loc

            if name is None:
                unknown_streak += 1
                box_color = GOLD if unknown_streak < config.RECOGNITION_UNKNOWN_STREAK else RED
                box_label = None
                if unknown_streak < config.RECOGNITION_UNKNOWN_STREAK:
                    web_app.update_status(state="IDLE", message="Hold steady...",
                                          worker_id=None, face_detected=True, confidence=confidence,
                                          known_workers=recognizer.known_count)
                else:
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
                display_until[0] = now + config.DISPLAY_TIME_SEC
                continue

            if config.KIOSK_TYPE == "entry":
                action = "clock_in"
            elif config.KIOSK_TYPE == "exit":
                action = "clock_out"
            else:
                last_action = database.get_last_action(worker_id)
                action = "clock_out" if last_action == "clock_in" else "clock_in"

            database.log_attendance(
                worker_id=worker_id, worker_name=display_name,
                action=action, liveness_confirmed=False, confidence=confidence,
            )
            last_clocks[worker_id] = datetime.now()

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
                                  known_workers=recognizer.known_count)
            logger.info("%s: %s id=%s (confidence: %.2f)", action.replace("_", " ").title(), display_name, display_id or "n/a", confidence)
            display_until[0] = now + config.DISPLAY_TIME_SEC

    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        camera.stop()
        sync_worker.stop()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FW Gatekeeper Pi Kiosk")
    parser.add_argument("--server", default=None)
    parser.add_argument("--kiosk-id", default=None)
    parser.add_argument("--camera", choices=["auto", "pi", "usb"], default="auto")
    run(parser.parse_args())
