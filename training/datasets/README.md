# Formato de datos de Karen

Crea `raw.jsonl` con **un objeto JSON por línea**:

```json
{"instruction":"Explica qué es la fotosíntesis.","input":"","output":"La fotosíntesis es el proceso por el que...","source":"libro de biología, capítulo 3","approved":true}
{"instruction":"Calcula el resultado y explica los pasos.","input":"12 × 8","output":"12 × 8 = 96. Multiplico 12 por 8.","source":"ejemplo propio revisado","approved":true}
```

Campos obligatorios:
- `instruction`: petición o pregunta.
- `output`: respuesta de referencia revisada.
- `approved`: debe ser exactamente `true`.

Campos opcionales:
- `input`: contexto adicional.
- `source`: procedencia comprobable.

No uses datos personales, secretos, material sin licencia ni respuestas inventadas. Evita meter la misma pregunta con respuestas contradictorias. La herramienta detecta duplicados exactos y separa por huella de ejemplo para evitar que una copia exacta aparezca a la vez en entrenamiento y evaluación.

El directorio `prepared/` se genera automáticamente y no debe editarse a mano.
