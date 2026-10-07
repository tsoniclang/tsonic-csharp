import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { planCsharpDelegateAdapter } from "../../../../dist/backend/planner/expressions/delegate-adapters.js";
import { applyCsharpConversionSelection } from "../../../../dist/backend/planner/expressions/conversions.js";
import { selectCsharpConversion } from "../../../../dist/policy/conversions/index.js";
import { csharpDelegateTargetType } from "../../../../dist/target-model/types/delegates.js";
import { csharpTargetNamedType } from "../../../../dist/target-model/types/factories.js";
import { printCsharpExpression } from "../../../../dist/print/source/printer.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { assertNoTargetDiagnostics } from "../../../../../tsonic/test/scripts/diagnostic-assertions.mjs";

const integer = { kind: "source-primitive", name: "int32" };
const policy = { projectTypes: { directSupertypes: () => [] }, providers: { findTargetBindingByTargetId() {} }, target: {} };
const context = { scope: {}, program: { conversions: { directCallableReference: () => undefined },
  captureStorage: { closure: () => undefined } }, names: { temporaryName: () => assert.fail("Native bindings must not allocate wrapper temporaries") } };

function nativeDelegate(name, mode = "by-value", returnPassing) {
  return csharpTargetNamedType(`Fixture.${name}`, undefined,
    { kind: "named", name, usingNamespace: ["Fixture"] },
    { delegateSignature: { parameters: [integer], parameterPassingModes: [mode], returnType: integer,
      ...(returnPassing === undefined ? {} : { returnPassing }) } });
}

function nativeBinding(source, target, expression, selected = selectCsharpConversion(policy, source, target, "implicit")) {
  assert.equal(selected.kind, "delegate-adapter");
  assert.equal(selected.strategy, "native-binding");
  const diagnostics = [];
  const planned = planCsharpDelegateAdapter({}, {}, context, diagnostics, source, target, selected, expression, applyCsharpConversionSelection);
  assertNoTargetDiagnostics(diagnostics);
  assert.equal(planned !== undefined, true);
  return planned;
}

test("native named delegates bind an authored lambda unchanged, without inner functions or closures", () => {
  const source = csharpDelegateTargetType("System.Func", [integer], integer);
  const lambda = { kind: "LambdaExpression", parameters: [{ kind: "Parameter", name: "current", type: { kind: "PredefinedType", name: "int" } }],
    body: { kind: "IdentifierName", name: "current" } };
  assert.equal(nativeBinding(source, nativeDelegate("Transform"), lambda) === lambda, true);
});

test("exact native delegate values bind their Invoke method group and evaluate producers once", () => {
  const source = csharpDelegateTargetType("System.Func", [integer], integer);
  const factory = { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "make" }, arguments: [] };
  const planned = nativeBinding(source, nativeDelegate("Transform"), factory);
  assert.equal(planned.kind, "ObjectCreationExpression");
  assert.equal(planned.arguments[0].expression.receiver === factory, true);
  assert.equal(planned.arguments[0].expression.name, "Invoke");
  assert.equal(JSON.stringify(planned).match(/"name":"make"/gu)?.length, 1);
  assert.doesNotMatch(JSON.stringify(planned), /LambdaExpression|LocalFunctionStatement|SwitchExpression/u);
});

test("exact ref, out, in and ref-return native bindings introduce no adapters", () => {
  for (const mode of ["by-value", "byref-readwrite", "byref-writeonly-must-init", "byref-readonly"]) {
    for (const returnPassing of [undefined, "byref-readwrite", "byref-readonly"]) {
      const planned = nativeBinding(nativeDelegate("Source", mode, returnPassing), nativeDelegate("Destination", mode, returnPassing),
        { kind: "IdentifierName", name: "original" });
      assert.equal(planned.kind, "ObjectCreationExpression");
      assert.equal(planned.arguments[0].expression.name, "Invoke");
      assert.doesNotMatch(JSON.stringify(planned), /LambdaExpression|LocalFunctionStatement|SwitchExpression/u);
    }
  }
});

