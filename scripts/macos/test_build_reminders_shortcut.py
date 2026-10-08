#!/usr/bin/env python3
"""Linux-safe checks for the Reminders Shortcut builder (no shortcuts CLI)."""
from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILDER = ROOT / "scripts/macos/build-reminders-shortcut.py"


def load_builder():
    spec = importlib.util.spec_from_file_location("build_reminders_shortcut", BUILDER)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class BuildRemindersShortcutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.mod = load_builder()

    def test_v4_invariants(self) -> None:
        workflow = self.mod.build_workflow(
            "https://the-daily-tailor.fly.dev",
            "0" * 64,
        )
        self.mod.validate_workflow(workflow)

    def test_plist_only_writes_twins(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "Invia promemoria al giornale.shortcut"
            memo = Path(tmp) / "Invia memo a TDT.shortcut"
            argv = [
                str(BUILDER),
                "--plist-only",
                "--with-memo",
                "--token",
                "0" * 64,
                "--output",
                str(out),
                "--memo-output",
                str(memo),
            ]
            old = sys.argv
            try:
                sys.argv = argv
                self.mod.main()
            finally:
                sys.argv = old
            self.assertTrue(out.with_suffix(".wflow").is_file())
            self.assertTrue(memo.with_suffix(".wflow").is_file())


if __name__ == "__main__":
    unittest.main()
