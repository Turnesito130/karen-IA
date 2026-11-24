# Karen · Motor de razonamiento 0.1

## Qué se integra
- El flujo normal de conversación pasa por `KarenReasoning.createReasoningEngine` antes de mostrar la respuesta.
- La revisión local comprueba que la respuesta no esté vacía, no supere el límite previsto y no repita contenido de forma evidente.
- Cuando la pregunta contiene una expresión aritmética simple y segura, el motor pide una comprobación independiente al calculador local de Karen.
- Si el número propuesto no coincide con el cálculo, Karen sustituye el resultado por el valor calculado y marca el estado como `corrected`.
- Los demás temas quedan como `unverified`: una revisión de formato no demuestra que un dato sea verdadero.

## Privacidad y dependencias
Todo el motor se ejecuta en JavaScript en el dispositivo. No añade llamadas a Gemini, ChatGPT, Claude ni a ninguna API de IA. No envía preguntas a servicios externos.

## Pruebas
`tests/reasoning-engine.test.cjs` cubre:
1. Verificación de una respuesta matemática correcta.
2. Corrección de un resultado matemático incorrecto.
3. Respuestas de conocimiento general marcadas como no verificadas.
4. Rechazo de respuestas vacías.
5. Extracción limitada de expresiones aritméticas.
6. Detección básica de repetición.

## Límites actuales
Esta versión no proporciona razonamiento general comparable al de un gran modelo neuronal, no verifica hechos externos y no demuestra que Karen haya aprendido nuevos conocimientos. La comprobación matemática solo se aplica a expresiones que el extractor reconoce sin ambigüedad. El siguiente paso es ampliar los verificadores por dominio, añadir un conjunto de evaluación de preguntas y conectar métricas de calidad al panel de Karen.
