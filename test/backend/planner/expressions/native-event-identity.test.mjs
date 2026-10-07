import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { buildUnsupportedMemberFixture } from "../../../fixtures/dotnet-provider/dotnet-provider.helpers.mjs";
import { planCsharpDelegateAdapter, planCsharpDelegateAdaptationBody } from "../../../../dist/backend/planner/expressions/delegate-adapters.js";
import { applyCsharpConversionSelection } from "../../../../dist/backend/planner/expressions/conversions.js";
import { csharpDelegateTargetType } from "../../../../dist/target-model/types/delegates.js";
import { selectCsharpConversion } from "../../../../dist/policy/conversions/index.js";

const importSource = 'import { EventSignatures } from "@tsonic/dotnet/ProviderUnsupportedMemberFixtures.js";';

function compiledEvents(source) {
  const assembly = buildUnsupportedMemberFixture();
  return { assembly, compiled: compileCsharpSource({ sourceText: `${importSource}\n${source}`,
    targetOptions: { namespace: "EventProof", references: { assemblies: [{ include: "UnsupportedMembersProviderFixture", hintPath: assembly }] } } }) };
}

function runNative(compiled, assembly, program) {
  mkdirSync(fileURLToPath(new URL("../../../../.temp/", import.meta.url)), { recursive: true });
  const root = mkdtempSync(fileURLToPath(new URL("../../../../.temp/native-event-identity-", import.meta.url)));
  for (const [index, [, source]] of [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).entries()) {
    writeFileSync(join(root, `Generated${index}.cs`), source);
  }
  const project = join(root, "Proof.csproj");
  writeFileSync(project, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><OutputType>Exe</OutputType><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup><ItemGroup><Reference Include="UnsupportedMembersProviderFixture"><HintPath>${assembly}</HintPath></Reference></ItemGroup></Project>`);
  writeFileSync(join(root, "Program.cs"), program);
  const executed = spawnSync("dotnet", ["run", "--project", project, "-c", "Release", "--verbosity", "quiet", "-m:1"],
    { encoding: "utf8", timeout: 240000, maxBuffer: 1048576 });
  assert.equal(executed.status, 0, `${executed.error ?? ""}\n${executed.stdout}\n${executed.stderr}`.slice(0, 4096));
  console.log(executed.stdout.trim());
  return executed.stdout;
}

test("native adapted events retain identity through original callbacks, aliases, branches and independent activations", () => {
  const original = readFileSync(fileURLToPath(new URL("../../../integration/provider-selection/dotnet-advanced-api-capability-closure.test.mjs", import.meta.url)), "utf8");
  const source = /export function events\(value: EventSignatures, callback: \(value: number\) => void\): void \{[\s\S]*?\n      \}/u.exec(original)?.[0];
  assert.equal(typeof source, "string", "retain unchanged original user source");
  const { assembly, compiled } = compiledEvents(`${source}
    export function aliases(value: EventSignatures, callback: (value: number) => void): void {
      const alias = callback;
      value.addChanged(callback);
      value.removeChanged(alias);
    }
    export function branches(value: EventSignatures, callback: (value: number) => void, enabled: boolean): void {
      if (enabled) value.addChanged(callback);
      if (enabled) value.removeChanged(callback);
    }
    export function repeated(value: EventSignatures, callback: (value: number) => void): void {
      value.addChanged(callback);
      value.addChanged(callback);
      value.Raise(7);
      value.removeChanged(callback);
      value.Raise(11);
      value.removeChanged(callback);
      value.Raise(13);
    }
    export function captured(value: EventSignatures, seed: number): number {
      let total = seed;
      const callback = (current: number): void => { total += current; };
      value.addChanged(callback);
      value.Raise(3);
      value.removeChanged(callback);
      value.Raise(11);
      return total;
    }
    export function exceptional(value: EventSignatures, callback: (value: number) => void): void {
      value.addChanged(callback);
      try { value.Raise(3); } finally { value.removeChanged(callback); }
    }
    export function mutable(value: EventSignatures, callback: (value: number) => void, next: (value: number) => void): void {
      value.addChanged(callback);
      callback = next;
      value.addChanged(callback);
    }
  `);
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, source]) => source).join("\n");
  const originalBody = output.slice(output.indexOf("public static void events"), output.indexOf("public static void aliases"));
  assert.equal(originalBody.match(/void __tsonic_adapter\w*\(int/gu)?.length, 1);
  const handlerNames = [...originalBody.matchAll(/\.Changed [+-]= new System\.Action<int>\((\w+)\)/gu)].map(match => match[1]);
  assert.equal(handlerNames.length, 2);
  assert.equal(handlerNames[0] === handlerNames[1], true, "same exact native method identity");
  assert.doesNotMatch(originalBody, /switch|=>|Dictionary|ConditionalWeakTable/u);
  assert.match(runNative(compiled, assembly, `using System;
using ProviderUnsupportedMemberFixtures;
using Generated = EventProof.Index;
static class Program {
  static void Human(EventSignatures value, Action<double> callback) {
    value.Changed += Adapter;
    value.Changed -= Adapter;
    void Adapter(int current) { callback(current); }
  }
  static long Allocation(Action<EventSignatures, Action<double>> operation) {
    var value = new EventSignatures(); Action<double> callback = current => {};
    for (var index = 0; index < 1000; index++) operation(value, callback);
    var start = GC.GetAllocatedBytesForCurrentThread();
    for (var index = 0; index < 10000; index++) operation(value, callback);
    return GC.GetAllocatedBytesForCurrentThread() - start;
  }
  static void Main() {
    var value = new EventSignatures(); var total = 0; Action<double> callback = current => { total++; };
    Generated.events(value, callback); Generated.events(value, callback); value.Raise(1);
    if (total != 0) throw new Exception("original independent activations");
    Generated.aliases(value, callback); value.Raise(1);
    Generated.branches(value, callback, false); Generated.branches(value, callback, true); value.Raise(1);
    if (total != 0) throw new Exception("aliases/branches");
    var sum = 0.0; Generated.repeated(value, current => { sum += current; });
    if (sum != 25.0) throw new Exception("native last matching subscription removal");
    if (Generated.captured(value, 5) != 8) throw new Exception("captured mutation");
    var expected = new InvalidOperationException("exact exception");
    try { Generated.exceptional(value, current => throw expected); throw new Exception("lost exception"); }
    catch (InvalidOperationException actual) { if (!ReferenceEquals(actual, expected)) throw; }
    value.Raise(1);
    var first = 0; var second = 0; var mutable = new EventSignatures();
    Generated.mutable(mutable, current => { first++; }, current => { second++; }); mutable.Raise(1);
    if (first != 1 || second != 1) throw new Exception("mutable value snapshots");
    var generatedBytes = Allocation(Generated.events); var humanBytes = Allocation(Human);
    Console.WriteLine($"generated_bytes={generatedBytes};human_bytes={humanBytes}");
    if (generatedBytes != humanBytes) throw new Exception("native local-method allocation parity");
    Console.WriteLine("native event identity passed");
  }
}`), /native event identity passed/u);
});

test("nullable adapted event handlers retain native absence without tags or invocation on null", () => {
  const { assembly, compiled } = compiledEvents(`
    export function nullable(value: EventSignatures, callback: ((value: number) => void) | undefined): void {
      value.addChanged(callback);
      value.removeChanged(callback);
    }
    export function nullableAliases(value: EventSignatures, callback: ((value: number) => void) | undefined): void {
      const alias = callback;
      value.addChanged(callback);
      value.removeChanged(alias);
    }
  `);
  assertCsharpCompilationSucceeded(compiled);
  assert.match(runNative(compiled, assembly, `using System;
using ProviderUnsupportedMemberFixtures;
var value = new EventSignatures();
EventProof.Index.nullable(value, null); value.Raise(1);
var invocations = 0; EventProof.Index.nullable(value, current => { invocations++; }); value.Raise(1);
EventProof.Index.nullableAliases(value, null); value.Raise(1);
EventProof.Index.nullableAliases(value, current => { invocations++; }); value.Raise(1);
if (invocations != 0) throw new Exception("nullable adapted identity");
Console.WriteLine("nullable event identity passed");
`), /nullable event identity passed/u);
});

test("retained adapter planning rejects a stale activation or carrier and keeps ABI validation at one owner", () => {
  const source = csharpDelegateTargetType("System.Action", [{ kind: "source-primitive", name: "float64" }]);
  const target = csharpDelegateTargetType("System.Action", [{ kind: "source-primitive", name: "int32" }]);
  const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId: () => undefined }, target: {} };
  const selection = selectCsharpConversion(policy, source, target, "implicit");
  const identity = Object.freeze({ declaration: {}, scope: {}, source, target, selection });
  const node = {};
  const base = { scope: { delegateAdapters: new Map([[identity, "adapter"]]) }, program: {
    conversions: { delegateAdapter: expression => expression === node ? identity : undefined },
  }, names: { temporaryName: () => assert.fail("retained native binding must not create per-use wrapper temporaries") } };
  for (const context of [
    { ...base, scope: { delegateAdapters: new Map() } },
    { ...base, program: { conversions: { delegateAdapter: () => ({ ...identity,
      target: csharpDelegateTargetType("System.Action", [{ kind: "source-primitive", name: "int64" }]) }) } } },
  ]) {
    const diagnostics = [];
    assert.equal(planCsharpDelegateAdapter(node, {}, context, diagnostics, source, target, selection,
      { kind: "IdentifierName", name: "callback" }, applyCsharpConversionSelection) === undefined, true);
    assert.equal(diagnostics.length, 1);
  }
  const diagnostics = [];
  const planned = planCsharpDelegateAdapter(node, {}, base, diagnostics, source, target, selection,
    { kind: "IdentifierName", name: "callback" }, applyCsharpConversionSelection);
  assert.equal(diagnostics.length, 0);
  assert.equal(planned.kind, "ObjectCreationExpression");
  assert.equal(planned.arguments[0].expression.name, "adapter");
  for (const modes of [undefined, [], ["byref-readwrite"], ["move"]]) {
    const invalid = { ...source, csharpDelegateSignature: { ...source.csharpDelegateSignature, parameterPassingModes: modes } };
    const failures = [];
    assert.equal(planCsharpDelegateAdaptationBody(node, {}, base, failures, invalid, target, selection,
      { kind: "IdentifierName", name: "callback" }, applyCsharpConversionSelection) === undefined, true);
    assert.equal(failures.length, 1);
  }
});

test("adapted native event removal rejects unproved mutable, opaque and cross-activation identity without disabling ordinary conversion", () => {
  for (const source of [
    "export function remove(value: EventSignatures, callback: (value: number) => void): void { value.removeChanged(callback); }",
    "export function remove(value: EventSignatures, callback: (value: number) => void, next: (value: number) => void): void { value.addChanged(callback); callback = next; value.removeChanged(callback); }",
    "export function remove(value: EventSignatures, make: () => ((value: number) => void)): void { value.addChanged(make()); value.removeChanged(make()); }",
    "export function add(value: EventSignatures, callback: (value: number) => void): void { value.addChanged(callback); } export function remove(value: EventSignatures, callback: (value: number) => void): void { value.removeChanged(callback); }",
  ]) {
    const { compiled } = compiledEvents(source);
    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "CSHARP_DELEGATE_IDENTITY_NOT_CLOSED"), true);
    assert.equal(compiled.artifacts.size, 0);
  }
});
