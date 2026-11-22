import test from "node:test";
import assert from "node:assert/strict";
import { createEDOpenJarvisAdapter } from "../openjarvis-adapter.mjs";
function storage(){const data=new Map();return {getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}
test("injects only relevant personal memories and cited local knowledge",async()=>{
 const seen=[];
 const brain={id:"test-brain",ready:true,checkSupport:async()=>({supported:true}),load:async()=>true,
  generate:async messages=>{seen.push(messages);return "ok";}};
 const adapter=createEDOpenJarvisAdapter({brain,storage:storage()});
 adapter.remember({content:"Prefiero respuestas breves",type:"preference",consent:true});
 await adapter.generate([{role:"user",content:"¿Qué prefiero sobre respuestas?"}]);
 const system=seen[0].find(m=>m.role==="system")?.content||"";
 assert.match(system,/RECUERDOS PERSONALES RECUPERADOS/);
 assert.match(system,/Prefiero respuestas breves/);
 await adapter.generate([{role:"user",content:"¿Qué es la fotosíntesis?"}]);
 const knowledge=seen[1].find(m=>m.role==="system")?.content||"";
 assert.match(knowledge,/CONOCIMIENTO LOCAL RECUPERADO/);
 assert.match(knowledge,/kb-sci-005/);
});

test("exposes conflict review and resolution for personal memories",()=>{
 const adapter=createEDOpenJarvisAdapter({brain:{id:"test",ready:true,generate:async()=>"ok"},storage:storage()});
 const old=adapter.remember({content:"Prefiero respuestas breves",type:"preference",consent:true});
 const next=adapter.remember({content:"Prefiero respuestas largas",type:"preference",consent:true});
 assert.equal(next.needsReview,true);
 assert.equal(adapter.memoryConflicts("Prefiero respuestas largas",{type:"preference"}).length,1);
 assert.equal(adapter.resolveMemoryConflict(next.id,[old.id]),true);
 assert.equal(adapter.searchMemory("respuestas").some(x=>x.id===next.id),true);
});
