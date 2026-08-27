"""Known-worker roster and optional blink-liveness for the kiosk.

Matching itself lives in main.py (MobileFaceNet ONNX 512-dim embeddings,
cosine similarity). This module owns the thread-safe roster of known worker
encodings loaded from SQLite, plus the optional LivenessChecker used when
LIVENESS_REQUIRED is enabled.
"""

from __future__ import annotations

import logging
import threading
from typing import Optional

import cv2
import face_recognition
import numpy as np

import config
import database
from liveness import LivenessChecker

logger = logging.getLogger(__name__)


class FaceRecognizer:
    """Loads known workers and exposes a thread-safe snapshot for matching."""

    def __init__(self):
        self._lock = threading.Lock()
        self._encodings: list[np.ndarray] = []
        self._ids: list[int] = []
        self._names: list[str] = []

        self.liveness_checker = None

        # Only load the (large) landmark model when this kiosk actually
        # enforces blink verification; it is off by default.
        if getattr(config, "LIVENESS_REQUIRED", False):
            try:
                self.liveness_checker = LivenessChecker()
            except FileNotFoundError as exc:
                logger.error(str(exc))
                logger.error(
                    "Blink verification is unavailable; clock events will be recorded "
                    "without liveness and the kiosk will report itself degraded."
                )

    @property
    def known_count(self) -> int:
        return len(self._encodings)

    def load_faces(self):
        """Load all worker encodings from SQLite."""
        with self._lock:
            self._encodings, self._ids, self._names = database.get_worker_encodings()
        logger.info("Loaded %d known face encodings", len(self._encodings))

    def reload_faces(self):
        self.load_faces()

    def snapshot_known_faces(self):
        """Return a consistent (encodings, ids, names) copy for matching."""
        with self._lock:
            return list(self._encodings), list(self._ids), list(self._names)

    @staticmethod
    def encode_frame(frame: np.ndarray, face_location: Optional[tuple[int, int, int, int]] = None) -> Optional[np.ndarray]:
        """Generate face encoding from a BGR frame (used by the enrollment CLI)."""
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        if face_location is None:
            encodings = face_recognition.face_encodings(rgb)
        else:
            encodings = face_recognition.face_encodings(rgb, [face_location])
        if not encodings:
            return None
        return encodings[0]
