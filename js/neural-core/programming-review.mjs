/**
 * Karen · revisión estática heurística de JavaScript.
 * No ejecuta código ni sustituye parser, pruebas, SAST completo o revisión humana.
 */
function maskCommentsAndStrings(source){
  const chars=[...source],out=[...source];
  let i=0,state="code",quoteChar=null;
  const blank=(at)=>{if(out[at]!=="\n"&&out[at]!=="\r")out[at]=" ";};
  while(i<chars.length){
    const ch=chars[i],next=chars[i+1];
    if(state==="code"){
      if(ch==="/"&&next==="/"){blank(i);blank(i+1);i+=2;state="line-comment";continue;}
      if(ch==="/"&&next==="*"){blank(i);blank(i+1);i+=2;state="block-comment";continue;}
      if(ch==="'"||ch==='"'||ch===String.fromCharCode(96)){quoteChar=ch;blank(i);i++;state=quoteChar===String.fromCharCode(96)?"template":"string";continue;}
      i++;continue;
    }
    if(state==="line-comment"){
      if(ch==="\n"||ch==="\r"){state="code";i++;continue;}
      blank(i);i++;continue;
    }
    if(state==="block-comment"){
      if(ch==="*"&&next==="/"){blank(i);blank(i+1);i+=2;state="code";continue;}
      blank(i);i++;continue;
    }
    if(state==="string"||state==="template"){
      if(ch==="\\"){blank(i);if(i+1<chars.length)blank(i+1);i+=2;continue;}
      if(ch===quoteChar){blank(i);i++;state="code";quoteChar=null;continue;}
      blank(i);i++;continue;
    }
  }
  return out.join("");
}
const RULES=[
  {id:"dynamic-code",pattern:/\beval\s*\(|\bnew\s+Function\s*\(/g,severity:"critical",message:"Ejecución dinámica de texto: posible inyección de código.",suggestion:"Evita eval/Function; usa funciones explícitas y datos validados."},
  {id:"html-injection",pattern:/\.(?:innerHTML|outerHTML)\s*=|\.insertAdjacentHTML\s*\(|\bdocument\s*\.\s*write\s*\(/g,severity:"high",message:"Inserción de HTML: posible XSS si el contenido no es de confianza.",suggestion:"Prefiere textContent o crea nodos DOM con APIs seguras."},
  {id:"string-timer",pattern:/\bset(?:Timeout|Interval)\s*\(\s*["']/g,severity:"high",message:"Temporizador que recibe código como texto.",suggestion:"Pasa una función, no una cadena de código."},
  {id:"strict-equality",pattern:/(?<![=!])==(?!=)/g,severity:"medium",message:"Comparación no estricta; puede producir conversiones implícitas.",suggestion:"Usa === o explica por qué necesitas coerción."},
  {id:"prefer-const",pattern:/\bvar\s+[A-Za-z_$][\w$]*/g,severity:"low",message:"Declaración con var.",suggestion:"Prefiere const si no reasignas; let si necesitas reasignación."}
];
export function reviewJavaScript(source,{maxChars=20000}={}){
  if(typeof source!=="string"||!source.trim())throw new TypeError("El código debe ser texto no vacío.");
  if(source.length>maxChars)throw new RangeError("El código supera el límite de revisión estática.");
  const masked=maskCommentsAndStrings(source),findings=[];
  for(const rule of RULES){
    rule.pattern.lastIndex=0;
    for(const match of masked.matchAll(rule.pattern)){
      const before=source.slice(0,match.index),line=before.split("\n").length;
      findings.push({rule:rule.id,severity:rule.severity,line,column:match.index-before.lastIndexOf("\n"),message:rule.message,suggestion:rule.suggestion});
    }
  }
  findings.sort((a,b)=>a.line-b.line||a.column-b.column);
  const counts=findings.reduce((acc,item)=>(acc[item.severity]=(acc[item.severity]||0)+1,acc),{});
  return Object.freeze({
    language:"javascript",mode:"heuristic-static-review",executed:false,syntaxVerified:false,
    findings:Object.freeze(findings),counts:Object.freeze(counts),
    summary:findings.length?"Se han detectado "+findings.length+" posibles problemas; revisa cada aviso.":"No se han detectado los patrones cubiertos; esto no demuestra que el código sea correcto."
  });
}
