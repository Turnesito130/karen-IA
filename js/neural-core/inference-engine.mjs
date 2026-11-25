/**
 * Motor de inferencia simbólica de Karen.
 * Solo deduce relaciones explícitas y conserva las evidencias enfrentadas.
 */
const ARTICLES=new Set(["un","una","unos","unas","el","la","los","las","todos","todas"]);
const STOP=new Set(["que","como","para","con","por","de","del","y","en","a"]);
function normalize(value){
  return String(value||"").toLocaleLowerCase("es").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9\s-]/g," ")
    .trim().split(/\s+/).filter(Boolean).filter(word=>!ARTICLES.has(word)&&!STOP.has(word))
    .map(word=>word.length>5&&word.endsWith("es")?word.slice(0,-2):word.length>4&&word.endsWith("s")?word.slice(0,-1):word).join(" ");
}
function parseRelation(value){
  const text=String(value||"").toLocaleLowerCase("es").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/[¿¡?!.]/g," ").replace(/[^a-z0-9\s-]/g," ")
    .replace(/\s+/g," ").trim();
  const parts=text.split(" ");
  const copula=parts.findIndex((word,index)=>index>0&&index<parts.length-1&&(word==="es"||word==="son"));
  if(copula<1||copula>=parts.length-1)return null;
  const negated=parts[copula-1]==="no";
  const from=normalize(parts.slice(0,negated?copula-1:copula).join(" "));
  const to=normalize(parts.slice(copula+1).join(" "));
  return from&&to&&from!==to?{from,to,negated}:null;
}
export function inferRelation({facts=[],query,maxDepth=6}={}){
  if(!Array.isArray(facts)||typeof query!=="string")throw new TypeError("facts y query no válidos");
  if(!Number.isInteger(maxDepth)||maxDepth<1||maxDepth>12)throw new RangeError("maxDepth debe estar entre 1 y 12");
  const wanted=parseRelation(query);
  if(!wanted)return {status:"not-a-relation",path:[],evidence:[]};
  const positive=new Map(),negative=new Map();
  const add=(map,edge,evidence)=>{
    if(!map.has(edge.from))map.set(edge.from,new Map());
    const targets=map.get(edge.from);
    if(!targets.has(edge.to))targets.set(edge.to,[]);
    targets.get(edge.to).push(evidence);
  };
  for(let index=0;index<facts.length;index++){
    const fact=facts[index]||{};
    const statement=typeof fact.statement==="string"?fact.statement:
      typeof fact.text==="string"?fact.text:
      String(fact.question||"")+" es "+String(fact.answer||"");
    const edge=parseRelation(statement);
    if(!edge)continue;
    const evidence={id:typeof fact.id==="string"?fact.id:"fact-"+index,statement};
    add(edge.negated?negative:positive,edge,evidence);
  }
  const directPositive=positive.get(wanted.from)?.get(wanted.to)||[];
  const directNegative=negative.get(wanted.from)?.get(wanted.to)||[];
  // Busca rutas simples: no descarta una segunda ruta solo por compartir un nodo.
  const queue=[{term:wanted.from,path:[wanted.from],evidence:[]}];
  const positiveProofs=[];
  while(queue.length){
    const current=queue.shift();
    if(current.path.length>maxDepth)continue;
    for(const [next,proof] of positive.get(current.term)||[]){
      if(current.path.includes(next))continue;
      const path=[...current.path,next],evidence=[...current.evidence,...proof];
      if(next===wanted.to){positiveProofs.push({path,evidence});continue;}
      if(path.length<=maxDepth)queue.push({term:next,path,evidence});
    }
  }
  const positiveProof=positiveProofs[0]||null;
  const hasPositive=Boolean(positiveProof||directPositive.length);
  const hasNegative=directNegative.length>0;
  const evidence=[...(positiveProof?.evidence||directPositive),...directNegative];
  const path=positiveProof?.path||[wanted.from,wanted.to];
  if(hasPositive&&hasNegative)return {status:"conflict",path,evidence};
  if(wanted.negated){
    if(hasNegative)return {status:"entailed",path:[wanted.from,wanted.to],evidence:directNegative};
    if(hasPositive)return {status:"contradicted",path,evidence:positiveProof?.evidence||directPositive};
  }else{
    if(hasNegative)return {status:"contradicted",path:[wanted.from,wanted.to],evidence:directNegative};
    if(hasPositive)return {status:"entailed",path,evidence:positiveProof?.evidence||directPositive};
  }
  return {status:"unknown",path:[],evidence:[]};
}
