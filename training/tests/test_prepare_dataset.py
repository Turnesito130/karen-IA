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

if __name__ == "__main__":
    unittest.main()
