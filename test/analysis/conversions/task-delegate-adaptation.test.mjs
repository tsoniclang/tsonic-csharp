import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpDelegateTargetType, csharpTaskTargetType, getCsharpLambdaSignature, getCsharpTaskResultTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { selectDelegateConversion } from "../../../dist/policy/conversions/carriers.js";
import { admitCsharpConversionSelection } from "../../../dist/analysis/conversions/validation.js";
import { planCsharpDelegateAdapter } from "../../../dist/backend/planner/expressions/callable-conversions.js";
import { applyCsharpConversionSelection } from "../../../dist/backend/planner/expressions/conversions.js";
import { printCsharpExpression } from "../../../dist/print/source/printer.js";
import { csharpDelegateContractRecord, csharpTypeEmissionRecord } from "../../helpers/planning-records.mjs";

const originalProgram = `export function create(): () => Promise<number> {
  const read = async () => { for (let index = 0; index < 3; index++) { return index; } return 0; };
  return read;
}`;
const simpleProgram = "export function create(): () => Promise<number> { return async () => 1; }";

function sourceArrow(compiled) {
  const { program } = compiled.result;
  const arrows = [];
  const visit = node => {
    if (program.source.syntax.is.IsArrowFunction(node)) arrows.push(node);
    program.source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(compiled.source.getSourceFile("/project/index.ts"));
  assert.equal(arrows.length, 1, "the actual Source program has one async implementation");
  return { program, arrow: arrows[0] };
}

for (const surface of ["native", "js"]) {
  test("BF01-ASYNC " + surface + " exact baseline loop keeps Task<long> and adapts its returned use", () => {
    const compiled = compileCsharpSource({ surface, sourceText: originalProgram });
    assertCsharpCompilationSucceeded(compiled);
    const { program, arrow } = sourceArrow(compiled);
    const published = program.source.facts.values.callableReturn(arrow);
    assert.equal(published?.kind === "resolved" && published.type.kind === "declared" &&
      published.type.typeArguments.length === 1 && published.type.typeArguments[0].kind === "primitive" &&
      published.type.typeArguments[0].primitive === "int64", true,
    "the Host publishes the actual int64 Promise result independently of the authored return-use demand");
    const creation = program.records.callableCreation.get(arrow);
    assert.equal(creation?.kind === "selected" && targetTypeRefEquals(
      getCsharpTaskResultTargetType(getCsharpLambdaSignature(creation.carrier)?.returnType),
      csharpSourcePrimitiveTargetType("int64")), true,
    "the actual implementation remains Task<long>, never contextual Task<double>");
    executeCsharpConstruction(compiled, "bf01-task-loop-" + surface, true, false, [], `
var selected = Tsonic.Generated.Index.create();
if (await selected() != 0D || await selected() != 0D)
    throw new System.Exception("fixed-width async result adaptation");
`);
  });

  test("BF01-ASYNC " + surface + " actual float64 async result needs no Task map", () => {
    const compiled = compileCsharpSource({ surface, sourceText: simpleProgram });
    assertCsharpCompilationSucceeded(compiled);
    const { program, arrow } = sourceArrow(compiled);
    const creation = program.records.callableCreation.get(arrow);
    assert.equal(creation?.kind === "selected" && targetTypeRefEquals(
      getCsharpTaskResultTargetType(getCsharpLambdaSignature(creation.carrier)?.returnType),
      csharpSourcePrimitiveTargetType("float64")), true);
    const emitted = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.equal(emitted.includes("__tsonic_task_result"), false, "an equal Task payload adds no mapper");
    executeCsharpConstruction(compiled, "bf01-task-equal-" + surface, true, false, [], `
var selected = Tsonic.Generated.Index.create();
if (await selected() != 1D || await selected() != 1D)
    throw new System.Exception("equal async result identity");
`);
  });

  test("BF01-ASYNC " + surface + " Native materialized Task delegate preserves invocation, receiver, faults and cost", () => {
    const compiled = compileCsharpSource({ surface, sourceText: simpleProgram });
    assertCsharpCompilationSucceeded(compiled);
    const native = { ...compiled, artifacts: new Map([...compiled.artifacts,
      ["generated/NativeTaskAdapter.cs", nativeTaskAdapter()]]) };
    const output = executeCsharpConstruction(native, "bf01-task-lifecycle-" + surface, true, false, [], lifecycleProgram);
    const match = /^BF01_TASK_COST (\d+) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+)$/mu.exec(output);
    assert.equal(match !== null, true, "the actual emitted adapter and handwritten Task map report bounded scalar allocation");
    const [, generatedBytes, handwrittenBytes, iterations, generatedCreationBytes, handwrittenCreationBytes,
      generatedTicks, handwrittenTicks] = match.map(Number);
    assert.equal(generatedBytes, handwrittenBytes,
      "the materialized delegate Task adapter has no allocation over equivalent handwritten native mapping");
    assert.equal(iterations, 10000);
    assert.equal(generatedCreationBytes, handwrittenCreationBytes,
      "materializing the original delegate's Task adapter adds no extra closure or delegate");
    console.log("BF01_TASK_COST", JSON.stringify({ surface, generatedBytes, handwrittenBytes, iterations,
      generatedCreationBytes, handwrittenCreationBytes, generatedTicks, handwrittenTicks }));
  });
}

