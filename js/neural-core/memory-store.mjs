/**
 * Karen Structured Memory v0.2
 * Memoria local con consentimiento, procedencia, confianza, conflictos y control del usuario.
 * Los recuerdos son datos; nunca se interpretan como instrucciones ejecutables.
 */
const DEFAULT_KEY="karen_structured_memory_v2";
const TYPES=new Set(["fact","preference","goal","knowledge","hypothesis","event","note"]);
const STATUSES=new Set(["active","uncertain","superseded"]);
function normalizeText(value,max=1200){
  if(typeof value!=="string")throw new TypeError("El contenido debe ser texto.");
  const clean=value.trim();
  if(!clean||clean.length>max)throw new TypeError("Contenido vacío o demasiado largo.");
  return clean;
}
function tokens(value){
  return normalizeText(value,3000).toLocaleLowerCase("es").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").match(/[a-z0-9]{2,}/g)||[];
}
function safeConfidence(value){
  const n=Number(value);
  if(!Number.isFinite(n))return .5;
  return Math.max(0,Math.min(1,n));
}
export function createMemoryStore({storage,key=DEFAULT_KEY,now=()=>new Date().toISOString()}={}){
  let backend=storage;
  try{if(!backend)backend=globalThis.localStorage||null}catch{backend=null}
  if(!backend||typeof backend.getItem!=="function"||typeof backend.setItem!=="function")throw new TypeError("Se necesita un almacenamiento compatible con localStorage.");
  let corrupt=false;
  function read(){
    try{
      let raw=backend.getItem(key);
      if(!raw){const legacy=backend.getItem("ed_structured_memory_v1");if(legacy){raw=legacy;backend.setItem(key,legacy);}}
      const parsed=JSON.parse(raw||"[]");
      if(!Array.isArray(parsed))throw new TypeError("El formato almacenado no es una lista.");
      const valid=parsed.filter(item=>item&&typeof item.id==="string"&&typeof item.content==="string"&&TYPES.has(item.type)&&STATUSES.has(item.status));
      if(valid.length!==parsed.length)throw new TypeError("Hay recuerdos con campos o estados no válidos.");
      return valid;
    }catch(error){
      corrupt=true;
      throw new Error("La memoria local no se puede leer. No se sobrescribirá para evitar pérdida de datos: "+String(error?.message||error));
    }
  }
  function write(items){
    if(corrupt)throw new Error("La memoria está marcada como dañada; exporta o revisa el almacenamiento antes de modificarla.");
    backend.setItem(key,JSON.stringify(items.slice(-1000)));
  }
  function similarity(a,b){
    const left=new Set(tokens(a)),right=new Set(tokens(b));
    if(!left.size||!right.size)return 0;
    let common=0;for(const token of left)if(right.has(token))common++;
    return common/(left.size+right.size-common);
  }
  function findConflicts(input,{type,threshold=.45}={}){
    const content=normalizeText(input);
    if(typeof threshold!=="number"||threshold<.2||threshold>1)throw new RangeError("Umbral de conflicto no válido.");
    const targetType=TYPES.has(type)?type:null;
    return read().filter(item=>item.status==="active"&&item.content.toLocaleLowerCase("es")!==content.toLocaleLowerCase("es")&&(!targetType||item.type===targetType))
      .map(item=>({...item,similarity:Number(similarity(content,item.content).toFixed(3))}))
      .filter(item=>item.similarity>=threshold).sort((a,b)=>b.similarity-a.similarity);
  }
  function remember(input={}){
    if(input.consent!==true)throw new Error("Se necesita consentimiento explícito para guardar un recuerdo.");
    const content=normalizeText(input.content),type=TYPES.has(input.type)?input.type:"note";
    const source=normalizeText(input.source||"user_explicit",160),confidence=safeConfidence(input.confidence??.8);
    const items=read();
    const duplicate=items.find(item=>item.status!=="superseded"&&item.content.toLocaleLowerCase("es")===content.toLocaleLowerCase("es")&&item.type===type);
    if(duplicate){duplicate.updatedAt=now();duplicate.source=source;duplicate.confidence=confidence;write(items);return {...duplicate,duplicate:true,needsReview:duplicate.status==="uncertain"}}
    const conflicts=findConflicts(content,{type});
    if(items.length>=1000)throw new RangeError("La memoria alcanzó su límite de 1000 recuerdos. Exporta o elimina recuerdos antes de guardar más.");
    const timestamp=now();
    const item={id:"karenmem-"+Math.random().toString(36).slice(2,12),content,type,source,confidence,status:conflicts.length?"uncertain":"active",createdAt:timestamp,updatedAt:timestamp};
    items.push(item);write(items);
    return {...item,needsReview:conflicts.length>0,conflicts:conflicts.map(({id,content,similarity})=>({id,content,similarity}))};
  }
  function resolveConflict(id,supersedeIds=[]){
    if(!Array.isArray(supersedeIds)||supersedeIds.length>20)throw new TypeError("Lista de recuerdos a sustituir no válida.");
    const items=read(),target=items.find(item=>item.id===id);
    if(!target)return false;
    const ids=new Set(supersedeIds.filter(value=>typeof value==="string"&&value!==id));
    for(const item of items)if(ids.has(item.id)&&item.type===target.type){item.status="superseded";item.updatedAt=now()}
    target.status="active";target.updatedAt=now();write(items);return true;
  }
  function search(query,{limit=8,includeUncertain=false}={}){
    const queryTokens=[...new Set(tokens(query))];
    if(!queryTokens.length)return [];
    const all=read();
    return all.map(item=>{
      if(item.status!=="active"&&!(includeUncertain&&item.status==="uncertain"))return null;
      if(item.status==="active"&&all.some(other=>other.status==="uncertain"&&other.type===item.type&&similarity(other.content,item.content)>=.45))return null;
      const contentTokens=new Set(tokens(item.content+" "+item.type));
      const matches=queryTokens.filter(token=>contentTokens.has(token)).length;
      if(!matches)return null;
      const coverage=matches/queryTokens.length,precision=matches/Math.max(1,contentTokens.size);
      const lexical=coverage*.75+precision*.25;
      const ageDays=Math.max(0,(Date.parse(now())-Date.parse(item.updatedAt||item.createdAt))/86400000);
      const freshness=Number.isFinite(ageDays)?1/(1+ageDays/365):.8;
      const confidence=safeConfidence(item.confidence);
      return {...item,relevance:Number((lexical*(.75+confidence*.25)*(.9+freshness*.1)).toFixed(3))};
    }).filter(Boolean).sort((a,b)=>b.relevance-a.relevance||String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,Math.max(1,Math.min(20,limit)));
  }
  function update(id,patch={}){
    const items=read(),index=items.findIndex(item=>item.id===id);
    if(index<0)return null;
    const next={...items[index]};
    if(patch.content!==undefined)next.content=normalizeText(patch.content);
    if(patch.type!==undefined){if(!TYPES.has(patch.type))throw new TypeError("Tipo de recuerdo no válido.");next.type=patch.type}
    if(patch.confidence!==undefined)next.confidence=safeConfidence(patch.confidence);
    if(patch.status!==undefined){if(!STATUSES.has(patch.status))throw new TypeError("Estado de recuerdo no válido.");next.status=patch.status}
    if(patch.source!==undefined)next.source=normalizeText(patch.source,160);
    next.updatedAt=now();items[index]=next;write(items);return {...next};
  }
  function forget(id){const items=read(),next=items.filter(item=>item.id!==id);write(next);return next.length!==items.length}
  function list({status="active",limit=100}={}){
    return read().filter(item=>status==="all"||item.status===status).slice(-Math.max(1,Math.min(500,limit))).map(item=>({...item}));
  }
  function context(query,{limit=5,maxChars=1400}={}){
    const found=search(query,{limit});let result="";
    for(const item of found){
      const line="- ["+item.type+"; confianza "+Math.round(safeConfidence(item.confidence)*100)+"%; fuente "+item.source+"] "+item.content;
      if(result.length+line.length>maxChars)continue;
      result+=(result?"\n":"")+line;
    }
    return result;
  }
  function forgetMatching(query,{limit=100}={}){
    const queryTokens=[...new Set(tokens(query))];if(!queryTokens.length)return 0;
    const items=read(),matches=items.filter(item=>{const itemTokens=new Set(tokens(item.content));return queryTokens.every(token=>itemTokens.has(token))}).slice(0,Math.max(1,Math.min(100,limit)));
    const ids=new Set(matches.map(item=>item.id));write(items.filter(item=>!ids.has(item.id)));return ids.size;
  }
  function clear({consent=false}={}){
    if(consent!==true)throw new Error("Borrar toda la memoria requiere confirmación explícita.");
    if(corrupt){backend.setItem(key,"[]");corrupt=false;return 0;}
    const count=read().length;write([]);return count;
  }
  function health(){
    try{
      const marker="__karen_memory_probe__";backend.setItem(key+":probe",marker);
      const available=backend.getItem(key+":probe")===marker;backend.removeItem(key+":probe");
      let nativeStorage=false;try{nativeStorage=typeof globalThis.localStorage!=="undefined"&&backend===globalThis.localStorage}catch{}
      const count=read().length;
      return {available,corrupt:false,count,limit:1000,persistent:nativeStorage,storage:nativeStorage?"browser-local-storage":"custom-or-ephemeral"};
    }catch{return {available:false,corrupt,persistent:false,count:null,limit:1000,storage:"unavailable"}}
  }
  function exportJSON(){return JSON.stringify({format:"karen-structured-memory",version:2,memories:read()},null,2)}
  function importJSON(input,{consent=false}={}){
    if(consent!==true)throw new Error("La importación necesita confirmación explícita.");
    const parsed=typeof input==="string"?JSON.parse(input):input;
    if(!parsed||!["karen-structured-memory","ed2-structured-memory"].includes(parsed.format)||![1,2].includes(parsed.version)||!Array.isArray(parsed.memories))throw new TypeError("Copia de memoria no válida.");
    const current=read(),known=new Set(current.map(item=>item.id));
    if(parsed.memories.length>1000)throw new RangeError("La copia supera el máximo de 1000 recuerdos.");
    const incoming=[],seen=new Set(known);
    for(const item of parsed.memories){
      if(!item||typeof item.id!=="string"||item.id.length>100||typeof item.content!=="string"||!item.content.trim()||item.content.length>1200||!TYPES.has(item.type)||typeof item.source!=="string"||item.source.length>160||!Number.isFinite(item.confidence)||item.confidence<0||item.confidence>1||!STATUSES.has(item.status)||typeof item.createdAt!=="string"||typeof item.updatedAt!=="string"||seen.has(item.id))continue;
      seen.add(item.id);incoming.push({id:item.id,content:item.content.trim(),type:item.type,source:item.source,confidence:item.confidence,status:item.status,createdAt:item.createdAt,updatedAt:item.updatedAt});
    }
    if(current.length+incoming.length>1000)throw new RangeError("La importación superaría los 1000 recuerdos. Exporta o elimina recuerdos antes de importar.");
    write([...current,...incoming]);return incoming.length;
  }
  function applySyncJSON(input,{consent=false}={}){
    if(consent!==true)throw new Error("Aplicar una sincronización requiere confirmación explícita.");
    const parsed=typeof input==="string"?JSON.parse(input):input;
    if(!parsed||parsed.format!=="karen-structured-memory"||parsed.version!==2||!Array.isArray(parsed.memories)||parsed.memories.length>1000)throw new TypeError("Paquete de sincronización no válido.");
    const current=read(),byId=new Map(current.map(item=>[item.id,item]));
    let added=0,updated=0;
    for(const item of parsed.memories){
      if(!item||typeof item.id!=="string"||!item.id||item.id.length>100||typeof item.content!=="string"||!item.content.trim()||item.content.length>1200||!TYPES.has(item.type)||typeof item.source!=="string"||item.source.length>160||!Number.isFinite(item.confidence)||item.confidence<0||item.confidence>1||!STATUSES.has(item.status)||typeof item.createdAt!=="string"||typeof item.updatedAt!=="string")throw new TypeError("El paquete contiene un recuerdo no válido.");
      const next={id:item.id,content:item.content.trim(),type:item.type,source:item.source,confidence:item.confidence,status:item.status,createdAt:item.createdAt,updatedAt:item.updatedAt};
      const previous=byId.get(next.id);
      if(!previous){byId.set(next.id,next);added++;continue;}
      const incomingTime=Date.parse(next.updatedAt),previousTime=Date.parse(previous.updatedAt);
      if(Number.isFinite(incomingTime)&&(!Number.isFinite(previousTime)||incomingTime>previousTime||(
        incomingTime===previousTime&&next.status!==previous.status&&next.status==="uncertain"))){
        byId.set(next.id,next);updated++;
      }
    }
    if(byId.size>1000)throw new RangeError("La sincronización superaría el límite de 1000 recuerdos.");
    write([...byId.values()]);return {added,updated,count:byId.size};
  }
  return Object.freeze({remember,search,findConflicts,resolveConflict,update,forget,forgetMatching,clear,list,context,health,exportJSON,importJSON,applySyncJSON});
}
