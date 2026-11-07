import assert from "node:assert/strict";
import test from "node:test";
import { assertPublishedMixedConstructionRefusals, assertPublishedRefusal } from "../../helpers/source-effective-types.mjs";
import { compileCsharpNativeUseSource } from "../../helpers/expected-native-uses.mjs";
import { getCsharpArrayLiteralElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { isCsharpStringTargetType, isCsharpJsStringTargetType } from "../../../dist/target-model/types/identity.js";
import { targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";
import { assertCsharpCompilationSucceeded, checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { hostProgram, representationServices, representations } from "../../representation/host-fixture.mjs";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpTestSourceProgram } from "../../helpers/target-source-program.mjs";
import { analyzeCsharpDeclarations } from "../../../dist/analysis/declarations/analyze.js";
import { csharpRuntimeUnionTargetType, csharpTargetNamedType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { csharpConversionIsApplicable } from "../../../dist/policy/conversions/applicability.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/projection/relation-resolution.js";
import { header, emptyProviders, compile, diagnosticLabel, accepted, arrays, constructedArrays, destinationBodies, actualDestinationEvidence, actualUnionDestinationEvidence } from "./inferred-numeric-array-elements.fixtures.mjs";

// Nextgen C-2542: the inferred return of a callable is the Host callable-return fact (facts.values.callableReturn),
// represented once (I6). The deleted C# return reconciliation (reconcileInferredReturnTargetContract) and its numeric
// baseline proof (csharpNumericReturnBaselineCovered) compared a coarse checked baseline with the observed native ABI;
// that comparison was a second Source decision in C# and has no successor. What remains: (1) the published C# return
// contract IS the representation of the Host return, arms in Host order (R6); (2) the CLR conversion proofs between a
// union-element array and a coarse array still reject both directions.
const inferredReturns = `import type { int32, uint32 } from "@tsonic/core/types.js";
export function mixed(flag: boolean, small: int32, wide: uint32) { return flag ? [small, wide, 1.5] : [wide]; }
export function nested(small: int32) { return [[small], [2.5]]; }
export function pair(small: int32) { return [[small], [1.5]] as const; }
export function maybe(flag: boolean, small: int32) { return flag ? [small] : undefined; }`;

test("an inferred numeric return contract is the represented Host callable return (no C# baseline reconciliation)", () => {
  const program = hostProgram(inferredReturns);
  const services = representationServices(program);
  const compiled = compileCsharpSource({ sourceText: inferredReturns });
  assertCsharpCompilationSucceeded(compiled);
  const analysis = compiled.result.program;
  const declarations = analysis.source.sourceFiles.filter(file => !analysis.source.syntax.isDeclarationFile(file))
    .flatMap(file => analysis.source.syntax.statements(file)).filter(node => analysis.source.syntax.is.IsFunctionDeclaration(node));
  assert.equal(declarations.length, 4);
  for (const declaration of declarations) {
    const name = analysis.source.syntax.text(analysis.source.syntax.name(declaration));
    const contract = analysis.records.returnContract.get(declaration);
    assert.equal(contract?.kind, "resolved", name);
    const local = program.named(name);
    const expected = representations(services).callableReturn(local);
    assert.equal(expected.kind !== "csharp-refused" && expected.kind !== "refused", true, `${name}: the Host return is representable`);
    assert.equal(targetTypeRefEquals(contract.type, expected), true,
      `${name}: the published return ABI is the one representation of the Host callable return`);
    for (const arms of [getCsharpRuntimeUnionArms(expected)].filter(Boolean)) {
      const sum = program.facts.sums.sumOf(program.callableReturn(local));
      if (sum !== undefined) assert.equal(arms.length <= sum.arms.length, true, `${name}: arms come from the Host sum, never added`);
    }
  }
});

// The negative controls of the deleted return-coverage proof (R4 #73) kept as CLR conversion controls: a union-element
// array never converts to a carrier with an unrelated arm, a missing alternative, another rank, another tuple arity or a
// missing native absence (the representation, not a C# reconciliation, decides the return; these stay distinct).
test("numeric array carriers with unrelated arms, missing alternatives, rank, tuple arity or absence never convert", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  const floating = csharpSourcePrimitiveTargetType("float64");
  const text = csharpStringTargetType();
  const native = element => Object.freeze({ kind: "array", element });
  const policy = { projectTypes: { directSupertypes: () => [] }, providers: emptyProviders, target: {} };
  const controls = [
    ["unrelated actual arm", native(csharpRuntimeUnionTargetType([integer, text])), native(floating)],
    ["missing checked alternative", native(integer), native(csharpRuntimeUnionTargetType([floating, text]))],
    ["native array rank", { ...native(integer), rank: 2 }, native(integer)],
    ["tuple arity", { kind: "tuple", elements: [integer] }, { kind: "tuple", elements: [integer, integer] }],
    ["missing native absence", native(integer), native(csharpNullableTargetType(integer))],
  ];
  for (const [label, observed, baseline] of controls) for (const mode of ["implicit", "explicit"]) {
    assert.equal(csharpConversionIsApplicable(selectCsharpConversion(policy, observed, baseline, mode), mode), false,
      `${label}/${mode}: distinct native return carriers have no CLR conversion`);
  }
});

test("coarse and union-element numeric arrays are distinct CLR carriers in both conversion directions", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  const unsigned = csharpSourcePrimitiveTargetType("uint32");
  const floating = csharpSourcePrimitiveTargetType("float64");
  const union = csharpRuntimeUnionTargetType([integer, unsigned, floating]);
  const native = element => Object.freeze({ kind: "array", element });
  const policy = { projectTypes: { directSupertypes: () => [] },
    providers: emptyProviders, target: {} };
  for (const [label, observed, baseline] of [
    ["native array", native(union), native(floating)],
    ["JS array", csharpJsArrayTargetType(union), csharpJsArrayTargetType(floating)],
  ]) for (const mode of ["implicit", "explicit"]) {
    assert.equal(selectCsharpConversion(policy, observed, baseline, mode).kind, "rejected",
      `${label}/${mode}: coarse source coverage never authorizes a different physical array conversion`);
    assert.equal(selectCsharpConversion(policy, baseline, observed, mode).kind, "rejected",
      `${label}/${mode}: a physical array cannot acquire a union layout through reversed coverage`);
  }
});

test("contradictory native collection metadata keeps one physical carrier identity at any nesting", () => {
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
      assert.equal(targetTypeRefKey(wrap(actual)) === targetTypeRefKey(wrap(contradictory)), true,
        `${field}/${label}: the physical native carrier identity is intentionally unchanged`);
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
  const source = csharpTestSourceProgram(checked.source);
  const ast = source.syntax;
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
  const declaredReturns = new Map();
  const declarations = [];
  const visit = node => {
    if (ast.is.IsFunctionDeclaration(node)) {
      const selected = carriers.get(ast.text(ast.name(node)));
      if (selected !== undefined) {
        declarations.push(node);
        authored.set(ast.typeNode(node), selected[1]);
        declaredReturns.set(node, selected[1]);
      }
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const absent = Object.freeze({ get: () => undefined });
  const evidence = { compileTimeMetadata: absent, pointerReturn: absent, contextualType: absent,
    inferredCallableReturnType: absent, nodeTargetType: { get: node => authored.get(node) } };
  const policy = { ast, sourceFiles: [file], facts: source.facts,
    types: {
      represent: () => assert.fail("callable return contracts represent only the published callable return"),
      callableReturn(declaration) {
        const published = source.facts.values.callableReturn(declaration);
        assert.equal(published !== undefined && published.kind !== "refused" &&
          published.provenance.occurrence === declaration, true,
          "the declared return belongs to this exact real checked callable");
        const represented = declaredReturns.get(declaration);
        assert.equal(represented !== undefined, true, "the native input is keyed by the actual callable declaration");
        return represented;
      },
    } };
  const result = analyzeCsharpDeclarations(policy, evidence, { selectedProperty: absent });
  for (const declaration of declarations) {
    const name = ast.text(ast.name(declaration));
    const [, declared] = carriers.get(name);
    const contract = result.returnContract.get(declaration);
    assert.equal(contract?.kind, "resolved", `${name}: the actual declaration publishes one native return contract`);
    assert.equal(contract.type === declared, true,
      `${name}: the one Host-published declared return fixes the ABI; body carriers cannot retarget it`);
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
    const ast = program.source.syntax;
    const found = new Set();
    const visit = node => {
      if (ast.is.IsVariableDeclaration(node) || ast.is.IsPropertyDeclaration(node)) {
        const declaration = ast.is.IsVariableDeclaration(node)
          ? ast.as.AsVariableDeclaration(node) : ast.as.AsPropertyDeclaration(node);
        const initializer = declaration?.Initializer;
        if (initializer !== undefined && ast.is.IsArrayLiteralExpression(initializer)) {
          const name = ast.text(ast.name(node));
          const expected = name === "localValues" || name === "values" ? "int64" : "float64";
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
      assertPublishedRefusal({ ...compiled, targetSource: compiled.nativeStage.source },
        "TSONIC_LOCAL_TYPE_MIXED_ELEMENTS", `[${order}]`);
      assert.equal(compiled.artifacts.size, 0, "a precision refusal publishes no generated artifact");
    });

test(`${surface} an annotated float32/${type} destination retains its actual native rounding (${order})`, () => {
      const program = accepted(compile(surface, `export function run(narrow: float32, value: ${type}): number {
        const values: float32[] = [${order}]; return values[0]; }`));
      const ast = program.source.syntax;
      const literals = [];
      const visit = node => {
        if (ast.is.IsArrayLiteralExpression(node)) literals.push(node);
        ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
      };
      for (const file of csharpProgramSourceFiles(program)) visit(file);
      assert.equal(literals.length, 1, "the companion keeps the identical single physical construction");
      const literal = literals[0];
      const physical = program.records.nativeExpression.get(literal)?.use;
      const read = program.records.valueRead.get(literal);
      assert.equal(physical?.kind === "constructed" &&
        getCsharpArrayLiteralElementTargetType(physical.carrier)?.name === "float32" &&
        getCsharpArrayLiteralElementTargetType(read?.value)?.name === "float32", true,
      "the explicit float32 array is constructed directly, not copied or repaired at the return");
      const input = ast.elements(literal).find(node => ast.is.IsIdentifier(node) && ast.text(node) === "value");
      const use = input === undefined ? undefined : program.records.nativeExpression.get(input)?.use;
      assert.equal(use?.kind === "converted" && use.input.kind === "value" &&
        use.input.type.kind === "source-primitive" && use.input.type.name === type &&
        use.target.kind === "source-primitive" && use.target.name === "float32" &&
        use.completion.kind === "value" && use.completion.type.kind === "source-primitive" &&
        use.completion.type.name === "float32", true,
      "the original signed or unsigned input has its exact authored native rounding at construction");
    });
}
}

test(`${surface} native float32 inference and actual explicit destinations preserve their distinct contracts`, () => {
    const original = `
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
      }`;
    assertPublishedMixedConstructionRefusals(compile(surface, original));
    let companion = original;
    for (const name of ["narrowSigned", "narrowUnsigned", "signedNarrow", "unsignedNarrow"]) {
      companion = companion.replace(`const ${name} =`, `const ${name}: float32[] =`);
    }
    for (const name of ["decimal", "decimalReverse", "computed", "integerPastSingle"]) {
      companion = companion.replace(`const ${name} =`, `const ${name}: number[] =`);
    }
    const program = accepted(compile(surface, companion));
    const carriers = arrays(program);
    for (const name of ["narrowSigned", "narrowUnsigned", "signedNarrow", "unsignedNarrow", "half", "quarter", "halfReverse", "actualSingle"]) assert.equal(
      carriers.get(name)?.kind === "source-primitive" && carriers.get(name)?.name === "float32", true,
      `${name}: exact inference or actual authored native float32 storage`);
    for (const name of ["decimal", "decimalReverse", "computed", "integerPastSingle", "actualDouble"]) assert.equal(
      carriers.get(name)?.kind === "source-primitive" && carriers.get(name)?.name === "float64", true,
      `${name}: actual float64 need is not narrowed or rounded twice`);
  });

test(`${surface} bare two arms and integer literal three arms retain every physical contribution`, () => {
    const original = `
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
      export const exactWideLiteral = [wide, 9007199254740993];`;
    assertPublishedMixedConstructionRefusals(compile(surface, original));
    let companion = original;
    for (const name of ["bare", "reverse"]) companion = companion.replace(`const ${name} =`, `const ${name}: (int32 | uint32)[] =`);
    for (const name of ["left", "middle", "right", "wrapped"]) {
      companion = companion.replace(`const ${name} =`, `const ${name}: (int32 | uint32 | number)[] =`);
    }
    const program = accepted(compile(surface, companion));
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
