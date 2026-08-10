"""Credential validation shared by kiosk startup and server synchronization."""

import config


def require_kiosk_api_key() -> str:
    """Return the configured kiosk key or fail with an actionable message."""
    key = config.KIOSK_API_KEY.strip()
    if not key:
        raise RuntimeError(
            "KIOSK_API_KEY is required for server synchronization. "
            "Configure the same key as the Gatekeeper server and restart the kiosk."
        )
    return key
