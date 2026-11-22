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
