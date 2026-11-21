#!/usr/bin/env python3
"""Fine-tuning supervisado LoRA/QLoRA con Unsloth sobre un modelo local."""
from __future__ import annotations
import argparse, inspect, json, os
from pathlib import Path
from datetime import datetime, timezone

def supported_kwargs(callable_obj, values, allow_var_kwargs=True):
    sig = inspect.signature(callable_obj)
    explicit = {k:v for k,v in values.items() if k in sig.parameters}
    if allow_var_kwargs and any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()):
        return values
    return explicit

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--model-path", required=True)
    p.add_argument("--dataset-dir", type=Path, required=True)
    p.add_argument("--output-dir", type=Path, required=True)
    p.add_argument("--max-seq-length", type=int, default=1024)
    p.add_argument("--rank", type=int, default=8)
    p.add_argument("--epochs", type=float, default=1.0)
    p.add_argument("--batch-size", type=int, default=1)
    p.add_argument("--grad-accumulation", type=int, default=4)
    p.add_argument("--learning-rate", type=float, default=2e-4)
    p.add_argument("--load-in-4bit", action=argparse.BooleanOptionalAction, default=True)
    p.add_argument("--offline", action="store_true")
    p.add_argument("--overwrite", action="store_true")
    a = p.parse_args()
    model_path = Path(a.model_path).expanduser()
    if not model_path.is_dir():
        p.error(f"El modelo debe existir como carpeta local: {model_path}")
    train_file, val_file = a.dataset_dir/"train.jsonl", a.dataset_dir/"validation.jsonl"
    for f in (train_file,val_file):
        if not f.is_file() or not f.read_text(encoding="utf-8").strip():
            p.error(f"Falta el dataset o está vacío: {f}")
    if a.max_seq_length < 128 or a.rank < 1 or a.epochs <= 0 or a.batch_size < 1 or a.grad_accumulation < 1:
        p.error("Parámetros inválidos: longitud >=128, rank/epochs/batch/grad-accumulation >0")
    if a.output_dir.exists() and any(a.output_dir.iterdir()) and not a.overwrite:
        p.error(f"La salida ya existe y no está vacía: {a.output_dir}; usa otra ruta o --overwrite")
    if a.offline:
        os.environ["HF_HUB_OFFLINE"]="1"
        os.environ["TRANSFORMERS_OFFLINE"]="1"
        os.environ["HF_DATASETS_OFFLINE"]="1"
    try:
        import torch
        from datasets import load_dataset
        from unsloth import FastLanguageModel
        from trl import SFTTrainer, SFTConfig
    except ImportError as exc:
        raise SystemExit("Falta una dependencia. Instala PyTorch/CUDA y Unsloth según la guía oficial; después instala training/requirements.txt. Detalle: "+str(exc))
    if a.load_in_4bit and not torch.cuda.is_available():
        raise SystemExit("QLoRA 4-bit de este flujo requiere CUDA disponible. No se inicia entrenamiento CPU accidentalmente.")
    print("Dispositivo:", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU")
    print("Cargando exclusivamente el modelo local:", model_path)
    model, tokenizer = FastLanguageModel.from_pretrained(**supported_kwargs(
      FastLanguageModel.from_pretrained, {"model_name":str(model_path),"max_seq_length":a.max_seq_length,
      "dtype":None,"load_in_4bit":a.load_in_4bit,"local_files_only":True,"trust_remote_code":False}))
    model = FastLanguageModel.get_peft_model(model, **supported_kwargs(
      FastLanguageModel.get_peft_model, {"r":a.rank,
      "target_modules":["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"],
      "lora_alpha":a.rank,"lora_dropout":0,"bias":"none",
      "use_gradient_checkpointing":"unsloth","random_state":2026,"use_rslora":False,"loftq_config":None}))
    data = load_dataset("json",data_files={"train":str(train_file),"validation":str(val_file)})
    def render(row):
        user = row["instruction"]
        if row.get("input"): user += "\n\nContexto:\n"+row["input"]
        messages=[{"role":"user","content":user},{"role":"assistant","content":row["output"]}]
        return {"text":tokenizer.apply_chat_template(messages,tokenize=False,add_generation_prompt=False)}
    data=data.map(render)
    a.output_dir.mkdir(parents=True,exist_ok=True)
    config_values={"output_dir":str(a.output_dir/"trainer"),"max_length":a.max_seq_length,
      "max_seq_length":a.max_seq_length,"dataset_text_field":"text",
      "per_device_train_batch_size":a.batch_size,"per_device_eval_batch_size":1,
      "gradient_accumulation_steps":a.grad_accumulation,"num_train_epochs":a.epochs,
      "learning_rate":a.learning_rate,"logging_steps":5,"save_strategy":"epoch",
      "eval_strategy":"epoch","report_to":"none","seed":2026,"dataset_num_proc":1,
      "packing":False}
    config=SFTConfig(**supported_kwargs(SFTConfig,config_values))
    trainer_values={"model":model,"args":config,"train_dataset":data["train"],
      "eval_dataset":data["validation"],"processing_class":tokenizer,"tokenizer":tokenizer}
    trainer=SFTTrainer(**supported_kwargs(SFTTrainer,trainer_values,allow_var_kwargs=False))
    result=trainer.train()
    adapter=a.output_dir/"adapter"
    model.save_pretrained(str(adapter))
    tokenizer.save_pretrained(str(adapter))
    metadata={"format":"karen-unsloth-run-v1","created_at":datetime.now(timezone.utc).isoformat(),
      "base_model_path":str(model_path.resolve()),"dataset_dir":str(a.dataset_dir.resolve()),
      "max_seq_length":a.max_seq_length,"rank":a.rank,"epochs":a.epochs,
      "batch_size":a.batch_size,"grad_accumulation":a.grad_accumulation,
      "learning_rate":a.learning_rate,"load_in_4bit":a.load_in_4bit,
      "offline":a.offline,"train_metrics":getattr(result,"metrics",{})}
    (a.output_dir/"run.json").write_text(json.dumps(metadata,ensure_ascii=False,indent=2,default=str)+"\n",encoding="utf-8")
    print("Adaptador guardado en:",adapter)
    print("No está conectado todavía al chat de Karen. Evalúa antes de desplegar.")
if __name__=="__main__":
    main()
