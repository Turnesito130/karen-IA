from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from generate_candidates import generate


class CandidateGeneratorTests(unittest.TestCase):
    def test_generates_unapproved_variants_only_from_approved_facts(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "facts.jsonl"
            facts = [
                {"concept": "fotosíntesis", "definition": "Proceso por el que las plantas usan luz.", "source": "libro revisado", "approved": True},
                {"concept": "dato dudoso", "definition": "No usar.", "source": "sin revisar", "approved": False},
            ]
            path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in facts), encoding="utf-8")
            candidates, issues = generate(path)
            self.assertEqual(len(candidates), 3)
            self.assertTrue(all(row["approved"] is False for row in candidates))
            self.assertTrue(all(row["review_required"] is True for row in candidates))
            self.assertEqual(len(issues), 1)

    def test_missing_source_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "facts.jsonl"
            path.write_text(json.dumps({
                "concept": "concepto", "definition": "definición", "approved": True,
            }, ensure_ascii=False) + "\n", encoding="utf-8")
            candidates, issues = generate(path)
            self.assertEqual(candidates, [])
            self.assertIn("falta source", issues[0])


if __name__ == "__main__":
    unittest.main()
