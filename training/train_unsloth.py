#!/usr/bin/env python3
"""Fine-tuning LoRA opcional con Unsloth sobre un modelo que ya existe en disco."""
from __future__ import annotations
import argparse
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-path", required=True, help="Ruta local al modelo base compatible ya descargado")
    parser.add_argument("--dataset-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--max-seq-length", type=int, default=1024)
    parser.add_argument("--rank", type=int, default=8)
    parser.add_argument("--epochs", type=float, default=1.0)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--grad-accumulation", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--offline", action="store_true", help="Impide que Transformers busque archivos remotos")
    args = parser.parse_args()
    model_path = Path(args.model_path).expanduser()
    required = [args.dataset_dir / name for name in ("train.jsonl", "validation.jsonl")]
    if not model_path.exists():
        parser.error(f"no existe el modelo local: {model_path}")
    for path in required:
        if not path.is_file():
            parser.error(f"falta {path}; ejecuta antes prepare_dataset.py")
        if not path.read_text(encoding="utf-8").strip():
            parser.error(f"{path} está vacío; añade más ejemplos o ajusta los porcentajes del split")
    if args.max_seq_length < 128 or args.rank < 1 or args.epochs <= 0:
        parser.error("max-seq-length debe ser >=128, rank >=1 y epochs >0")
    if args.offline:
        import os
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
    try:
        from unsloth import FastLanguageModel
        from datasets import load_dataset
        from trl import SFTTrainer, SFTConfig
    except ImportError as exc:
        raise SystemExit(
            "Faltan dependencias. Instala Unsloth siguiendo https://docs.unsloth.ai/get-started/installing-unsloth "
            "y añade datasets/trl en el mismo entorno compatible. Detalle: " + str(exc)
        )
    print("Cargando modelo local. El script no descarga modelos ni usa APIs.")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=str(model_path),
        max_seq_length=args.max_seq_length,
        dtype=None,
        load_in_4bit=True,
        local_files_only=True,
    )
    model = FastLanguageModel.get_peft_model(
        model,
        r=args.rank,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        lora_alpha=args.rank,
        lora_dropout=0,
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=2026,
        use_rslora=False,
        loftq_config=None,
    )
    files = {"train": str(required[0]), "validation": str(required[1])}
    dataset = load_dataset("json", data_files=files)
    def format_example(example):
        user = example["instruction"]
        if example.get("input"):
            user += "\n\nContexto:\n" + example["input"]
        messages = [
            {"role": "user", "content": user},
            {"role": "assistant", "content": example["output"]},
        ]
        return {"text": tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)}
    dataset = dataset.map(format_example)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    config = SFTConfig(
        output_dir=str(args.output_dir / "trainer"),
        dataset_text_field="text",
        max_seq_length=args.max_seq_length,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accumulation,
        num_train_epochs=args.epochs,
        learning_rate=args.learning_rate,
        logging_steps=5,
        save_strategy="epoch",
        eval_strategy="epoch",
        report_to="none",
        seed=2026,
    )
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset["train"],
        eval_dataset=dataset["validation"],
        args=config,
    )
    trainer.train()
    adapter_dir = args.output_dir / "adapter"
    model.save_pretrained(str(adapter_dir))
    tokenizer.save_pretrained(str(adapter_dir))
    print(f"Adaptador LoRA guardado en: {adapter_dir}")
    print("IMPORTANTE: aún no está conectado al chat de Karen. Evalúa el adaptador y comprueba compatibilidad del runtime antes de integrarlo.")

if __name__ == "__main__":
    main()
