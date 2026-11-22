import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../js/neural-core/memory-store.mjs";
import { createMemorySync, validateMemorySyncEnvelope } from "../js/neural-core/memory-sync.mjs";

function storage(){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
function remoteStore(initial=null){
 let revision=initial?"r1":null, envelope=initial;
 return {
  async read(){return {revision,envelope};},
  async compareAndSwap({expectedRevision,envelope:next}){
   if(expectedRevision!==revision)return {ok:false,revision};
   envelope=structuredClone(next);revision="r"+(Number(String(revision||"r0").slice(1))+1);
   return {ok:true,revision};
  },
  snapshot(){return structuredClone(envelope);}
 };
}
function makeEnvelope(deviceId, memories=[]){return{format:"karen-memory-sync",version:1,deviceId,exportedAt:"2026-11-22T10:00:00.000Z",memories};}
function item(id,content,updatedAt="2026-11-22T10:00:00.000Z"){return{id,content,type:"fact",source:"user_explicit",confidence:.9,status:"active",createdAt:updatedAt,updatedAt};}

test("preview no modifica memoria local ni escribe en remoto",async()=>{
 const memory=createMemoryStore({storage:storage()});
 memory.remember({content:"Dato local",type:"fact",consent:true});
 const remote=remoteStore(makeEnvelope("phone",[item("remote-1","Dato del móvil")]));
 const sync=createMemorySync({memory,transport:remote,deviceId:"laptop"});
 const preview=await sync.preview();
 assert.equal(preview.added,1);
 assert.equal(memory.list({status:"all"}).length,1);
 assert.equal(remote.snapshot().memories.length,1);
});

test("sincroniza en ambas direcciones usando compare-and-swap",async()=>{
 const memory=createMemoryStore({storage:storage()});
 memory.remember({content:"Dato del ordenador",type:"fact",consent:true});
 const remote=remoteStore(makeEnvelope("phone",[item("phone-1","Dato del móvil")]));
 const sync=createMemorySync({memory,transport:remote,deviceId:"laptop"});
 const result=await sync.sync();
 assert.equal(result.dryRun,false);
 assert.equal(memory.list({status:"all"}).length,2);
 assert.equal(remote.snapshot().memories.length,2);
 assert.ok(memory.list({status:"all"}).some(x=>x.id==="phone-1"));
});

test("conserva ambas versiones como inciertas si el mismo ID tiene contenido distinto",async()=>{
 const memory=createMemoryStore({storage:storage()});
 memory.remember({content:"Versión local",type:"fact",consent:true});
 const local=JSON.parse(memory.exportJSON()).memories[0];
 const remote=remoteStore(makeEnvelope("phone",[{...local,content:"Versión remota",source:"phone"}]));
 const sync=createMemorySync({memory,transport:remote,deviceId:"laptop"});
 const result=await sync.sync();
 assert.equal(result.conflicts.length,2);
 assert.ok(memory.list({status:"all"}).filter(x=>x.status==="uncertain").length>=2);
});

test("no sincroniza en modo dry-run",async()=>{
 const memory=createMemoryStore({storage:storage()});
 const remote=remoteStore(null);
 const sync=createMemorySync({memory,transport:remote,deviceId:"laptop"});
 const result=await sync.sync({dryRun:true});
 assert.equal(result.dryRun,true);
 assert.equal(remote.snapshot(),null);
});

test("rechaza paquetes con identificadores duplicados",()=>{
 assert.throws(()=>validateMemorySyncEnvelope(makeEnvelope("phone",[item("same","uno"),item("same","dos")])),/duplicados/);
});

test("reintenta si cambia la revisión remota durante la escritura",async()=>{
 const memory=createMemoryStore({storage:storage()});
 const base=remoteStore(null);let first=true;
 const transport={
  read:()=>base.read(),
  async compareAndSwap(args){if(first){first=false;await base.compareAndSwap({expectedRevision:null,envelope:makeEnvelope("other",[item("other-1","Cambio concurrente")])});return{ok:false};}return base.compareAndSwap(args);}
 };
 const sync=createMemorySync({memory,transport,deviceId:"laptop"});
 const result=await sync.sync();
 assert.equal(result.attempt,2);
 assert.ok(base.snapshot().memories.some(x=>x.id==="other-1"));
});
