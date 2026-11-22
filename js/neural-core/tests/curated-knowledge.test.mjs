import test from "node:test";
import assert from "node:assert/strict";
import { createCuratedKnowledgeBase } from "../curated-knowledge.mjs";
test("includes new technical knowledge cards on connectivity, model tuning and security",()=>{
 const kb=createCuratedKnowledgeBase();
 assert.ok(kb.size>=40);
 assert.ok(kb.search("Bluetooth bombilla inteligente").some(x=>x.id==="kb-tech-008"));
 assert.ok(kb.search("QLoRA ajuste fino").some(x=>x.id==="kb-ai-002"));
 assert.ok(kb.search("mínimo privilegio permisos").some(x=>x.id==="kb-sec-001"));
});
test("returns source identifiers with retrieved context",()=>{
 const kb=createCuratedKnowledgeBase();
 const result=kb.buildContext("qué es RAG", {limit:3});
 assert.match(result.context,/\[Fuente kb-ai-005/);
 assert.ok(result.sources.some(x=>x.id==="kb-ai-005"));
});