function nativeTaskAdapter() {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const floating = csharpSourcePrimitiveTargetType("float64");
  const source = csharpDelegateTargetType("System.Func", [], csharpTaskTargetType(integer));
  const target = csharpDelegateTargetType("System.Func", [], csharpTaskTargetType(floating));
  const policy = { projectTypes: { directSupertypes: () => [] },
    providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) }, target: {} };
  const selected = selectDelegateConversion(policy, source, target);
  assert.equal(admitCsharpConversionSelection(policy, source, target, selected) === selected, true);
  const names = new Set();
  const input = { scope: {}, program: { records: {
    delegateContract: csharpDelegateContractRecord([[source, target, selected]]),
    typeEmission: csharpTypeEmissionRecord(), directCallableReference: { get: () => undefined },
  } }, names: { temporaryName(preferred) {
    let name = preferred;
    while (names.has(name)) name = "_" + name;
    names.add(name);
    return name;
  } } };
  const diagnostics = [];
  const prelude = [];
  const planned = planCsharpDelegateAdapter({}, {}, input, diagnostics, source, target, selected,
    { kind: "IdentifierName", name: "read" }, applyCsharpConversionSelection, prelude, "stable", { kind: "stable-value" });
  assert.equal(diagnostics.length === 0 && prelude.length === 0 && planned?.kind === "LambdaExpression", true);
  assert.equal(planned.async === undefined || planned.async === false, true,
    "the outer delegate invocation stays synchronous");
  const [mapper, returned] = planned.body.statements;
  assert.equal(mapper.kind === "LocalFunctionStatement" && mapper.modifiers.join(" ") === "static async", true);
  assert.equal(returned.kind === "ReturnStatement" && returned.expression.kind === "InvocationExpression" &&
    returned.expression.arguments.length === 1 && returned.expression.arguments[0].expression.kind === "InvocationExpression" &&
    returned.expression.arguments[0].expression.callee.name === "read", true,
  "the original invocation is evaluated exactly once as the mapper's argument");
  return "public static class NativeTaskAdapter { public static System.Func<System.Threading.Tasks.Task<double>> " +
    "Adapt(System.Func<System.Threading.Tasks.Task<long>> read) => " + printCsharpExpression(planned) + "; }";
}

