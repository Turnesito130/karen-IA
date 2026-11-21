#!/usr/bin/env python3
"""Valida ejemplos aprobados y crea splits reproducibles sin duplicados exactos."""
from __future__ import annotations
import argparse, hashlib, json, random, re
from pathlib import Path

def norm(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()

def fingerprint(item: dict) -> str:
    payload = "\n".join(norm(str(item.get(k, ""))) for k in ("instruction", "input", "output"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def load_rows(path: Path):
    rows, errors, seen = [], [], set()
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(f"línea {line_no}: JSON inválido ({exc.msg})")
            continue
        if not isinstance(item, dict):
            errors.append(f"línea {line_no}: cada fila debe ser un objeto JSON")
            continue
        instruction, output = item.get("instruction"), item.get("output")
        if not isinstance(instruction, str) or not instruction.strip():
            errors.append(f"línea {line_no}: falta instruction")
            continue
        if not isinstance(output, str) or not output.strip():
            errors.append(f"línea {line_no}: falta output")
            continue
        if item.get("approved") is not True:
            errors.append(f"línea {line_no}: ejemplo no aprobado; se excluye")
            continue
        clean = {
            "instruction": instruction.strip(),
            "input": str(item.get("input", "")).strip(),
            "output": output.strip(),
            "source": str(item.get("source", "")).strip(),
        }
        key = fingerprint(clean)
        if key in seen:
            errors.append(f"línea {line_no}: duplicado exacto; se excluye")
            continue
        seen.add(key)
        rows.append(clean)
    return rows, errors

def write_jsonl(path: Path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20261121)
    parser.add_argument("--validation", type=float, default=0.10)
    parser.add_argument("--test", type=float, default=0.10)
    args = parser.parse_args()
    if args.validation < 0 or args.test < 0 or args.validation + args.test >= 0.5:
        parser.error("validation y test deben ser >= 0 y sumar menos de 0.5")
    rows, issues = load_rows(args.input)
    random.Random(args.seed).shuffle(rows)
    n = len(rows)
    n_test = int(n * args.test)
    n_val = int(n * args.validation)
    test = rows[:n_test]
    validation = rows[n_test:n_test+n_val]
    train = rows[n_test+n_val:]
    out = args.output_dir
    write_jsonl(out / "train.jsonl", train)
    write_jsonl(out / "validation.jsonl", validation)
    write_jsonl(out / "test.jsonl", test)
    report = {
        "format": "karen-dataset-report-v1",
        "input": str(args.input),
        "seed": args.seed,
        "counts": {"accepted": n, "train": len(train), "validation": len(validation), "test": len(test)},
        "issues": issues,
        "warning": "Revisa manualmente procedencia, exactitud, derechos y equilibrio temático antes de entrenar."
    }
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if n < 10:
        print("AVISO: hay menos de 10 ejemplos; las métricas de validación/test serán poco fiables.")

if __name__ == "__main__":
    main()
