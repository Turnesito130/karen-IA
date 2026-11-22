#!/usr/bin/env python3
"""Genera respuestas sobre el conjunto test para revisión humana; no asigna notas automáticas."""
from __future__ import annotations
import argparse, json
from pathlib import Path
from karen_prompt import KAREN_SYSTEM_PROMPT

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-path", required=True, help="Modelo base local ya descargado")
    parser.add_argument("--test", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--adapter", type=Path, help="Adaptador LoRA opcional")
    parser.add_argument("--max-new-tokens", type=int, default=160)
    args = parser.parse_args()
    if not Path(args.model_path).exists():
        parser.error("No existe la ruta local del modelo.")
    if not args.test.is_file() or not args.test.read_text(encoding="utf-8").strip():
        parser.error("El fichero test no existe o está vacío.")
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError as exc:
        raise SystemExit("Instala PyTorch y Transformers en el entorno compatible con Unsloth: " + str(exc))
    tokenizer = AutoTokenizer.from_pretrained(args.model_path, local_files_only=True)
    model = AutoModelForCausalLM.from_pretrained(
        args.model_path,
        torch_dtype="auto",
        device_map="auto" if torch.cuda.is_available() else None,
        local_files_only=True,
    )
    if args.adapter:
        try:
            from peft import PeftModel
        except ImportError as exc:
            raise SystemExit("Falta peft para cargar el adaptador: " + str(exc))
        model = PeftModel.from_pretrained(model, str(args.adapter), local_files_only=True)
    model.eval()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with args.test.open(encoding="utf-8") as source, args.output.open("w", encoding="utf-8") as target:
        for line_no, line in enumerate(source, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            user = row["instruction"]
            if row.get("input"):
                user += "\n\nContexto:\n" + row["input"]
            messages = [{"role": "system", "content": KAREN_SYSTEM_PROMPT}, {"role": "user", "content": user}]
            prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            inputs = tokenizer(prompt, return_tensors="pt")
            inputs = {key: value.to(model.device) for key, value in inputs.items()}
            with torch.inference_mode():
                generated = model.generate(**inputs, max_new_tokens=args.max_new_tokens, do_sample=False)
            new_tokens = generated[0][inputs["input_ids"].shape[1]:]
            prediction = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
            record = {
                "line": line_no,
                "instruction": row["instruction"],
                "input": row.get("input", ""),
                "reference": row["output"],
                "prediction": prediction,
                "source": row.get("source", ""),
            }
            target.write(json.dumps(record, ensure_ascii=False) + "\n")
            count += 1
    print(f"Generadas {count} respuestas para revisión humana: {args.output}")
    print("Compara el modelo base y el adaptado con el mismo test. Revisa exactitud, utilidad, incertidumbre y errores; no uses este test para seguir entrenando.")

if __name__ == "__main__":
    main()
