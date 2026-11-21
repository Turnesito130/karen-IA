$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root
if (-not (Test-Path ".venv-karen-cpu\Scripts\python.exe")) {
  py -m venv .venv-karen-cpu
}
$Py = Join-Path $Root ".venv-karen-cpu\Scripts\python.exe"
& $Py -m pip install --upgrade pip
& $Py -m pip install numpy
# PyTorch CPU: no CUDA/NVIDIA necesaria.
& $Py -m pip install torch --index-url https://download.pytorch.org/whl/cpu
if (-not (Test-Path "external\nanoGPT\train.py")) {
  New-Item -ItemType Directory -Force "external" | Out-Null
  git clone https://github.com/karpathy/nanoGPT.git external/nanoGPT
}
if (-not (Test-Path "training\datasets\raw.jsonl")) {
  throw "Falta training\datasets\raw.jsonl. Copia raw.example.jsonl y añade ejemplos revisados con approved=true."
}
& $Py training/nanogpt/prepare_nanogpt.py --input training/datasets/raw.jsonl --output-dir external/nanoGPT/data/karen_char
Push-Location external/nanoGPT
try {
  & $Py train.py config/train_shakespeare_char.py --dataset=karen_char --device=cpu --compile=False --eval_iters=10 --log_interval=10 --batch_size=4 --block_size=64 --n_layer=2 --n_head=2 --n_embd=64 --dropout=0.0 --max_iters=200 --lr_decay_iters=200 --eval_interval=50 --always_save_checkpoint=True --out_dir=out-karen-cpu
} finally { Pop-Location }
Write-Host "Experimento terminado. Revisa external\nanoGPT\out-karen-cpu. No es todavía el modelo conversacional de Karen."
