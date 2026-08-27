"""Face recognition engine with blink-based liveness gating.

Supports both legacy 128-dim dlib encodings and 512-dim ArcFace embeddings.
Matching uses cosine similarity (works for both, more accurate for ArcFace).
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


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def cosine_similarities(known: list[np.ndarray], candidate: np.ndarray) -> np.ndarray:
    """Compute cosine similarities between candidate and all known encodings."""
    if not known:
        return np.array([])
    known_mat = np.array(known)
    norms = np.linalg.norm(known_mat, axis=1, keepdims=True)
    norms[norms == 0] = 1
    known_normed = known_mat / norms

    cand_norm = np.linalg.norm(candidate)
    if cand_norm == 0:
        return np.zeros(len(known))
    cand_normed = candidate / cand_norm

    return known_normed @ cand_normed


def _supported_encodings(
    encodings: list[np.ndarray],
    ids: list[int],
    names: list[str],
    candidate_dim: int,
) -> tuple[list[np.ndarray], list[int], list[str]]:
    filtered: list[tuple[np.ndarray, int, str]] = []
    for encoding, worker_id, name in zip(encodings, ids, names):
        arr = np.asarray(encoding, dtype=np.float64).reshape(-1)
        if arr.size != candidate_dim:
            logger.warning("Skipping worker %s during match due to encoding dimension %d", name, arr.size)
            continue
        filtered.append((arr, worker_id, name))

    if not filtered:
        return [], [], []

    filtered_encodings, filtered_ids, filtered_names = zip(*filtered)
    return list(filtered_encodings), list(filtered_ids), list(filtered_names)


class FaceRecognizer:
    """Loads known workers and matches live faces against stored encodings."""

    def __init__(self):
        self._lock = threading.Lock()
        self._encodings: list[np.ndarray] = []
        self._ids: list[int] = []
        self._names: list[str] = []

        self.last_face_location: Optional[tuple[int, int, int, int]] = None
        self.last_face_detected: bool = False
        self._liveness_enabled = False
        self.liveness_checker = None

        # Only load the (large) landmark model when this kiosk actually
        # enforces blink verification; it is off by default.
        if getattr(config, "LIVENESS_REQUIRED", False):
            try:
                self.liveness_checker = LivenessChecker()
                self._liveness_enabled = True
            except FileNotFoundError as exc:
                logger.error(str(exc))
                logger.error(
                    "Blink verification is unavailable; clock events will be recorded "
                    "without liveness and the kiosk will report itself degraded."
                )

    @property
    def liveness_enabled(self) -> bool:
        return self._liveness_enabled

    @property
    def known_count(self) -> int:
        return len(self._encodings)

    @property
    def current_ear(self) -> float:
        if self.liveness_checker:
            return self.liveness_checker.get_ear()
        return 0.0

    def reset_liveness(self):
        if self.liveness_checker:
            self.liveness_checker.reset()

    def load_faces(self):
        """Load all worker encodings from SQLite."""
        with self._lock:
            self._encodings, self._ids, self._names = database.get_worker_encodings()
        logger.info("Loaded %d known face encodings", len(self._encodings))

    def reload_faces(self):
        self.load_faces()

    @staticmethod
    def _largest_face(face_locations: list[tuple[int, int, int, int]]) -> tuple[int, int, int, int]:
        return max(face_locations, key=lambda loc: (loc[2] - loc[0]) * (loc[1] - loc[3]))

    @staticmethod
    def _scale_location(
        face_location: tuple[int, int, int, int],
        scale_x: float,
        scale_y: float,
    ) -> tuple[int, int, int, int]:
        top, right, bottom, left = face_location
        return (
            int(top * scale_y),
            int(right * scale_x),
            int(bottom * scale_y),
            int(left * scale_x),
        )

    def _snapshot_known_faces(self):
        with self._lock:
            return list(self._encodings), list(self._ids), list(self._names)

    def detect_primary_face(
        self, frame: np.ndarray
    ) -> tuple[Optional[tuple[int, int, int, int]], Optional[tuple[int, int, int, int]], np.ndarray]:
        """
        Detect primary face and return:
          - full-resolution location
          - downscaled location
          - downscaled RGB frame
        """
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        small_rgb = cv2.resize(rgb, (0, 0), fx=0.5, fy=0.5)
        locations = face_recognition.face_locations(small_rgb, model="hog")
        if not locations:
            self.last_face_location = None
            self.last_face_detected = False
            return None, None, small_rgb

        small_face = self._largest_face(locations)
        full_face = self._scale_location(small_face, scale_x=2.0, scale_y=2.0)
        self.last_face_location = full_face
        self.last_face_detected = True
        return full_face, small_face, small_rgb

    def recognize_with_liveness(
        self,
        frame: np.ndarray,
        known_encodings: Optional[dict[str, np.ndarray]] = None,
    ) -> tuple[Optional[str], float, bool]:
        """
        Detect, verify liveness, then match identity.

        Returns:
            (worker_name, confidence, liveness_confirmed)
        """
        if frame is None:
            return None, 0.0, False

        full_face, small_face, small_rgb = self.detect_primary_face(frame)
        if full_face is None:
            self.reset_liveness()
            return None, 0.0, False

        if not self._liveness_enabled or not self.liveness_checker:
            return None, 0.0, False

        liveness_confirmed = self.liveness_checker.update(frame, full_face)
        if not liveness_confirmed:
            return None, 0.0, False

        if known_encodings is not None and isinstance(known_encodings, dict):
            names = list(known_encodings.keys())
            encodings = [np.asarray(known_encodings[name], dtype=np.float64) for name in names]
            ids = [-1 for _ in names]
        else:
            encodings, ids, names = self._snapshot_known_faces()

        if not encodings:
            return None, 0.0, True

        candidate_encodings = face_recognition.face_encodings(small_rgb, [small_face])
        if not candidate_encodings:
            return None, 0.0, True

        candidate = candidate_encodings[0]
        candidate_dim = int(candidate.size)

        encodings, ids, names = _supported_encodings(encodings, ids, names, candidate_dim)
        if not encodings:
            return None, 0.0, True

        # Detect encoding dimension to choose matching strategy
        first_enc = encodings[0]
        if len(first_enc) >= 256:
            # ArcFace 512-dim embeddings — use cosine similarity
            # Re-encode with ArcFace would be ideal, but for now
            # dlib 128-dim candidate vs 512-dim known won't match.
            # The Pi should eventually use ArcFace too.
            # For now, use cosine similarity which works for both.
            sims = cosine_similarities(encodings, candidate)
            best_idx = int(np.argmax(sims))
            confidence = float(sims[best_idx])
            if confidence >= config.RECOGNITION_TOLERANCE:
                return names[best_idx], confidence, True
            return None, confidence, True
        else:
            # Legacy 128-dim dlib encodings — euclidean distance
            distances = face_recognition.face_distance(encodings, candidate)
            best_idx = int(np.argmin(distances))
            best_distance = float(distances[best_idx])
            confidence = max(0.0, 1.0 - best_distance)
            if best_distance <= config.RECOGNITION_TOLERANCE:
                return names[best_idx], confidence, True
            return None, confidence, True

    def recognize_face(self, frame: np.ndarray) -> Optional[tuple[int, str, float]]:
        """
        Backward-compatible helper that returns worker id on successful live match.
        """
        name, confidence, liveness_confirmed = self.recognize_with_liveness(frame)
        if not name or not liveness_confirmed:
            return None

        with self._lock:
            if name in self._names:
                idx = self._names.index(name)
                return self._ids[idx], self._names[idx], confidence
        return None

    @staticmethod
    def encode_face(image_path: str) -> Optional[np.ndarray]:
        """Generate 128-dimensional face encoding from an image file."""
        try:
            image = face_recognition.load_image_file(image_path)
        except Exception:
            logger.error("Failed to load image: %s", image_path)
            return None

        encodings = face_recognition.face_encodings(image)
        if not encodings:
            return None
        return encodings[0]

    @staticmethod
    def encode_frame(frame: np.ndarray, face_location: Optional[tuple[int, int, int, int]] = None) -> Optional[np.ndarray]:
        """Generate face encoding from a BGR frame."""
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        if face_location is None:
            encodings = face_recognition.face_encodings(rgb)
        else:
            encodings = face_recognition.face_encodings(rgb, [face_location])
        if not encodings:
            return None
        return encodings[0]
