import test from "node:test";
import assert from "node:assert/strict";
import { createKnowledgeBase } from "../knowledge-base.mjs";
test("retrieves Spanish aliases and ranks title matches",()=>{
 const kb=createKnowledgeBase([
  {id:"a",title:"Sistema operativo",text:"Administra procesos y memoria del ordenador.",domain:"technology",source:"test",status:"approved"},
  {id:"b",title:"Fotosíntesis",text:"Las plantas convierten luz en energía química.",domain:"science",source:"test",status:"approved"}
 ]);
 const result=kb.search("computadora sistema operativo");
 assert.equal(result[0].id,"a");
 assert.ok(result[0].score>0);
});
test("does not expose unapproved documents",()=>{
 const kb=createKnowledgeBase([
  {id:"a",title:"Dato revisado",text:"Contenido fiable.",domain:"general",source:"test",status:"approved"},
  {id:"b",title:"Dato pendiente",text:"Contenido sin revisar.",domain:"general",source:"test",status:"review"}
 ]);
 assert.equal(kb.search("contenido pendiente").some(x=>x.id==="b"),false);
});
