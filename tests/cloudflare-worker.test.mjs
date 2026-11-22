import test from "node:test";
import assert from "node:assert/strict";
import worker from "../server/cloudflare-worker.mjs";

function fakeDB() {
 let row = null;
 return {
  prepare(sql) {
   if (sql.startsWith("SELECT")) return { first: async () => row ? { ...row } : null };
   return {
    bind(...args) {
     return {
      run: async () => {
       if (sql.startsWith("INSERT")) {
        if (row) return { success: true, meta: { changes: 0 } };
        row = { revision: args[0], envelope: args[1] };
        return { success: true, meta: { changes: 1 } };
       }
       if (sql.startsWith("UPDATE")) {
        if (!row || row.revision !== args[2]) return { success: true, meta: { changes: 0 } };
        row = { revision: args[0], envelope: args[1] };
        return { success: true, meta: { changes: 1 } };
       }
       throw new Error("SQL no soportado en test");
      }
     };
    }
   };
  }
 };
}
const token="cloudflare-worker-test-token".padEnd(48,"x");
const origin="https://turnesito130.github.io";
const cipher={format:"karen-memory-ciphertext",version:1,salt:btoa("1234567890123456"),
 iv:btoa("123456789012"),ciphertext:btoa("123456789012345678901234")};
const env=()=>({DB:fakeDB(),KAREN_SYNC_TOKEN:token,KAREN_SYNC_ORIGIN:origin});
const request=(method,headers={},body)=>new Request("https://vault.example/v1/memory",{method,headers:{Origin:origin,...headers},body});

test("Worker aplica CORS, autenticación y compare-and-swap sobre ciphertext",async()=>{
 const bindings=env();
 const denied=await worker.fetch(request("GET"),bindings);
 assert.equal(denied.status,401);
 const empty=await worker.fetch(request("GET",{Authorization:"Bearer "+token}),bindings);
 assert.equal(empty.status,200);
 assert.equal(empty.headers.get("Access-Control-Allow-Origin"),origin);
 assert.equal((await empty.json()).envelope,null);
 const saved=await worker.fetch(request("PUT",{Authorization:"Bearer "+token,"Content-Type":"application/json","If-None-Match":"*"},JSON.stringify({envelope:cipher})),bindings);
 assert.equal(saved.status,200);
 const revision=(await saved.json()).revision;
 const stale=await worker.fetch(request("PUT",{Authorization:"Bearer "+token,"Content-Type":"application/json","If-Match":'"stale"'},JSON.stringify({envelope:cipher})),bindings);
 assert.equal(stale.status,412);
 const loaded=await worker.fetch(request("GET",{Authorization:"Bearer "+token}),bindings);
 assert.equal((await loaded.json()).revision,revision);
 const updated=await worker.fetch(request("PUT",{Authorization:"Bearer "+token,"Content-Type":"application/json","If-Match":'"'+revision+'"'},JSON.stringify({envelope:cipher})),bindings);
 assert.equal(updated.status,200);
});

test("Worker rechaza orígenes y contenido sin cifrar",async()=>{
 const bindings=env();
 const foreign=new Request("https://vault.example/v1/memory",{headers:{Origin:"https://attacker.example",Authorization:"Bearer "+token}});
 assert.equal((await worker.fetch(foreign,bindings)).status,403);
 const plain=await worker.fetch(request("PUT",{Authorization:"Bearer "+token,"Content-Type":"application/json","If-None-Match":"*"},JSON.stringify({envelope:{format:"plain",memories:[]}})),bindings);
 assert.equal(plain.status,400);
});
