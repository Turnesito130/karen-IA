import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../memory-store.mjs";
function storage(){const data=new Map();return {getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}
test("requires consent and recalls only relevant approved memories",()=>{
 const store=createMemoryStore({storage:storage(),now:()=>"2026-11-22T00:00:00.000Z"});
 assert.throws(()=>store.remember({content:"Prefiero respuestas breves"}),/consentimiento/);
 store.remember({content:"Prefiero respuestas breves",type:"preference",consent:true});
 assert.equal(store.search("respuestas breves").length,1);
 assert.match(store.context("respuestas breves"),/Prefiero respuestas breves/);
});
test("deduplicates, supports correction and explicit deletion",()=>{
 const store=createMemoryStore({storage:storage()});
 const first=store.remember({content:"Vivo en Pamplona",type:"fact",consent:true});
 const duplicate=store.remember({content:"Vivo en Pamplona",type:"fact",consent:true});
 assert.equal(duplicate.id,first.id);
 assert.equal(duplicate.duplicate,true);
 store.update(first.id,{content:"Ahora vivo en otra ciudad"});
 assert.equal(store.list()[0].content,"Ahora vivo en otra ciudad");
 assert.equal(store.forget(first.id),true);
 assert.equal(store.list().length,0);
});
test("import requires consent, rejects oversized payloads and clear requires consent",()=>{
 const store=createMemoryStore({storage:storage()});
 assert.throws(()=>store.clear(),/confirmación/);
 assert.throws(()=>store.importJSON({format:"ed2-structured-memory",version:1,memories:[]}),/confirmación/);
 assert.throws(()=>store.importJSON({format:"ed2-structured-memory",version:1,memories:Array(1001).fill({})},{consent:true}),/1000/);
 assert.deepEqual(store.health().available,true);
});
