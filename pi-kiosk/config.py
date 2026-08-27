"""Configuration for FW Gatekeeper Pi kiosk."""

import os
from pathlib import Path

# Server (optional if running fully offline)
SERVER_URL = "https://fw-gatekeeper.onrender.com"
SYNC_INTERVAL = 30  # seconds

# Kiosk identity
KIOSK_ID = "kiosk-entry-1"
KIOSK_TYPE = "entry"  # entry | exit | auto
KIOSK_NAME = "Main Entry"
KIOSK_API_KEY = os.environ.get("KIOSK_API_KEY", "")

# Camera
CAMERA_INDEX = 0
CAMERA_WIDTH = 640
CAMERA_HEIGHT = 480

# Liveness / recognition
LIVENESS_EAR_THRESHOLD = 0.21
LIVENESS_BLINK_FRAMES = 2
LIVENESS_TIMEOUT_SEC = 5
RECOGNITION_TOLERANCE = 0.5
RECOGNITION_MATCH_THRESHOLD = 0.30  # Existing Pi MobileFaceNet accept threshold
RECOGNITION_NEAR_MISS_MARGIN = 0.08
RECOGNITION_EMBEDDING_WINDOW = 3
RECOGNITION_UNKNOWN_STREAK = 3
RECOGNITION_MODEL_VERSION = "mobilefacenet-buffalo_s-onnx"
RECOGNITION_ATTEMPTS_ENDPOINT = "/api/recognition-attempts/bulk"

# Gatekeeper behavior
CLOCK_DEBOUNCE_MINUTES = 60  # Don't re-scan same person for 1 hour
AUTO_CLOCKOUT_HOURS = 12
DISPLAY_TIME_SEC = 5  # Show result for 5 seconds before scanning again

# Web server
FLASK_HOST = "0.0.0.0"
KIOSK_PORT = 5555
FLASK_PORT = KIOSK_PORT  # backward-compatible alias

# Storage
DATA_DIR = "data"
_DATA_PATH = Path(DATA_DIR)
DB_PATH = str(_DATA_PATH / "attendance.db")
FACES_DIR = str(_DATA_PATH / "faces")
MODEL_DIR = str(_DATA_PATH / "models")
SHAPE_PREDICTOR_PATH = str(Path(MODEL_DIR) / "shape_predictor_68_face_landmarks.dat")

# Backward-compatible alias used by legacy modules
PHOTO_DIR = FACES_DIR
