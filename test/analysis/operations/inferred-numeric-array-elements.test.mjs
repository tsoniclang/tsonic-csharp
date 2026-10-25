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

const header = 'import type { float32, float64, int16, uint16, int32, uint32, int64 } from "@tsonic/core/types.js";';
const compile = (surface, body) => compileCsharpNativeUseSource({ surface, sourceText: `${header}\n${body}` });
const diagnosticLabel = compiled => `count=${compiled.targetDiagnostics.length}; ${compiled.targetDiagnostics.slice(0, 4)
  .map(issue => `${issue.code}: ${issue.message.slice(0, 512)}`).join(" | ")}`;
const accepted = compiled => {
  assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
  assert.equal(compiled.result.program !== undefined && compiled.targetDiagnostics.length === 0, true,
    compiled.targetDiagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | "));
  return compiled.result.program;
};

test("inferred numeric return coverage preserves complete native union layouts without converting their arrays", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  const unsigned = csharpSourcePrimitiveTargetType("uint32");
  const floating = csharpSourcePrimitiveTargetType("float64");
  const union = csharpRuntimeUnionTargetType([integer, unsigned, floating]);
  const duplicate = csharpRuntimeUnionTargetType([floating, floating]);
  const native = element => Object.freeze({ kind: "array", element });
  const tuple = elements => Object.freeze({ kind: "tuple", elements: Object.freeze(elements) });
  const policy = { projectTypes: { directSupertypes: () => [] },
    providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) }, target: {} };
  const controls = [
    ["native array", native(union), native(floating)],
    ["JS array", csharpJsArrayTargetType(union), csharpJsArrayTargetType(floating)],
    ["nested arrays", native(csharpJsArrayTargetType(union)), native(csharpJsArrayTargetType(floating))],
    ["tuple positions", tuple([native(union), csharpJsArrayTargetType(union)]), tuple([native(floating), csharpJsArrayTargetType(floating)])],
    ["optional array", csharpNullableTargetType(native(union)), csharpNullableTargetType(native(floating))],
    ["duplicate native ABI slots", native(duplicate), native(floating)],
  ];
  for (const [label, observed, baseline] of controls) {
    assert.equal(csharpNumericReturnBaselineCovered({ source: observed, baseline, definitions: undefined,
      convert: (source, target) => selectCsharpConversion(policy, source, target, "implicit") }), true,
    `${label}: every actual native arm and checked coarse alternative corresponds`);
    const selected = reconcileInferredReturnTargetContract(policy, baseline, [observed], false);
    assert.equal(selected.kind === "resolved" && selected.type === observed, true,
      `${label}: inferred return publication retains the one actual native ABI by identity`);
  }
  for (const [label, observed, baseline] of controls.slice(0, 2)) for (const mode of ["implicit", "explicit"]) {
    assert.equal(selectCsharpConversion(policy, observed, baseline, mode).kind, "rejected",
      `${label}/${mode}: coarse source coverage never authorizes a different physical array conversion`);
    assert.equal(selectCsharpConversion(policy, baseline, observed, mode).kind, "rejected",
      `${label}/${mode}: a physical array cannot acquire a union layout through reversed coverage`);
  }
});

test("numeric return coverage refuses missing arms, unrelated carriers and contradictory native collection metadata", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  const floating = csharpSourcePrimitiveTargetType("float64");
  const text = csharpStringTargetType();
  const native = element => Object.freeze({ kind: "array", element });
  const policy = { projectTypes: { directSupertypes: () => [] },
    providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) }, target: {} };
  const controls = [
    ["unrelated actual arm", native(csharpRuntimeUnionTargetType([integer, text])), native(floating)],
    ["missing checked alternative", native(integer), native(csharpRuntimeUnionTargetType([floating, text]))],
    ["native array rank", { ...native(integer), rank: 2 }, native(floating)],
    ["tuple arity", { kind: "tuple", elements: [integer] }, { kind: "tuple", elements: [floating, floating] }],
    ["missing native absence", native(integer), native(csharpNullableTargetType(floating))],
    ["contradictory collection payload", { ...csharpJsArrayTargetType(integer), csharpReadOnlyIndexableElementType: text }, csharpJsArrayTargetType(floating)],
  ];
  for (const [label, observed, baseline] of controls) assert.equal(csharpNumericReturnBaselineCovered({ source: observed,
    baseline, definitions: undefined, convert: (source, target) => selectCsharpConversion(policy, source, target, "implicit") }), false,
  `${label}: a complete independent baseline proof is still required`);
});

