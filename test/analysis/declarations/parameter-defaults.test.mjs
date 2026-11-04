import assert from "node:assert/strict";
import test from "node:test";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { analyzeCsharpDeclarations } from "../../../dist/analysis/declarations/analyze.js";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";

function fixture(acceptsOmission, foreign = false) {
  const checked = checkCsharpSource({ sourceText: `import type { int32 } from "@tsonic/core/types.js";
    export function run(value: int32 = 1): void {}
    declare function other(value: int32): void;` });
  assert.equal(checked.sourceDiagnosticsText, "");
  const source = createTargetSourceProgram(checked.source);
  const file = source.sourceFiles.find(file => !source.ast.isDeclarationFile(file));
  const owners = source.ast.statements(file).filter(node => source.ast.is.IsFunctionDeclaration(node));
  const owner = owners.find(node => source.ast.text(source.ast.name(node)) === "run");
  const other = owners.find(node => source.ast.text(source.ast.name(node)) === "other");
  const parameter = source.ast.parameters(owner)[0];
  const foreignParameter = source.ast.parameters(other)[0];
  const queries = source.semantics.forNode(parameter);
  const signature = queries.types.declarationSignatureInfo(owner);
  assert.equal(signature?.parameters[0]?.declaration === parameter, true,
    "the original checked callable, parameter, initializer and eager publication belong to the same Source program");
  const selectedQueries = { ...queries, types: { ...queries.types,
    declarationSignatureInfo(declaration) {
      if (declaration !== owner) return queries.types.declarationSignatureInfo(declaration);
      return acceptsOmission === undefined ? undefined : { ...signature,
        parameters: [{ ...signature.parameters[0], declaration: foreign ? foreignParameter : parameter, acceptsOmission }] };
    },
  } };
  const policy = { ast: source.ast, sourceFiles: [file], effectiveTypes: source.effectiveTypes,
    navigation: source.navigation, semanticsFor: node => node === owner || node === parameter ? selectedQueries : source.semantics.forNode(node) };
  const valueType = { kind: "source-primitive", name: "int32" };
  const evidence = { compileTimeMetadata: new Map(), pointerReturn: new Map(), inferredCallableReturnType: new Map(),
    nodeTargetType: { get: node => node === source.ast.typeNode(parameter) || node === source.ast.name(parameter)
      ? valueType : source.ast.kindName(node) === "KindVoidKeyword" ? { kind: "void" } : undefined },
    contextualType: new Map(), expressionType: { get: node => queries.types.expressionType(node) } };
  return { parameter, selected: () => analyzeCsharpDeclarations(policy, evidence,
    { selectedProperty: new Map(), selectedCall: new Map() }, new Map()).runtimeDefault.get(parameter) };
}

test("native default declarations retain exact omission independently of their initializer and carrier", () => {
  for (const acceptsOmission of [false, true]) {
    const input = fixture(acceptsOmission);
    const selected = input.selected();
    assert.equal(selected.acceptsOmission, acceptsOmission);
    assert.equal(selected.kind, "nullable");
    assert.equal(selected.valueType.name, "int32");
    assert.equal(getCsharpNullableElementTargetType(selected.parameterType).name, "int32");
    assert.equal(Object.isFrozen(selected), true);
    assert.equal(Object.isFrozen(selected.native) && selected.native.source === selected.parameterType &&
      selected.native.target === selected.valueType && selected.native.kind === "coalesce" && selected.native.presence === false, true,
      "the immutable native default decision is owned by declaration analysis");
  }
});

test("a native default rejects missing or foreign declaration-slot evidence instead of guessing omission", () => {
  for (const input of [fixture(undefined), fixture(true, true), fixture(false, true)]) {
    assert.throws(input.selected, /requires its exact checked declaration slot/u);
  }
});
