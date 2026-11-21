#!/usr/bin/env python3
"""Exporta un adaptador Unsloth a un modelo combinado o GGUF, si está soportado."""
from __future__ import annotations
import argparse
from pathlib import Path

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--adapter", type=Path, required=True)
    p.add_argument("--format", choices=("merged_16bit", "gguf"), required=True)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--quantization", default="q4_k_m")
    p.add_argument("--max-seq-length", type=int, default=1024)
    args = p.parse_args()
    if not args.adapter.is_dir():
        p.error(f"No existe el adaptador: {args.adapter}")
    if args.output.exists() and any(args.output.iterdir()):
        p.error(f"La carpeta de salida no está vacía: {args.output}")
    args.output.mkdir(parents=True, exist_ok=True)
    try:
        from unsloth import FastLanguageModel
    except ImportError as exc:
        raise SystemExit("Unsloth no está instalado: " + str(exc))
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=str(args.adapter), max_seq_length=args.max_seq_length,
        dtype=None, load_in_4bit=True, local_files_only=True,
    )
    if args.format == "merged_16bit":
        model.save_pretrained_merged(str(args.output), tokenizer, save_method="merged_16bit")
    else:
        model.save_pretrained_gguf(str(args.output), tokenizer, quantization_method=args.quantization)
    print(f"Exportación terminada: {args.output}")
    print("Verifica el artefacto con el runtime de destino antes de integrarlo en Karen.")

if __name__ == "__main__":
    main()
