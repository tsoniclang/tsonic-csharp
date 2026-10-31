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
      const value: MakeDirectoryOptions = {};
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
      const original: ProcessEnv = {};
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
    const refusal = compiled.targetDiagnostics.find(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST" &&
      diagnostic.message.startsWith("No exact C# implicit conversion relates "));
    assert.equal(refusal !== undefined, true, "the declared carrier has no valid native identity conversion");
    assert.match(refusal.message, name === "conflicting native demands"
      ? /MakeDirectoryOptions<>.*RmOptions<>/u : /MakeDirectoryOptions<>/u);
    assert.equal(compiled.artifacts.size, 0, "failed native construction cannot publish executable output");
  });
}

const originalUntypedConstructions = [
  ["MakeDirectoryOptions", `
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
  `],
  ["ProcessEnv", `
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
  `],
];

for (const [name, sourceText] of originalUntypedConstructions) {
  test(`original unannotated ${name} construction is refused at its own empty literal`, () => {
    const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText });
    assertCsharpCheckingSucceeded(compiled);
    const issues = compiled.result.diagnostics.filter(diagnostic => diagnostic.code === "TSONIC_UNTYPED_OBJECT_LITERAL");
    assert.equal(issues.length, 1, "one exact refusal belongs to the original untyped producer");
    const issue = issues[0];
    assert.equal(issue.message,
      "This object literal has no target type. Declare one, e.g. 'function baseOptions(): MakeDirectoryOptions'.");
    const ast = compiled.source.ast;
    const range = issue.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
    const file = issue.sourceNode === undefined ? undefined : ast.getSourceFile(issue.sourceNode);
    assert.equal(file !== undefined && compiled.source.sourceFiles.includes(file), true,
      "the refusal's subject belongs to the same checked source program");
    assert.equal(range?.kind, "authored", "the original literal has an authored diagnostic range");
    assert.deepEqual({ start: range.start, end: range.end },
      { start: sourceText.indexOf("{}"), end: sourceText.indexOf("{}") + 2 },
      "the exact empty initializer, not a later alias or conversion, owns the refusal");
    assert.equal(ast.getSourceText(file).slice(range.start, range.end), "{}");
    assert.equal(compiled.result.program === undefined, true, "a refused producer publishes no native program");
    assert.equal(compiled.artifacts.size, 0, "a refused producer publishes no executable artifacts");
  });
}
