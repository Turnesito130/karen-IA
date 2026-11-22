import test from "node:test";
import assert from "node:assert/strict";
import { inferRelation } from "../inference-engine.mjs";
test("infers a multi-hop positive relation",()=>{
 const facts=[{question:"perros",answer:"mamíferos"},{question:"mamíferos",answer:"animales"}];
 const result=inferRelation({facts,query:"¿Los perros son animales?"});
 assert.equal(result.status,"entailed");
 assert.equal(result.path.length,3);
});
test("detects an explicit negative fact instead of inventing certainty",()=>{
 const facts=[{question:"perros no",answer:"aves"}];
 assert.equal(inferRelation({facts,query:"¿Los perros son aves?"}).status,"contradicted");
 assert.equal(inferRelation({facts,query:"¿Los perros no son aves?"}).status,"entailed");
});
test("keeps unrelated claims unknown",()=>{
 const facts=[{question:"perros",answer:"mamíferos"}];
 assert.equal(inferRelation({facts,query:"¿Los perros son reptiles?"}).status,"unknown");
});

test("reports contradictory positive and negative evidence",()=>{
 const facts=[
  {id:"f1",statement:"Los gatos son mamíferos"},
  {id:"f2",statement:"Los gatos no son mamíferos"}
 ];
 const result=inferRelation({facts,query:"¿Los gatos son mamíferos?"});
 assert.equal(result.status,"conflict");
 assert.deepEqual(result.evidence.map(x=>x.id).sort(),["f1","f2"]);
});
test("reports a negative conclusion from a positive chain",()=>{
 const facts=[
  {id:"f1",statement:"Los perros son mamíferos"},
  {id:"f2",statement:"Los mamíferos son animales"}
 ];
 const result=inferRelation({facts,query:"¿Los perros no son animales?"});
 assert.equal(result.status,"contradicted");
});
test("rejects unsafe inference depth",()=>{
 assert.throws(()=>inferRelation({facts:[],query:"¿Los perros son animales?",maxDepth:99}),/maxDepth/);
});
