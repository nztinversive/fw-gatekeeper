"""Flask web UI for the FW Gatekeeper Pi kiosk."""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime
from typing import Optional

import cv2
from flask import Flask, Response, jsonify, render_template, request

import config
import database

logger = logging.getLogger(__name__)
app = Flask(__name__)

_frame_lock = threading.Lock()
_current_frame = None

_status_lock = threading.Lock()
_status = {
    "state": "IDLE",
    "message": "Step toward camera",
    "worker_name": None,
    "worker_id": None,
    "action": None,
    "confidence": 0.0,
    "liveness_confirmed": False,
    "ear": 0.0,
    "face_detected": False,
    "face_count": 0,
    "known_workers": 0,
    "timestamp": None,
}

_server_thread = None


def set_frame(frame):
    """Set the latest frame used by MJPEG feed."""
    global _current_frame
    with _frame_lock:
        _current_frame = frame.copy() if frame is not None else None


def update_status(**kwargs):
    """Update shared status fields."""
    with _status_lock:
        _status.update(kwargs)
        _status["timestamp"] = datetime.now().isoformat(timespec="seconds")


def get_status_snapshot() -> dict:
    """Get current status plus metadata used by the frontend."""
    with _status_lock:
        data = dict(_status)

    workers = database.list_workers()
    data["kiosk_id"] = config.KIOSK_ID
    data["kiosk_name"] = config.KIOSK_NAME
    data["kiosk_type"] = config.KIOSK_TYPE
    data["server_time"] = datetime.now().isoformat(timespec="seconds")
    data["admin"] = {
        "worker_count": len(workers),
        "total_photos": sum(worker["photo_count"] for worker in workers),
        "workers": workers,
    }
    return data


def _mjpeg_stream():
    while True:
        with _frame_lock:
            frame = _current_frame
        if frame is not None:
            ok, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            if ok:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n"
                )
        time.sleep(0.05)


def _manual_action_for_worker(worker_id: int) -> str:
    if config.KIOSK_TYPE == "entry":
        return "clock_in"
    if config.KIOSK_TYPE == "exit":
        return "clock_out"
    last = database.get_last_action(worker_id)
    return "clock_out" if last == "clock_in" else "clock_in"


@app.route("/")
def index():
    return render_template("index.html", kiosk_name=config.KIOSK_NAME, kiosk_type=config.KIOSK_TYPE)


@app.route("/feed")
def feed():
    return Response(_mjpeg_stream(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/video_feed")
def video_feed_alias():
    return feed()


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/status")
def status():
    return jsonify(get_status_snapshot())


@app.route("/log")
def today_log():
    return jsonify(database.get_today_logs(limit=100))


@app.route("/today")
def today_log_alias():
    return today_log()


@app.route("/manual-clock", methods=["POST"])
@app.route("/manual_clock", methods=["POST"])
def manual_clock():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    if not name:
        return jsonify({"success": False, "error": "Name is required"}), 400

    worker = database.get_worker_by_name(name)
    if worker is None:
        return jsonify({"success": False, "error": "Worker not found"}), 404

    action = payload.get("action")
    if action not in {"clock_in", "clock_out"}:
        action = _manual_action_for_worker(worker["id"])

    log_id = database.log_attendance(
        worker_id=worker["id"],
        worker_name=worker["name"],
        action=action,
        liveness_confirmed=False,
        confidence=1.0,
        note="manual_clock",
    )
    action_label = "Clocked in" if action == "clock_in" else "Clocked out"
    update_status(
        state="CLOCKED_IN",
        message=f"{action_label}: {worker['name']} ID: {worker['employee_id'] or worker['id']}",
        worker_name=worker["name"],
        worker_id=worker["employee_id"] or str(worker["id"]),
        action=action,
        liveness_confirmed=False,
        confidence=1.0,
    )
    return jsonify({"success": True, "log_id": log_id, "worker_name": worker["name"], "action": action})


def start_server():
    """Run Flask app in a background daemon thread."""
    global _server_thread
    if _server_thread and _server_thread.is_alive():
        return _server_thread

    def _serve():
        app.run(
            host=config.FLASK_HOST,
            port=config.KIOSK_PORT,
            debug=False,
            use_reloader=False,
            threaded=True,
        )

    _server_thread = threading.Thread(target=_serve, daemon=True, name="kiosk-web")
    _server_thread.start()
    logger.info("Web UI started at http://%s:%d", config.FLASK_HOST, config.KIOSK_PORT)
    return _server_thread
