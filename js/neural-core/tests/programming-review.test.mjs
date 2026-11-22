import test from "node:test";
import assert from "node:assert/strict";
import { reviewJavaScript } from "../programming-review.mjs";
test("flags risky JavaScript patterns without executing the source",()=>{
 const result=reviewJavaScript("var x = 1;\nif (x == 1) el.innerHTML = input;\neval(input);");
 assert.equal(result.executed,false);
 assert.equal(result.syntaxVerified,false);
 assert.ok(result.findings.some(x=>x.rule==="dynamic-code"&&x.severity==="critical"));
 assert.ok(result.findings.some(x=>x.rule==="html-injection"));
 assert.ok(result.findings.some(x=>x.rule==="strict-equality"));
 assert.ok(result.findings.some(x=>x.rule==="prefer-const"));
});
test("ignores examples inside strings and comments",()=>{
 const result=reviewJavaScript('const sample = "eval(x)"; // document.write(x)\n/* el.innerHTML = input; */\nconst safe = input;');
 assert.equal(result.findings.length,0);
});
test("detects string-based timers and preserves source line numbers",()=>{
 const result=reviewJavaScript('const ok = 1;\nsetTimeout("alert(1)", 10);');
 assert.equal(result.findings[0].rule,"string-timer");
 assert.equal(result.findings[0].line,2);
});
test("rejects empty and oversized source",()=>{
 assert.throws(()=>reviewJavaScript(" "),/no vacío/);
 assert.throws(()=>reviewJavaScript("12345",{maxChars:4}),/límite/);
});
