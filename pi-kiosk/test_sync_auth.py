#!/usr/bin/env python3
"""Behavioral coverage for kiosk server-sync credential startup checks."""

import sys
import unittest
from pathlib import Path

KIOSK_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(KIOSK_DIR))

import config  # noqa: E402
from sync_auth import require_kiosk_api_key  # noqa: E402


class KioskSyncAuthTests(unittest.TestCase):
    def setUp(self):
        self.original_key = config.KIOSK_API_KEY

    def tearDown(self):
        config.KIOSK_API_KEY = self.original_key

    def test_missing_key_fails_with_actionable_message(self):
        config.KIOSK_API_KEY = "   "

        with self.assertRaisesRegex(RuntimeError, "KIOSK_API_KEY is required for server synchronization"):
            require_kiosk_api_key()

    def test_configured_key_is_trimmed_and_returned(self):
        config.KIOSK_API_KEY = "  test-kiosk-key  "

        self.assertEqual(require_kiosk_api_key(), "test-kiosk-key")

    def test_startup_and_setup_use_the_required_key_check(self):
        main_source = (KIOSK_DIR / "main.py").read_text(encoding="utf-8")
        sync_source = (KIOSK_DIR / "sync.py").read_text(encoding="utf-8")
        setup_source = (KIOSK_DIR / "setup.sh").read_text(encoding="utf-8")
        readme_source = (KIOSK_DIR / "README.md").read_text(encoding="utf-8")

        self.assertIn("require_kiosk_api_key()", main_source)
        self.assertIn("logger.critical", main_source)
        self.assertIn("require_kiosk_api_key()", sync_source)
        self.assertIn('if [ -z "$KIOSK_API_KEY" ]', setup_source)
        self.assertIn("KIOSK_API_KEY is required", readme_source)


if __name__ == "__main__":
    unittest.main()
