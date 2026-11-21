# Karen Training Toolkit

Herramientas experimentales para preparar datos, validar calidad, dividir conjuntos sin mezclar ejemplos y ajustar **un modelo abierto compatible** mediante Unsloth.

## Separación de componentes

- El núcleo JavaScript de Karen sigue funcionando por separado y no necesita Python.
- Unsloth es una herramienta opcional de entrenamiento/fine-tuning; no es el cerebro de Karen ni una API de inferencia.
- Esta vía ajusta un modelo base preexistente. No equivale a entrenar un modelo fundacional desde cero.
- El flujo está preparado para usar un modelo descargado/local. No descarga modelos automáticamente ni llama a APIs de IA.

## Requisitos

Python 3.10–3.12 recomendado y entorno compatible con la versión de PyTorch/Unsloth elegida. Para entrenamientos útiles suele hacer falta una GPU NVIDIA compatible y memoria suficiente. El Chromebook bloqueado y un portátil con 8 GB de RAM no son equipos adecuados para este entrenamiento.

Instalación: sigue primero las instrucciones oficiales de Unsloth para tu sistema: https://docs.unsloth.ai/get-started/installing-unsloth

Después instala las dependencias de preparación:

```bash
python -m venv .venv
# activar el entorno según tu sistema
pip install -r training/requirements.txt
```

Instala Unsloth según su guía oficial en el entorno compatible. No instales paquetes CUDA/PyTorch al azar: deben coincidir con el hardware y el sistema.

## Flujo de trabajo

1. Añade ejemplos revisados a `training/datasets/raw.jsonl` (mira `datasets/README.md`).
2. Ejecuta el validador y separador:

```bash
python training/prepare_dataset.py --input training/datasets/raw.jsonl --output-dir training/datasets/prepared
```

3. Revisa los informes y los ficheros `train.jsonl`, `validation.jsonl` y `test.jsonl`. No entrenes hasta corregir los avisos y verificar la procedencia de los datos.
4. Ajusta un modelo que ya esté descargado en disco:

```bash
python training/train_unsloth.py --model-path /ruta/al/modelo-local --dataset-dir training/datasets/prepared --output-dir training/checkpoints/karen-lora --offline
```

5. Evalúa manualmente el adaptador y compáralo con el modelo base usando preguntas reservadas en el conjunto test. No uses los ejemplos de test para entrenar.

## Seguridad y honestidad

- Solo se aceptan ejemplos con `approved: true`; el programa no aprueba datos por sí solo.
- No incluyas contraseñas, datos privados, conversaciones de terceros ni material sin derechos de uso.
- No se suben datos a ningún servicio. El entrenamiento se ejecuta en la máquina configurada.
- El script requiere una ruta de modelo local. No selecciona ni descarga modelos por su cuenta.
- El adaptador LoRA no se conecta automáticamente al chat de Karen. Hace falta un runtime compatible y una integración posterior, probada por separado.
- Las pérdidas de entrenamiento no demuestran por sí solas que Karen razone mejor. Hay que medir calidad en preguntas no vistas.
- Haz copias de seguridad antes de reemplazar modelos o checkpoints.

## Estado

Toolkit inicial. Los scripts pueden validarse sintácticamente sin instalar Unsloth, pero el entrenamiento real solo se considera verificado después de ejecutarlo en hardware compatible y evaluar el resultado.
