const test = require("node:test");
const assert = require("node:assert/strict");
const { createReasoningEngine, extractArithmetic, inspectAnswer } = require("../js/neural-core/reasoning-engine.js");

test("verifica de forma independiente una respuesta matemática correcta", async () => {
  const engine = createReasoningEngine({ generate: async () => "El resultado es 14.", verifyMath: async () => 14 });
  const result = await engine.run([{ role: "user", content: "¿Cuánto es 2 + 3 * 4?" }]);
  assert.equal(result.status, "verified");
  assert.equal(result.verification.expected, 14);
});

test("corrige una respuesta matemática incorrecta sin fingir que el borrador era correcto", async () => {
  const engine = createReasoningEngine({ generate: async () => "El resultado es 20.", verifyMath: async () => 14 });
  const result = await engine.run([{ role: "user", content: "¿Cuánto es 2 + 3 * 4?" }]);
  assert.equal(result.status, "corrected");
  assert.match(result.answer, /14/);
  assert.equal(result.verification.proposed, 20);
});

test("no declara verificadas las respuestas de conocimiento general", async () => {
  const engine = createReasoningEngine({ generate: async () => "La fotosíntesis transforma energía luminosa." });
  const result = await engine.run([{ role: "user", content: "¿Qué es la fotosíntesis?" }]);
  assert.equal(result.status, "unverified");
  assert.equal(result.verification, null);
});

test("rechaza respuestas vacías", async () => {
  const engine = createReasoningEngine({ generate: async () => "   " });
  await assert.rejects(() => engine.run([{ role: "user", content: "Hola" }]), /revisión básica/);
});

test("extrae solo expresiones aritméticas seguras", () => {
  assert.equal(extractArithmetic("¿Cuánto es 8 por 3 más 2?"), "8 * 3 + 2");
  assert.equal(extractArithmetic("abre mi correo"), null);
});

test("detecta respuestas repetitivas", () => {
  assert.equal(inspectAnswer("Hola\nHola\nHola").acceptable, false);
});
