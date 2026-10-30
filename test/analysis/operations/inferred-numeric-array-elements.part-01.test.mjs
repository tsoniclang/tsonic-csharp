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
import { header, emptyProviders, compile, diagnosticLabel, accepted, arrays, constructedArrays, destinationBodies, actualDestinationEvidence, actualUnionDestinationEvidence } from "./inferred-numeric-array-elements.fixtures.mjs";

test("inferred numeric return coverage preserves complete native union layouts without converting their arrays", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  const unsigned = csharpSourcePrimitiveTargetType("uint32");
  const floating = csharpSourcePrimitiveTargetType("float64");
  const union = csharpRuntimeUnionTargetType([integer, unsigned, floating]);
  const duplicate = csharpRuntimeUnionTargetType([floating, floating]);
  const native = element => Object.freeze({ kind: "array", element });
  const tuple = elements => Object.freeze({ kind: "tuple", elements: Object.freeze(elements) });
  const policy = { projectTypes: { directSupertypes: () => [] },
    providers: emptyProviders, target: {} };
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
    providers: emptyProviders, target: {} };
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
  const evidence = { compileTimeMetadata: absent, pointerReturn: absent, contextualType: absent,
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

for (const surface of ["native", "js"]){
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

for (const type of ["int32", "uint32"]){
for (const order of ["narrow, value", "value, narrow"]){
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
}
