# Experimentos nanoGPT de Karen (CPU)

Este flujo usa el repositorio original [karpathy/nanoGPT](https://github.com/karpathy/nanoGPT) como laboratorio de Transformers pequeños entrenados desde cero. No crea por sí solo el cerebro principal de Karen. El modelo de caracteres aprende patrones del corpus y tiene capacidades muy limitadas; sirve para comprobar el ciclo de datos, entrenamiento, checkpoint y generación.

## Requisitos
- Windows 64-bit, Python 3.10+ y Git.
- 8 GB RAM: usar únicamente la configuración diminuta indicada abajo.
- PyTorch CPU. No requiere NVIDIA/CUDA ni API de IA.
- Para entrenamientos serios de modelos conversacionales, usar después el flujo Unsloth en GPU.

## Preparación (PowerShell, desde la raíz del repo Karen)
```powershell
py -m venv .venv-karen-cpu
.\.venv-karen-cpu\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
python -m pip install numpy
git clone https://github.com/karpathy/nanoGPT.git external/nanoGPT
python training/nanogpt/prepare_nanogpt.py --input training/datasets/raw.jsonl --output-dir external/nanoGPT/data/karen_char
```

El archivo raw.jsonl debe contener ejemplos JSONL con `instruction`, `output` y `approved: true`. No introduzcas secretos ni datos privados de terceros. El preparador exige 10 ejemplos por seguridad técnica, pero eso es insuficiente para obtener un modelo útil.

## Entrenamiento diminuto en CPU
Desde la raíz de nanoGPT:
```powershell
cd external/nanoGPT
python train.py config/train_shakespeare_char.py --dataset=karen_char --device=cpu --compile=False --eval_iters=10 --log_interval=10 --batch_size=4 --block_size=64 --n_layer=2 --n_head=2 --n_embd=64 --dropout=0.0 --max_iters=200 --lr_decay_iters=200 --eval_interval=50 --always_save_checkpoint=True --out_dir=out-karen-cpu
```
Con un corpus muy pequeño puede memorizar ejemplos y generar texto incoherente. El tiempo dependerá del procesador. Si falta memoria, reduce `batch_size` a 2 y `block_size` a 32.

El checkpoint resultante queda en `external/nanoGPT/out-karen-cpu`. Es un artefacto experimental, no compatible directamente con el runtime conversacional de Karen.

## Criterio de aceptación
1. El script de preparación crea train.bin, val.bin, meta.pkl y report.json.
2. nanoGPT termina sin error y guarda un checkpoint.
3. Se conserva el log, la configuración y el hash del corpus.
4. Se prueba generación y se registra explícitamente que el modelo de caracteres no equivale a Karen conversacional.

Este flujo no modifica el código de Karen ni sube los datos a servicios externos. El único acceso de red es clonar nanoGPT y descargar PyTorch; el entrenamiento ocurre localmente.
