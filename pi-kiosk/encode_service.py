"""Lightweight face encoding HTTP service.

Accepts base64 photos, returns averaged face encoding.
Run alongside the dashboard for web-based enrollment.

Usage: py encode_service.py
Listens on port 5557 by default.
"""

from __future__ import annotations

import base64
import io
import json
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler

import cv2
import face_recognition
import numpy as np

from kiosk_ui_auth import get_encode_service_host

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("encode-service")

PORT = 5557


def decode_base64_image(data_url: str) -> np.ndarray | None:
    """Convert a base64 data URL or raw base64 to a cv2 image."""
    try:
        if "," in data_url:
            data_url = data_url.split(",", 1)[1]
        img_bytes = base64.b64decode(data_url)
        img_array = np.frombuffer(img_bytes, dtype=np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        return img
    except Exception as exc:
        logger.warning("Failed to decode image: %s", exc)
        return None


def encode_face(img: np.ndarray) -> np.ndarray | None:
    """Get face encoding from an image. Returns None if no face found."""
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    locations = face_recognition.face_locations(rgb, model="hog")
    if not locations:
        return None
    encodings = face_recognition.face_encodings(rgb, locations)
    if not encodings:
        return None
    # Use the largest face
    if len(locations) > 1:
        areas = [(b - t) * (r - l) for t, r, b, l in locations]
        best_idx = int(np.argmax(areas))
        return encodings[best_idx]
    return encodings[0]


class EncodeHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/encode":
            self.send_error(404)
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return

        photos = data.get("photos", [])
        if not photos or not isinstance(photos, list):
            self._respond(400, {"error": "photos array required"})
            return

        encodings = []
        for i, photo_b64 in enumerate(photos):
            img = decode_base64_image(photo_b64)
            if img is None:
                logger.warning("Photo %d: failed to decode", i + 1)
                continue
            enc = encode_face(img)
            if enc is not None:
                encodings.append(enc)
                logger.info("Photo %d: face encoded", i + 1)
            else:
                logger.warning("Photo %d: no face found", i + 1)

        if not encodings:
            self._respond(422, {"error": "No faces detected in any photo"})
            return

        # Average all encodings for a robust representation
        avg_encoding = np.mean(np.vstack(encodings), axis=0)

        self._respond(200, {
            "encoding": avg_encoding.tolist(),
            "photos_processed": len(photos),
            "faces_found": len(encodings),
        })

    def do_GET(self):
        if self.path == "/health":
            self._respond(200, {"status": "ok"})
        else:
            self.send_error(404)

    def _respond(self, code: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_error(405)

    def log_message(self, format, *args):
        logger.info(format, *args)


def main():
    host = get_encode_service_host()
    server = HTTPServer((host, PORT), EncodeHandler)
    logger.info("Face encoding service running on http://%s:%d", host, PORT)
    logger.info("POST /encode — accepts {photos: [base64...]} returns {encoding: [128 floats]}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down")
        server.server_close()


if __name__ == "__main__":
    main()