test("mutated native-binding selections and unsupported byref lambdas fail closed", () => {
  const source = csharpDelegateTargetType("System.Func", [integer], integer);
  const target = nativeDelegate("Target");
  const selected = selectCsharpConversion(policy, source, target, "implicit");
  for (const [from, to, selection, expression] of [
    [source, nativeDelegate("RefTarget", "byref-readwrite"), selected, { kind: "IdentifierName", name: "original" }],
    [source, target, { ...selected, parameterConversions: [{ kind: "implicit", proof: "numeric" }] }, { kind: "IdentifierName", name: "original" }],
    [nativeDelegate("RefSource", "byref-readwrite"), nativeDelegate("RefTarget", "byref-readwrite"), selected,
      { kind: "LambdaExpression", parameters: [], body: { kind: "IdentifierName", name: "original" } }],
  ]) {
    const diagnostics = [];
    assert.equal(planCsharpDelegateAdapter({}, {}, context, diagnostics, from, to, selection, expression, applyCsharpConversionSelection) === undefined, true);
    assert.equal(diagnostics.length, 1);
  }
  for (const modes of [undefined, [], new Array(1), ["move"], ["by-value", "by-value"]]) {
    const from = { ...source, csharpDelegateSignature: { ...source.csharpDelegateSignature, parameterPassingModes: modes } };
    const diagnostics = [];
    assert.equal(planCsharpDelegateAdapter({}, {}, context, diagnostics, from, target,
      { ...selected, strategy: "adaptation" }, { kind: "IdentifierName", name: "original" }, applyCsharpConversionSelection) === undefined, true);
    assert.equal(diagnostics.length, 1);
  }
});

function runDotnet(arguments_) {
  const result = spawnSync("dotnet", arguments_, { encoding: "utf8", timeout: 240_000, maxBuffer: 1_048_576 });
  assert.equal(result.status, 0, `${result.error ?? ""}\n${result.stdout}\n${result.stderr}`.slice(0, 4096));
  return result.stdout;
}

