import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
test("Chromebook file bundle loads current memory, knowledge, autonomy and review modules",async()=>{
 const source=await readFile(new URL("../chromebook-file-bundle.js",import.meta.url),"utf8");
 const sandbox={window:{}};
 vm.runInNewContext(source,sandbox,{timeout:2000});
 const modules=sandbox.window.EDModules;
 assert.equal(typeof modules.import,"function");
 const syncModule=await modules.import("./neural-core/memory-sync.mjs");
 const transportModule=await modules.import("./neural-core/memory-sync-transport.mjs");
 assert.equal(typeof syncModule.createMemorySync,"function");
 assert.equal(typeof transportModule.createEncryptedMemoryTransport,"function");

 const {createEDOpenJarvisAdapter}=await modules.import("./neural-core/openjarvis-adapter.mjs");
 const backendData=new Map();
 const storage={getItem:key=>backendData.has(key)?backendData.get(key):null,setItem:(key,value)=>backendData.set(key,String(value)),removeItem:key=>backendData.delete(key)};
 const adapter=createEDOpenJarvisAdapter({brain:{id:"bundle-test",ready:true,generate:async()=>"ok"},storage});
 assert.equal(adapter.knowledge.size>=40,true);
 assert.equal(adapter.id,"karen-native-local-adapter");
 const native=createEDOpenJarvisAdapter({storage});
 await native.load();
 const identity=await native.generate([{role:"user",content:"¿Quién eres?"}]);
 assert.match(identity,/Soy Karen/);
 assert.doesNotMatch(identity,/Soy E[.]D[.]/);

 assert.equal(typeof adapter.memoryConflicts,"function");
 assert.equal(typeof adapter.resolveMemoryConflict,"function");
 assert.equal(typeof adapter.reviewJavaScript,"function");
 assert.ok(adapter.reviewJavaScript("eval(input)").findings.some(item=>item.rule==="dynamic-code"));
 const memory=adapter.remember({content:"Prefiero respuestas breves",type:"preference",consent:true});
 assert.equal(memory.status,"active");
});
