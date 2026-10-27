import assert from "node:assert/strict";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDotnetModuleSpecifierPolicy, csharpDotnetProviderContributionKind } from "../../../dist/public/provider-dotnet.js";
import { buildDotnetFixture } from "../../helpers/dotnet-fixtures.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = join(root, "test/fixtures/dotnet-provider/expression-trees");
const reference = buildDotnetFixture({ project: join(fixture, "ExpressionTrees.csproj"), projectDirectory: fixture,
  outputDirectory: join(root, ".temp/dotnet-provider-fixtures/expression-trees/bin"),
  intermediateDirectory: join(root, ".temp/dotnet-provider-fixtures/expression-trees/obj/"), outputAssemblyName: "ExpressionTrees.dll" });
const packageName = "@fixture/expressions";
const moduleSpecifierPolicy = createDotnetModuleSpecifierPolicy(packageName);
const capability = { kind: "target-capability", id: packageName, targetId: "csharp", displayName: "Native quotations",
  moduleOwnership: [{ specifierPrefix: moduleSpecifierPolicy.modulePrefix }], createTargetContributions() {
    return [{ kind: csharpDotnetProviderContributionKind,
      providerIdentity: { id: "fixture.expressions", version: "1.0.0", target: "csharp", displayName: "Native quotations" },
      moduleSpecifierPolicy, referenceDirectoryUrl: pathToFileURL(`${dirname(reference)}/`).href,
      assemblySourcePackages: [{ assemblyName: "ExpressionTrees", packageName }], targetFramework: "net10.0" }];
  } };
const imports = `import { ExpressionHost } from "${packageName}/ExpressionFixtures.js";
  import type { int32 } from "@tsonic/core/types.js";`;

for (const surface of [undefined, "js"]) {
  test(`native trees preserve authored bodies, shared captures, aliases and generic carriers (${surface ?? "native"})`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, capabilities: [capability], sourceText: `${imports}
        export function run(): boolean {
          let step: int32 = 3;
          const advance = (): void => { step += 2; };
          const predicate = ExpressionHost.Predicate((value: int32): boolean => value > step);
          const alias = predicate;
          const selected = (value: int32): int32 => value + 3;
          const lambdaAlias = selected;
          const initial: int32 = ExpressionHost.Add((value: int32): int32 => value + 2, 4);
          const captured: int32 = ExpressionHost.Add((value: int32): int32 => value + step, 4);
          advance();
          return initial === 6 && captured === 7 && !ExpressionHost.Test(alias, 4) &&
            ExpressionHost.Test(predicate, 6) && ExpressionHost.Identity<int32>((value: int32): int32 => value, 9) === 9 &&
            ExpressionHost.Add(lambdaAlias, 4) === 7 && ExpressionHost.IsAbsent(undefined) &&
            ExpressionHost.Observe((value: int32): void => ExpressionHost.Record(value), 11) === 11;
        }
        export function deferred(): boolean {
          const predicate = ExpressionHost.Predicate((value: int32): boolean => value > step);
          let step: int32 = 3;
          const advance = (): void => { step += 2; };
          advance();
          return !ExpressionHost.Test(predicate, 4) && ExpressionHost.Test(predicate, 6) &&
            ExpressionHost.HasDirectCapture(predicate);
        }
      ` });
      assertCsharpCompilationSucceeded(compiled);
      const generated = [...compiled.artifacts.values()].join("\n");
      assert.doesNotMatch(generated, /new System\.Linq\.Expressions\.Expression</u);
      assert.match(generated, /ExpressionHost\.Add\([^;]*=>/u, "native quotation remains lambda syntax");
      executeCsharpConstruction(compiled, `native-expression-trees-${surface ?? "native"}`, false, false,
        [join(fixture, "ExpressionTrees.csproj")], `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("quoted native bodies and captures");
if (!Tsonic.Generated.Index.deferred()) throw new System.Exception("quoted activation identity without a second capture wrapper");
if (!ExpressionFixtures.ExpressionHost.IsAbsent(null)) throw new System.Exception("one native absence carrier");
`);
    });
}

for (const [name, expression] of [
  ["statement preparation", "(value: int32): int32 => { const extra: int32 = 1; return value + extra; }"],
  ["function expression", "function (value: int32): int32 { return value + 1; }"],
]) {
  test(`native quotation rejects ${name} before native publication`, () => {
    const compiled = compileCsharpSource({ capabilities: [capability], sourceText: `${imports}
      export function run(): int32 { return ExpressionHost.Add(${expression}, 4); }
    ` });
    assert.equal(compiled.result.diagnostics.some(diagnostic => /expression-tree quotation/u.test(diagnostic.message)), true);
    assert.equal(compiled.artifacts.size, 0, "unsupported quotation publishes no partial native output");
  });
}

test("nullable quotation does not widen the provider's authored source contract", () => {
  const compiled = compileCsharpSource({ capabilities: [capability], sourceText: `${imports}
    export function run(): boolean { return ExpressionHost.IsAbsent(null); }
  ` });
  assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "TSTS_DIAGNOSTIC" &&
    /TS2345/u.test(diagnostic.message)), true);
  assert.equal(compiled.artifacts.size, 0);
});

test("native Task quotation does not weaken the provider's source return contract", () => {
  const compiled = compileCsharpSource({ capabilities: [capability], sourceText: `${imports}
    export function run(): void { ExpressionHost.Async(async (value: int32): Promise<int32> => value); }
  ` });
  assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "TSTS_DIAGNOSTIC" &&
    /TS2345/u.test(diagnostic.message)), true);
  assert.equal(compiled.artifacts.size, 0);
});

test("native quotation rejects source-checkable asynchronous void bodies before native publication", () => {
  const compiled = compileCsharpSource({ capabilities: [capability], sourceText: `${imports}
    export function run(): void { ExpressionHost.AsyncAction(async (value: int32): Promise<void> => { value; }); }
  ` });
  assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "TSTS_DIAGNOSTIC"), false,
    "the asynchronous callback must reach native quotation analysis");
  assert.equal(compiled.result.diagnostics.some(diagnostic => /expression-tree quotation/u.test(diagnostic.message)), true,
    compiled.result.diagnostics.slice(0, 4).map(diagnostic => `${diagnostic.code}: ${diagnostic.message}`).join("\n").slice(0, 2048));
  assert.equal(compiled.artifacts.size, 0);
});

test("a runtime delegate cannot be reinterpreted as a quoted tree", () => {
  const compiled = compileCsharpSource({ capabilities: [capability], sourceText: `${imports}
    export function run(selected: (value: int32) => int32): int32 { return ExpressionHost.Add(selected, 4); }
  ` });
  assert.equal(compiled.result.diagnostics.some(diagnostic => /No exact C# implicit conversion/u.test(diagnostic.message)), true);
  assert.equal(compiled.artifacts.size, 0);
});
