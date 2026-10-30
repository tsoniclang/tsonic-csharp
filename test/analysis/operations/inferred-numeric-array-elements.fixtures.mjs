import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";
import { getCsharpArrayLiteralElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { isCsharpStringTargetType, isCsharpJsStringTargetType } from "../../../dist/target-model/types/identity.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { analyzeCsharpDeclarations, reconcileInferredReturnTargetContract } from "../../../dist/analysis/declarations/analyze.js";
import { csharpRuntimeUnionTargetType, csharpTargetNamedType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpNumericReturnBaselineCovered } from "../../../dist/policy/conversions/union-relations.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";

const header = 'import type { float32, float64, int16, uint16, int32, uint32, int64 } from "@tsonic/core/types.js";';

const emptyProviders = createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] });

const compile = (surface, body) => compileCsharpNativeUseSource({ surface, sourceText: `${header}\n${body}` });

const diagnosticLabel = compiled => `count=${compiled.targetDiagnostics.length}; ${compiled.targetDiagnostics.slice(0, 4)
  .map(issue => `${issue.code}: ${issue.message.slice(0, 512)}`).join(" | ")}`;

const accepted = compiled => {
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.program !== undefined && compiled.targetDiagnostics.length === 0, true,
    compiled.targetDiagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
  return compiled.result.program;
};

