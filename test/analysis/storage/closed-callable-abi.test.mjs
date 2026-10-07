import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpTargetProgram } from "../../../dist/analysis/program/index.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/relations/resolver.js";
import { createCsharpTargetConfiguration } from "../../../dist/options/csharp-target-options.js";
import { getCsharpDelegateSignature } from "../../../dist/target-model/types/delegates.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

function fixture(body) {
  const checked = checkCsharpSource({ surface: "js", sourceText: `
    import type { int } from "@tsonic/csharp/types.js";
    function unknown(mapper: (value: int) => int): (value: int) => int { return mapper; }
    export function run(values: int[], step: int) { ${body} }
  ` });
  assert.equal(checked.sourceDiagnosticsText, "", "strict checking");
  assert.equal(checked.extensionDiagnostics.length, 0, "extension checking");
  const source = createTargetSourceProgram(checked.source);
  const analysis = analyzeCsharpTargetProgram({
    input: { source, sourcePackages: checked.sourcePackages, project: checked.project, target: checked.target,
      runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: checked.paths },
    configuration: createCsharpTargetConfiguration(checked.target, checked.paths.projectRoot, checked.paths.targetOutputRoot),
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
  });
  assert.equal(analysis.kind, "resolved", analysis.diagnostics.map(diagnostic => diagnostic.code).join(","));
  assert.equal(analysis.diagnostics.length, 0, "exact native analysis");
  const variables = new Map();
  let lambda;
  const visit = node => {
    if (source.ast.is.IsArrowFunction(node)) lambda = node;
    if (source.ast.is.IsVariableDeclaration(node)) variables.set(source.ast.text(source.ast.name(node)), node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.navigation.sourceFiles) visit(file);
  assert.equal(lambda !== undefined, true, "one exact mapper declaration");
  return { program: analysis.value, variables, lambda };
}

for (const [name, expression, creation] of [
  ["stateless", "value + 1", "cached"],
  ["captured", "value + step", "inline"],
]) {
  test(`closed ${name} const aliases share the selected native storage ABI`, () => {
    const selected = fixture(`const mapper = (value: int): int => ${expression}; const alias = mapper; return Array.from(values, alias);`);
    const target = selected.program.expectedTypes.callableTarget(selected.lambda);
    assert.equal(getCsharpDelegateSignature(target)?.parameters.length, 2, "one selected native invocation signature");
    for (const name of ["mapper", "alias"]) {
      const declaration = selected.variables.get(name);
      assert.equal(declaration !== undefined, true, name);
      assert.equal(targetTypeRefEquals(selected.program.storage.requiredType(declaration), target), true, name);
      assert.equal(targetTypeRefEquals(selected.program.storage.type(declaration), target), true, name);
    }
    assert.equal(selected.program.captureStorage.lambdaCreation(selected.lambda).kind, creation);
  });
}

for (const [name, body] of [
  ["authored alias contract", "const mapper = (value: int): int => value; const alias: (value: int) => int = mapper; return Array.from(values, alias);"],
  ["mutable origin", "let mapper = (value: int): int => value; const alias = mapper; return Array.from(values, alias);"],
  ["mixed unknown use", "const mapper = (value: int): int => value; const alias = mapper; Array.from(values, alias); return unknown(mapper);"],
  ["observed identity", "const mapper = (value: int): int => value; const alias = mapper; Array.from(values, alias); return mapper === alias;"],
  ["escaped origin", "const mapper = (value: int): int => value; const alias = mapper; Array.from(values, alias); return mapper;"],
]) {
  test(`${name} retains its exact intrinsic origin ABI and fresh identity`, () => {
    const selected = fixture(body);
    assert.equal(getCsharpDelegateSignature(selected.program.storage.type(selected.variables.get("mapper")))?.parameters.length, 1,
      "no unproved source storage promotion");
    assert.equal(selected.program.captureStorage.lambdaCreation(selected.lambda).kind, "fresh", "observable or unknown identity preserved");
  });
}
