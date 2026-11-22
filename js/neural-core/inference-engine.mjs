/**
 * Motor de inferencia simbólica de Karen.
 * Solo deduce relaciones explícitas; si hay evidencia enfrentada, devuelve conflicto.
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
    .replace(/[\u0300-\u036f]/g,"").replace(/[¿¡?!.]/g," ").replace(/\s+/g," ").trim();
  const match=text.match(/^(?:(?:todos|todas)\s+)?(?:(?:los|las|un|una|unos|unas|el|la)\s+)?(.+?)\s+(no\s+)?(?:es|son)\s+(.+)$/);
  if(!match)return null;
  const from=normalize(match[1]),to=normalize(match[4]);
  return from&&to&&from!==to?{from,to,negated:!!match[2]}:null;
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
  if(directPositive.length&&directNegative.length)return {status:"conflict",path:[wanted.from,wanted.to],evidence:[...directPositive,...directNegative]};
  if(wanted.negated&&directNegative.length)return {status:"entailed",path:[wanted.from,wanted.to],evidence:directNegative};
  if(!wanted.negated&&directNegative.length)return {status:"contradicted",path:[wanted.from,wanted.to],evidence:directNegative};
  const queue=[{term:wanted.from,path:[wanted.from],evidence:[]}],seen=new Set([wanted.from]);
  while(queue.length){
    const current=queue.shift();
    if(current.path.length>maxDepth+1)continue;
    const edges=positive.get(current.term);
    if(!edges)continue;
    for(const [next,proof] of edges){
      const path=[...current.path,next],evidence=[...current.evidence,...proof];
      const neg=negative.get(wanted.from)?.get(next)||[];
      if(next===wanted.to){
        if(neg.length)return {status:"conflict",path,evidence:[...evidence,...neg]};
        return {status:wanted.negated?"contradicted":"entailed",path,evidence};
      }
      if(!seen.has(next)){seen.add(next);queue.push({term:next,path,evidence});}
    }
  }
  if(wanted.negated&&directPositive.length)return {status:"contradicted",path:[wanted.from,wanted.to],evidence:directPositive};
  return {status:"unknown",path:[],evidence:[]};
}