test("numeric baseline identity cannot hide contradictory native collection slots at any nesting", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  const text = csharpStringTargetType();
  const actual = csharpJsArrayTargetType(integer);
  const wrappers = [
    ["direct", value => value],
    ["native array", value => ({ kind: "array", element: value })],
    ["tuple", value => ({ kind: "tuple", elements: [value] })],
    ["optional", value => csharpNullableTargetType(value)],
    ["native generic", value => csharpTargetNamedType("fixture.Box`1", [value],
      { kind: "named", name: "Box", genericArity: 1 }, { allowsRefLikeTypeArguments: [false] })],
  ];
  for (const field of ["csharpArrayLiteralElementType", "csharpEnumerableElementType", "csharpArrayLikeElementType",
    "csharpReadOnlyIndexableElementType", "csharpDenseMutableElementType"]) {
    const contradictory = { ...actual, [field]: text };
    for (const [label, wrap] of wrappers) {
      const source = wrap(actual);
      const target = wrap(contradictory);
      assert.equal(targetTypeRefKey(source) === targetTypeRefKey(target), true,
        `${field}/${label}: the physical native carrier identity is intentionally unchanged`);
      for (const [observed, baseline] of [[source, target], [target, source]]) assert.equal(csharpNumericReturnBaselineCovered({
        source: observed, baseline, definitions: undefined, convert: () => assert.fail("contradictory metadata is not a conversion"),
      }), false, `${field}/${label}: neither baseline direction accepts contradictory slot metadata`);
    }
  }
});

