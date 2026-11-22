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

test("prefers exact phrase matches and exposes why a document matched",()=>{
 const kb=createKnowledgeBase([
  {id:"a",title:"Seguridad de contraseñas",text:"Una contraseña larga y única protege cuentas.",domain:"technology",source:"manual-v1",status:"approved"},
  {id:"b",title:"Seguridad informática",text:"La protección de sistemas y redes.",domain:"technology",source:"manual-v1",status:"approved"}
 ]);
 const result=kb.search("seguridad de contraseñas");
 assert.equal(result[0].id,"a");
 assert.equal(result[0].matchType,"exact-title-phrase");
 assert.equal(result[0].source,"manual-v1");
});
test("accepts new Spanish aliases without trusting pending documents",()=>{
 const kb=createKnowledgeBase([
  {id:"a",title:"Conexión inalámbrica",text:"WiFi conecta dispositivos a una red.",domain:"technology",source:"test",status:"approved"},
  {id:"b",title:"Conexión Bluetooth",text:"Conexión inalámbrica de corto alcance.",domain:"technology",source:"test",status:"review"}
 ]);
 assert.equal(kb.search("wifi").some(x=>x.id==="a"),true);
 assert.equal(kb.search("bluetooth").some(x=>x.id==="b"),false);
});
