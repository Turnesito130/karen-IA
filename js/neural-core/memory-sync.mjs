/**
 * Karen Memory Sync Protocol v0.1
 *
 * Synchronization core with optimistic concurrency. It deliberately does not
 * implement a network server or authentication: the host application must
 * provide an authenticated, encrypted transport with atomic compare-and-swap.
 *
 * Deletions are not propagated in v0.1 because the current memory store does
 * not retain deletion tombstones. A sync never silently deletes local data.
 */
const FORMAT = "karen-memory-sync";
const VERSION = 1;
const MAX_MEMORIES = 1000;

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function cloneMemory(item) {
  if (!plainObject(item) || typeof item.id !== "string" || !item.id || item.id.length > 100
    || typeof item.content !== "string" || !item.content.trim() || item.content.length > 1200
    || !["fact","preference","goal","knowledge","hypothesis","event","note"].includes(item.type)
    || typeof item.source !== "string" || item.source.length > 160
    || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1
    || !["active","uncertain","superseded"].includes(item.status)
    || typeof item.createdAt !== "string" || typeof item.updatedAt !== "string") {
    throw new TypeError("El paquete contiene un recuerdo no válido.");
  }
  return { id:item.id, content:item.content.trim(), type:item.type, source:item.source,
    confidence:item.confidence, status:item.status, createdAt:item.createdAt, updatedAt:item.updatedAt };
}
function validateEnvelope(value) {
  if (!plainObject(value) || value.format !== FORMAT || value.version !== VERSION
    || typeof value.deviceId !== "string" || !value.deviceId.trim() || value.deviceId.length > 120
    || typeof value.exportedAt !== "string" || !Array.isArray(value.memories)
    || value.memories.length > MAX_MEMORIES) {
    throw new TypeError("Paquete de sincronización no válido o incompatible.");
  }
  const seen = new Set();
  const memories = value.memories.map(cloneMemory);
  for (const item of memories) {
    if (seen.has(item.id)) throw new TypeError("El paquete contiene identificadores duplicados.");
    seen.add(item.id);
  }
  return { format:FORMAT, version:VERSION, deviceId:value.deviceId.trim(),
    exportedAt:value.exportedAt, memories };
}
function fingerprint(value) {
  let hash = 2166136261;
  for (let i=0;i<value.length;i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash,16777619); }
  return (hash >>> 0).toString(36);
}
function mergeEnvelopes(localInput, remoteInput, { deviceId, now }) {
  const local = validateEnvelope(localInput), remote = validateEnvelope(remoteInput);
  const byId = new Map(local.memories.map(item => [item.id, item]));
  const conflicts = [];
  let added = 0, updated = 0;
  for (const incoming of remote.memories) {
    const current = byId.get(incoming.id);
    if (!current) { byId.set(incoming.id, incoming); added++; continue; }
    if (current.content === incoming.content && current.type === incoming.type) {
      if (Date.parse(incoming.updatedAt) > Date.parse(current.updatedAt)) {
        byId.set(incoming.id, incoming); updated++;
      }
      continue;
    }
    const signature = incoming.id + "|" + incoming.content + "|" + incoming.updatedAt + "|" + remote.deviceId;
    const conflictId = (incoming.id.slice(0, 72) + "-conflict-" + fingerprint(signature)).slice(0, 100);
    if (!byId.has(conflictId)) {
      byId.set(conflictId, { ...incoming, id:conflictId, status:"uncertain",
        source:"sync_conflict:" + remote.deviceId, updatedAt:now() });
      conflicts.push({ originalId:incoming.id, preservedAs:conflictId });
      added++;
    }
    const localConflictId = (current.id.slice(0, 72) + "-conflict-" + fingerprint(current.id + "|" + current.content + "|" + current.updatedAt + "|" + local.deviceId)).slice(0,100);
    if (!byId.has(localConflictId)) {
      byId.set(localConflictId, { ...current, id:localConflictId, status:"uncertain",
        source:"sync_conflict:" + local.deviceId, updatedAt:now() });
      conflicts.push({ originalId:current.id, preservedAs:localConflictId });
      added++;
    }
    byId.set(incoming.id, { ...current, status:"uncertain" });
  }
  const memories = [...byId.values()].sort((a,b)=>a.id.localeCompare(b.id));
  if (memories.length > MAX_MEMORIES) throw new RangeError("La sincronización superaría el límite de 1000 recuerdos.");
  return {
    envelope:{ format:FORMAT, version:VERSION, deviceId, exportedAt:now(), memories },
    added, updated, conflicts,
    note:"Las eliminaciones no se sincronizan en esta versión; no se ha borrado ningún recuerdo."
  };
}

