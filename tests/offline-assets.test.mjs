import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("PWA caches the current Karen brain, offline bundle and secure memory-sync modules",async()=>{
 const [sw,index]=await Promise.all([
  readFile(new URL("../sw.js",import.meta.url),"utf8"),
  readFile(new URL("../index.html",import.meta.url),"utf8")
 ]);
 for(const asset of [
  "./js/memory-sync-ui.js",
  "./js/neural-core/openjarvis-adapter.mjs",
  "./js/neural-core/curated-knowledge.mjs",
  "./js/neural-core/local-transformer-brain.mjs",
  "./js/neural-core/memory-sync.mjs",
  "./js/neural-core/memory-sync-transport.mjs"
 ])assert.ok(sw.includes(asset),"Falta en la caché offline: "+asset);
 assert.match(sw,/karen-native-v\d+/);
 assert.match(index,/js\/memory-sync-ui\.js\?v=\d+/);
 assert.match(index,/js\/brain\.js\?v=\d+/);
});
