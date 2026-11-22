/**
 * Karen Agent Runtime v0.2
 * Ejecutor acotado: solo herramientas registradas y autorización explícita.
 * No concede permisos del sistema operativo.
 */
const RISK = Object.freeze({ LOW:"low", MEDIUM:"medium", HIGH:"high", CRITICAL:"critical" });
const AUTO_RISKS = new Set([RISK.LOW]);

function cleanText(value, max = 500) {
  if (typeof value !== "string") throw new TypeError("El texto debe ser una cadena.");
  const text = value.trim();
  if (!text || text.length > max) throw new TypeError("El texto está vacío o supera el límite permitido.");
  return text;
}
function safeArgs(value, depth = 0) {
  if (depth > 6) throw new TypeError("Los argumentos superan la profundidad permitida.");
  if (value === null || ["string","number","boolean"].includes(typeof value)) {
    if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("Número no válido en argumentos.");
    if (typeof value === "string" && value.length > 2000) throw new TypeError("Texto de argumento demasiado largo.");
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 50) throw new TypeError("Lista de argumentos demasiado grande.");
    return value.map(item => safeArgs(item, depth + 1));
  }
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError("Solo se permiten argumentos JSON simples.");
  }
  const entries = Object.entries(value);
  if (entries.length > 50) throw new TypeError("Demasiados campos en argumentos.");
  const result = {};
  for (const [key, item] of entries) {
    if (["__proto__","prototype","constructor"].includes(key)) throw new TypeError("Clave de argumento no permitida.");
    result[key] = safeArgs(item, depth + 1);
  }
  return result;
}
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
function step(id, tool, args, risk = RISK.LOW, description = tool) {
  return Object.freeze({ id, tool, args: deepFreeze(safeArgs(args)), risk, description });
}
export function classifyRisk(tool) {
  const name = String(tool || "").toLowerCase();
  if (/delete|remove|erase|format|shutdown|kill|attack|weapon|transfer|purchase|send_message|publish|install|execute_shell|admin|factory_reset|unlock/.test(name)) return RISK.CRITICAL;
  if (/email|message|post|share|upload|download|camera|microphone|location|device_setting|file_move|file_write|bluetooth|wifi|smart_home|control_device|pair_device|turn_on|turn_off/.test(name)) return RISK.HIGH;
  if (/open_url|search|timer|calculate|read|list|note|study|memory_search/.test(name)) return RISK.LOW;
  return RISK.MEDIUM;
}
export function planTask(input) {
  const query = cleanText(input, 1000);
  const q = query.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const steps = [];
  const add = (tool, args, description) => steps.push(step("step-" + (steps.length + 1), tool, args, classifyRisk(tool), description));
  let match = q.match(/(?:cuanto es|calcula|calcular|resuelve)\s+(.+)/);
  if (match) add("calculate", { expression:match[1].replace(/[?¿]/g,"").trim() }, "Calcular la expresión solicitada");
  match = q.match(/^(?:que recuerdas de|que sabes de|busca en mi memoria)\s+(.+)/);
  if (match) add("memory_search", { query:match[1].trim() }, "Consultar recuerdos relevantes");
  match = q.match(/^(?:anota|apunta|recuerda|memoriza)(?: que)?\s+(.+)/);
  if (match) add("note", { text:match[1].trim() }, "Guardar la nota solicitada expresamente");
  match = q.match(/^(?:busca en google|busca en internet|busca)\s+(.+)/);
  if (match) add("search", { query:match[1].trim() }, "Buscar información");
  match = q.match(/^(?:abre|abrir|ve a|entra en)\s+(https?:\/\/\S+|[a-z0-9.-]+\.[a-z]{2,}(?:\/\S*)?)$/);
  if (match) add("open_url", { url:match[1].startsWith("http")?match[1]:"https://"+match[1] }, "Abrir la dirección indicada");
  match = q.match(/(?:temporizador|avisa(?:me)? en)\s+(\d{1,4})\s*(segundos?|minutos?)/);
  if (match) add("timer", { seconds:Number(match[1])*(match[2].startsWith("min")?60:1) }, "Crear un temporizador");
  return Object.freeze({
    id:"ed-plan-"+Date.now().toString(36), goal:query, steps:Object.freeze(steps),
    status:steps.length?"planned":"no_supported_action",
    requiresReview:steps.some(s=>!AUTO_RISKS.has(s.risk))
  });
}
export function validatePlan(plan) {
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.steps) || plan.steps.length > 12) return false;
  const ids = new Set();
  for (const item of plan.steps) {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id)) return false;
    ids.add(item.id);
    if (typeof item.tool !== "string" || !/^[a-z][a-z0-9_]{0,40}$/.test(item.tool) || !item.args || typeof item.args !== "object" || Array.isArray(item.args)) return false;
    try { if (JSON.stringify(safeArgs(item.args)).length > 8000) return false; } catch { return false; }
    if (![RISK.LOW,RISK.MEDIUM,RISK.HIGH,RISK.CRITICAL].includes(item.risk)) return false;
    if (item.risk !== classifyRisk(item.tool)) return false;
  }
  return true;
}
export function createAgentRuntime({ tools = {}, onAudit = () => {} } = {}) {
  const registry = new Map(Object.entries(tools).filter(([name,fn])=>/^[a-z][a-z0-9_]{0,40}$/.test(name)&&typeof fn==="function"));
  let auditFailures = 0;
  function audit(event) {
    try { onAudit(Object.freeze({ ...event, at:new Date().toISOString() })); }
    catch { auditFailures++; }
  }
  async function execute(plan, {
    approve = async () => false, shouldStop = () => false,
    stopOnFailure = true, maxSteps = 12, dryRun = false
  } = {}) {
    if (!validatePlan(plan)) throw new TypeError("Plan no válido: se cancela la ejecución.");
    if (!Number.isInteger(maxSteps)||maxSteps<1||maxSteps>12) throw new RangeError("maxSteps debe estar entre 1 y 12.");
    if (typeof approve!=="function"||typeof shouldStop!=="function") throw new TypeError("approve y shouldStop deben ser funciones.");
    if (plan.steps.length>maxSteps) throw new RangeError("El plan supera el límite de pasos permitido.");
    if (typeof dryRun!=="boolean"||typeof stopOnFailure!=="boolean") throw new TypeError("Opciones de ejecución no válidas.");
    const results=[];
    let halted=false;
    for (const item of plan.steps) {
      if (shouldStop()) {
        halted=true;
        results.push({id:item.id,status:"cancelled",message:"Ejecución detenida por la señal de cancelación."});
        audit({type:"workflow_cancelled",tool:item.tool,risk:item.risk});
        break;
      }
      if (dryRun) {
        results.push({id:item.id,status:"simulated",message:"No se ejecutó ninguna herramienta (modo de simulación)."});
        continue;
      }
      if (!registry.has(item.tool)) {
        results.push({id:item.id,status:"unavailable",message:"Herramienta no registrada."});
        audit({type:"tool_unavailable",tool:item.tool,risk:item.risk});
        if (stopOnFailure) { halted=true; break; }
        continue;
      }
      if (!AUTO_RISKS.has(item.risk)) {
        let allowed=false;
        try { allowed=await approve(deepFreeze({...item,args:safeArgs(item.args)})); } catch { allowed=false; }
        if (allowed!==true) {
          results.push({id:item.id,status:"approval_required",message:"No se ejecutó: falta autorización explícita."});
          audit({type:"approval_denied",tool:item.tool,risk:item.risk});
          if (stopOnFailure) { halted=true; break; }
          continue;
        }
      }
      try {
        const args=deepFreeze(safeArgs(item.args));
        const value=await registry.get(item.tool)(args);
        results.push({id:item.id,status:"completed",value});
        audit({type:"tool_completed",tool:item.tool,risk:item.risk});
      } catch(error) {
        results.push({id:item.id,status:"failed",message:String(error?.message||error)});
        audit({type:"tool_failed",tool:item.tool,risk:item.risk});
        if (stopOnFailure) { halted=true; break; }
      }
    }
    return Object.freeze({planId:plan.id,halted,results:Object.freeze(results)});
  }
  return Object.freeze({
    plan:planTask, execute, listTools:()=>[...registry.keys()],
    diagnostics:()=>Object.freeze({registeredTools:registry.size,auditFailures})
  });
}
export const RISK_LEVELS=RISK;
