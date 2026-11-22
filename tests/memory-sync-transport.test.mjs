import test from "node:test";
import assert from "node:assert/strict";
import { createEncryptedMemoryTransport } from "../js/neural-core/memory-sync-transport.mjs";

function response(value,status=200){return{ok:status>=200&&status<300,status,json:async()=>value};}
function fakeVault(){
 let envelope=null,revision=null;
 return {
  snapshot:()=>structuredClone(envelope),
  fetch:async(_url,options)=>{
   if(options.method==="GET")return response({revision,envelope:structuredClone(envelope)});
   if(options.method==="PUT"){
    const expected=options.headers["If-Match"],create=options.headers["If-None-Match"]==="*";
    if(create?revision!==null:!revision||expected!=='"'+revision+'"')return response({error:"conflict"},412);
    envelope=JSON.parse(options.body).envelope;
    revision="rev-"+(revision?Number(revision.split("-")[1])+1:1);
    return response({revision});
   }
   return response({},405);
  }
 };
}
const envelope={format:"karen-memory-sync",version:1,deviceId:"phone",exportedAt:"2026-11-22T10:00:00.000Z",
 memories:[{id:"m1",content:"Un recuerdo privado",type:"note",source:"user_explicit",confidence:.9,status:"active",createdAt:"2026-11-22T10:00:00.000Z",updatedAt:"2026-11-22T10:00:00.000Z"}]};

test("cifra antes de enviar y descifra al recuperar",async()=>{
 const vault=fakeVault();
 const transport=createEncryptedMemoryTransport({baseUrl:"https://memory.example.test",accessToken:"x".repeat(48),passphrase:"una-frase-larga-y-privada",fetchImpl:vault.fetch,cryptoImpl:globalThis.crypto});
 assert.deepEqual(await transport.read(),{revision:null,envelope:null});
 const saved=await transport.compareAndSwap({expectedRevision:null,envelope});
 assert.equal(saved.ok,true);
 const stored=JSON.stringify(vault.snapshot());
 assert.doesNotMatch(stored,/Un recuerdo privado/);
 assert.equal(vault.snapshot().format,"karen-memory-ciphertext");
 const restored=await transport.read();
 assert.equal(restored.revision,"rev-1");
 assert.equal(restored.envelope.memories[0].content,"Un recuerdo privado");
});

test("una frase incorrecta no puede descifrar ni sobrescribir recuerdos",async()=>{
 const vault=fakeVault();
 const first=createEncryptedMemoryTransport({baseUrl:"https://memory.example.test",accessToken:"x".repeat(48),passphrase:"frase-correcta-privada",fetchImpl:vault.fetch,cryptoImpl:globalThis.crypto});
 await first.compareAndSwap({expectedRevision:null,envelope});
 const wrong=createEncryptedMemoryTransport({baseUrl:"https://memory.example.test",accessToken:"x".repeat(48),passphrase:"frase-incorrecta-privada",fetchImpl:vault.fetch,cryptoImpl:globalThis.crypto});
 await assert.rejects(()=>wrong.read(),/frase de cifrado/);
 assert.equal(vault.snapshot().format,"karen-memory-ciphertext");
});

test("rechaza HTTP remoto, tokens débiles y frases cortas",()=>{
 assert.throws(()=>createEncryptedMemoryTransport({baseUrl:"http://memory.example.test",accessToken:"x".repeat(48),passphrase:"frase-segura-larga"}),/HTTPS/);
 assert.throws(()=>createEncryptedMemoryTransport({baseUrl:"https://memory.example.test/path",accessToken:"x".repeat(48),passphrase:"frase-segura-larga"}),/HTTPS/);
 assert.throws(()=>createEncryptedMemoryTransport({baseUrl:"https://memory.example.test",accessToken:"short",passphrase:"frase-segura-larga"}),/32 caracteres/);
 assert.throws(()=>createEncryptedMemoryTransport({baseUrl:"https://memory.example.test",accessToken:"x".repeat(48),passphrase:"corta"}),/12 caracteres/);
});
