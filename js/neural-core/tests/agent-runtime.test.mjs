import test from "node:test";
import assert from "node:assert/strict";
import { createAgentRuntime, planTask, classifyRisk } from "../agent-runtime.mjs";
test("executes registered low-risk tools and stops on failure",async()=>{
 const calls=[];
 const runtime=createAgentRuntime({tools:{calculate:async args=>{calls.push(args.expression);return 42;},search:async()=>{throw new Error("offline");}}});
 const plan={id:"p1",steps:[
  {id:"s1",tool:"calculate",args:{expression:"6*7"},risk:"low"},
  {id:"s2",tool:"search",args:{query:"test"},risk:"low"}
 ]};
 const result=await runtime.execute(plan);
 assert.deepEqual(calls,["6*7"]);
 assert.equal(result.results[0].status,"completed");
 assert.equal(result.results[1].status,"failed");
 assert.equal(result.halted,true);
});
test("high-risk and device actions require explicit approval",async()=>{
 let executed=0,asked=0;
 const runtime=createAgentRuntime({tools:{send_message:async()=>{executed++;},control_device:async()=>{executed++;}}});
 for(const item of [
  {id:"s1",tool:"send_message",args:{text:"hi"},risk:"critical"},
  {id:"s2",tool:"control_device",args:{device:"lamp"},risk:"high"}
 ]){
  const denied=await runtime.execute({id:item.id,steps:[item]},{approve:async()=>{asked++;return false;}});
  assert.equal(denied.results[0].status,"approval_required");
 }
 assert.equal(asked,2);assert.equal(executed,0);
});
test("supports dry-run, cancellation and safe immutable arguments",async()=>{
 let executed=0,received;
 const runtime=createAgentRuntime({tools:{calculate:async args=>{executed++;received=args;return 42;}}});
 const plan={id:"p3",steps:[{id:"s1",tool:"calculate",args:{nested:{x:1}},risk:"low"}]};
 const simulated=await runtime.execute(plan,{dryRun:true});
 assert.equal(simulated.results[0].status,"simulated");
 assert.equal(executed,0);
 const done=await runtime.execute(plan);
 assert.equal(done.results[0].status,"completed");
 assert.equal(Object.isFrozen(received.nested),true);
 assert.throws(()=>{received.nested.x=2;},TypeError);
 const cancelled=await runtime.execute(plan,{shouldStop:()=>true});
 assert.equal(cancelled.results[0].status,"cancelled");
});
test("rejects unsafe args and validates tool risk",async()=>{
 const runtime=createAgentRuntime();
 assert.equal(classifyRisk("delete_file"),"critical");
 assert.equal(classifyRisk("control_device"),"high");
 await assert.rejects(()=>runtime.execute({id:"p",steps:Array(13).fill({id:"x",tool:"calculate",args:{},risk:"low"})}),/no válido/);
 await assert.rejects(()=>runtime.execute({id:"p",steps:[{id:"s",tool:"calculate",args:{"__proto__":{polluted:true}},risk:"low"}]}),/no válido/);
 assert.equal(planTask("calcula 4 por 5").steps[0].tool,"calculate");
});
test("audit callback failure cannot crash execution",async()=>{
 const runtime=createAgentRuntime({tools:{calculate:async()=>2},onAudit:()=>{throw new Error("audit disk full");}});
 const result=await runtime.execute({id:"p",steps:[{id:"s",tool:"calculate",args:{expression:"1+1"},risk:"low"}]});
 assert.equal(result.results[0].status,"completed");
 assert.equal(runtime.diagnostics().auditFailures,1);
});
