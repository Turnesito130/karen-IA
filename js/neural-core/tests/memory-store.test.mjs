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
test("detects conflicting preferences and requires explicit resolution",()=>{
 const store=createMemoryStore({storage:storage()});
 const old=store.remember({content:"Prefiero respuestas breves",type:"preference",consent:true});
 const newer=store.remember({content:"Prefiero respuestas largas",type:"preference",consent:true});
 assert.equal(newer.status,"uncertain");
 assert.equal(newer.needsReview,true);
 assert.equal(store.search("respuestas").length,0);
 assert.equal(store.search("respuestas",{includeUncertain:true}).some(x=>x.id===newer.id),true);
 assert.equal(store.resolveConflict(newer.id,[old.id]),true);
 assert.equal(store.list({status:"all"}).find(x=>x.id===old.id).status,"superseded");
 assert.equal(store.list().some(x=>x.id===newer.id),true);
});
test("migrates old E.D. memory and reports storage persistence honestly",()=>{
 const backend=storage();
 backend.setItem("ed_structured_memory_v1",JSON.stringify([{id:"old-1",content:"Dato antiguo",type:"fact",status:"active"}]));
 const store=createMemoryStore({storage:backend});
 assert.equal(store.list({status:"all"}).some(x=>x.id==="old-1"),true);
 assert.equal(store.health().persistent,false);
});
test("import requires consent, rejects oversized payloads and clear requires consent",()=>{
 const store=createMemoryStore({storage:storage()});
 assert.throws(()=>store.clear(),/confirmación/);
 assert.throws(()=>store.importJSON({format:"karen-structured-memory",version:2,memories:[]}),/confirmación/);
 assert.throws(()=>store.importJSON({format:"karen-structured-memory",version:2,memories:Array(1001).fill({})},{consent:true}),/1000/);
 assert.deepEqual(store.health().available,true);
});

test("does not silently overwrite corrupted memory",()=>{
 const backend=storage();
 backend.setItem("karen_structured_memory_v2","{broken-json");
 const store=createMemoryStore({storage:backend});
 assert.throws(()=>store.search("dato"),/no se puede leer/);
 assert.equal(store.health().corrupt,true);
 assert.throws(()=>store.remember({content:"nuevo dato",consent:true}),/no se puede leer/);
 assert.equal(store.clear({consent:true}),0);
 assert.equal(store.health().corrupt,false);
 assert.deepEqual(store.list(),[]);
});