test("authored native generic return ABIs are not rewritten by a nested logical union permutation", () => {
  const checked = checkCsharpSource({ sourceText: `
    interface NativeBox<Value> { value: Value; }
    interface NativeUnion<Left, Right> { left?: Left; right?: Right; }
    type Logical = string | number;
    type Values = readonly Logical[];
    type Nested<Value> = readonly (string | Value)[][];
    export function wrapper(value: NativeBox<Logical>): NativeBox<Logical> { return value; }
    export function explicit(value: NativeBox<NativeUnion<string, number>>): NativeBox<NativeUnion<string, number>> { return value; }
    export function nativeUnion(value: NativeUnion<string, number>): NativeUnion<string, number> { return value; }
    export function alias(value: Values): Values { return value; }
    export function nested(value: Nested<number>): Nested<number> { return value; }
    export function tuple(value: [Values, Values]): [Values, Values] { return value; }
  ` });
  assert.equal(checked.sourceDiagnosticsText, "", "every declaration and alias uses actual checked semantic types");
  const source = createTargetSourceProgram(checked.source);
  const { ast } = source;
  const file = checked.source.getSourceFile("/project/index.ts");
  const text = csharpStringTargetType();
  const numeric = csharpSourcePrimitiveTargetType("float64");
  const producedUnion = csharpRuntimeUnionTargetType([text, numeric]);
  const declaredUnion = csharpRuntimeUnionTargetType([numeric, text]);
  const array = element => Object.freeze({ kind: "array", element });
  const box = element => csharpTargetNamedType("fixture.NativeBox", [element],
    { kind: "named", name: "NativeBox", genericArity: 1 }, { allowsRefLikeTypeArguments: [false] });
  const carriers = new Map([
    ["wrapper", [box(producedUnion), box(declaredUnion), false]],
    ["explicit", [box(producedUnion), box(declaredUnion), false]],
    ["nativeUnion", [producedUnion, declaredUnion, false]],
    ["alias", [array(producedUnion), array(declaredUnion), true]],
    ["nested", [array(array(producedUnion)), array(array(declaredUnion)), true]],
    ["tuple", [{ kind: "tuple", elements: [array(producedUnion), array(producedUnion)] },
      { kind: "tuple", elements: [array(declaredUnion), array(declaredUnion)] }, true]],
  ]);
  const authored = new Map();
  const returned = new Map();
  const declarations = [];
  const visit = node => {
    if (ast.is.IsFunctionDeclaration(node)) {
      const selected = carriers.get(ast.text(ast.name(node)));
      if (selected !== undefined) {
        declarations.push(node);
        authored.set(ast.typeNode(node), selected[1]);
        const statement = ast.statements(ast.body(node))[0];
        returned.set(ast.as.AsReturnStatement(statement).Expression, selected[0]);
      }
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const absent = Object.freeze({ get: () => undefined });
  const evidence = { compileTimeMetadata: absent, pointerReturn: absent, contextualTargetType: absent,
    inferredCallableReturnType: absent, nodeTargetType: { get: node => authored.get(node) } };
  const policy = { ast, sourceFiles: [file], semanticsFor: source.semantics.forNode,
    types: { resolveType: (type, sourceFile) => {
      const queries = source.semantics.forFile(sourceFile);
      return queries.types.isStringLike(type) ? text : queries.types.isNumberLike(type) ? numeric : undefined;
    } } };
  const result = analyzeCsharpDeclarations(policy, evidence, { selectedProperty: absent },
    { get: node => returned.has(node) ? { returnedValue: returned.get(node) } : undefined });
  for (const declaration of declarations) {
    const name = ast.text(ast.name(declaration));
    const [produced, declared, selectable] = carriers.get(name);
    const contract = result.returnContract.get(declaration);
    assert.equal(contract?.kind, "resolved", `${name}: the actual declaration publishes one native return contract`);
    assert.equal(contract.type === (selectable ? produced : declared), true,
      `${name}: source-layout provenance, not nested-union presence, decides whether the native declaration ABI is selectable`);
  }
  assert.equal(declarations.length, 6, "all explicit native ABI negatives and source alias/nesting positives reach declaration analysis");
});
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

for (const surface of ["native", "js"]) {
  test(`${surface} inferred array binding and field storage retain their actual construction carrier`, () => {
    const program = accepted(compile(surface, `
      function select(values: number[]): number[] { return values; }
      export function local() { let localValues = [1, 2]; localValues[0] = 3; return localValues[0]; }
      export function authored() { let authoredValues: number[] = [1, 2]; authoredValues[0] = 1.5; return authoredValues; }
      export function destination() { let demandedValues = [1, 2]; return select(demandedValues); }
      export class Counter { values = [1, 2]; current() { return this.values[0]; } }
    `));
    const ast = program.source.ast;
    const found = new Set();
    const visit = node => {
      if (ast.is.IsVariableDeclaration(node) || ast.is.IsPropertyDeclaration(node)) {
        const declaration = ast.is.IsVariableDeclaration(node)
          ? ast.as.AsVariableDeclaration(node) : ast.as.AsPropertyDeclaration(node);
        const initializer = declaration?.Initializer;
        if (initializer !== undefined && ast.is.IsArrayLiteralExpression(initializer)) {
          const name = ast.text(ast.name(node));
          const expected = name === "localValues" || name === "values"
            ? surface === "native" ? "int32" : "float64" : "float64";
          const construction = program.records.nativeExpression.get(initializer)?.use;
          const stored = program.records.storageType.get(node);
          const read = program.records.valueRead.get(initializer)?.value;
          assert.equal(construction?.kind === "constructed" &&
            getCsharpArrayLiteralElementTargetType(construction.carrier)?.name === expected &&
            getCsharpArrayLiteralElementTargetType(stored)?.name === expected &&
            getCsharpArrayLiteralElementTargetType(read)?.name === expected, true,
          `${name}: inferred mutable storage and fields consume the original native construction without a copy or a checker-number substitution`);
          found.add(name);
        }
      }
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    for (const file of csharpProgramSourceFiles(program)) visit(file);
    assert.equal(found.size === 4 && ["localValues", "authoredValues", "demandedValues", "values"]
      .every(name => found.has(name)), true, "inferred, authored, independently demanded and field constructions are all retained");
  });
  for (const type of ["int32", "uint32"]) for (const order of ["narrow, value", "value, narrow"]) {
    test(`${surface} inferred float32/${type} refuses precision loss (${order})`, () => {
      const compiled = compile(surface, `export function run(narrow: float32, value: ${type}): number {
        const values = [${order}]; return values[0]; }`);
      assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
      assert.equal(compiled.result.program === undefined, true, "inferred precision is refused before the program seal");
      assert.equal(compiled.targetDiagnostics.length === 1 &&
        compiled.targetDiagnostics[0].code === "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH" &&
        compiled.targetDiagnostics[0].message === "Inferred array elements require an exact common native numeric carrier; an explicit native array destination is required for a rounding conversion.",
      true, `one exact source diagnostic, never an internal missing fact or artificial f64 rescue; ${diagnosticLabel(compiled)}`);
      assert.equal(compiled.artifacts.size, 0, "a precision refusal publishes no generated artifact");
    });
  }
  test(`${surface} native float32 inference and actual explicit destinations preserve their distinct contracts`, () => {
    const program = accepted(compile(surface, `
      export function inferred(narrow: float32, signed: int16, unsigned: uint16): number {
        const narrowSigned = [narrow, signed]; const narrowUnsigned = [unsigned, narrow];
        const signedNarrow = [signed, narrow]; const unsignedNarrow = [narrow, unsigned];
        const half = [narrow, 0.5]; const quarter = [1.25, narrow]; const decimal = [narrow, 0.1];
        const halfReverse = [0.5, narrow]; const decimalReverse = [0.1, narrow];
        const computed = [narrow, 0.5 as float64]; const integerPastSingle = [narrow, 16777217];
        return narrowSigned[0] + narrowUnsigned[1] + signedNarrow[1] + unsignedNarrow[0] + half[1] +
          quarter[0] + halfReverse[0] + decimal[1] + decimalReverse[0] + computed[1] + integerPastSingle[1];
      }
      export function explicit(narrow: float32, signed: int32): number {
        const actualDouble: number[] = [narrow, signed]; const actualSingle: float32[] = [narrow, signed];
        return actualDouble[1] + actualSingle[1];
      }`));
    const carriers = arrays(program);
    for (const name of ["narrowSigned", "narrowUnsigned", "signedNarrow", "unsignedNarrow", "half", "quarter", "halfReverse", "actualSingle"]) assert.equal(
      carriers.get(name)?.kind === "source-primitive" && carriers.get(name)?.name === "float32", true,
      `${name}: exact inference or actual authored native float32 storage`);
    for (const name of ["decimal", "decimalReverse", "computed", "integerPastSingle", "actualDouble"]) assert.equal(
      carriers.get(name)?.kind === "source-primitive" && carriers.get(name)?.name === "float64", true,
      `${name}: actual float64 need is not narrowed or rounded twice`);
  });
  test(`${surface} bare two arms and integer literal three arms retain every physical contribution`, () => {
    const program = accepted(compile(surface, `
      export function run(signed: int32, unsigned: uint32): boolean {
        const bare = [signed, unsigned]; const reverse = [unsigned, signed];
        const left = [signed, unsigned, 1]; const middle = [signed, 1, unsigned]; const right = [1, signed, unsigned];
        const wrapped = [signed, unsigned, ((1))];
        return bare[0] === signed && bare[1] === unsigned && reverse[0] === unsigned && reverse[1] === signed &&
          left[0] === signed && left[1] === unsigned && left[2] === 1 &&
          middle[0] === signed && middle[1] === 1 && middle[2] === unsigned &&
          right[0] === 1 && right[1] === signed && right[2] === unsigned &&
          wrapped[0] === signed && wrapped[1] === unsigned && wrapped[2] === 1;
      }
      const signed: int32 = 1; const wide: int64 = 9007199254740993n; const narrow: float32 = 0.5;
      export const genuine = [signed, wide]; export const floatWide = [narrow, wide];
      export const sameWide = [wide, wide]; export const fittingWide = [wide, 1];
      export const exactWideLiteral = [wide, 9007199254740993];`));
    const carriers = arrays(program);
    for (const name of ["bare", "reverse"]) {
      const arms = getCsharpRuntimeUnionArms(carriers.get(name), program.typeDefinitions);
      assert.equal(arms?.length === 2 && arms.some(arm => arm.kind === "source-primitive" && arm.name === "int32") &&
        arms.some(arm => arm.kind === "source-primitive" && arm.name === "uint32"), true,
      `${name}: the retained original source/native pair is not cut`);
    }
    for (const name of ["left", "middle", "right", "wrapped"]) {
      const arms = getCsharpRuntimeUnionArms(carriers.get(name), program.typeDefinitions);
      assert.equal(arms?.length === 3 && ["int32", "uint32", "float64"].every(kind =>
        arms.some(arm => arm.kind === "source-primitive" && arm.name === kind)), true,
      `${name}: actual integer peers and the canonical f64 literal arm remain distinct`);
    }
    const genuine = getCsharpRuntimeUnionArms(carriers.get("genuine"), program.typeDefinitions);
    assert.equal(genuine?.length === 2 && ["int32", "int64"].every(kind => genuine.some(arm =>
      arm.kind === "source-primitive" && arm.name === kind)), true, "the genuine checked native union is not numerically joined");
    assert.equal(carriers.get("sameWide")?.kind === "source-primitive" && carriers.get("sameWide")?.name === "int64", true,
      "a homogeneous exact native wide array never takes a floating route");
    const floatWide = getCsharpRuntimeUnionArms(carriers.get("floatWide"), program.typeDefinitions);
    assert.equal(floatWide?.length === 2 && ["float32", "int64"].every(kind => floatWide.some(arm =>
      arm.kind === "source-primitive" && arm.name === kind)), true, "a genuine checked float/wide union is not cut by inferred exactness");
    for (const name of ["fittingWide", "exactWideLiteral"]) assert.equal(carriers.get(name)?.kind === "source-primitive" &&
      carriers.get(name)?.name === "int64", true, `${name}: an exact authored integer fits native wide storage without a floating detour`);
  });
  for (const [name, body] of [
    ["alias", "type Values = float32[]; export function run(value: float32): Values { const result: Values = [value, 1]; return result; }"],
    ["argument", "function first(values: float32[]): float32 { return values[0]; } export function run(value: float32): float32 { return first([value, 1]); }"],
    ["return", "export function run(value: float32): float32[] { const result = [value, 1]; return result; }"],
    ["async", "export async function run(value: float32): Promise<float32[]> { return [value, 1]; }"],
    ["concise arrow", "export function run(value: float32): float32 { const make = (): float32[] => [value, 1]; return make()[0]; }"],
    ["nested callback", "function call(make: () => float32[]): float32[] { return make(); } export function run(value: float32): float32 { return call(() => [value, 1])[0]; }"],
  ]) test(`${surface} actual ${name} destination reaches the same numeric owner`, () => {
    accepted(compile(surface, body));
  });
  for (const [name, body] of Object.entries(destinationBodies)) test(`${surface} actual ${name} destination changes physical i32 element storage`, () => {
    const program = accepted(compile(surface, body("float32", "runSingle") + body("number", "runDouble")));
    actualDestinationEvidence(program, ["float32", "float64"], name);
  });
  for (const [name, body] of Object.entries(destinationBodies)) test(`${surface} actual ${name} closed union destination preserves explicit native rounding`, () => {
    const source = body("(string | number)", "run").replaceAll("[narrow, signed]",
      '["text", 9007199254740993, -9007199254740993, 1e100]');
    const program = accepted(compile(surface, source));
    actualUnionDestinationEvidence(program, name);
  });
  test(`${surface} an actual generic union argument selects the literal's physical storage order`, () => {
    const program = accepted(compile(surface, `function consume<T>(values: (string | T)[]): void {}
      export function run(): number {
        const values = ["text", 9007199254740993, -9007199254740993, 1e100]; consume<number>(values); return 7;
      }`));
    const ast = program.source.ast;
    let call;
    let array;
    const visit = node => {
      if (ast.is.IsArrayLiteralExpression(node)) array = node;
      if (ast.is.IsCallExpression(node) && ast.text(ast.as.AsCallExpression(node)?.Expression) === "consume") call = node;
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    for (const file of csharpProgramSourceFiles(program)) visit(file);
    assert.equal(call !== undefined && array !== undefined, true, "the actual call and source construction remain present");
    const grouping = program.records.selectedCall.get(call)?.sourceArgumentGrouping;
    const constructed = program.records.nativeExpression.get(array)?.use;
    assert.equal(grouping?.kind === "grouped" && grouping.arguments.length === 1 && constructed?.kind === "constructed" &&
      targetTypeRefKey(constructed.carrier) === targetTypeRefKey(grouping.arguments[0].type), true,
    "literal storage is the exact selected native array parameter, not a sorted peer requiring an array conversion or copy");
  });
  for (const [name, source] of [
    ["nested generic argument", `function accept<T>(values: (string | T)[]): (string | T)[] { return values; }
      export function run(): (string | number)[] { const values = ["text", 9007199254740993, -9007199254740993, 1e100]; return accept<number>(values); }`],
    ["nested generic callback", `function call<T>(make: () => (string | T)[]): (string | T)[] { return make(); }
      export function run(): (string | number)[] { return call<number>(() => {
        const values = ["text", 9007199254740993, -9007199254740993, 1e100]; return values; }); }`],
    ["nested generic receiver", `class Receiver<T> { accept(values: (string | T)[]): (string | T)[] { return values; } }
      export function run(): (string | number)[] { const receiver = new Receiver<number>();
        const values = ["text", 9007199254740993, -9007199254740993, 1e100]; return receiver.accept(values); }`],
  ]) test(`${surface} actual ${name} union bindings are authoritative native destinations`, () => {
    actualUnionDestinationEvidence(accepted(compile(surface, source)), name);
  });
  test(`${surface} explicit heterogeneous and nullable native destinations retain their real selected widths`, () => {
    const program = accepted(compile(surface, `
      import type { decimal } from "@tsonic/core/types.js";
      export function exact(wide: int64): (string | int64)[] {
        const values: (string | int64)[] = ["text", wide, 9007199254740993n]; return values; }
      export function optional(): (number | undefined)[] {
        const optionalValues: (number | undefined)[] = [undefined, 9007199254740993]; return optionalValues; }
      export function decimalUnion(): (string | decimal)[] {
        const decimalValues: (string | decimal)[] = ["text", 9007199254740993]; return decimalValues; }
      export function single(): (string | float32)[] {
        const singleValues: (string | float32)[] = ["text", 16777217]; return singleValues; }
      export function mixed(wide: int64, computed: number): (int64 | number)[] {
        const mixedValues: (int64 | number)[] = [wide, computed]; return mixedValues; }`));
    const selected = constructedArrays(program);
    for (const [name, scalar] of [["values", "int64"], ["decimalValues", "decimal"], ["singleValues", "float32"]]) {
      const arms = getCsharpRuntimeUnionArms(selected.get(name), program.typeDefinitions);
      assert.equal(arms?.length === 2 && arms.some(arm => arm.kind === "source-primitive" && arm.name === scalar), true,
        `${name}: the actual authored union endpoint is retained without an artificial floating common carrier`);
    }
    const mixed = getCsharpRuntimeUnionArms(selected.get("mixedValues"), program.typeDefinitions);
    assert.equal(mixed?.length === 2 && ["int64", "float64"].every(kind => mixed.some(arm => arm.name === kind)), true,
      "an actual heterogeneous destination preserves the full native integer arm as well as a genuine computed float");
  });
  test(`${surface} inferred heterogeneous counter-controls preserve exact integers, fractions, signed zero and computed values`, () => {
    const program = accepted(compile(surface, `export function run(computed: number) {
      const exact = ["text", 9007199254740994];
      const huge = ["text", 1606938044258990275541962092341162602522202993782792835301376];
      const fraction = ["text", 0.1]; const signedZero = ["text", -0];
      const actualFloat = ["text", computed]; const absent = [undefined, 9007199254740994];
      return exact.${surface === "native" ? "Length" : "length"} + huge.${surface === "native" ? "Length" : "length"} +
        fraction.${surface === "native" ? "Length" : "length"} + signedZero.${surface === "native" ? "Length" : "length"} +
        actualFloat.${surface === "native" ? "Length" : "length"} + absent.${surface === "native" ? "Length" : "length"}; }`));
    const selected = constructedArrays(program);
    for (const name of ["exact", "huge", "fraction", "signedZero", "actualFloat"]) {
      const arms = getCsharpRuntimeUnionArms(selected.get(name), program.typeDefinitions);
      assert.equal(arms?.length === 2 && arms.some(arm => arm.kind === "source-primitive" && arm.name === "float64") &&
        arms.some(arm => isCsharpStringTargetType(arm) || isCsharpJsStringTargetType(arm)), true,
      `${name}: actual exact or computed f64 contributions remain with the existing heterogeneous native carrier`);
    }
  });
  for (const [name, body] of [
    ["generic argument", `function accept<T>(values: T[]): T[] { return values; }
      export function run(narrow: float32, signed: int32) { return accept([narrow, signed]); }`],
    ["generic callback", `function call<T>(make: () => T[]): T[] { return make(); }
      export function run(narrow: float32, signed: int32) {
        return call(() => { const values = [narrow, signed]; return values; }); }`],
  ]) test(`${surface} a self-inferred ${name} is not an authored rounding destination`, () => {
    const compiled = compile(surface, body);
    assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
    const issue = compiled.nativeStage.diagnostics[0];
    const ast = compiled.nativeStage.source.ast;
    const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
    const text = range?.kind !== "authored" ? undefined : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end);
    assert.equal(compiled.targetDiagnostics.length === 1 && issue.code === "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH" &&
      issue.message === "Inferred array elements require an exact common native numeric carrier; an explicit native array destination is required for a rounding conversion." &&
      text === "[narrow, signed]", true, `checked generic inference cannot round an actual i32 through a manufactured f64 destination; ${diagnosticLabel(compiled)}`);
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      "the actual inferred construction is refused before sealing and emission");
  });
  for (const [name, body] of [
    ["plain generic argument", `function accept<T>(values: T[]): T[] { return values; }
      export function run() { const values = ["text", 9007199254740993]; return accept(values); }`],
    ["nested generic argument", `function accept<T>(values: (string | T)[]): (string | T)[] { return values; }
      export function run() { const values = ["text", 9007199254740993]; return accept(values); }`],
    ["nested generic callback", `function call<T>(make: () => (string | T)[]): (string | T)[] { return make(); }
      export function run() { return call(() => { const values = ["text", 9007199254740993]; return values; }); }`],
  ]) test(`${surface} a self-inferred ${name} is not an explicit closed union destination`, () => {
    const compiled = compile(surface, body);
    assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
    const issue = compiled.nativeStage.diagnostics[0];
    const ast = compiled.nativeStage.source.ast;
    const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
    const text = range?.kind !== "authored" ? undefined : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end);
    assert.equal(compiled.targetDiagnostics.length === 1 && issue.code === "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH" &&
      issue.message === "An inferred numeric union requires an exact canonical carrier for every authored integer literal." &&
      text === '["text", 9007199254740993]', true,
    `the same inference cannot certify itself as a native rounding demand through a generic union or callback; ${diagnosticLabel(compiled)}`);
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      "a failed inferred construction is rejected before any sealed or emitted program");
  });
  for (const [name, body] of [
    ["argument", `function accept<T>(sample: T, values: T[]): T[] { void sample; return values; }
      export function run(narrow: float32, signed: int32, wide: number) {
        const values = [narrow, signed]; return accept(wide, values); }`],
    ["callback", `function call<T>(sample: T, make: () => T[]): T[] { void sample; return make(); }
      export function run(narrow: float32, signed: int32, wide: number) {
        return call(wide, () => { const values = [narrow, signed]; return values; }); }`],
  ]) test(`${surface} an independently inferred generic ${name} retains its actual native destination`, () => {
    const program = accepted(compile(surface, body));
    actualDestinationEvidence(program, ["float64"], `independent generic ${name}`);
  });
  for (const [name, body] of [
    ["arguments", `function accept<T>(first: T[], second: T[]): T[] { void second; return first; }
      export function run() { const values = ["text", 9007199254740993]; const alias = values;
        return accept(values, alias); }`],
    ["callbacks", `function call<T>(first: () => T[], second: () => T[]): T[] { void second; return first(); }
      export function run() { const values = ["text", 9007199254740993];
        return call(() => values, () => values); }`],
  ]) test(`${surface} same-call ${name} of one array cannot certify each other's rounding destination`, () => {
    const compiled = compile(surface, body);
    assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
    const issue = compiled.nativeStage.diagnostics[0];
    const ast = compiled.nativeStage.source.ast;
    const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
    const text = range?.kind !== "authored" ? undefined : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end);
    assert.equal(compiled.targetDiagnostics.length === 1 && issue.code === "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH" &&
      issue.message === "An inferred numeric union requires an exact canonical carrier for every authored integer literal." &&
      text === '["text", 9007199254740993]', true, `checked aliases of the same native construction supply no independent rounding authority; ${diagnosticLabel(compiled)}`);
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      "the original precise rejection occurs before sealing, without an alias-induced floating conversion");
  });
  test(`${surface} incompatible actual native destinations refuse one physical array before sealing`, () => {
    const compiled = compile(surface, `function single(values: float32[]): void {}
      function double(values: number[]): void {}
      export function run(narrow: float32, signed: int32): void {
        const values = [narrow, signed]; single(values); double(values); }`);
    assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
    const issue = compiled.nativeStage.diagnostics[0];
    const ast = compiled.nativeStage.source.ast;
    const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
    const text = range?.kind !== "authored" ? undefined : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end);
    assert.equal(compiled.targetDiagnostics.length === 1 && issue.code === "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH" &&
      issue.message === "Array construction requires one consistent actual native element destination across its storage and uses." &&
      text === "[narrow, signed]", true, `no use-order winner, array copy or consumer-side storage repair hides conflicting native destinations; ${diagnosticLabel(compiled)}`);
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      "one physical construction is either closed or precisely refused before publication");
  });
  test(`${surface} an erased callable does not admit or reject its numeric body`, () => {
    accepted(compile(surface, `export function run(narrow: float32, signed: int32): number {
      const unused = () => { const values = [narrow, signed]; return values[0]; }; void unused; return 7; }`));
  });
  test(`${surface} an authored integer outside the canonical floating arm is refused without a native-integer cap`, () => {
    const compiled = compile(surface, `export function run(signed: int32, unsigned: uint32): number {
      const values = [signed, unsigned, 9007199254740993]; return values[0]; }`);
    assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0 && compiled.targetDiagnostics.length === 1 &&
      compiled.targetDiagnostics[0].code === "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH" &&
      compiled.targetDiagnostics[0].message === "An inferred numeric union requires an exact canonical carrier for every authored integer literal.", true,
    `the actual f64 union arm cannot round the authored integer; exact native int64 values remain separately admitted; ${diagnosticLabel(compiled)}`);
    const program = accepted(compile(surface, `export function run(signed: int32, unsigned: uint32) {
      const values = [signed, unsigned, 9007199254740992]; return values; }`));
    const arms = getCsharpRuntimeUnionArms(arrays(program).get("values"), program.typeDefinitions);
    assert.equal(arms?.length === 3 && arms.some(arm => arm.kind === "source-primitive" && arm.name === "float64"), true,
      "the neighboring exact floating value retains all approved native arms");
  });
  for (const [name, elements] of [
    ["single fixed peer", "signed, 9007199254740993"],
    ["single fixed peer reversed", "9007199254740993, signed"],
    ["negative token", "signed, -9007199254740993"],
    ["fraction cannot conceal inexact integer", "signed, unsigned, 9007199254740993, 0.5"],
    ["unmaterialized integral token", "signed, 1e100"],
    ["unmaterialized token cannot erase incompatible peers", "signed, unsigned, 1e100"],
    ["absence cannot conceal an inexact canonical integer", "signed, undefined, 9007199254740993"],
    ["nonnumeric arms cannot conceal an inexact canonical integer", 'signed, "text", 9007199254740993'],
    ["text cannot authorize a floating default", '"text", 9007199254740993'],
    ["text reversed cannot authorize a floating default", '9007199254740993, "text"'],
    ["text and a fraction cannot authorize a floating default", '"text", -9007199254740993, 0.5'],
    ["native absence cannot authorize a floating default", "undefined, 9007199254740993"],
    ["native absence reversed cannot authorize a floating default", "9007199254740993, undefined"],
    ["Boolean storage cannot authorize a floating default", "false, 1e100"],
  ]) test(`${surface} every inferred union fallback proves exact canonical integers (${name})`, () => {
    const compiled = compile(surface, `export function run(signed: int32, unsigned: uint32) { const values = [${elements}]; return values; }`);
    assert.equal(compiled.sourceDiagnosticsText === "", true, compiled.sourceDiagnosticsText);
    const issues = compiled.nativeStage.diagnostics;
    const issue = issues[0];
    const ast = compiled.nativeStage.source.ast;
    const range = issue?.sourceNode === undefined ? undefined : ast.authoredRange(issue.sourceNode);
    const text = range?.kind !== "authored" ? undefined : ast.getSourceText(ast.getSourceFile(issue.sourceNode)).slice(range.start, range.end);
    assert.equal(issues.length === 1 && issue.code === "CSHARP_ARRAY_ELEMENT_CARRIER_MISMATCH" &&
      issue.message === "An inferred numeric union requires an exact canonical carrier for every authored integer literal." &&
      text === `[${elements}]`, true, "one exact diagnostic identifies the actual array construction, never a compiler invariant");
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      "a refused physical union has no sealed program or generated artifacts");
  });
  test(`${surface} exact integers beyond2^53 and bounded materialization retain actual native representations`, () => {
    const program = accepted(compile(surface, `export function run(signed: int32, unsigned: uint32) {
      const exact = [signed, 9007199254740994];
      const huge = [signed, unsigned, 1606938044258990275541962092341162602522202993782792835301376];
      const rounded: number[] = [signed, 9007199254740993];
      return exact[0] === signed && huge[0] === signed && rounded[0] === signed; }`));
    const selected = arrays(program);
    assert.equal(selected.get("exact")?.name === "float64" && selected.get("rounded")?.name === "float64", true,
      "inferred exact f64 and explicitly rounded f64 remain distinct admitted contracts");
    const arms = getCsharpRuntimeUnionArms(selected.get("huge"), program.typeDefinitions);
    assert.equal(arms?.length === 3 && ["int32", "uint32", "float64"].every(kind => arms.some(arm => arm.name === kind)), true,
      "the exact2^200 token is a flexible canonical arm, not an inferred reason to erase native integer peers");
  });
}
