const MAX_BODY = 4_500_000;

function json(value,status=200,headers={}) {
  const responseHeaders=new Headers({
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff"
  });
  for(const [key,val] of new Headers(headers))responseHeaders.set(key,val);
  return new Response(JSON.stringify(value),{status,headers:responseHeaders});
}
function cors(request,env,headers) {
  const origin=request.headers.get("Origin");
  if(!origin)return true;
  if(!env.KAREN_SYNC_ORIGIN||origin!==env.KAREN_SYNC_ORIGIN)return false;
  headers.set("Access-Control-Allow-Origin",env.KAREN_SYNC_ORIGIN);
  headers.set("Vary","Origin");
  headers.set("Access-Control-Allow-Methods","GET, PUT, OPTIONS");
  headers.set("Access-Control-Allow-Headers","Authorization, Content-Type, If-Match, If-None-Match");
  headers.set("Access-Control-Max-Age","600");
  return true;
}
function equalSecret(a,b) {
  if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
function validCipher(value) {
  if(!value||typeof value!=="object"||value.format!=="karen-memory-ciphertext"||value.version!==1
    ||typeof value.salt!=="string"||typeof value.iv!=="string"||typeof value.ciphertext!=="string"
    ||!/^[A-Za-z0-9+/]{22}==$/.test(value.salt)||!/^[A-Za-z0-9+/]{16}$/.test(value.iv)
    ||value.ciphertext.length<24||value.ciphertext.length>MAX_BODY)return false;
  try{return atob(value.salt).length===16&&atob(value.iv).length===12&&atob(value.ciphertext).length>=16;}
  catch{return false;}
}
async function revisionFor(envelope) {
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(envelope)));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function etagValue(value){return typeof value==="string"?value.replace(/^"|"$/g,""):null;}

export default {
  async fetch(request,env) {
    const url=new URL(request.url),headers=new Headers();
    if(!cors(request,env,headers))return json({error:"Origen no autorizado."},403);
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
    if(url.pathname==="/health"&&request.method==="GET")return json({ok:true,service:"karen-encrypted-memory-vault",protocol:1},200,headers);
    if(url.pathname!=="/v1/memory")return json({error:"Ruta no encontrada."},404,headers);
    if(typeof env.KAREN_SYNC_TOKEN!=="string"||env.KAREN_SYNC_TOKEN.length<32||!env.DB)
      return json({error:"Configuración segura del servidor incompleta."},503,headers);
    const authorization=request.headers.get("Authorization")||"";
    if(!equalSecret(authorization.startsWith("Bearer ")?authorization.slice(7):"",env.KAREN_SYNC_TOKEN))
      return json({error:"No autorizado."},401,headers);
    if(request.method==="GET") {
      const row=await env.DB.prepare("SELECT revision,envelope FROM memory_vault WHERE id=1").first();
      if(!row)return json({revision:null,envelope:null},200,headers);
      let envelope;
      try{envelope=JSON.parse(row.envelope);}catch{return json({error:"Almacén ilegible."},500,headers);}
      if(!validCipher(envelope)||await revisionFor(envelope)!==row.revision)return json({error:"La bóveda no superó la comprobación de integridad."},500,headers);
      return json({revision:row.revision,envelope},200,headers);
    }
    if(request.method!=="PUT")return json({error:"Método no permitido."},405,{...Object.fromEntries(headers),Allow:"GET, PUT, OPTIONS"});
    const text=await request.text();
    if(text.length>MAX_BODY)return json({error:"Cuerpo demasiado grande."},413,headers);
    let body;try{body=JSON.parse(text);}catch{return json({error:"JSON no válido."},400,headers);}
    const envelope=body?.envelope;
    if(!validCipher(envelope))return json({error:"Solo se aceptan paquetes cifrados válidos."},400,headers);
    const ifMatch=request.headers.get("If-Match"),create=request.headers.get("If-None-Match")==="*";
    if((!ifMatch&&!create)||(ifMatch&&create))return json({error:"Se requiere If-Match o If-None-Match."},428,headers);
    const revision=await revisionFor(envelope),serialized=JSON.stringify(envelope);
    let result;
    if(create) {
      result=await env.DB.prepare("INSERT INTO memory_vault (id,revision,envelope) VALUES (1,?,?) ON CONFLICT(id) DO NOTHING")
        .bind(revision,serialized).run();
    } else {
      result=await env.DB.prepare("UPDATE memory_vault SET revision=?, envelope=?, updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?")
        .bind(revision,serialized,etagValue(ifMatch)).run();
    }
    if(!result.success)return json({error:"No se pudo escribir la bóveda."},500,headers);
    if(!result.meta?.changes)return json({error:"La memoria cambió desde la última lectura. Vuelve a leer y combina."},412,headers);
    headers.set("ETag",'"'+revision+'"');
    return json({ok:true,revision},200,headers);
  }
};
