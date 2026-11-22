import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("la interfaz de revisión carga JavaScript válido y no aprueba ejemplos por sí sola",async()=>{
 const html=await readFile(new URL("../training/review_dataset.html",import.meta.url),"utf8");
 const script=html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
 assert.ok(script,"No se encontró el script de revisión");
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.match(script,/item\.approved=status==="approved"/);
 assert.match(script,/approved\.length<10/);
 assert.match(script,/x\.approved===true&&x\.review_status==="approved"/);
 assert.doesNotMatch(script,/approveAll|approve-all|aprobarTodos/i);
});