export function createMemorySync({ memory, transport, deviceId, now=()=>new Date().toISOString(), maxRetries=3 } = {}) {
  if (!memory || typeof memory.exportJSON !== "function" || typeof memory.importJSON !== "function")
    throw new TypeError("Se necesita una memoria compatible con exportJSON/importJSON.");
  if (!transport || typeof transport.read !== "function" || typeof transport.compareAndSwap !== "function")
    throw new TypeError("El transporte debe implementar read() y compareAndSwap().");
  if (typeof deviceId !== "string" || !deviceId.trim() || deviceId.length > 120)
    throw new TypeError("Se necesita un identificador de dispositivo válido.");
  if (!Number.isInteger(maxRetries) || maxRetries < 1 || maxRetries > 10)
    throw new RangeError("maxRetries debe estar entre 1 y 10.");

  function localEnvelope() {
    const data = JSON.parse(memory.exportJSON());
    if (!data || !Array.isArray(data.memories)) throw new TypeError("La exportación local no es válida.");
    return validateEnvelope({ format:FORMAT, version:VERSION, deviceId, exportedAt:now(), memories:data.memories });
  }
  async function preview() {
    const remote = await transport.read();
    if (!remote || (remote.revision !== null && typeof remote.revision !== "string"))
      throw new TypeError("El servidor devolvió una revisión no válida.");
    if (remote.envelope === null) return { added:0, updated:0, conflicts:[], localCount:localEnvelope().memories.length, remoteEmpty:true };
    const merged = mergeEnvelopes(localEnvelope(), remote.envelope, { deviceId, now });
    return { added:merged.added, updated:merged.updated, conflicts:merged.conflicts,
      localCount:localEnvelope().memories.length, mergedCount:merged.envelope.memories.length, note:merged.note };
  }
  async function sync({ dryRun=false } = {}) {
    if (typeof dryRun !== "boolean") throw new TypeError("dryRun debe ser booleano.");
    for (let attempt=1; attempt<=maxRetries; attempt++) {
      const remote = await transport.read();
      if (!remote || (remote.revision !== null && typeof remote.revision !== "string"))
        throw new TypeError("El servidor devolvió una revisión no válida.");
      const local = localEnvelope();
      const remoteEnvelope = remote.envelope === null
        ? { format:FORMAT, version:VERSION, deviceId:"server-empty", exportedAt:now(), memories:[] }
        : remote.envelope;
      const merged = mergeEnvelopes(local, remoteEnvelope, { deviceId, now });
      if (dryRun) return { dryRun:true, attempt, ...merged };
      const result = await transport.compareAndSwap({ expectedRevision:remote.revision, envelope:merged.envelope });
      if (!result || typeof result.ok !== "boolean") throw new TypeError("Respuesta compareAndSwap no válida.");
      if (!result.ok) continue;
      const incoming = merged.envelope.memories.filter(item => !local.memories.some(existing => existing.id === item.id));
      if (incoming.length) memory.importJSON({ format:"karen-structured-memory", version:2, memories:incoming }, { consent:true });
      return { dryRun:false, attempt, revision:result.revision ?? null, added:merged.added,
        updated:merged.updated, conflicts:merged.conflicts, count:merged.envelope.memories.length, note:merged.note };
    }
    throw new Error("La memoria remota cambió repetidamente; no se sincronizó para evitar sobrescribir datos. Inténtalo de nuevo.");
  }
  return Object.freeze({ preview, sync });
}

export { validateEnvelope as validateMemorySyncEnvelope, mergeEnvelopes as mergeMemorySyncEnvelopes };