const lifecycleProgram = `
using System;
using System.Threading;
using System.Threading.Tasks;

var receiver = new TaskReceiver();
Func<Task<long>> original = receiver.Read;
var selected = NativeTaskAdapter.Adapt(original);
if (receiver.Calls != 0) throw new Exception("adaptation cannot invoke the original delegate");
receiver.Value = 31;
if (await selected() != 31D || receiver.Calls != 1) throw new Exception("original receiver/capture identity");
receiver.Value = 47;
if (await selected() != 47D || receiver.Calls != 2) throw new Exception("the materialized original receiver remains live");

var synchronous = new InvalidOperationException("synchronous original invocation");
var syncCalls = 0;
Func<Task<long>> throwing = () => { syncCalls++; throw synchronous; };
var synchronousAdapter = NativeTaskAdapter.Adapt(throwing);
Task<double>? escaped = null;
try { escaped = synchronousAdapter(); throw new Exception("missing synchronous throw"); }
catch (InvalidOperationException error) {
    if (!ReferenceEquals(error, synchronous) || escaped is not null || syncCalls != 1)
        throw new Exception("synchronous phase and exception identity");
}

var fault = new InvalidOperationException("faulted Task");
var faultCalls = 0;
var faulted = NativeTaskAdapter.Adapt(() => { faultCalls++; return Task.FromException<long>(fault); });
Task<double> faultedResult = faulted();
try { await faultedResult; throw new Exception("missing Task fault"); }
catch (InvalidOperationException error) {
    if (!ReferenceEquals(error, fault) || faultCalls != 1 || !faultedResult.IsFaulted)
        throw new Exception("fault identity and invocation count");
}

using var cancellation = new CancellationTokenSource();
cancellation.Cancel();
var canceledCalls = 0;
var canceled = NativeTaskAdapter.Adapt(() => {
    canceledCalls++;
    return Task.FromCanceled<long>(cancellation.Token);
});
var canceledResult = canceled();
try { await canceledResult; throw new Exception("missing Task cancellation"); }
catch (OperationCanceledException error) {
    if (error.CancellationToken != cancellation.Token || canceledCalls != 1 || !canceledResult.IsCanceled)
        throw new Exception("Task cancellation token and invocation count");
}

var pending = new TaskCompletionSource<long>();
var pendingCalls = 0;
var deferred = NativeTaskAdapter.Adapt(() => { pendingCalls++; return pending.Task; });
var deferredResult = deferred();
if (pendingCalls != 1 || deferredResult.IsCompleted) throw new Exception("one deferred original invocation");
pending.SetResult(9007199254740992L);
if (await deferredResult != 9007199254740992D || pendingCalls != 1)
    throw new Exception("deferred payload widening");

Func<Task<long>> forCost = new TaskReceiver { Value = 37 }.Read;
Func<Task<double>> generated = NativeTaskAdapter.Adapt(forCost);
Func<Task<double>> handwritten = async () => (double)await forCost();
for (var warm = 0; warm < 2000; warm++) {
    if (generated().GetAwaiter().GetResult() != 37D || handwritten().GetAwaiter().GetResult() != 37D)
        throw new Exception("warm Task result");
}
const int iterations = 10000;
var generatedBytes = Allocation(generated, iterations, out var generatedTicks);
var handwrittenBytes = Allocation(handwritten, iterations, out var handwrittenTicks);
var generatedCreationBytes = CreationAllocation(NativeTaskAdapter.Adapt, forCost, iterations);
var handwrittenCreationBytes = CreationAllocation(Handwritten, forCost, iterations);
if (generatedBytes != handwrittenBytes) throw new Exception("avoidable Task adapter allocation");
if (generatedCreationBytes != handwrittenCreationBytes) throw new Exception("avoidable Task adapter materialization");
Console.WriteLine($"BF01_TASK_COST {generatedBytes} {handwrittenBytes} {iterations} {generatedCreationBytes} {handwrittenCreationBytes} {generatedTicks} {handwrittenTicks}");

static long Allocation(Func<Task<double>> action, int count, out long elapsed) {
    var before = GC.GetAllocatedBytesForCurrentThread();
    var start = System.Diagnostics.Stopwatch.GetTimestamp();
    for (var index = 0; index < count; index++)
        if (action().GetAwaiter().GetResult() != 37D) throw new Exception("Task result allocation control");
    elapsed = System.Diagnostics.Stopwatch.GetTimestamp() - start;
    return GC.GetAllocatedBytesForCurrentThread() - before;
}

static Func<Task<double>> Handwritten(Func<Task<long>> read) => async () => (double)await read();

static long CreationAllocation(Func<Func<Task<long>>, Func<Task<double>>> factory, Func<Task<long>> read, int count) {
    var before = GC.GetAllocatedBytesForCurrentThread();
    for (var index = 0; index < count; index++) GC.KeepAlive(factory(read));
    return GC.GetAllocatedBytesForCurrentThread() - before;
}

sealed class TaskReceiver {
    public long Value;
    public int Calls;
    public Task<long> Read() { Calls++; return Task.FromResult(Value); }
}
`;
