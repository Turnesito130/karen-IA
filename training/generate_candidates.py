#!/usr/bin/env python3
"""Genera candidatos de instrucciones desde fichas revisadas, nunca ejemplos aprobados."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


TEMPLATES = (
    "¿Qué es {concept}?",
    "Explica brevemente qué significa {concept}.",
    "Define {concept} con claridad.",
)


def generate(source_path: Path) -> tuple[list[dict], list[str]]:
    candidates = []
    issues = []
    seen = set()
    for line_no, line in enumerate(source_path.read_text(encoding="utf-8").splitlines(), 1):
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
        concept = item.get("concept")
        definition = item.get("definition")
        source = item.get("source")
        if item.get("approved") is not True:
            issues.append(f"línea {line_no}: ficha no aprobada; excluida")
            continue
        if not isinstance(concept, str) or not concept.strip():
            issues.append(f"línea {line_no}: falta concept")
            continue
        if not isinstance(definition, str) or not definition.strip():
            issues.append(f"línea {line_no}: falta definition")
            continue
        if not isinstance(source, str) or not source.strip():
            issues.append(f"línea {line_no}: falta source")
            continue
        for template in TEMPLATES:
            instruction = template.format(concept=concept.strip())
            key = (instruction.casefold(), definition.strip().casefold())
            if key in seen:
                continue
            seen.add(key)
            candidates.append({
                "instruction": instruction,
                "input": "",
                "output": definition.strip(),
                "source": source.strip(),
                "approved": False,
                "review_required": True,
                "generated_from_line": line_no,
            })
    return candidates, issues


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True,
                        help="JSONL con concept, definition, source y approved:true")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.input.is_file():
        parser.error(f"No existe el fichero de entrada: {args.input}")
    candidates, issues = generate(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as stream:
        for item in candidates:
            stream.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(json.dumps({
        "generated_candidates": len(candidates),
        "issues": issues,
        "all_candidates_unapproved": True,
        "next_step": "Revisar cada candidato y cambiar approved a true solo manualmente.",
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
