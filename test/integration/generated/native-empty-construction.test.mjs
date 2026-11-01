import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { compileCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";

function nativeEmptyOptionsSource(annotation) {
  return `
    import type { MakeDirectoryOptions } from "node:fs";
    function make(): MakeDirectoryOptions {
      const value${annotation} = {};
      const alias = value;
      const selected: MakeDirectoryOptions = alias;
      selected.mode = 11;
      return selected;
    }
    export function run(): boolean {
      const value = make();
      const alias = value;
      alias.mode = 13;
      return value.mode === 13 && value === alias;
    }
  `;
}

function nativeEmptyEnvironmentSource(annotation) {
  return `
    import type { ProcessEnv } from "node:process";
    export function make(value: string): ProcessEnv {
      const original${annotation} = {};
      const alias = original;
      const environment: ProcessEnv = alias;
      environment["TSONIC_ENVIRONMENT_PROOF"] = value;
      return environment;
    }
    export function run(): boolean {
      const environment = make("original");
      const alias = environment;
      const optional: ProcessEnv | undefined = environment;
      const container: { environment?: ProcessEnv } = { environment: optional };
      if (container.environment !== environment || optional !== environment) return false;
      alias["TSONIC_ENVIRONMENT_PROOF"] = "changed";
      alias["TSONIC_ENVIRONMENT_PROOF"] = undefined;
      container.environment = undefined;
      return environment === alias && environment["TSONIC_ENVIRONMENT_PROOF"] === undefined &&
        container.environment === undefined;
    }
  `;
}

test("fresh empty native construction retains allocation and alias identity through a return", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: nativeEmptyOptionsSource(": MakeDirectoryOptions") });
  executeCsharpConstruction(compiled, "native-empty-aliases", false, false,
    [join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj")]);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal([...output.matchAll(/new Tsonic\.CSharp\.Node\.MakeDirectoryOptions\b/gu)].length, 1,
    "one native object allocation at the original literal producer");
  assert.doesNotMatch(output, /Tsonic__ObjectShape|Activator|System\.Reflection|DynamicInvoke/u);
});

test("fresh native indexed construction retains one environment and its exact allocation cost", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: nativeEmptyEnvironmentSource(": ProcessEnv") });
  executeCsharpConstruction(compiled, "native-empty-indexed-construction", false, false,
    [join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj")], `
using System;
using Tsonic.CSharp.Node;
using Index = Tsonic.Generated.Index;
if (!Index.run()) throw new Exception("source environment identity, mutation and absence");
string value = new string('x', 20);
for (int index = 0; index < 1000; index++) {
    GC.KeepAlive(Index.make(value));
    GC.KeepAlive(Handwritten(value));
}
long before = GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 10000; index++) {
    var environment = Index.make(value);
    if (!ReferenceEquals(environment["TSONIC_ENVIRONMENT_PROOF"], value)) throw new Exception("native string copied");
    GC.KeepAlive(environment);
}
long generated = GC.GetAllocatedBytesForCurrentThread() - before;
before = GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 10000; index++) GC.KeepAlive(Handwritten(value));
long handwritten = GC.GetAllocatedBytesForCurrentThread() - before;
if (generated != handwritten) throw new Exception($"environment allocation {generated} != {handwritten}");
static ProcessEnv Handwritten(string value) {
    var environment = new ProcessEnv();
    environment["TSONIC_ENVIRONMENT_PROOF"] = value;
    return environment;
}
`);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal([...output.matchAll(/new Tsonic\.CSharp\.Node\.ProcessEnv\b/gu)].length, 1);
  assert.doesNotMatch(output, /__TsonicShape|Activator|System\.Reflection|DynamicInvoke|\.ToDictionary\(/u);
});

const nonfreshControls = [
  ["open parameter", `export function options(value: {}): MakeDirectoryOptions { return value; }`],
  ["hidden fields", `export function options(): MakeDirectoryOptions {
    const actual = { extra: 7 };
    const value: {} = actual;
    return value;
  }`],
  ["nominal allocation", `class Empty {}
    export function options(): MakeDirectoryOptions { return new Empty(); }`],
  ["conflicting native demands", `import type { RmOptions } from "node:fs";
    export function options(): MakeDirectoryOptions {
      const value = {};
      const first: MakeDirectoryOptions = value;
      const second: RmOptions = value;
      return first;
    }`],
];

for (const [name, body] of nonfreshControls) {
  test(`native empty construction rejects ${name} before publication`, () => {
    const sourceText = `
      import type { MakeDirectoryOptions } from "node:fs";
      ${body}
    `;
    const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText });
    assertCsharpCheckingSucceeded(compiled);
    if (name === "conflicting native demands") {
      const issues = compiled.targetDiagnostics.filter(diagnostic => diagnostic.category === "error");
      assert.equal(issues.length, 1, "one original literal owns the conflicting identity requirements");
      const refusal = issues[0];
      assert.equal(refusal.code, "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN");
      assert.match(refusal.message, /^This object literal has no target type\. Declare a type for 'value' at this initializer\. Native construction has conflicting exact identity representations at source offset \d+\.$/u);
      const ast = compiled.source.ast;
      const range = refusal.sourceNode === undefined ? undefined : ast.authoredRange(refusal.sourceNode);
      assert.equal(range?.kind === "authored" && range.start === sourceText.indexOf("{}") &&
        range.end === sourceText.indexOf("{}") + 2, true, "the original literal owns the precise conflict");
      assert.equal(compiled.result.program === undefined && compiled.plan === undefined && compiled.artifacts.size === 0,
        true, "a conflicting native representation publishes nothing");
      return;
    }
    const refusal = compiled.targetDiagnostics.find(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST" &&
      diagnostic.message.startsWith("No exact C# implicit conversion relates "));
    assert.equal(refusal !== undefined, true, "the declared carrier has no valid native identity conversion");
    assert.match(refusal.message, /MakeDirectoryOptions<>/u);
    assert.equal(compiled.artifacts.size, 0, "failed native construction cannot publish executable output");
  });
}

const originalUntypedConstructions = [
  ["MakeDirectoryOptions", "value", nativeEmptyOptionsSource("")],
  ["ProcessEnv", "original", nativeEmptyEnvironmentSource("")],
];

for (const [name, binding, sourceText] of originalUntypedConstructions) {
  test(`original unannotated ${name} construction uses its complete direct native contract`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText });
    assertCsharpCheckingSucceeded(compiled);
    assert.equal(compiled.targetDiagnostics.length, 0,
      `${binding}: ${compiled.targetDiagnostics.map(diagnostic => `${diagnostic.code}: ${diagnostic.message}`).join("; ")}`);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal([...output.matchAll(new RegExp(`new Tsonic\\.CSharp\\.Node\\.${name}\\b`, "gu"))].length, 1,
      `${binding}: one direct native allocation at the original empty initializer`);
    assert.doesNotMatch(output, /TsObject|CreateDynamicObject|Tsonic__ObjectShape|Activator|System\.Reflection|DynamicInvoke|\.ToDictionary\(/u);
    const nativeProgram = name === "MakeDirectoryOptions" ? `
