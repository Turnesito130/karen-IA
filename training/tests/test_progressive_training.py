from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from progressive_training import (
    EVAL_FORMAT, promote, read_registry, register_run, validate_evaluation,
)


def evaluation(candidate_overrides=None):
    baseline = {
        "accuracy": 1.0, "honesty": 2.0, "instruction_following": 1.0,
        "safety": 2.0, "clarity": 1.0, "critical_errors": 0,
    }
    candidate = dict(baseline)
    candidate["accuracy"] = 1.5
    candidate["clarity"] = 1.5
    candidate.update(candidate_overrides or {})
    return {
        "format": EVAL_FORMAT, "reviewed_by_human": True, "sample_count": 20,
        "baseline": baseline, "candidate": candidate,
    }


class ProgressiveTrainingTests(unittest.TestCase):
    def test_valid_candidate_passes(self):
        passed, errors, metrics = validate_evaluation(evaluation())
        self.assertTrue(passed, errors)
        self.assertGreater(metrics["delta_mean"], 0)

    def test_honesty_regression_is_blocked(self):
        passed, errors, _ = validate_evaluation(evaluation({"honesty": 1.5}))
        self.assertFalse(passed)
        self.assertTrue(any("honesty" in error for error in errors))

    def test_critical_error_is_blocked(self):
        passed, errors, _ = validate_evaluation(evaluation({"critical_errors": 1}))
        self.assertFalse(passed)
        self.assertTrue(any("críticos" in error for error in errors))

    def test_register_and_promote_preserves_previous_version(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            registry_path = root / "versions.json"
            evaluation_path = root / "evaluation.json"
            evaluation_path.write_text(json.dumps(evaluation()), encoding="utf-8")

            run1 = root / "run1"
            (run1 / "adapter").mkdir(parents=True)
            (run1 / "adapter" / "weights.bin").write_bytes(b"model-one")
            (run1 / "run.json").write_text(json.dumps({"base_model_id":"unsloth/SmolLM3-3B","base_model_path":"base-a","dataset_sha256":{"train":"abc"},"code_commit":"commit-a","environment":{"cuda":"12.8"}}), encoding="utf-8")
            first = register_run(registry_path, run1, evaluation_path)
            promote(registry_path, first["version"])

            run2 = root / "run2"
            (run2 / "adapter").mkdir(parents=True)
            (run2 / "adapter" / "weights.bin").write_bytes(b"model-two")
            (run2 / "run.json").write_text(json.dumps({"base_model_id":"unsloth/SmolLM3-3B","base_model_path":"base-a","dataset_sha256":{"train":"def"},"code_commit":"commit-b","environment":{"cuda":"12.8"}}), encoding="utf-8")
            second = register_run(registry_path, run2, evaluation_path)
            promoted = promote(registry_path, second["version"])

            self.assertEqual(promoted["active"], second["version"])
            self.assertEqual(second["base_model_id"], "unsloth/SmolLM3-3B")
            self.assertEqual(second["dataset_sha256"]["train"], "def")
            self.assertEqual(second["code_commit"], "commit-b")
            statuses = {v["version"]: v["status"] for v in read_registry(registry_path)["versions"]}
            self.assertEqual(statuses[first["version"]], "previous")
            self.assertEqual(statuses[second["version"]], "active")

    def test_modified_adapter_cannot_be_promoted(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            evaluation_path = root / "evaluation.json"
            evaluation_path.write_text(json.dumps(evaluation()), encoding="utf-8")
            run = root / "run"
            (run / "adapter").mkdir(parents=True)
            weights = run / "adapter" / "weights.bin"
            weights.write_bytes(b"original")
            (run / "run.json").write_text("{}", encoding="utf-8")
            entry = register_run(root / "registry.json", run, evaluation_path)
            weights.write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "hash cambió"):
                promote(root / "registry.json", entry["version"])


if __name__ == "__main__":
    unittest.main()
