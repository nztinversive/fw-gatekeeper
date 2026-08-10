"""Authentication helpers for the kiosk's localhost-only web UI."""

import hashlib
import hmac
import os
from typing import Optional

import config


KIOSK_UI_KEY_HEADER = "X-Kiosk-UI-Key"
KIOSK_UI_SESSION_COOKIE = "fw-kiosk-ui"
_SESSION_CONTEXT = b"fw-gatekeeper-kiosk-ui-session-v1"


def _config_or_env(config_name: str, env_name: str, default: str = "") -> str:
    configured = getattr(config, config_name, None)
    if configured is not None:
        return str(configured).strip()
    return os.environ.get(env_name, default).strip()


def require_kiosk_ui_key() -> str:
    key = _config_or_env("KIOSK_UI_KEY", "KIOSK_UI_KEY")
    if not key:
        raise RuntimeError(
            "KIOSK_UI_KEY is required for protected kiosk web routes. "
            "Configure it locally and restart the kiosk service."
        )
    return key


def get_kiosk_ui_host() -> str:
    return _config_or_env("KIOSK_UI_HOST", "KIOSK_UI_HOST", "127.0.0.1") or "127.0.0.1"


def get_encode_service_host() -> str:
    return _config_or_env("KIOSK_ENCODE_HOST", "KIOSK_ENCODE_HOST", "127.0.0.1") or "127.0.0.1"


def get_enroll_preview_host() -> str:
    return _config_or_env(
        "KIOSK_ENROLL_PREVIEW_HOST",
        "KIOSK_ENROLL_PREVIEW_HOST",
        "127.0.0.1",
    ) or "127.0.0.1"


def kiosk_ui_session_token(key: Optional[str] = None) -> str:
    configured_key = (key or require_kiosk_ui_key()).strip()
    return hmac.new(configured_key.encode("utf-8"), _SESSION_CONTEXT, hashlib.sha256).hexdigest()


def has_valid_kiosk_ui_credential(
    provided_key: Optional[str] = None,
    session_token: Optional[str] = None,
) -> bool:
    try:
        configured_key = require_kiosk_ui_key()
    except RuntimeError:
        return False

    candidate_key = (provided_key or "").strip()
    if candidate_key and hmac.compare_digest(candidate_key, configured_key):
        return True

    candidate_session = (session_token or "").strip()
    return bool(
        candidate_session
        and hmac.compare_digest(candidate_session, kiosk_ui_session_token(configured_key))
    )