using System;
using Tsonic.CSharp.Node;
using Index = Tsonic.Generated.Index;
for (int index = 0; index < 10000; index++) {
    if (!Index.run() || !NativeRun()) throw new Exception("native option values and alias identity");
}
long before = GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 8192; index++) if (!Index.run()) throw new Exception("generated option identity");
long generated = GC.GetAllocatedBytesForCurrentThread() - before;
before = GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 8192; index++) if (!NativeRun()) throw new Exception("handwritten option identity");
long handwritten = GC.GetAllocatedBytesForCurrentThread() - before;
if (generated != handwritten) throw new Exception($"option allocation {generated} != {handwritten}");
static MakeDirectoryOptions NativeMake() {
    var value = new MakeDirectoryOptions();
    var alias = value;
    MakeDirectoryOptions selected = alias;
    selected.mode = 11;
    return selected;
}
static bool NativeRun() {
    var value = NativeMake();
    var alias = value;
    alias.mode = 13;
    return value.mode == 13 && ReferenceEquals(value, alias);
}
` : `
using System;
using Tsonic.CSharp.Node;
using Index = Tsonic.Generated.Index;
if (!Index.run()) throw new Exception("source environment identity, mutation and absence");
string value = new string('x', 20);
for (int index = 0; index < 10000; index++) {
    GC.KeepAlive(Index.make(value));
    GC.KeepAlive(NativeMake(value));
}
long before = GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 8192; index++) {
    var environment = Index.make(value);
    if (!ReferenceEquals(environment["TSONIC_ENVIRONMENT_PROOF"], value)) throw new Exception("native string copied");
    GC.KeepAlive(environment);
}
long generated = GC.GetAllocatedBytesForCurrentThread() - before;
before = GC.GetAllocatedBytesForCurrentThread();
for (int index = 0; index < 8192; index++) {
    var environment = NativeMake(value);
    if (!ReferenceEquals(environment["TSONIC_ENVIRONMENT_PROOF"], value)) throw new Exception("handwritten string copied");
    GC.KeepAlive(environment);
}
long handwritten = GC.GetAllocatedBytesForCurrentThread() - before;
if (generated != handwritten) throw new Exception($"environment allocation {generated} != {handwritten}");
static ProcessEnv NativeMake(string value) {
    var original = new ProcessEnv();
    var alias = original;
    ProcessEnv environment = alias;
    environment["TSONIC_ENVIRONMENT_PROOF"] = value;
    return environment;
}
`;
    executeCsharpConstruction(compiled, `native-inferred-empty-${name}`, false, false,
      [join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj")], nativeProgram);
  });
}

