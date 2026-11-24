/* Karen Reasoning Engine 0.1 — motor de revisión local, sin APIs externas. */
(function (root) {
  "use strict";

  function clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function lastUser(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i] && messages[i].role === "user") return clean(messages[i].content);
    }
    return "";
  }

  function inspectAnswer(answer) {
    const text = clean(answer);
    const flags = [];
    if (!text) flags.push("empty");
    if (text.length > 12000) flags.push("too_long");
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length > 2 && new Set(lines).size < lines.length * 0.6) flags.push("repeated_content");
    return { acceptable: flags.length === 0, flags };
  }

  function extractArithmetic(query) {
    let source = clean(query).toLocaleLowerCase("es")
      .replace(/[¿?¡!]/g, "")
      .replace(/^(cu[aá]nto es|cu[aá]nto da|calcula|calcular|resuelve)\s*/i, "")
      .replace(/\b(por)\b/g, "*")
      .replace(/\b(m[aá]s)\b/g, "+")
      .replace(/\b(menos)\b/g, "-")
      .replace(/\b(dividido entre|dividido por|entre)\b/g, "/")
      .replace(/,/g, ".");
    if (!source || source.length > 256 || !/^[\d\s.+*/^()\-]+$/.test(source)) return null;
    return source;
  }

  function extractLastNumber(answer) {
    const matches = clean(answer).replace(/,/g, ".").match(/-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/gi);
    if (!matches) return null;
    const value = Number(matches[matches.length - 1]);
    return Number.isFinite(value) ? value : null;
  }

  function createReasoningEngine({ generate, verifyMath } = {}) {
    if (typeof generate !== "function") throw new TypeError("generate debe ser una función.");
    return Object.freeze({
      async run(messages) {
        if (!Array.isArray(messages) || !messages.length) throw new TypeError("Se necesita un historial de mensajes.");
        const query = lastUser(messages);
        if (!query) throw new TypeError("No se encontró la pregunta del usuario.");
        const draft = clean(await generate(messages));
        const review = inspectAnswer(draft);
        if (!review.acceptable) {
          throw new Error("La respuesta no superó la revisión básica: " + review.flags.join(", "));
        }

        const expression = extractArithmetic(query);
        if (expression && typeof verifyMath === "function") {
          try {
            const expected = await verifyMath(expression);
            const proposed = extractLastNumber(draft);
            if (Number.isFinite(Number(expected)) && proposed !== null) {
              const correct = Number(expected);
              const tolerance = 1e-9 * Math.max(1, Math.abs(correct));
              if (Math.abs(proposed - correct) > tolerance) {
                return Object.freeze({
                  answer: "He detectado una discrepancia al comprobar el cálculo. El resultado correcto es " + correct + ".",
                  status: "corrected",
                  checks: Object.freeze(["non_empty", "length", "independent_math"]),
                  verification: Object.freeze({ expected: correct, proposed, verifiedBy: "karen-local-calculator" })
                });
              }
              return Object.freeze({
                answer: draft,
                status: "verified",
                checks: Object.freeze(["non_empty", "length", "independent_math"]),
                verification: Object.freeze({ expected: correct, proposed, verifiedBy: "karen-local-calculator" })
              });
            }
          } catch (_) {
            // Un cálculo que no pueda comprobarse queda expresamente sin verificar.
          }
        }

        return Object.freeze({
          answer: draft,
          status: "unverified",
          checks: Object.freeze(["non_empty", "length", "repetition"]),
          verification: null
        });
      }
    });
  }

  const api = Object.freeze({ createReasoningEngine, inspectAnswer, extractArithmetic });
  root.KarenReasoning = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
