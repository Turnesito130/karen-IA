import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryVaultServer } from "../server/memory-sync-server.mjs";

const token="karen-test-token-".padEnd(48,"x");
const cipher={format:"karen-memory-ciphertext",version:1,
 salt:Buffer.alloc(16,1).toString("base64"),iv:Buffer.alloc(12,2).toString("base64"),
 ciphertext:Buffer.alloc(32,3).toString("base64")};

test("el servidor exige autorización y almacena únicamente sobres cifrados",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"karen-vault-")),file=join(dir,"vault.json");
 const server=createMemoryVaultServer({token,dataFile:file,origin:"https://karen.example"});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const base="http://127.0.0.1:"+server.address().port+"/v1/memory";
 try{
  const denied=await fetch(base);assert.equal(denied.status,401);
  const empty=await fetch(base,{headers:{Authorization:"Bearer "+token}}).then(r=>r.json());
  assert.equal(empty.revision,null);assert.equal(empty.envelope,null);
  const saved=await fetch(base,{method:"PUT",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json","If-None-Match":"*"},body:JSON.stringify({envelope:cipher})});
  assert.equal(saved.status,200);const revision=(await saved.json()).revision;
  const stored=await readFile(file,"utf8");assert.doesNotMatch(stored,/recuerdo privado|texto secreto/i);
  const stale=await fetch(base,{method:"PUT",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json","If-Match":'"'+"stale"+'"'},body:JSON.stringify({envelope:cipher})});
  assert.equal(stale.status,412);
  const updated=await fetch(base,{method:"PUT",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json","If-Match":'"'+revision+'"'},body:JSON.stringify({envelope:cipher})});
  assert.equal(updated.status,200);
  const corrupted=JSON.parse(await readFile(file,"utf8"));corrupted.revision="wrong-revision";
  await writeFile(file,JSON.stringify(corrupted),"utf8");
  const integrity=await fetch(base,{headers:{Authorization:"Bearer "+token}});
  assert.equal(integrity.status,500);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});

test("rechaza un origen web no autorizado",async()=>{
 const server=createMemoryVaultServer({token,origin:"https://allowed.example",dataFile:join(tmpdir(),"karen-vault-origin-test.json")});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const response=await fetch("http://127.0.0.1:"+server.address().port+"/v1/memory",{headers:{Origin:"https://attacker.example",Authorization:"Bearer "+token}});
  assert.equal(response.status,403);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test("no acepta sobres que no sean ciphertext",async()=>{
 const server=createMemoryVaultServer({token,dataFile:join(tmpdir(),"karen-vault-invalid-test.json")});
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{
  const response=await fetch("http://127.0.0.1:"+server.address().port+"/v1/memory",{method:"PUT",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json","If-None-Match":"*"},body:JSON.stringify({envelope:{format:"plain-json",memories:[]}})});
  assert.equal(response.status,400);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
