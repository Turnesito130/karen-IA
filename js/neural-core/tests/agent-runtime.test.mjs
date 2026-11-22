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
test("high-risk actions require approval and cancellation stops later steps",async()=>{
 let executed=0,asked=0;
 const runtime=createAgentRuntime({tools:{send_message:async()=>{executed++;}}});
 const plan={id:"p2",steps:[{id:"s1",tool:"send_message",args:{text:"hi"},risk:"critical"}]};
 const denied=await runtime.execute(plan,{approve:async()=>{asked++;return false;}});
 assert.equal(asked,1);assert.equal(executed,0);assert.equal(denied.results[0].status,"approval_required");
 const cancelled=await runtime.execute({id:"p3",steps:[{id:"s1",tool:"calculate",args:{expression:"1+1"},risk:"low"}]},{shouldStop:()=>true});
 assert.equal(cancelled.results[0].status,"cancelled");
});
test("limits plans and classifies destructive actions as critical",async()=>{
 const runtime=createAgentRuntime();
 assert.equal(classifyRisk("delete_file"),"critical");
 await assert.rejects(()=>runtime.execute({id:"p",steps:Array(13).fill({id:"x",tool:"calculate",args:{},risk:"low"})}),/no válido/);
 assert.equal(planTask("calcula 4 por 5").steps[0].tool,"calculate");
});
