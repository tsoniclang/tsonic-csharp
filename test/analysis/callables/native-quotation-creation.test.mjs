import assert from "node:assert/strict";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDotnetModuleSpecifierPolicy, csharpDotnetProviderContributionKind } from "../../../dist/public/provider-dotnet.js";
import { getCsharpExpressionTreeDelegateType, getCsharpLambdaSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { buildDotnetFixture } from "../../helpers/dotnet-fixtures.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";

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

function compile(body, surface, parameters = "") {
  return compileCsharpSource({ surface, capabilities: [capability], sourceText: `${imports}
    export function run(${parameters}): int32 { ${body} }
  ` });
}

function originalArrow(compiled) {
  const source = compiled.result.program?.source;
  assert.equal(source !== undefined, true, "completed analysis retains its original checked source");
  const arrows = [];
  const visit = node => {
    if (source.ast.is.IsArrowFunction(node)) arrows.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const sourceFile of source.navigation.sourceFiles) {
    if (source.ast.getFileName(sourceFile) === "/project/index.ts") visit(sourceFile);
  }
  assert.equal(arrows.length, 1, "one original authored arrow, not a replayed body");
  return arrows[0];
}

for (const surface of [undefined, "js"]) {
  for (const [name, body] of [
    ["direct", "return ExpressionHost.Add((value: int32): int32 => value + 3, 4);"],
    ["fixed initializer", "const selected = (value: int32): int32 => value + 3; return ExpressionHost.Add(selected, 4);"],
    ["one immutable alias", "const selected = (value: int32): int32 => value + 3; const alias = selected; return ExpressionHost.Add(alias, 4);"],
    ["one alias with transparent syntax", "const selected = ((value: int32): int32 => value + 3); const alias = (selected); return ExpressionHost.Add(alias, 4);"],
    ["shared mutable capture", "let step: int32 = 3; const selected = (value: int32): int32 => value + step; const alias = selected; step += 2; return ExpressionHost.Add(alias, 4);"],
  ]) {
    test(`native quotation creation retains ${name} on ${surface ?? "native"}`, () => {
      const compiled = compile(body, surface);
      assertCsharpCompilationSucceeded(compiled);
      const arrow = originalArrow(compiled);
      const records = compiled.result.program.records;
      const creation = records.lambdaCreation.get(arrow);
      const target = records.callableTarget.get(arrow);
      const signature = getCsharpLambdaSignature(target);
      assert.equal(creation.kind, "quotation", "original arrow has one native quotation creation");
      assert.equal(creation.staticBody, false, "quotation does not acquire an ordinary delegate cache");
      assert.equal(getCsharpExpressionTreeDelegateType(target) !== undefined, true, "selected carrier retains native quotation metadata");
      assert.equal(signature?.parameters.length === 1 && signature.parameters[0].kind === "source-primitive" &&
        signature.parameters[0].name === "int32" && signature.returnType.kind === "source-primitive" && signature.returnType.name === "int32",
      true, "quotation parameter and result retain exact authored native int32 ABI");
      assert.equal(records.callableTarget.get(arrow) === target, true, "sealed quotation carrier identity is stable");
      assert.equal(records.captureClosure.get(arrow) === undefined, true, "ordinary lambda requires no additional compiler capture wrapper");
      const generated = [...compiled.artifacts.values()].join("\n");
      assert.doesNotMatch(generated, /__TsonicCallable_|new System\.Linq\.Expressions\.Expression</u,
        "quotation adds neither a callable wrapper nor a Func-to-Expression constructor");
    });
  }
}

for (const [name, body, parameters = ""] of [
  ["mutable initializer", "let selected = (value: int32): int32 => value + 3; return ExpressionHost.Add(selected, 4);"],
  ["mutable alias", "const selected = (value: int32): int32 => value + 3; let alias = selected; return ExpressionHost.Add(alias, 4);"],
  ["additional alias", "const selected = (value: int32): int32 => value + 3; const alias = selected; const extra = alias; return ExpressionHost.Add(extra, 4);"],
  ["declared runtime delegate", "const selected: (value: int32) => int32 = (value: int32): int32 => value + 3; return ExpressionHost.Add(selected, 4);"],
  ["runtime delegate parameter", "return ExpressionHost.Add(selected, 4);", "selected: (value: int32) => int32"],
  ["runtime call result", "const selected = make(); return ExpressionHost.Add(selected, 4);", "make: () => ((value: int32) => int32)"],
  ["foreign declaration", "return ExpressionHost.Add(foreign, 4);", "foreign: (value: int32) => int32"],
]) {
  test(`native quotation demand never retargets ${name}`, () => {
    const compiled = compile(body, undefined, parameters);
    assert.equal(compiled.sourceDiagnosticsText === "" && compiled.extensionDiagnostics.length === 0, true,
      "negative reaches the native representation boundary with valid checked source");
    assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST" &&
      diagnostic.message.includes("No exact C# implicit conversion")), true,
    "an actual runtime delegate is not reinterpreted as its authored body");
    assert.equal(compiled.artifacts.size, 0, "refused runtime conversion publishes no partial artifact");
  });
}

test("a non-quotation native callable demand keeps an ordinary delegate", () => {
  const compiled = compile(`
    const selected = (value: int32): int32 => value + 3;
    const alias = selected;
    return alias(4);
  `);
  assertCsharpCompilationSucceeded(compiled);
  const arrow = originalArrow(compiled);
  assert.equal(compiled.result.program.records.lambdaCreation.get(arrow).kind !== "quotation", true,
    "a callable's spelling or initializer does not manufacture native quotation metadata");
  assert.equal(getCsharpExpressionTreeDelegateType(compiled.result.program.records.callableTarget.get(arrow)) === undefined,
    true, "ordinary native callable carrier remains a delegate");
});

test("asynchronous alias bodies never become synchronous native quotations", () => {
  const compiled = compileCsharpSource({ capabilities: [capability], sourceText: `${imports}
    export function run(): void {
      const selected = async (value: int32): Promise<void> => { value; };
      const alias = selected;
      ExpressionHost.AsyncAction(alias);
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText === "" && compiled.extensionDiagnostics.length === 0, true,
    "source-checkable asynchronous void input reaches native admission");
  assert.equal(compiled.result.diagnostics.some(diagnostic => diagnostic.code === "CSHARP_UNSUPPORTED_AST" &&
    diagnostic.message.includes("No exact C# implicit conversion")), true,
  "an asynchronous runtime callable cannot acquire quotation by an alias");
  assert.equal(compiled.artifacts.size, 0, "asynchronous runtime quotation publishes no partial output");
});
