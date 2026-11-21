#!/usr/bin/env python3
"""Diagnóstico sin instalar paquetes ni descargar modelos."""
from __future__ import annotations
import importlib.metadata as md
import platform
import shutil
import sys

PACKAGES = ("torch", "unsloth", "trl", "transformers", "datasets", "peft", "accelerate", "bitsandbytes")

def main():
    print("KAREN · DIAGNÓSTICO DE ENTRENAMIENTO")
    print(f"Python: {sys.version.split()[0]} ({platform.platform()})")
    print(f"Ejecutable: {sys.executable}")
    print("\nPaquetes:")
    for name in PACKAGES:
        try:
            print(f"  {name}: {md.version(name)}")
        except md.PackageNotFoundError:
            print(f"  {name}: NO INSTALADO")
    print("\nHerramientas:")
    for name in ("nvidia-smi", "nvcc", "git"):
        print(f"  {name}: {shutil.which(name) or 'no encontrado'}")
    try:
        import torch
        print("\nPyTorch:")
        print(f"  CUDA disponible: {torch.cuda.is_available()}")
        print(f"  CUDA de PyTorch: {torch.version.cuda}")
        if torch.cuda.is_available():
            for i in range(torch.cuda.device_count()):
                p = torch.cuda.get_device_properties(i)
                print(f"  GPU {i}: {p.name} · {p.total_memory / 1024**3:.1f} GiB")
        else:
            print("  Sin GPU CUDA: no inicies un entrenamiento Unsloth QLoRA NVIDIA.")
    except ImportError:
        print("\nPyTorch no está instalado; no se puede comprobar CUDA.")
    print("\nEste diagnóstico no garantiza compatibilidad: contrasta versiones y GPU con la guía oficial de Unsloth.")
if __name__ == "__main__":
    main()
