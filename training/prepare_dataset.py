#!/usr/bin/env python3
"""Valida JSONL aprobado y crea splits reproducibles, sin duplicados exactos."""
from __future__ import annotations
import argparse, hashlib, json, math, random, re
from pathlib import Path

def norm(value: str) -> str:
    return re.sub(r"\\s+", " ", value).strip().casefold()

def fingerprint(item: dict) -> str:
    payload = "\\n".join(norm(str(item.get(k, ""))) for k in ("instruction", "input", "output"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def load_rows(path: Path):
    rows, issues, seen = [], [], set()
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as exc:
            issues.append(f"línea {line_no}: JSON inválido ({exc.msg})")
            continue
        if not isinstance(item, dict):
            issues.append(f"línea {line_no}: se esperaba un objeto JSON")
            continue
        instruction, output = item.get("instruction"), item.get("output")
        if not isinstance(instruction, str) or not instruction.strip():
            issues.append(f"línea {line_no}: falta instruction")
            continue
        if not isinstance(output, str) or not output.strip():
            issues.append(f"línea {line_no}: falta output")
            continue
        if item.get("approved") is not True:
            issues.append(f"línea {line_no}: no aprobado; excluido")
            continue
        extra = item.get("input", "")
        if not isinstance(extra, str):
            issues.append(f"línea {line_no}: input debe ser texto")
            continue
        clean = {"instruction": instruction.strip(), "input": extra.strip(),
                 "output": output.strip(), "source": str(item.get("source", "")).strip()}
        key = fingerprint(clean)
        if key in seen:
            issues.append(f"línea {line_no}: duplicado exacto; excluido")
            continue
        seen.add(key)
        rows.append(clean)
    return rows, issues

def write_jsonl(path: Path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\\n")

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", type=Path, required=True)
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--seed", type=int, default=20261121)
    p.add_argument("--validation", type=float, default=0.10)
    p.add_argument("--test", type=float, default=0.10)
    a = p.parse_args()
    if a.validation <= 0 or a.test <= 0 or a.validation + a.test >= 0.5:
        p.error("validation y test deben ser >0 y sumar menos de 0.5")
    if not a.input.is_file():
        p.error(f"no existe el fichero de entrada: {a.input}")
    rows, issues = load_rows(a.input)
    if len(rows) < 10:
        p.error(f"solo hay {len(rows)} ejemplos válidos; añade al menos 10 para crear splits útiles")
    random.Random(a.seed).shuffle(rows)
    n = len(rows)
    n_test = max(1, math.ceil(n * a.test))
    n_val = max(1, math.ceil(n * a.validation))
    if n_test + n_val >= n:
        p.error("no quedan ejemplos para train; añade más datos o reduce porcentajes")
    test, validation, train = rows[:n_test], rows[n_test:n_test+n_val], rows[n_test+n_val:]
    out = a.output_dir
    write_jsonl(out / "train.jsonl", train)
    write_jsonl(out / "validation.jsonl", validation)
    write_jsonl(out / "test.jsonl", test)
    report = {"format":"karen-dataset-report-v2","input":str(a.input),"seed":a.seed,
      "counts":{"accepted":n,"train":len(train),"validation":len(validation),"test":len(test)},
      "issues":issues,
      "warning":"La validación comprueba formato y aprobación, no la veracidad. Revisa procedencia, derechos, equilibrio y exactitud manualmente."}
    (out / "report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__ == "__main__":
    main()
