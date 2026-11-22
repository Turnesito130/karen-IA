# Modelo base candidato para Karen (provisional)

## Candidato principal: `unsloth/SmolLM3-3B`

Se propone como **candidato para la primera prueba**, no como modelo aprobado definitivamente.

- Tamaño declarado: 3.000 millones de parámetros.
- Licencia indicada en la ficha: Apache 2.0.
- Idiomas nativos indicados: inglés, francés, español, alemán, italiano y portugués.
- Hay una copia publicada por Unsloth, lo que permite evaluar el ajuste con su ecosistema.
- Requiere una versión moderna de Transformers (la ficha del modelo indica 4.53.0 o superior).

Fuentes oficiales consultadas:
- Ficha del modelo de Unsloth: https://huggingface.co/unsloth/SmolLM3-3B
- Ficha de SmolLM3: https://huggingface.co/HuggingFaceTB/SmolLM3-3B

## Por qué se propone

Karen debe conversar principalmente en español. SmolLM3 declara soporte nativo para español y tiene licencia Apache 2.0. Es una base de pesos abiertos que se descarga y ejecuta localmente; no es una API de conversación ni un servicio de inferencia externo.

## Qué falta antes de aprobarlo

1. Descargarlo en un entorno de GPU.
2. Comprobar que la versión de Unsloth instalada puede cargarlo desde una carpeta local.
3. Ejecutar un ensayo pequeño de QLoRA y verificar consumo de VRAM.
4. Evaluar el modelo base y el adaptado con el mismo conjunto reservado.
5. Revisar manualmente respuestas en español, razonamiento, honestidad y seguridad.

**No se ha descargado ni entrenado este modelo todavía.** La ficha del modelo no garantiza que una GPU gratuita concreta tenga memoria suficiente. Si falla el diagnóstico, se buscará un candidato menor compatible; no se forzará el entrenamiento en CPU.

## Relación con la independencia de Karen

Los pesos del modelo se descargan una vez y pueden ejecutarse localmente con un runtime compatible. El entrenamiento no convierte el modelo en una IA creada desde cero: es una adaptación de un modelo base abierto. Karen seguirá necesitando sus propios sistemas de memoria, herramientas, seguridad, sincronización y evaluación.
