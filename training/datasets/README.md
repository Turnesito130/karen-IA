# Datos de entrenamiento de Karen

Usa JSONL: un objeto JSON por línea. Copia `raw.example.jsonl` como `raw.jsonl` para empezar.

Campos obligatorios:
- `instruction`: pregunta o instrucción.
- `output`: respuesta objetivo revisada por una persona.
- `approved`: booleano exactamente `true`; no se aceptan ejemplos sin aprobación explícita.

Opcionales: `input` (contexto) y `source` (procedencia verificable).

Buenas prácticas:
- Escribe respuestas correctas y consistentes con las reglas de Karen.
- Incluye variedad de temas, dificultades y casos donde Karen debe reconocer incertidumbre.
- Evita contradicciones, duplicados, datos privados, secretos y material sin licencia.
- No uses respuestas generadas por Karen como verdad de referencia sin revisión humana.
- Mantén un test separado que no se use para entrenar.

El validador excluye filas no aprobadas y duplicados exactos. No puede verificar que una respuesta sea verdadera: eso requiere revisión humana.