test("real provider native execution seals the original IntTransform lambda without a wrapper", () => {
  const root = mkdtempSync(fileURLToPath(new URL("../../../../.temp/native-delegate-provider-", import.meta.url)));
  const project = join(root, "Provider.ParameterModes.csproj");
  writeFileSync(project, '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup></Project>');
  writeFileSync(join(root, "Provider.cs"), "namespace Provider.ParameterModes; public delegate int IntTransform(int value); public delegate void IntAction(int value); public static class DelegateTarget { public static int Observed { get; private set; } public static void Observe(int value) { Observed = value; } public static int Invoke(IntTransform transform, int value) => transform(value); public static void InvokeVoid(IntAction action, int value) => action(value); }");
  runDotnet(["build", project, "-c", "Release", "--nologo", "--verbosity", "quiet", "-m:1"]);
  const assembly = join(root, "bin/Release/net10.0/Provider.ParameterModes.dll");
  const compiled = compileCsharpSource({ sourceText: [
    'import type { int } from "@tsonic/csharp/types.js";',
    'import { DelegateTarget } from "@tsonic/dotnet/Provider.ParameterModes.js";',
    'export function invokeDelegate(value: int): int {',
    '  return DelegateTarget.Invoke((current: int): int => current, value);',
    '}',
    'export function invokeAlias(value: int): int {',
    '  const callback = (current: int): int => current;',
    '  return DelegateTarget.Invoke(callback, value);',
    '}',
    'export function invokeVoid(value: int): void {',
    '  DelegateTarget.InvokeVoid((current: int): void => { DelegateTarget.Observe(current); }, value);',
    '}',
    'export function readObserved(): int {',
    '  return DelegateTarget.Observed;',
    '}',
  ].join("\n"), targetOptions: { namespace: "Smoke.Generated", references: { assemblies: [{ include: "Provider.ParameterModes", hintPath: assembly }] } } });
  assertCsharpCompilationSucceeded(compiled);
  const generated = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs"));
  assert.equal(generated.length > 0, true);
  const text = generated.map(([, source]) => source).join("\n");
  const method = /int ([\p{L}_][\p{L}\p{N}_]*)\(int current\)/u.exec(text)?.[1];
  assert.equal(typeof method, "string", "authored lambda retains its native method signature");
  assert.equal(text.includes(`Invoke(new Provider.ParameterModes.IntTransform(${method}), value)`), true);
  assert.doesNotMatch(text.slice(0, text.indexOf("public static int invokeAlias")), /new Func|System\.Func|\.Invoke\)/u);
  assert.match(text, /InvokeVoid\(new Provider\.ParameterModes\.IntAction\(/u);
  assert.doesNotMatch(text, /new Action|System\.Action/u);
  const proof = mkdtempSync(fileURLToPath(new URL("../../../../.temp/native-delegate-execution-", import.meta.url)));
  for (const [index, [, source]] of generated.entries()) writeFileSync(join(proof, `Generated${index}.cs`), source);
  writeFileSync(join(proof, "Proof.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><OutputType>Exe</OutputType><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup><ItemGroup><Reference Include="Provider.ParameterModes"><HintPath>${assembly}</HintPath></Reference></ItemGroup></Project>`);
  writeFileSync(join(proof, "Program.cs"), 'if (Smoke.Generated.Index.invokeDelegate(7) != 7 || Smoke.Generated.Index.invokeDelegate(-3) != -3 || Smoke.Generated.Index.invokeAlias(11) != 11) throw new System.Exception("exact native delegate"); Smoke.Generated.Index.invokeVoid(-1); if (Smoke.Generated.Index.readObserved() != -1) throw new System.Exception("native void delegate side effect"); System.Console.WriteLine("native provider delegate passed");');
  assert.match(runDotnet(["run", "--project", join(proof, "Proof.csproj"), "-c", "Release", "--verbosity", "quiet", "-m:1"]), /native provider delegate passed/u);
});

test("native CLR executes exact ref, out, in and ref-return method-group bindings", () => {
  const modes = ["byref-readwrite", "byref-writeonly-must-init", "byref-readonly"];
  const bindings = modes.map((mode, index) => printCsharpExpression(nativeBinding(nativeDelegate(`Source${index}`, mode),
    nativeDelegate(`Target${index}`, mode), { kind: "IdentifierName", name: `original${index}` })));
  const refReturns = ["byref-readwrite", "byref-readonly"].map((mode, index) => printCsharpExpression(nativeBinding(
    nativeDelegate(`ReturnSource${index}`, "by-value", mode), nativeDelegate(`ReturnTarget${index}`, "by-value", mode),
    { kind: "IdentifierName", name: `returnOriginal${index}` })));
  const source = csharpDelegateTargetType("System.Func", [integer], integer);
  const effectful = printCsharpExpression(nativeBinding(source, nativeDelegate("Transform"),
    { kind: "InvocationExpression", callee: { kind: "IdentifierName", name: "Make" }, arguments: [] }));
  const root = mkdtempSync(fileURLToPath(new URL("../../../../.temp/native-delegate-modes-", import.meta.url)));
  writeFileSync(join(root, "Proof.csproj"), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net10.0</TargetFramework><OutputType>Exe</OutputType><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup></Project>');
  writeFileSync(join(root, "Program.cs"), `using System;
namespace Fixture;
delegate int Source0(ref int value); delegate int Target0(ref int value);
delegate int Source1(out int value); delegate int Target1(out int value);
delegate int Source2(in int value); delegate int Target2(in int value);
delegate ref int ReturnSource0(int index); delegate ref int ReturnTarget0(int index);
delegate ref readonly int ReturnSource1(int index); delegate ref readonly int ReturnTarget1(int index);
delegate int Transform(int value);
static class Program {
  static int storage = 3; static int calls;
  static int Ref(ref int value) => ++value;
  static int Out(out int value) { value = 9; return value; }
  static int In(in int value) => value;
  static ref int Return(int index) => ref storage;
  static ref readonly int ReadOnlyReturn(int index) => ref storage;
  static Func<int,int> Make() { calls++; return value => throw new InvalidOperationException("exact exception"); }
  static void Main() {
    Source0 original0 = Ref; Source1 original1 = Out; Source2 original2 = In;
    Target0 target0 = ${bindings[0]}; Target1 target1 = ${bindings[1]}; Target2 target2 = ${bindings[2]};
    int value = 1; if (target0(ref value) != 2 || value != 2) throw new Exception("ref");
    if (target1(out value) != 9 || value != 9 || target2(in value) != 9) throw new Exception("out/in");
    ReturnSource0 returnOriginal0 = Return; ReturnSource1 returnOriginal1 = ReadOnlyReturn;
    ReturnTarget0 returned = ${refReturns[0]}; ReturnTarget1 readonlyReturned = ${refReturns[1]};
    returned(0) = 11; if (readonlyReturned(0) != 11) throw new Exception("ref return alias");
    Transform effectful = ${effectful}; if (calls != 1) throw new Exception("duplicated producer");
    try { effectful(1); throw new Exception("exception lost"); } catch (InvalidOperationException error) { if (error.Message != "exact exception") throw; }
    if (calls != 1) throw new Exception("producer moved into invocation");
    Console.WriteLine("native modes passed");
  }
}`);
  assert.match(runDotnet(["run", "--project", join(root, "Proof.csproj"), "-c", "Release", "--verbosity", "quiet", "-m:1"]), /native modes passed/u);
});
