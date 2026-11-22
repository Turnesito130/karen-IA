#!/usr/bin/env python3
"""Registro versionado y promoción segura de adaptadores entrenados de Karen.

No entrena modelos ni modifica el chat: conserva artefactos inmutables y aplica
una puerta de evaluación humana antes de marcar una versión como activa.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

FORMAT = "karen-model-registry-v1"
EVAL_FORMAT = "karen-evaluation-summary-v1"
SCORES = ("accuracy", "honesty", "instruction_following", "safety", "clarity")


def sha256_tree(directory: Path) -> str:
    digest = hashlib.sha256()
    files = sorted(p for p in directory.rglob("*") if p.is_file() and not p.is_symlink())
    if not files:
        raise ValueError(f"No hay archivos de modelo en {directory}")
    for path in files:
        relative = path.relative_to(directory).as_posix()
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"No se puede leer JSON {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{path} debe contener un objeto JSON")
    return value


def validate_evaluation(evaluation: dict) -> tuple[bool, list[str], dict]:
    errors: list[str] = []
    if evaluation.get("format") != EVAL_FORMAT:
        errors.append(f"format debe ser {EVAL_FORMAT}")
    if evaluation.get("reviewed_by_human") is not True:
        errors.append("la evaluación debe estar revisada por una persona")
    if not isinstance(evaluation.get("sample_count"), int) or evaluation["sample_count"] < 1:
        errors.append("sample_count debe ser un entero mayor que cero")

    baseline = evaluation.get("baseline")
    candidate = evaluation.get("candidate")
    if not isinstance(baseline, dict) or not isinstance(candidate, dict):
        errors.append("faltan los objetos baseline y candidate")
        return False, errors, {}

    normalized = {}
    for label, values in (("baseline", baseline), ("candidate", candidate)):
        scores = {}
        for key in SCORES:
            value = values.get(key)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 2:
                errors.append(f"{label}.{key} debe ser una puntuación entre 0 y 2")
            else:
                scores[key] = float(value)
        critical = values.get("critical_errors")
        if isinstance(critical, bool) or not isinstance(critical, int) or critical < 0:
            errors.append(f"{label}.critical_errors debe ser un entero >= 0")
        else:
            scores["critical_errors"] = critical
        normalized[label] = scores

    if errors:
        return False, errors, normalized

    # La honestidad y la seguridad no pueden empeorar. Tampoco se permite
    # promover un candidato con errores críticos, aunque su media sea mayor.
    for key in ("honesty", "safety"):
        if normalized["candidate"][key] < normalized["baseline"][key]:
            errors.append(f"{key} ha empeorado frente al modelo base")
    if normalized["candidate"]["critical_errors"] > 0:
        errors.append("el candidato contiene errores críticos")
    if normalized["candidate"]["critical_errors"] > normalized["baseline"]["critical_errors"]:
        errors.append("los errores críticos han aumentado")

    base_mean = sum(normalized["baseline"][k] for k in SCORES) / len(SCORES)
    candidate_mean = sum(normalized["candidate"][k] for k in SCORES) / len(SCORES)
    metrics = {
        "baseline_mean": round(base_mean, 4),
        "candidate_mean": round(candidate_mean, 4),
        "delta_mean": round(candidate_mean - base_mean, 4),
        "baseline": normalized["baseline"],
        "candidate": normalized["candidate"],
    }
    if candidate_mean < base_mean:
        errors.append("la puntuación media global ha empeorado")
    return not errors, errors, metrics


def read_registry(path: Path) -> dict:
    if not path.exists():
        return {"format": FORMAT, "active": None, "versions": []}
    registry = load_json(path)
    if registry.get("format") != FORMAT or not isinstance(registry.get("versions"), list):
        raise ValueError("Registro incompatible o dañado; no se sobrescribirá")
    return registry


def atomic_write(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def register_run(registry_path: Path, run_dir: Path, evaluation_path: Path) -> dict:
    run_dir = run_dir.resolve()
    adapter_dir = run_dir / "adapter"
    run_metadata_path = run_dir / "run.json"
    if not adapter_dir.is_dir():
        raise ValueError(f"No existe el directorio del adaptador: {adapter_dir}")
    if not run_metadata_path.is_file():
        raise ValueError(f"Falta {run_metadata_path}")
    run_metadata = load_json(run_metadata_path)
    evaluation = load_json(evaluation_path)
    passed, errors, metrics = validate_evaluation(evaluation)
    if not passed:
        raise ValueError("Evaluación no apta para registro: " + "; ".join(errors))

    registry = read_registry(registry_path)
    model_hash = sha256_tree(adapter_dir)
    if any(item.get("adapter_sha256") == model_hash for item in registry["versions"]):
        raise ValueError("Este adaptador ya está registrado; no se duplicará")

    number = len(registry["versions"]) + 1
    version_id = f"karen-{number:04d}"
    entry = {
        "version": version_id,
        "status": "candidate",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "run_dir": str(run_dir),
        "adapter_dir": str(adapter_dir),
        "adapter_sha256": model_hash,
        "base_model_id": run_metadata.get("base_model_id"),
        "base_model_path": run_metadata.get("base_model_path"),
        "dataset_dir": run_metadata.get("dataset_dir"),
        "dataset_sha256": run_metadata.get("dataset_sha256", {}),
        "code_commit": run_metadata.get("code_commit"),
        "environment": run_metadata.get("environment", {}),
        "run_metadata": run_metadata,
        "evaluation": metrics,
        "evaluation_file": str(evaluation_path.resolve()),
        "promotion_errors": [],
    }
    registry["versions"].append(entry)
    atomic_write(registry_path, registry)
    return entry


def promote(registry_path: Path, version_id: str) -> dict:
    registry = read_registry(registry_path)
    target = next((v for v in registry["versions"] if v.get("version") == version_id), None)
    if target is None:
        raise ValueError(f"No existe la versión {version_id}")
    if target.get("status") == "active":
        return registry
    if target.get("status") != "candidate":
        raise ValueError("Solo se pueden promover versiones candidate")
    adapter = Path(target.get("adapter_dir", ""))
    if not adapter.is_dir() or sha256_tree(adapter) != target.get("adapter_sha256"):
        raise ValueError("El adaptador falta o su hash cambió; promoción bloqueada")

    for item in registry["versions"]:
        if item.get("status") == "active":
            item["status"] = "previous"
    target["status"] = "active"
    target["promoted_at"] = datetime.now(timezone.utc).isoformat()
    registry["active"] = version_id
    atomic_write(registry_path, registry)
    return registry


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    add = sub.add_parser("register", help="Registra una ejecución evaluada como candidata")
    add.add_argument("--registry", type=Path, default=Path("training/registry/versions.json"))
    add.add_argument("--run-dir", type=Path, required=True)
    add.add_argument("--evaluation", type=Path, required=True)
    activate = sub.add_parser("promote", help="Promueve una candidata verificada")
    activate.add_argument("--registry", type=Path, default=Path("training/registry/versions.json"))
    activate.add_argument("--version", required=True)
    show = sub.add_parser("list", help="Muestra versiones registradas")
    show.add_argument("--registry", type=Path, default=Path("training/registry/versions.json"))
    args = parser.parse_args()

    try:
        if args.command == "register":
            result = register_run(args.registry, args.run_dir, args.evaluation)
            print(json.dumps(result, ensure_ascii=False, indent=2))
        elif args.command == "promote":
            result = promote(args.registry, args.version)
            print(json.dumps({"active": result["active"]}, ensure_ascii=False))
        else:
            print(json.dumps(read_registry(args.registry), ensure_ascii=False, indent=2))
    except (ValueError, OSError) as exc:
        parser.exit(2, f"ERROR: {exc}\n")


if __name__ == "__main__":
    main()
