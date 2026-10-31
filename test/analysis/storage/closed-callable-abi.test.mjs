import assert from "node:assert/strict";
import test from "node:test";
import { checkCsharpSource, withCsharpSessionRequest } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpAnalysisProgram } from "../../../dist/analysis/program/index.js";
import { getCsharpDelegateSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";

function fixture(body) {
  const checkOptions = { surface: "js", sourceText: `
    import type { int } from "@tsonic/csharp/types.js";
    function unknown(mapper: (value: int) => int): (value: int) => int { return mapper; }
    export function run(values: int[], step: int) { ${body} }
  ` };
  const checked = checkCsharpSource(checkOptions);
  assert.equal(checked.sourceDiagnosticsText, "", "strict checking");
  assert.equal(checked.extensionDiagnostics.length, 0, "extension checking");
  const { source, analysis } = withCsharpSessionRequest(checkOptions, request => ({ source: request.input.source,
    analysis: analyzeCsharpAnalysisProgram(request) })).value;
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

for (const [name, annotation] of [
  ["nullable", "((value: int) => int) | null"],
  ["union", "((value: int) => int) | string"],
]) {
  test(`${name} callable storage retains its existing carrier owner and exact aliased identity`, () => {
    const selected = fixture(`const mapper: ${annotation} = (value: int): int => value; const alias = mapper; Array.from(values, alias); return mapper === alias;`);
    const original = selected.program.records.storageType.get(selected.variables.get("mapper"));
    const nullable = getCsharpNullableElementTargetType(original);
    const arms = getCsharpRuntimeUnionArms(nullable ?? original, selected.program.typeDefinitions);
    const signatures = arms === undefined ? [getCsharpDelegateSignature(nullable ?? original)] : arms.map(getCsharpDelegateSignature);
    assert.equal(signatures.filter(signature => signature !== undefined).length, 1, "one exact callable carrier in the canonical absence/union owner");
    assert.equal(signatures.find(signature => signature !== undefined).parameters.length, 1, "authored ABI is not contextual callback ABI");
    assert.equal(getCsharpDelegateSignature(selected.program.records.storageType.get(selected.variables.get("alias")))?.parameters.length, 1,
      "narrowed alias retains the original callable identity");
    const creation = selected.program.records.callableCreation.get(selected.lambda);
    assert.equal(creation?.kind, "selected", "one completed native creation");
    assert.equal(creation.allocation.kind, "fresh", "no cache for observed identity");
  });
}

for (const [name, expression, staticBody] of [
  ["stateless", "value + 1", true],
  ["captured", "value + step", false],
]) {
  test(`closed ${name} const aliases share the selected native storage ABI`, () => {
    const selected = fixture(`const mapper = (value: int): int => ${expression}; const alias = mapper; return Array.from(values, alias);`);
    const target = selected.program.records.callableTarget.get(selected.lambda);
    const signature = getCsharpDelegateSignature(target);
    assert.equal(signature?.parameters.length, 2, "one exact two-slot native consumer ABI");
    assert.equal(signature.parameters.every(type => targetTypeRefEquals(type, { kind: "source-primitive", name: "int32" })), true,
      "the original value and native index retain their exact integer carrier");
    for (const name of ["mapper", "alias"]) {
      const declaration = selected.variables.get(name);
      assert.equal(declaration !== undefined, true, name);
      assert.equal(targetTypeRefEquals(selected.program.records.requiredStorageType.get(declaration), target), true,
        `${name}: the same completed consumer ABI owns original storage`);
      assert.equal(targetTypeRefEquals(selected.program.records.storageType.get(declaration), target), true, name);
    }
    const completed = selected.program.records.callableCreation.get(selected.lambda);
    assert.equal(completed?.kind, "selected", "one completed native creation");
    assert.equal(completed.carrier === target, true, "the original completed creation owns its native carrier");
    assert.equal(completed.allocation.staticBody, staticBody, "native inline caching follows the original body and captures");
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
    assert.equal(getCsharpDelegateSignature(selected.program.records.storageType.get(selected.variables.get("mapper")))?.parameters.length, 1,
      "no unproved source storage promotion");
    assert.equal(getCsharpDelegateSignature(selected.program.records.storageType.get(selected.variables.get("alias")))?.parameters.length, 1,
      "aliases preserve the identical authored value carrier until the invocation boundary");
    const creation = selected.program.records.callableCreation.get(selected.lambda);
    assert.equal(creation?.kind, "selected", "one completed native creation");
    assert.equal(creation.allocation.kind, "fresh", "observable or unknown identity preserved");
  });
}
