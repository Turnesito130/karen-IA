#!/usr/bin/env python3
"""Audita calidad estructural de un JSONL de entrenamiento sin aprobar datos."""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path


def normalize(text: str) -> str:
    return re.sub(r"[^\w\s]", " ", text.casefold(), flags=re.UNICODE).strip()


def audit(path: Path, similarity_threshold: float = 0.94) -> dict:
    rows = []
    issues = []
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            issues.append({"line": line_no, "type": "invalid_json", "detail": exc.msg})
            continue
        if not isinstance(row, dict):
            issues.append({"line": line_no, "type": "not_object"})
            continue
        instruction = row.get("instruction")
        output = row.get("output")
        if not isinstance(instruction, str) or not instruction.strip():
            issues.append({"line": line_no, "type": "missing_instruction"})
            continue
        if not isinstance(output, str) or not output.strip():
            issues.append({"line": line_no, "type": "missing_output"})
            continue
        if row.get("approved") is not True:
            issues.append({"line": line_no, "type": "not_approved"})
        if not isinstance(row.get("source", ""), str) or not row.get("source", "").strip():
            issues.append({"line": line_no, "type": "missing_source"})
        if len(instruction) > 2000 or len(output) > 8000:
            issues.append({"line": line_no, "type": "unusually_long"})
        rows.append({
            "line": line_no,
            "instruction": instruction.strip(),
            "output": output.strip(),
            "instruction_norm": normalize(instruction),
            "output_norm": normalize(output),
            "source": str(row.get("source", "")).strip(),
        })

    exact = {}
    for row in rows:
        key = (row["instruction_norm"], row["output_norm"])
        if key in exact:
            issues.append({
                "line": row["line"], "type": "duplicate_pair",
                "duplicate_of_line": exact[key],
            })
        else:
            exact[key] = row["line"]

    near_duplicates = []
    # Evita un coste cuadrático ilimitado en corpus enormes.
    compare_rows = rows[:2500]
    for index, current in enumerate(compare_rows):
        for previous in compare_rows[:index]:
            if not current["instruction_norm"] or not previous["instruction_norm"]:
                continue
            ratio = SequenceMatcher(
                None, current["instruction_norm"], previous["instruction_norm"]
            ).ratio()
            if ratio >= similarity_threshold and current["output_norm"] != previous["output_norm"]:
                near_duplicates.append({
                    "line_a": previous["line"], "line_b": current["line"],
                    "instruction_similarity": round(ratio, 4),
                    "detail": "Instrucciones muy parecidas con respuestas diferentes; revisar manualmente.",
                })

    source_counts = Counter(row["source"] or "(sin fuente)" for row in rows)
    return {
        "format": "karen-dataset-audit-v1",
        "input": str(path),
        "counts": {
            "readable_examples": len(rows),
            "issues": len(issues),
            "near_duplicate_pairs": len(near_duplicates),
            "distinct_sources": len(source_counts),
        },
        "source_counts": dict(source_counts),
        "issues": issues,
        "near_duplicates": near_duplicates,
        "limitations": [
            "La auditoría comprueba estructura y similitud, no verifica la verdad de las respuestas.",
            "Las parejas similares son avisos para revisión humana, no eliminaciones automáticas.",
            "La búsqueda de similitud se limita a los primeros 2500 ejemplos legibles.",
            "No aprueba ejemplos ni concede derechos de uso sobre el contenido.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, help="JSON opcional para guardar el informe")
    parser.add_argument("--similarity-threshold", type=float, default=0.94)
    parser.add_argument("--fail-on-issues", action="store_true")
    args = parser.parse_args()
    if not 0.5 <= args.similarity_threshold <= 1:
        parser.error("--similarity-threshold debe estar entre 0.5 y 1")
    if not args.input.is_file():
        parser.error(f"No existe el fichero: {args.input}")
    report = audit(args.input, args.similarity_threshold)
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    print(rendered)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    if args.fail_on_issues and (report["issues"] or report["near_duplicates"]):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
