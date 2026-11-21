# Karen · laboratorio de entrenamiento con Unsloth

Este directorio prepara datos, comprueba el entorno, ajusta un modelo base local con LoRA/QLoRA, evalúa el resultado y permite exportarlo. Es una vía de fine-tuning, no una IA fundacional creada desde cero.

## Qué hace y qué no hace
- Unsloth optimiza el ajuste de modelos compatibles; no es el cerebro ni el runtime de Karen.
- El flujo realiza SFT supervisado sobre un modelo base ya existente.
- No llama a APIs de ChatGPT, Gemini, Claude ni a servicios externos de inferencia.
- `--offline` exige que el modelo esté descargado localmente y activa los indicadores offline de Hugging Face.
- El adaptador resultante no está conectado automáticamente al chat de Karen; la integración requiere un runtime compatible y pruebas propias.

## Requisitos y hardware
Python 3.10–3.12 es una referencia práctica. La combinación PyTorch/CUDA/Unsloth/Triton/TRL depende del sistema y de la GPU. No existe una instalación universal segura: sigue la guía oficial y su selector de instalación: https://docs.unsloth.ai/get-started/installing-unsloth

Para QLoRA NVIDIA hace falta una GPU CUDA compatible y VRAM suficiente para el modelo. Unsloth reduce memoria, pero no elimina ese requisito. El Chromebook bloqueado y el portátil conocido con 8 GB de RAM sin GPU NVIDIA dedicada no son plataformas realistas para entrenar un LLM con Unsloth. Sí se pueden preparar y validar datos en CPU y entrenar luego en un equipo GPU compatible o entorno GPU autorizado.

## Instalación y diagnóstico
Desde la raíz del repositorio:

```bash
python -m venv .venv
# Activa .venv según tu sistema
python -m pip install --upgrade pip
python -m pip install -r training/requirements.txt
# Instala Unsloth siguiendo su guía oficial y la combinación PyTorch/CUDA adecuada.
python training/check_environment.py
```

No pegues tokens privados ni claves en scripts o en Git.

## Datos
1. Copia `training/datasets/raw.example.jsonl` a `training/datasets/raw.jsonl`.
2. Añade respuestas correctas, revisadas y autorizadas.
3. Cada línea debe contener `instruction`, `output` y `approved: true`; `input` y `source` son opcionales.
4. No incluyas contraseñas, datos personales sensibles, conversaciones de terceros ni material sin derechos de uso.
5. La aprobación debe ser humana, nunca automática.

```bash
python training/prepare_dataset.py --input training/datasets/raw.jsonl --output-dir training/datasets/prepared
```

Revisa `report.json` y los tres ficheros. Se requieren al menos 10 ejemplos válidos para crear splits no vacíos; aun así, las métricas con pocos datos no son representativas. Un ajuste serio necesita muchos más ejemplos diversos y revisados.

## Entrenamiento
```bash
python training/train_unsloth.py \
  --model-path /ruta/al/modelo-base-local \
  --dataset-dir training/datasets/prepared \
  --output-dir training/checkpoints/karen-v1 \
  --offline
```

Empieza con una ejecución pequeña. Ajusta longitud, rango LoRA, épocas y batch según modelo y VRAM. El script guarda un adaptador LoRA y configuración. No sobrescribe salidas existentes salvo que se indique `--overwrite`.

También puedes copiar y editar `training/config.example.json` y ejecutar `python training/train_unsloth.py --config training/mi-config.json`. Los argumentos de la línea de comandos prevalecen sobre los valores del JSON.

## Evaluación
```bash
python training/evaluate_model.py --model-path /ruta/al/modelo-base-local --test training/datasets/prepared/test.jsonl --output training/evaluation/base.jsonl
python training/evaluate_model.py --model-path /ruta/al/modelo-base-local --adapter training/checkpoints/karen-v1/adapter --test training/datasets/prepared/test.jsonl --output training/evaluation/adapted.jsonl
```

Compara ambas salidas manualmente con el mismo test. Usa la rúbrica de `training/EVALUATION_RUBRIC.md` para puntuar exactitud, honestidad, seguimiento de instrucciones, seguridad y claridad. No uses test para seguir entrenando. La pérdida de entrenamiento no demuestra por sí sola que Karen sea más capaz.

## Exportación opcional
```bash
python training/export_model.py --adapter training/checkpoints/karen-v1/adapter --format merged_16bit --output training/exports/karen-v1
```

La exportación puede necesitar mucha memoria y disco. GGUF depende de la compatibilidad de la versión de Unsloth instalada.

## Estado verificable
Los scripts pueden comprobarse sintácticamente sin GPU; eso no equivale a instalar Unsloth ni completar un entrenamiento. El entrenamiento solo se considera verificado tras ejecutarlo en hardware compatible, conservar logs y revisar respuestas. Los datos y artefactos pesados se excluyen de Git.
