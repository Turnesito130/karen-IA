/**
 * Karen encrypted memory vault.
 * Node.js 20+; stores only client-encrypted AES-GCM envelopes.
 * Run behind HTTPS. A single process/instance is supported.
 */
import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const TOKEN = process.env.KAREN_SYNC_TOKEN || "";
const ORIGIN = process.env.KAREN_SYNC_ORIGIN || "";
const DATA_FILE = process.env.KAREN_SYNC_FILE || join(process.cwd(), "data", "memory-vault.json");
const MAX_BODY = 4_500_000;

if (TOKEN.length < 32) throw new Error("KAREN_SYNC_TOKEN debe ser un secreto aleatorio de al menos 32 caracteres.");
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error("PORT no válido.");

function authorized(req) {
  const header = req.headers.authorization || "";
  const supplied = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const expected = Buffer.from(TOKEN);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!ORIGIN || origin !== ORIGIN) return false;
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, If-Match, If-None-Match");
  res.setHeader("Access-Control-Max-Age", "600");
  return true;
}
function send(res, status, value, headers={}) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff", "Content-Length":Buffer.byteLength(body), ...headers });
  res.end(body);
}
async function bodyJSON(req) {
  let size=0, chunks=[];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("Cuerpo demasiado grande."), { status:413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("JSON no válido."), { status:400 }); }
}
function validateCipher(value) {
  if (!value || typeof value !== "object" || value.format !== "karen-memory-ciphertext" || value.version !== 1
    || typeof value.salt !== "string" || typeof value.iv !== "string" || typeof value.ciphertext !== "string"
    || !/^[A-Za-z0-9+/]{22}==$/.test(value.salt) || !/^[A-Za-z0-9+/]{16}$/.test(value.iv)
    || value.ciphertext.length < 24 || value.ciphertext.length > MAX_BODY) return false;
  try {
    return Buffer.from(value.salt,"base64").length===16 && Buffer.from(value.iv,"base64").length===12
      && Buffer.from(value.ciphertext,"base64").length>=16;
  } catch { return false; }
}
async function readVault() {
  try {
    const parsed=JSON.parse(await readFile(DATA_FILE,"utf8"));
    if (!parsed || typeof parsed.revision!=="string" || !validateCipher(parsed.envelope)) {
      throw new Error("El almacén existente no tiene un formato válido; no se sobrescribirá.");
    }
    return parsed;
  } catch(error) {
    if(error?.code==="ENOENT")return null;
    throw error;
  }
}
function revisionFor(envelope) {
  return createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
}
let writeQueue=Promise.resolve();
function serialized(task) {
  const next=writeQueue.then(task,task);
  writeQueue=next.catch(()=>{});
  return next;
}
async function writeVault(envelope) {
  await mkdir(dirname(DATA_FILE),{recursive:true});
  const revision=revisionFor(envelope);
  const temporary=DATA_FILE+"."+process.pid+".tmp";
  await writeFile(temporary,JSON.stringify({revision,envelope}),{encoding:"utf8",mode:0o600});
  await rename(temporary,DATA_FILE);
  return revision;
}
const server=createServer(async(req,res)=>{
  if(!cors(req,res)){send(res,403,{error:"Origen no autorizado."});return;}
  if(req.method==="OPTIONS"){res.writeHead(204);res.end();return;}
  const url=new URL(req.url||"/","http://localhost");
  if(url.pathname==="/health"&&req.method==="GET"){send(res,200,{ok:true,service:"karen-encrypted-memory-vault",protocol:1});return;}
  if(url.pathname!=="/v1/memory"){send(res,404,{error:"Ruta no encontrada."});return;}
  if(!authorized(req)){send(res,401,{error:"No autorizado."});return;}
  if(req.method==="GET"){
    try { const current=await readVault();send(res,200,{revision:current?.revision??null,envelope:current?.envelope??null}); }
    catch(error){send(res,500,{error:"No se pudo leer el almacén."});}
    return;
  }
  if(req.method!=="PUT"){send(res,405,{error:"Método no permitido."},{Allow:"GET, PUT, OPTIONS"});return;}
  try {
    const body=await bodyJSON(req),envelope=body?.envelope;
    if(!validateCipher(envelope)){send(res,400,{error:"Solo se aceptan paquetes cifrados válidos."});return;}
    const expected=req.headers["if-match"];
    const create=req.headers["if-none-match"]==="*";
    if((expected===undefined&&!create)||(expected!==undefined&&create)){send(res,428,{error:"Se requiere una condición If-Match o If-None-Match."});return;}
    const outcome=await serialized(async()=>{
      const current=await readVault();
      if(create ? current!==null : (!current || expected.replace(/^"|"$/g,"")!==current.revision)) return {ok:false};
      const revision=await writeVault(envelope);
      return {ok:true,revision};
    });
    if(!outcome.ok){send(res,412,{error:"La memoria cambió desde la última lectura. Vuelve a leer y combina."});return;}
    send(res,200,{ok:true,revision:outcome.revision},{ETag:'"'+outcome.revision+'"'});
  } catch(error) {
    send(res,error?.status||500,{error:error?.status?error.message:"No se pudo guardar el almacén."});
  }
});
server.listen(PORT,HOST,()=>process.stdout.write("Karen memory vault escuchando en "+HOST+":"+PORT+"\n"));
