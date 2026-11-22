/**
 * Karen · revisión estática inicial de JavaScript.
 * No ejecuta código ni sustituye un parser, pruebas o revisión humana.
 */
const RULES = [
  {id:"no-eval",pattern:/\beval\s*\(|\bnew\s+Function\s*\(/g,severity:"critical",message:"Ejecución dinámica de texto: puede abrir una vía de inyección.",suggestion:"Evita eval/Function; usa funciones explícitas y datos validados."},
  {id:"no-innerhtml",pattern:/\.innerHTML\s*=/g,severity:"high",message:"Asignación a innerHTML: riesgo de XSS si el contenido no es de confianza.",suggestion:"Prefiere textContent o construye nodos DOM con APIs seguras."},
  {id:"strict-equality",pattern:/(?<![=!])==(?!=)/g,severity:"medium",message:"Comparación no estricta; puede producir conversiones implícitas.",suggestion:"Usa === o explica por qué necesitas coerción."},
  {id:"prefer-const",pattern:/\bvar\s+[A-Za-z_$][\w$]*/g,severity:"low",message:"Declaración con var.",suggestion:"Prefiere const si no reasignas; let si necesitas reasignación."}
];
export function reviewJavaScript(source,{maxChars=20000}={}) {
  if(typeof source!=="string"||!source.trim()) throw new TypeError("El código debe ser texto no vacío.");
  if(source.length>maxChars) throw new RangeError("El código supera el límite de revisión estática.");
  const findings=[];
  for(const rule of RULES){
    rule.pattern.lastIndex=0;
    for(const match of source.matchAll(rule.pattern)){
      const before=source.slice(0,match.index);
      const line=before.split("\n").length;
      findings.push({rule:rule.id,severity:rule.severity,line,column:match.index-before.lastIndexOf("\n"),message:rule.message,suggestion:rule.suggestion});
    }
  }
  findings.sort((a,b)=>a.line-b.line||a.column-b.column);
  return Object.freeze({
    language:"javascript",
    mode:"heuristic-static-review",
    executed:false,
    syntaxVerified:false,
    findings:Object.freeze(findings),
    counts:Object.freeze(findings.reduce((acc,item)=>(acc[item.severity]=(acc[item.severity]||0)+1,acc),{})),
    summary:findings.length? "Se han detectado "+findings.length+" posibles problemas; revisa cada aviso.":"No se han detectado los patrones cubiertos; esto no demuestra que el código sea correcto."
  });
}
