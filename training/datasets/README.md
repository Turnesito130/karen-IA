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


## Dataset semilla de Karen v1

El archivo `karen-seed-v1.review.jsonl` contiene 40 ejemplos candidatos escritos para iniciar la curación del dataset.

**Todos están marcados `approved: false` y `review_status: pending`. No están autorizados para entrenamiento.** Son borradores originales de trabajo, no una fuente externa auditada ni una garantía de verdad.

### Revisión recomendada
1. Revisa cada línea JSONL individualmente.
2. Comprueba que la instrucción sea clara y que la salida responda exactamente a ella.
3. Verifica afirmaciones técnicas con documentación primaria cuando proceda.
4. Corrige o elimina ejemplos ambiguos, repetidos, incorrectos o inseguros.
5. Solo entonces cambia `approved` a `true` y `review_status` a `approved`.
6. Ejecuta la auditoría y el preparador. Conserva un conjunto de test independiente.

La semilla cubre honestidad, memoria, razonamiento, autonomía, programación, entrenamiento de modelos, seguridad, dispositivos e interacción. Es pequeña y no basta para entrenar un modelo conversacional general ni para demostrar una mejora.

No añadas datos personales sensibles, contraseñas, conversaciones privadas de terceros ni material sin derechos de uso.
