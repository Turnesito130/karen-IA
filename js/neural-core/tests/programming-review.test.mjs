import test from "node:test";
import assert from "node:assert/strict";
import { reviewJavaScript } from "../programming-review.mjs";
test("flags risky JavaScript patterns without executing the source",()=>{
 const result=reviewJavaScript("var x = 1;\nif (x == 1) el.innerHTML = input;\neval(input);");
 assert.equal(result.executed,false);
 assert.equal(result.syntaxVerified,false);
 assert.ok(result.findings.some(x=>x.rule==="no-eval"&&x.severity==="critical"));
 assert.ok(result.findings.some(x=>x.rule==="no-innerhtml"));
 assert.ok(result.findings.some(x=>x.rule==="strict-equality"));
 assert.ok(result.findings.some(x=>x.rule==="prefer-const"));
});
test("rejects empty and oversized source",()=>{
 assert.throws(()=>reviewJavaScript(" "),/no vacío/);
 assert.throws(()=>reviewJavaScript("12345",{maxChars:4}),/límite/);
});
