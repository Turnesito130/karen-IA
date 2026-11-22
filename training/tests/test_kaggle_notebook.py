import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class KaggleNotebookTests(unittest.TestCase):
    def test_notebook_is_valid_and_contains_the_guarded_pipeline(self):
        path = ROOT / "training" / "kaggle" / "karen-training.ipynb"
        notebook = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(notebook["nbformat"], 4)
        self.assertGreaterEqual(len(notebook["cells"]), 10)
        source = "\n".join(
            "".join(cell.get("source", []))
            for cell in notebook["cells"]
            if cell.get("cell_type") == "code"
        )
        for required in (
            "torch.cuda.is_available()",
            "training/audit_dataset.py",
            "training/prepare_dataset.py",
            "training/train_unsloth.py",
            "training/evaluate_model.py",
            "approved_count < 10",
            "snapshot_download",
            "unsloth/SmolLM3-3B",
            "--offline",
        ):
            self.assertIn(required, source)
        self.assertNotIn("approved=True", source)
        self.assertNotIn("approved = True", source)

    def test_kaggle_config_uses_a_local_model_path_and_4bit_training(self):
        path = ROOT / "training" / "config.kaggle.example.json"
        config = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(config["model_path"], "/kaggle/working/base-model")
        self.assertTrue(config["load_in_4bit"])
        self.assertTrue(config["offline"])
        self.assertEqual(config["batch_size"], 1)

    def test_seed_examples_remain_unapproved(self):
        path = ROOT / "training" / "datasets" / "karen-seed-v1.review.jsonl"
        if not path.exists():
            self.skipTest("No existe el archivo de revisión inicial.")
        rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertGreaterEqual(len(rows), 10)
        self.assertTrue(all(row.get("approved") is False for row in rows))


if __name__ == "__main__":
    unittest.main()
