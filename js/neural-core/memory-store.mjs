/**
 * E.D.-2 Structured Memory v0.1
 * Memoria local con procedencia, confianza, fechas, consentimiento y búsqueda.
 * No interpreta recuerdos como instrucciones ejecutables.
 */
const DEFAULT_KEY = "ed_structured_memory_v1";
const TYPES = new Set(["fact", "preference", "goal", "knowledge", "hypothesis", "event", "note"]);
const STATUSES = new Set(["active", "uncertain", "superseded"]);

function normalizeText(value, max = 1200) {
  if (typeof value !== "string") throw new TypeError("El contenido debe ser texto.");
  const clean = value.trim();
  if (!clean || clean.length > max) throw new TypeError("Contenido vacío o demasiado largo.");
  return clean;
}
function tokens(value) {
  return normalizeText(value, 3000).toLocaleLowerCase("es").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{2,}/g) || [];
}
function safeConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

export function createMemoryStore({ storage, key = DEFAULT_KEY, now = () => new Date().toISOString() } = {}) {
  const backend = storage || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!backend || typeof backend.getItem !== "function" || typeof backend.setItem !== "function") {
    throw new TypeError("Se necesita un almacenamiento compatible con localStorage.");
  }
  function read() {
    try {
      const parsed = JSON.parse(backend.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === "string" && typeof item.content === "string") : [];
    } catch { return []; }
  }
  function write(items) {
    backend.setItem(key, JSON.stringify(items.slice(-1000)));
  }
  function remember(input = {}) {
    if (input.consent !== true) throw new Error("Se necesita consentimiento explícito para guardar un recuerdo.");
    const content = normalizeText(input.content);
    const type = TYPES.has(input.type) ? input.type : "note";
    const source = normalizeText(input.source || "user_explicit", 160);
    const confidence = safeConfidence(input.confidence ?? 0.8);
    const items = read();
    const duplicate = items.find(item => item.status === "active" && item.content.toLocaleLowerCase("es") === content.toLocaleLowerCase("es"));
    if (duplicate) {
      duplicate.updatedAt = now();
      duplicate.source = source;
      duplicate.confidence = confidence;
      write(items);
      return { ...duplicate, duplicate: true };
    }
    const item = {
      id: "edmem-" + Math.random().toString(36).slice(2, 10),
      content, type, source, confidence, status: "active",
      createdAt: now(), updatedAt: now()
    };
    items.push(item);
    write(items);
    return { ...item };
  }
  function similarity(a, b) {
    const left = new Set(tokens(a)), right = new Set(tokens(b));
    if (!left.size || !right.size) return 0;
    let common = 0;
    for (const token of left) if (right.has(token)) common++;
    return common / (left.size + right.size - common);
  }
  function findConflicts(input, { type, threshold = 0.55 } = {}) {
    const content = normalizeText(input);
    if (typeof threshold !== "number" || threshold < 0.2 || threshold > 1) throw new RangeError("Umbral de conflicto no válido.");
    const targetType = TYPES.has(type) ? type : null;
    return read().filter(item => item.status === "active" && item.content.toLocaleLowerCase("es") !== content.toLocaleLowerCase("es") && (!targetType || item.type === targetType))
      .map(item => ({ ...item, similarity: Number(similarity(content, item.content).toFixed(3)) }))
      .filter(item => item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);
  }
  function resolveConflict(id, supersedeIds = []) {
    if (!Array.isArray(supersedeIds) || supersedeIds.length > 20) throw new TypeError("Lista de recuerdos a sustituir no válida.");
    const items = read(), target = items.find(item => item.id === id);
    if (!target) return false;
    const ids = new Set(supersedeIds.filter(value => typeof value === "string" && value !== id));
    for (const item of items) if (ids.has(item.id) && item.type === target.type) {
      item.status = "superseded";
      item.updatedAt = now();
    }
    target.status = "active";
    target.updatedAt = now();
    write(items);
    return true;
  }
  function search(query, { limit = 8, includeUncertain = false } = {}) {
    const queryTokens = [...new Set(tokens(query))];
    if (!queryTokens.length) return [];
    return read().map(item => {
      if (item.status !== "active" && !(includeUncertain && item.status === "uncertain")) return null;
      const contentTokens = new Set(tokens(item.content + " " + item.type));
      const matches = queryTokens.filter(token => contentTokens.has(token)).length;
      if (!matches) return null;
      const coverage = matches / queryTokens.length;
      const precision = matches / Math.max(1, contentTokens.size);
      const lexical = coverage * 0.75 + precision * 0.25;\n      const ageDays = Math.max(0, (Date.parse(now()) - Date.parse(item.updatedAt || item.createdAt)) / 86400000);\n      const freshness = Number.isFinite(ageDays) ? 1 / (1 + ageDays / 365) : 0.8;\n      const confidence = safeConfidence(item.confidence);\n      return { ...item, relevance: Number((lexical * (0.75 + confidence * 0.25) * (0.9 + freshness * 0.1)).toFixed(3)) };
    }).filter(Boolean).sort((a, b) => b.relevance - a.relevance || b.updatedAt.localeCompare(a.updatedAt)).slice(0, Math.max(1, Math.min(20, limit)));
  }
  function update(id, patch = {}) {
    const items = read();
    const index = items.findIndex(item => item.id === id);
    if (index < 0) return null;
    const old = items[index];
    const next = { ...old };
    if (patch.content !== undefined) next.content = normalizeText(patch.content);
    if (patch.type !== undefined) {
      if (!TYPES.has(patch.type)) throw new TypeError("Tipo de recuerdo no válido.");
      next.type = patch.type;
    }
    if (patch.confidence !== undefined) next.confidence = safeConfidence(patch.confidence);
    if (patch.status !== undefined) {
      if (!STATUSES.has(patch.status)) throw new TypeError("Estado de recuerdo no válido.");
      next.status = patch.status;
    }
    if (patch.source !== undefined) next.source = normalizeText(patch.source, 160);
    next.updatedAt = now();
    items[index] = next;
    write(items);
    return { ...next };
  }
  function forget(id) {
    const items = read();
    const next = items.filter(item => item.id !== id);
    write(next);
    return next.length !== items.length;
  }
  function list({ status = "active", limit = 100 } = {}) {
    return read().filter(item => status === "all" || item.status === status).slice(-Math.max(1, Math.min(500, limit))).map(item => ({ ...item }));
  }
  function context(query, { limit = 5, maxChars = 1400 } = {}) {
    const found = search(query, { limit });
    let result = "";
    for (const item of found) {
      const line = "- [" + item.type + "; confianza " + Math.round(item.confidence * 100) + "%; fuente " + item.source + "] " + item.content;
      if (result.length + line.length > maxChars) break;
      result += (result ? "\n" : "") + line;
    }
    return result;
  }
  function forgetMatching(query, { limit = 100 } = {}) {
    const queryTokens = [...new Set(tokens(query))];
    if (!queryTokens.length) return 0;
    const items = read();
    const matches = items.filter(item => {
      const itemTokens = new Set(tokens(item.content));
      return queryTokens.every(token => itemTokens.has(token));
    }).slice(0, Math.max(1, Math.min(100, limit)));
    const ids = new Set(matches.map(item => item.id));
    write(items.filter(item => !ids.has(item.id)));
    return ids.size;
  }
  function clear({ consent = false } = {}) {
    if (consent !== true) throw new Error("Borrar toda la memoria requiere confirmación explícita.");
    const count = read().length;
    write([]);
    return count;
  }
  function health() {
    try {
      const marker = "__ed_memory_probe__";
      backend.setItem(key + ":probe", marker);
      const ok = backend.getItem(key + ":probe") === marker;
      backend.removeItem(key + ":probe");
      return { available: ok, count: read().length, limit: 1000, persistent: true };
    } catch {
      return { available: false, count: read().length, limit: 1000, persistent: false };
    }
  }
  function exportJSON() {
    return JSON.stringify({ format: "ed2-structured-memory", version: 1, memories: read() }, null, 2);
  }
  function importJSON(input, { consent = false } = {}) {
    if (consent !== true) throw new Error("La importación necesita confirmación explícita.");
    const parsed = typeof input === "string" ? JSON.parse(input) : input;
    if (!parsed || parsed.format !== "ed2-structured-memory" || parsed.version !== 1 || !Array.isArray(parsed.memories)) {
      throw new TypeError("Copia de memoria no válida.");
    }
    const current = read();
    const known = new Set(current.map(item => item.id));
    if (parsed.memories.length > 1000) throw new RangeError("La copia supera el máximo de 1000 recuerdos.");
    const incoming = [];
    const seen = new Set(known);
    for (const item of parsed.memories) {
      if (!item || typeof item.id !== "string" || item.id.length > 100 ||
          typeof item.content !== "string" || !item.content.trim() || item.content.length > 1200 ||
          !TYPES.has(item.type) || typeof item.source !== "string" || item.source.length > 160 ||
          !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1 ||
          !STATUSES.has(item.status) || typeof item.createdAt !== "string" ||
          typeof item.updatedAt !== "string" || seen.has(item.id)) continue;
      seen.add(item.id);
      incoming.push({ id:item.id, content:item.content.trim(), type:item.type, source:item.source,
        confidence:item.confidence, status:item.status, createdAt:item.createdAt, updatedAt:item.updatedAt });
    }
    write([...current, ...incoming].slice(-1000));
    return incoming.length;
  }
  return Object.freeze({ remember, search, findConflicts, resolveConflict, update, forget, forgetMatching, clear, list, context, health, exportJSON, importJSON });
}
