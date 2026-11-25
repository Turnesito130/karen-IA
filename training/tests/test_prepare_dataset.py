import json
import tempfile
import unittest
from pathlib import Path

from training.prepare_dataset import load_rows, fingerprint


class DatasetPreparationTests(unittest.TestCase):
    def test_only_approved_and_unique_rows_are_kept(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "raw.jsonl"
            rows = [
                {"instruction": "Pregunta", "output": "Respuesta", "approved": True},
                {"instruction": "Pregunta", "output": "Respuesta", "approved": True},
                {"instruction": "No revisada", "output": "Texto", "approved": False},
            ]
            path.write_text("\n".join(json.dumps(x) for x in rows), encoding="utf-8")
            accepted, issues = load_rows(path)
            self.assertEqual(len(accepted), 1)
            self.assertEqual(len(issues), 2)

    def test_fingerprint_ignores_case_and_whitespace(self):
        a = {"instruction": "Hola  mundo", "input": "", "output": "Respuesta"}
        b = {"instruction": "hola mundo", "input": "", "output": "respuesta"}
        self.assertEqual(fingerprint(a), fingerprint(b))

    def test_example_template_never_preapproves_training_data(self):
        template = Path(__file__).resolve().parents[1] / "datasets" / "raw.example.jsonl"
        rows = [json.loads(line) for line in template.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertGreater(len(rows), 0)
        self.assertTrue(all(row.get("approved") is False for row in rows))


if __name__ == "__main__":
    unittest.main()
