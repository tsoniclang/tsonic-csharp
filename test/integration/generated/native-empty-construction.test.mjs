import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { compileCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { testRepositoryRoots } from "../../../../tsonic/test/scripts/workspace-layout.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../csharp-nodejs/dist/index.js";

test("fresh empty native construction retains allocation and alias identity through a return", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: `
    import type { MakeDirectoryOptions } from "node:fs";
    function make(): MakeDirectoryOptions {
      const value = {};
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
  ` });
  executeCsharpConstruction(compiled, "native-empty-aliases", false, false,
    [join(testRepositoryRoots.csharpNodejs, "csharp/src/Tsonic.CSharp.Node/Tsonic.CSharp.Node.csproj")]);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal([...output.matchAll(/new Tsonic\.CSharp\.Node\.MakeDirectoryOptions\b/gu)].length, 1,
    "one native object allocation at the original literal producer");
  assert.doesNotMatch(output, /Tsonic__ObjectShape|Activator|System\.Reflection|DynamicInvoke/u);
});

test("fresh native indexed construction retains one environment and its exact allocation cost", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: `
    import type { ProcessEnv } from "node:process";
    export function make(value: string): ProcessEnv {
      const original = {};
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
  ` });
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
    const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: `
      import type { MakeDirectoryOptions } from "node:fs";
      ${body}
    ` });
    assertCsharpCheckingSucceeded(compiled);
    assert.equal(compiled.targetDiagnostics.some(diagnostic => diagnostic.code === "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN"), true,
      "exact allocation provenance is required");
    assert.equal(compiled.artifacts.size, 0, "failed native construction cannot publish executable output");
  });
}
