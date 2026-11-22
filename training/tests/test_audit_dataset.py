from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from audit_dataset import audit


class DatasetAuditTests(unittest.TestCase):
    def test_reports_missing_source_and_unapproved_example(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "data.jsonl"
            path.write_text(json.dumps({
                "instruction": "Define la fotosíntesis",
                "output": "Proceso biológico.",
                "approved": False,
            }, ensure_ascii=False) + "\n", encoding="utf-8")
            report = audit(path)
            issue_types = {item["type"] for item in report["issues"]}
            self.assertIn("missing_source", issue_types)
            self.assertIn("not_approved", issue_types)

    def test_flags_near_duplicate_questions_with_different_answers(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "data.jsonl"
            rows = [
                {"instruction": "Explica qué es la fotosíntesis", "output": "Respuesta A", "approved": True, "source": "libro"},
                {"instruction": "Explica que es la fotosintesis", "output": "Respuesta B", "approved": True, "source": "libro"},
            ]
            path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
            report = audit(path, 0.90)
            self.assertEqual(report["counts"]["near_duplicate_pairs"], 1)

    def test_invalid_json_is_reported_not_crashed(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "data.jsonl"
            path.write_text("{not-json}\n", encoding="utf-8")
            report = audit(path)
            self.assertEqual(report["issues"][0]["type"], "invalid_json")


if __name__ == "__main__":
    unittest.main()
