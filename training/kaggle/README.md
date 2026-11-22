# Entrenamiento GPU remoto de Karen en Kaggle

Este flujo es para fine-tuning supervisado de un modelo base con Unsloth/LoRA. Kaggle proporciona cómputo remoto sujeto a disponibilidad, cuotas, reglas y cambios del proveedor. No se garantiza una GPU concreta ni sesiones ilimitadas.

## Notebook preparado

El repositorio incluye `training/kaggle/karen-training.ipynb`. Ábrelo en Kaggle, activa una GPU y adjunta como Dataset privado un único `raw.jsonl` con ejemplos revisados y `approved: true`. El notebook clona la rama de Karen, instala y diagnostica el entorno, audita los datos, descarga el candidato `unsloth/SmolLM3-3B`, prepara los splits, ejecuta QLoRA y genera evaluaciones base/adaptada. Se detiene si no hay GPU o si la auditoría detecta problemas.

El candidato es provisional: 3B, Apache 2.0 y soporte declarado de español. Revisa `training/models/README.md` y la ficha https://huggingface.co/unsloth/SmolLM3-3B. El notebook no garantiza que cualquier GPU gratuita tenga VRAM suficiente.

## Preparar el Notebook
1. Abre https://www.kaggle.com/code y crea un Notebook nuevo.
2. En Settings, activa un acelerador GPU si tu cuenta y cuota lo permiten.
3. Añade el repositorio o clona la rama de Karen. Si el repositorio es privado, no pegues un token en una celda, dataset público ni commit. Usa únicamente el mecanismo de secretos privado de Kaggle, si está disponible, o sube un ZIP privado sin credenciales.
4. Asegúrate de que el dataset aprobado raw.jsonl está disponible en el entorno.
5. Revisa la licencia del modelo base y sus términos antes de descargarlo.

## Celdas de ejecución sugeridas
Instalación: seguir primero el instalador oficial compatible con la GPU/runtime de Kaggle: https://docs.unsloth.ai/get-started/installing-unsloth

Después, desde el directorio raíz del repositorio:
```bash
python -m pip install -r training/requirements.txt
python training/prepare_dataset.py --input training/datasets/raw.jsonl --output-dir training/datasets/prepared
python training/check_environment.py
```

Descarga el modelo base desde el hub a una carpeta local dentro de la sesión, comprueba su licencia y luego entrena en modo local/offline. No escribas credenciales dentro de comandos guardados ni del repositorio. El script de Karen exige una carpeta de modelo local y evita resolver modelos remotos por nombre.

```bash
python training/train_unsloth.py \
  --model-path /kaggle/working/base-model \
  --dataset-dir training/datasets/prepared \
  --output-dir /kaggle/working/karen-run \
  --max-seq-length 1024 --rank 8 --epochs 1 \
  --batch-size 1 --grad-accumulation 4 --offline
```

Guarda el directorio completo del resultado como output privado de la sesión: contiene adapter/, run.json y trainer/. Descarga una copia segura antes de que expire la sesión. No subas pesos grandes ni datasets privados a Git.

## Validación obligatoria
- Comprueba que el diagnóstico detecta la GPU y que el entrenamiento termina.
- Ejecuta evaluación sobre test separado y revisa manualmente las respuestas.
- Compara base y adaptado con los mismos ejemplos; no uses test para entrenar.
- No declares que Karen ha mejorado solo por bajar la loss.
- Registra GPU, versiones, modelo base exacto, licencia, commit de Karen, dataset hash, parámetros y métricas.

## Límites y privacidad
Kaggle es un proveedor externo: los datos y modelos que subas se procesan en su infraestructura. No subas datos personales, conversaciones privadas, contraseñas ni información sensible. Si se requiere privacidad estrictamente local, usa hardware propio compatible. El entrenamiento remoto no significa que Karen dependa de una API para responder: el adaptador descargado puede ejecutarse localmente con un runtime compatible.
