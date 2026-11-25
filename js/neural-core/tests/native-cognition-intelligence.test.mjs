import test from "node:test";
import assert from "node:assert/strict";
import { createNativeCognition } from "../native-cognition.mjs";

function memoryStorage(){
  const data=new Map();
  return {getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
}

test("recupera conocimiento con plurales, tildes y formas verbales españolas",async()=>{
  const brain=createNativeCognition({storage:memoryStorage()});
  await brain.load();
  const messages=[
    {role:"system",content:"CONOCIMIENTO LOCAL RECUPERADO\n[Fuente kb-sci-006]\nLos cloroplastos son orgánulos de las células vegetales donde ocurre principalmente la fotosíntesis."},
    {role:"user",content:"¿Qué función tienen los cloroplastos?"}
  ];
  const answer=brain.generate(messages);
  assert.match(answer,/cloroplastos/i);
  assert.match(answer,/Fuente local: kb-sci-006/);
});

test("recupera hechos aprendidos aunque cambien singular, plural y conjugación",async()=>{
  const brain=createNativeCognition({storage:memoryStorage()});
  await brain.load();
  brain.learn("motor eléctrico","Transforma energía eléctrica en energía mecánica.");
  const found=brain.recall("¿Cómo funcionan los motores eléctricos?",{limit:1,minScore:.5});
  assert.equal(found.length,1);
  assert.match(found[0].answer,/energía mecánica/);
});

test("no convierte una consulta sin términos coincidentes en un recuerdo",async()=>{
  const brain=createNativeCognition({storage:memoryStorage()});
  await brain.load();
  brain.learn("fotosíntesis","Proceso por el que las plantas convierten luz en energía química.");
  assert.equal(brain.recall("¿Cuál es la capital de Japón?",{limit:1,minScore:.5}).length,0);
});
