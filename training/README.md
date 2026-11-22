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

### Generar candidatos sin inventar nuevos hechos

Para ampliar las instrucciones a partir de fichas de conocimiento ya revisadas, crea un JSONL con `concept`, `definition`, `source` y `approved: true`. Después ejecuta:

```bash
python training/generate_candidates.py --input training/datasets/approved-facts.jsonl --output training/datasets/candidates.jsonl
```

El generador crea variantes de preguntas usando exactamente la definición proporcionada. **Todos los resultados salen con `approved: false`** y requieren revisión humana. No genera conocimiento nuevo ni comprueba que una ficha sea verdadera. Solo después de revisar cada fila se puede aprobar manualmente para incorporarla a `raw.jsonl`.


```bash
python training/prepare_dataset.py --input training/datasets/raw.jsonl --output-dir training/datasets/prepared
```

Revisa `report.json` y los tres ficheros. Se requieren al menos 10 ejemplos válidos para crear splits no vacíos; aun así, las métricas con pocos datos no son representativas. Un ajuste serio necesita muchos más ejemplos diversos y revisados.

Antes de preparar los splits, ejecuta también la auditoría:

```bash
python training/audit_dataset.py --input training/datasets/raw.jsonl --output training/datasets/audit.json
```

La auditoría detecta fuentes ausentes, ejemplos no aprobados, pares repetidos y preguntas muy parecidas con respuestas diferentes. No verifica hechos ni elimina ejemplos automáticamente; revisa sus avisos manualmente. Para detener el proceso si encuentra avisos, añade `--fail-on-issues`.

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

## Instrucciones comunes y benchmark reservado

El prompt de sistema compartido está en `training/karen_prompt.py`; el entrenador y el evaluador usan exactamente las mismas instrucciones de identidad, honestidad y seguridad. El benchmark independiente `training/evaluation/karen-benchmark-v1.jsonl` contiene casos en español de razonamiento, matemáticas, incertidumbre, privacidad y acciones. No se incluye en los splits de entrenamiento. El Notebook genera respuestas base y adaptadas para ese benchmark y deben revisarse manualmente.

## Evaluación
```bash
python training/evaluate_model.py --model-path /ruta/al/modelo-base-local --test training/datasets/prepared/test.jsonl --output training/evaluation/base.jsonl
python training/evaluate_model.py --model-path /ruta/al/modelo-base-local --adapter training/checkpoints/karen-v1/adapter --test training/datasets/prepared/test.jsonl --output training/evaluation/adapted.jsonl
```

Compara ambas salidas manualmente con el mismo test. Usa la rúbrica de `training/EVALUATION_RUBRIC.md` para puntuar exactitud, honestidad, seguimiento de instrucciones, seguridad y claridad. No uses test para seguir entrenando. La pérdida de entrenamiento no demuestra por sí sola que Karen sea más capaz.

## Registro progresivo y promoción segura

Cada entrenamiento debe conservarse como una versión separada. No se sobrescribe el modelo anterior ni se activa automáticamente un adaptador recién entrenado.

1. Genera las respuestas del modelo base y del adaptado sobre exactamente el mismo conjunto test.
2. Una persona puntúa ambos resultados con la rúbrica. Resume las medias de 0 a 2 en una copia de `training/evaluation-summary.template.json`; indica el número real de ejemplos revisados y pon `reviewed_by_human: true` solo después de revisarlos.
3. Registra la ejecución evaluada:

```bash
python training/progressive_training.py register \
  --run-dir training/checkpoints/karen-v1 \
  --evaluation training/evaluation/karen-v1-summary.json
```

4. Lista las versiones y sus estados:

```bash
python training/progressive_training.py list
```

5. Solo si la candidata supera las reglas, promuévela explícitamente:

```bash
python training/progressive_training.py promote --version karen-0001
```

La puerta de promoción bloquea puntuaciones inválidas, evaluaciones no revisadas por una persona, cualquier error crítico, regresiones en honestidad o seguridad y una media global inferior a la del modelo base. El registro calcula el SHA-256 del adaptador y vuelve a comprobarlo antes de activarlo. La versión anterior queda marcada como `previous`; sus archivos no se borran.

El registro de versiones es local al equipo donde se ejecute. Haz copias de seguridad de `training/registry/versions.json` y de los directorios de checkpoints. Esta herramienta no conecta el adaptador al chat: la activación en el runtime de Karen es una fase independiente y requiere pruebas de compatibilidad.

Pruebas sin GPU ni dependencias de ML:

```bash
python -m unittest discover -s training/tests -v
```

## Exportación opcional
```bash
python training/export_model.py --adapter training/checkpoints/karen-v1/adapter --format merged_16bit --output training/exports/karen-v1
```

La exportación puede necesitar mucha memoria y disco. GGUF depende de la compatibilidad de la versión de Unsloth instalada.

## Estado verificable
Los scripts pueden comprobarse sintácticamente sin GPU; eso no equivale a instalar Unsloth ni completar un entrenamiento. El entrenamiento solo se considera verificado tras ejecutarlo en hardware compatible, conservar logs y revisar respuestas. Los datos y artefactos pesados se excluyen de Git.

## Entrenamiento local experimental con nanoGPT (CPU)

Para el Windows conocido (Intel UHD, 8 GB RAM, sin CUDA NVIDIA) hay un flujo experimental de caracteres:
- Guía: `training/nanogpt/README.md`
- Preparador del corpus: `training/nanogpt/prepare_nanogpt.py`
- Lanzador PowerShell: `training/run_local_nanogpt.ps1`
- Dependencias auxiliares: `training/requirements-local.txt`

Desde la raíz del repositorio, prepara primero los datos y ejecuta:

```powershell
powershell -ExecutionPolicy Bypass -File training/run_local_nanogpt.ps1
```

Esto clona nanoGPT en `external/nanoGPT` y ejecuta una configuración diminuta en CPU. Es un experimento de aprendizaje del pipeline; no produce un asistente conversacional comparable a un LLM.

## Entrenamiento remoto con GPU en Kaggle

Abre `training/kaggle/karen-training.ipynb` en Kaggle. El Notebook ya automatiza clonación de la rama, diagnóstico GPU, auditoría y preparación de datos, descarga del candidato provisional `unsloth/SmolLM3-3B`, fine-tuning QLoRA y evaluación base/adaptada. Revisa `training/models/README.md` antes de aceptar el candidato. La GPU y el tiempo de sesión dependen de la disponibilidad y cuotas de Kaggle. Los datos enviados a Kaggle se procesan en infraestructura de terceros: no subas datos sensibles ni secretos. El Notebook se detiene si no hay GPU o datos aprobados suficientes.

## Ejemplos iniciales

`training/datasets/starter_examples.template.jsonl` contiene ejemplos de partida con `approved: false`. Revísalos, corrígelos y cópialos a `training/datasets/raw.jsonl` cambiando a `approved: true` únicamente los que apruebes. No se consideran aprobados automáticamente. Añade muchos más ejemplos diversos y verificados antes de un ajuste serio.