function arrays(program) {
  const selected = new Map();
  const ast = program.source.ast;
  const visit = node => {
    if (ast.is.IsVariableDeclaration(node)) {
      const initializer = ast.as.AsVariableDeclaration(node)?.Initializer;
      if (initializer !== undefined && ast.is.IsArrayLiteralExpression(initializer)) selected.set(ast.text(ast.name(node)),
        getCsharpArrayLiteralElementTargetType(program.records.valueRead.get(initializer)?.value));
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  return selected;
}

function constructedArrays(program) {
  const selected = new Map();
  const ast = program.source.ast;
  const visit = node => {
    if (ast.is.IsVariableDeclaration(node)) {
      const initializer = ast.as.AsVariableDeclaration(node)?.Initializer;
      if (initializer !== undefined && ast.is.IsArrayLiteralExpression(initializer)) {
        const use = program.records.nativeExpression.get(initializer)?.use;
        assert.equal(use?.kind === "constructed", true, `${ast.text(ast.name(node))}: the actual array construction is admitted`);
        selected.set(ast.text(ast.name(node)), getCsharpArrayLiteralElementTargetType(use.carrier));
      }
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  return selected;
}

const destinationBodies = {
  alias: (element, name) => `type ${name}Values = ${element}[];
    export function ${name}(narrow: float32, signed: int32): ${name}Values {
      const values: ${name}Values = [narrow, signed]; return values; }`,
  argument: (element, name) => `function ${name}Accept(values: ${element}[]): ${element}[] { return values; }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      const values = [narrow, signed]; return ${name}Accept(values); }`,
  return: (element, name) => `export function ${name}(narrow: float32, signed: int32): ${element}[] {
    const values = [narrow, signed]; const alias = values; return alias; }`,
  async: (element, name) => `export async function ${name}(narrow: float32, signed: int32): Promise<${element}[]> {
    const values = [narrow, signed]; return values; }`,
  concise: (element, name) => `export function ${name}(narrow: float32, signed: int32): ${element}[] {
    const make = (): ${element}[] => [narrow, signed]; return make(); }`,
  nested: (element, name) => `function ${name}Call(make: () => ${element}[]): ${element}[] { return make(); }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      return ${name}Call(() => { const values = [narrow, signed]; return values; }); }`,
  "explicit generic argument": (element, name) => `function ${name}Accept<T>(values: T[]): T[] { return values; }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      const values = [narrow, signed]; return ${name}Accept<${element}>(values); }`,
  "explicit generic callback": (element, name) => `function ${name}Call<T>(make: () => T[]): T[] { return make(); }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      return ${name}Call<${element}>(() => { const values = [narrow, signed]; return values; }); }`,
  "native generic receiver": (element, name) => `class ${name}Receiver<T> { accept(values: T[]): T[] { return values; } }
    export function ${name}(narrow: float32, signed: int32): ${element}[] {
      const receiver = new ${name}Receiver<${element}>(); const values = [narrow, signed]; return receiver.accept(values); }`,
  "typed callback": (element, name) => `export function ${name}(narrow: float32, signed: int32): ${element}[] {
    const make: () => ${element}[] = () => { const values = [narrow, signed]; return values; }; return make(); }`,
};

function actualDestinationEvidence(program, expected, label) {
  const nodes = [];
  const ast = program.source.ast;
  const visit = node => {
    if (ast.is.IsArrayLiteralExpression(node)) nodes.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  assert.equal(nodes.length, expected.length, `${label}: every actual construction is checked`);
  for (const [index, node] of nodes.entries()) {
    const kind = expected[index];
    const read = program.records.valueRead.get(node);
    const physical = getCsharpArrayLiteralElementTargetType(read?.value);
    assert.equal(physical?.kind === "source-primitive" && physical.name === kind, true,
      `${label}/${kind}: the array's own inferred physical storage is the actual destination`);
    const constructed = program.records.nativeExpression.get(node)?.use;
    assert.equal(constructed?.kind === "constructed" &&
      getCsharpArrayLiteralElementTargetType(constructed.carrier)?.name === kind, true,
    `${label}/${kind}: one actual native construction, not an end-only array conversion or copy`);
    const signed = ast.elements(node)[1];
    const use = signed === undefined ? undefined : program.records.nativeExpression.get(signed)?.use;
    assert.equal(use?.kind === "converted" && use.input.kind === "value" && use.input.type.kind === "source-primitive" &&
      use.input.type.name === "int32" && use.target.kind === "source-primitive" && use.target.name === kind &&
      use.completion.kind === "value" && use.completion.type.kind === "source-primitive" && use.completion.type.name === kind,
    true, `${label}/${kind}: the actual i32 element conversion is selected at construction`);
  }
}

function actualUnionDestinationEvidence(program, label) {
  const ast = program.source.ast;
  const nodes = [];
  const visit = node => {
    if (ast.is.IsArrayLiteralExpression(node)) nodes.push(node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of csharpProgramSourceFiles(program)) visit(file);
  assert.equal(nodes.length, 1, `${label}: the original physical construction is observed`);
  const expression = nodes[0];
  const use = program.records.nativeExpression.get(expression)?.use;
  const element = getCsharpArrayLiteralElementTargetType(use?.carrier);
  const arms = getCsharpRuntimeUnionArms(element, program.typeDefinitions);
  assert.equal(use?.kind === "constructed" && arms?.length === 2 &&
    arms.some(arm => arm.kind === "source-primitive" && arm.name === "float64") &&
    arms.some(arm => isCsharpStringTargetType(arm) || isCsharpJsStringTargetType(arm)), true,
  `${label}: an actual closed heterogeneous destination reaches the single native construction`);
  for (const node of ast.elements(expression).slice(1)) {
    const literal = program.records.exactLiteral.get(node, csharpSourcePrimitiveTargetType("float64"));
    const native = program.records.nativeExpression.get(node)?.use;
    assert.equal(literal?.kind === "source-representation" && native?.kind === "converted" &&
      native.input.kind === "value" && native.input.type.kind === "source-primitive" && native.input.type.name === "float64" &&
      targetTypeRefKey(native.target) === targetTypeRefKey(element), true,
    `${label}: source-representation literals reach their actual admitted native double union endpoint`);
  }
}

export { header, emptyProviders, compile, diagnosticLabel, accepted, arrays, constructedArrays, destinationBodies, actualDestinationEvidence, actualUnionDestinationEvidence };
