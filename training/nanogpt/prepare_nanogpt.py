#!/usr/bin/env python3
"""Convierte ejemplos JSONL aprobados al formato de caracteres de nanoGPT."""
from __future__ import annotations
import argparse, json, pickle, random
from pathlib import Path
import numpy as np

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input",type=Path,required=True)
    p.add_argument("--output-dir",type=Path,required=True)
    p.add_argument("--validation-ratio",type=float,default=0.1)
    p.add_argument("--seed",type=int,default=20261121)
    a=p.parse_args()
    if not a.input.is_file(): p.error(f"No existe: {a.input}")
    if not 0<a.validation_ratio<0.5: p.error("validation-ratio debe estar entre 0 y 0.5")
    examples=[]
    for n,line in enumerate(a.input.read_text(encoding="utf-8").splitlines(),1):
        if not line.strip(): continue
        try: row=json.loads(line)
        except json.JSONDecodeError as e: p.error(f"Línea {n}: JSON inválido: {e}")
        if not isinstance(row,dict) or row.get("approved") is not True: continue
        instruction=row.get("instruction"); output=row.get("output")
        if not isinstance(instruction,str) or not instruction.strip() or not isinstance(output,str) or not output.strip():
            p.error(f"Línea {n}: instruction/output deben ser textos no vacíos")
        context=row.get("input","")
        examples.append("Usuario: "+instruction.strip()+("\nContexto: "+context.strip() if isinstance(context,str) and context.strip() else "")+"\nKaren: "+output.strip()+"\n\n")
    if len(examples)<10: p.error(f"Solo {len(examples)} ejemplos aprobados; se exigen 10 como mínimo técnico. Para aprender algo útil harán falta muchos más y variados.")
    rng=random.Random(a.seed); rng.shuffle(examples)
    corpus="".join(examples)
    chars=sorted(set(corpus)); stoi={ch:i for i,ch in enumerate(chars)}; itos={i:ch for ch,i in stoi.items()}
    ids=np.array([stoi[c] for c in corpus],dtype=np.uint16)
    split=max(1,min(len(ids)-1,int(len(ids)*(1-a.validation_ratio))))
    out=a.output_dir; out.mkdir(parents=True,exist_ok=True)
    ids[:split].tofile(out/"train.bin"); ids[split:].tofile(out/"val.bin")
    with (out/"meta.pkl").open("wb") as f: pickle.dump({"vocab_size":len(chars),"itos":itos,"stoi":stoi},f)
    report={"examples":len(examples),"characters":len(ids),"vocab_size":len(chars),"train_tokens":split,"validation_tokens":len(ids)-split,"seed":a.seed,"warning":"nanoGPT character-level es un experimento didáctico, no un modelo conversacional competitivo ni un reemplazo de fine-tuning de un LLM."}
    (out/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=="__main__": main()
