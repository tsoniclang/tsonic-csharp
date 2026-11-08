import assert from "node:assert/strict";
import test from "node:test";
import * as representations from "../../../dist/policy/types/source-type-flow/representation.js";
import * as obligations from "../../../dist/policy/types/source-type-flow/obligations.js";
import * as integerUses from "../../../dist/policy/conversions/native-index.js";
import { sourceOutcome } from "../../../dist/policy/types/source-type-flow/representation-results.js";
import { csharpNativeTypeImplements } from "../../../dist/policy/types/source-type-flow/relations.js";
import { selectCsharpParameterListCarrier } from "../../../dist/policy/types/callables/parameter-list.js";
import { csharpTargetTypeFailsConstraint } from "../../../dist/analysis/operations/members/calls/constraint-satisfaction.js";
import { csharpObjectShapeMemberContractKey } from "../../../dist/target-model/types/object-shape-identity.js";
import { csharpRuntimeUnionTargetType, csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType, csharpObjectTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpQualifiedTypeRenderShape } from "../../../dist/target-model/types/render-shapes.js";
import { getCsharpArrayLiteralElementTargetType, csharpEnumerableTargetType, csharpReadOnlyListTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { createNativeConversionHost } from "../../helpers/native-conversion-host.mjs";

const primitive = csharpSourcePrimitiveTargetType;
const core = 'import type { int32, int64, uint32, uint64, float32, float64, decimal } from "@tsonic/core/types.js";';

function fixture(text, surface = "native") {
  const compiled = analyzeCsharpSource({ surface, sourceText: core + text });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved", "the genuine Native program owns one representation view");
  const program = compiled.analysis.value;
  const source = compiled.source;
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.sourceFiles) if (!source.ast.isDeclarationFile(file)) visit(file);
  const named = (node, name) => source.ast.text(source.ast.name(node)) === name;
  const parameter = name => {
    const matches = nodes.filter(node => source.ast.is.IsParameterDeclaration(node) && named(node, name));
    assert.equal(matches.length, 1, `one original parameter ${name}`);
    return matches[0];
  };
  const slot = name => {
    const node = parameter(name);
    const evidence = resolvedSourceValue(source.facts.values.declaredSlot(node), "the original declared storage").type;
    return { node, evidence };
  };
  const endpoint = name => {
    const selected = slot(name);
    const result = program.representation.represent(selected.evidence, "storage", selected.node);
    assert.equal(result.kind, "represented", `actual Native storage for ${name}`);
    return { ...selected, carrier: result.value.carrier, represented: result.value };
  };
  return { compiled, program, source, nodes, named, parameter, slot, endpoint };
}

function nativeHost(context, laws = createNativeConversionHost()) {
  return { ...laws, representation: context.program.representation,
    nativeConstraintFailure(carrier, constraint) {
      const reason = csharpTargetTypeFailsConstraint(laws, { kind: "target-derived", targetType: carrier }, constraint);
      return reason === undefined ? { kind: "none" } : { kind: "present", value: reason };
    } };
}

function write(context, source, destination, site = source.node) {
  return obligations.checkCsharpNativeTypeObligation(nativeHost(context), { kind: "write-fit", site, source, destination });
}

function scalar(context, text) {
  const node = context.source.facts.values.occurrences().find(node => context.source.ast.text(node) === text);
  assert.equal(node !== undefined, true, `the actual original scalar ${text}`);
  return { node, evidence: resolvedSourceValue(context.source.facts.values.type(node), "the original scalar value") };
}

for (const surface of ["native", "js"]) {
  test(`published ${surface} tuple slots retain exact absence and homogeneous Native rest ABI`, () => {
    const context = fixture(`export declare function slots(
      fixed: [int64, int64?], rest: [int64, int64?, ...int64[]],
      heterogeneous: [float64, ...int64[]]): void;`, surface);
    const fixed = context.endpoint("fixed");
    assert.equal(fixed.carrier.kind, "tuple");
    assert.equal(fixed.carrier.elements.length, 2);
    assert.equal(targetTypeRefEquals(fixed.carrier.elements[0], primitive("int64")), true);
    assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(fixed.carrier.elements[1]), primitive("int64")), true);
    assert.equal(targetTypeRefEquals(getCsharpArrayLiteralElementTargetType(context.endpoint("rest").carrier), primitive("int64")), true);
    const bad = context.slot("heterogeneous");
    const rejected = context.program.representation.represent(bad.evidence, "storage", bad.node);
    assert.equal(rejected.kind, "native-refused");
    assert.equal(rejected.code, "CSHARP_TUPLE_STORAGE_UNSUPPORTED");
    assert.equal(rejected.site === bad.node, true);
    const rest = surface === "js" ? csharpJsArrayTargetType(primitive("int64")) : { kind: "array", element: primitive("int64") };
    assert.equal(selectCsharpParameterListCarrier([rest, rest], [0, 1], surface === "js"), undefined,
      "malformed multiple-rest Native metadata never acquires a common element");
  });
}

test("declarations, original reads and metadata have one genuine Source publication boundary", () => {
  const context = fixture(`export class Box { field: number = 1; }
    export function run(input: number): number {
      const value: number = input; const { item } = { item: value };
      const record = { value, value2: value }; const box = new Box();
      return value + item + record.value + record["value"] + box.field;
    }`);
  const { source, nodes, named } = context;
  const occurrences = source.facts.values.occurrences();
  const kinds = [
    ["variable", node => source.ast.is.IsVariableDeclaration(node) && named(node, "value")],
    ["parameter", node => source.ast.is.IsParameterDeclaration(node) && named(node, "input")],
    ["binding", node => source.ast.is.IsBindingElement(node) && named(node, "item")],
    ["field", node => source.ast.is.IsPropertyDeclaration(node) && named(node, "field")],
  ];
  for (const [name, predicate] of kinds) {
    const node = nodes.find(predicate);
    assert.equal(node !== undefined, true, name);
    const slot = resolvedSourceValue(source.facts.values.declaredSlot(node), `${name} original storage`);
    source.facts.descriptors.assertEvidence(slot.type);
  }
  for (const node of nodes.filter(node => source.ast.is.IsPropertyAssignment(node) || source.ast.is.IsShorthandPropertyAssignment(node))) {
    assert.equal(occurrences.includes(node), false, "member metadata is not a second value occurrence");
  }
  for (const node of occurrences.filter(node => source.ast.is.IsPropertyAccessExpression(node) || source.ast.is.IsElementAccessExpression(node))) {
    const value = resolvedSourceValue(source.facts.values.type(node), "the original read");
    const represented = context.program.representation.represent(value, "value", node);
    assert.equal(represented.kind, "represented");
    assert.equal(represented.value.evidence === value, true, "the exact Source evidence reaches Native unchanged");
    assert.throws(() => context.program.representation.represent({ ...value }, "value", node), TypeError,
      "a copied record is not authenticated evidence, even after caching its real counterpart");
  }
});

test("superseded representation and batch obligation APIs are not exported", () => {
  for (const name of ["representCsharpSourceType", "sourceTypeFlowRepresentation"]) assert.equal(Object.hasOwn(representations, name), false, name);
  for (const name of ["checkCsharpSourceTypeFlowObligation", "checkCsharpSourceTypeFlowObligations"]) assert.equal(Object.hasOwn(obligations, name), false, name);
  for (const name of ["selectCsharpSourceTypeFlowIndexConversion", "csharpSourceTypeFlowShiftCountType"]) assert.equal(Object.hasOwn(integerUses, name), false, name);
});

test("the unchanged Source refusal object and its exact original child site are forwarded", () => {
  const context = fixture("export function original(value: number): number { return value; }");
  const site = context.parameter("value");
  const refusal = Object.freeze({ kind: "refused", source: "tsonic", code: "TSONIC_SOURCE_FORM_UNSUPPORTED",
    message: "Exact unsupported demanded Source child.", site });
  const result = sourceOutcome(refusal);
  assert.equal(result.kind, "source-refused");
  assert.equal(result.refusal === refusal && result.refusal.site === site, true,
    "unit contract, not a reconstructed or claimed measured lazy-constraint program");
});

test("a real enum underlying publication has no invented generic parameters", () => {
  const context = fixture("export enum Token { Ready = 1, Done = 2 }");
  const declaration = context.nodes.find(node => context.source.ast.is.IsEnumDeclaration(node));
  assert.equal(declaration !== undefined, true);
  const enumeration = resolvedSourceValue(context.source.facts.enums.declaration(declaration), "original enum metadata");
  assert.equal(enumeration.declaration === declaration, true);
  assert.deepEqual(context.source.facts.descriptors.freeParameters(enumeration.underlying), []);
});

for (const surface of ["native", "js"]) {
  test(`representation retains every exact Source width and ${surface} array carrier`, () => {
    const names = ["int32", "int64", "float32", "float64", "uint32", "uint64", "decimal"];
    const context = fixture(`export declare function widths(${names.map(name => `${name}Values: ${name}[]`).join(",")}): void;`, surface);
    for (const name of names) {
      const selected = context.endpoint(`${name}Values`);
      assert.equal(getCsharpArrayLiteralElementTargetType(selected.carrier)?.name, name);
      assert.equal(selected.carrier.kind === "array", surface === "native");
      assert.equal(Object.isFrozen(selected.evidence), true, "the original publication is not rewritten");
    }
  });
}

test("declared Native representation keeps original identity and ordered class arguments", () => {
  const context = fixture(`export class Pair<Left, Right> {
      constructor(public left: Left, public right: Right) {}
    }
    export declare function take(pair: Pair<int64, float32>): void;`);
  const selected = context.endpoint("pair");
  assert.equal(selected.evidence.type.kind, "declared");
  assert.equal(selected.carrier.kind, "target-named");
  assert.deepEqual(selected.carrier.typeArguments.map(type => type.name), ["int64", "float32"]);
  const repeated = context.program.representation.represent(selected.evidence, "storage", selected.node);
  assert.equal(repeated.kind, "represented");
  assert.equal(repeated.value === selected.represented, true, "same-view representation is canonical");
});

test("optional value storage has one absence and no nested optional payload", () => {
  const context = fixture("export declare function optional(value: int32 | undefined): void;");
  const selected = context.endpoint("value");
  const payload = getCsharpNullableElementTargetType(selected.carrier);
  assert.equal(targetTypeRefEquals(payload, primitive("int32")), true);
  assert.equal(getCsharpNullableElementTargetType(payload), undefined);
});

test("literal admission retains exact authored data and the original Native failure site", () => {
  const context = fixture("export const huge = 2147483648; export declare function take(target: int32): void;");
  const original = scalar(context, "2147483648");
  const destination = context.endpoint("target");
  const result = obligations.checkCsharpNativeTypeObligation(nativeHost(context), { kind: "literal-admission", site: original.node,
    source: { evidence: original.evidence, carrier: primitive("int64") }, destination, construction: { kind: "none" } });
  assert.equal(result.kind, "native-refused");
  assert.equal(result.code, "CSHARP_NATIVE_WRITE_CARRIER_MISMATCH");
  assert.equal(result.message, "Source bigint literal is outside the exact 'int32' range.");
  assert.equal(result.site === original.node && result.source === "tsonic-csharp", true);
});

test("projected RHS checks use exact registered child evidence rather than a parent Box", () => {
  const context = fixture("export function run(box: { values: [int32] }): int32 { return box.values[0]; }");
  const read = context.source.facts.values.occurrences().find(node => context.source.ast.is.IsElementAccessExpression(node));
  assert.equal(read !== undefined, true);
  const evidence = resolvedSourceValue(context.source.facts.values.type(read), "the exact projected read");
  const endpoint = { evidence, carrier: primitive("int32") };
  assert.equal(write(context, { ...endpoint, node: read }, endpoint).kind, "represented");
  assert.throws(() => write(context, { node: read, evidence: { ...evidence }, carrier: primitive("int32") }, endpoint), TypeError,
    "a missing/counterfeit child cannot be filled by retyping the Box");
});

test("canonical shapes retain readonly and original declarations and reject contradictory Native headers", () => {
  const context = fixture("export declare function shape(record: { readonly count: int32 }): void;");
  const selected = context.endpoint("record");
  const registry = context.program.analysis.typeSystem.objectShapes;
  const shape = registry.resolveTarget(selected.carrier);
  assert.equal(shape !== undefined && shape.members.length === 1, true);
  const member = shape.members[0];
  assert.equal(member.readonly === true && member.origins.length === 1, true);
  assert.equal(member.sourceDeclarations.includes(member.origins[0].declaration), true);
  assert.equal(member.type.name, "int32");
  assert.throws(() => registry.retainShape({ ...shape, members: [{ ...member, readonly: false }] }, selected.node), TypeError,
    "same physical identity cannot retain the first incompatible header");
});

test("optional member presence is independent of optional value storage and authentic evidence is mandatory", () => {
  const context = fixture("export declare function shape(required: { value: int32 | undefined }, optional: { value?: int32 }): void;");
  const required = context.endpoint("required");
  const optional = context.endpoint("optional");
  const registry = context.program.analysis.typeSystem.objectShapes;
  const first = registry.resolveTarget(required.carrier).members[0];
  const second = registry.resolveTarget(optional.carrier).members[0];
  assert.equal(first.optional, false);
  assert.equal(second.optional, true);
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(first.type), primitive("int32")), true);
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(second.type), primitive("int32")), true);
  assert.notEqual(targetTypeRefKey(required.carrier), targetTypeRefKey(optional.carrier));
  assert.throws(() => context.program.representation.represent({ ...required.evidence, type: { ...required.evidence.type, members: [] } },
    "storage", required.node), TypeError, "opaque evidence has no presence-less mock/default form");
});

test("Native bound and unbound physical fields keep exact Source origins and width", () => {
  const context = fixture("export declare function shape(record: { count: int32 }): void;");
  const value = context.endpoint("record");
  const member = context.program.analysis.typeSystem.objectShapes.resolveTarget(value.carrier).members[0];
  const bound = Object.freeze({ ...member, bound: true });
  assert.equal(bound.origins === member.origins && bound.sourceDeclarations === member.sourceDeclarations, true);
  assert.equal(bound.type === member.type, true, "Native binding never retypes the Source child");
  assert.notEqual(csharpObjectShapeMemberContractKey(bound), csharpObjectShapeMemberContractKey(member));
});

test("only real type-only metadata avoids Native runtime representation demand", () => {
  const context = fixture(`type CompileOnly = [number, string, ...number[]];
    export const live = 1; export declare function rejected(runtime: [number, string, ...number[]]): void;`);
  const metadata = context.nodes.find(node => context.source.ast.is.IsTypeAliasDeclaration(node));
  assert.equal(metadata !== undefined, true);
  assert.equal(context.source.facts.values.occurrences().includes(metadata), false);
  const runtime = context.slot("runtime");
  const result = context.program.representation.represent(runtime.evidence, "storage", runtime.node);
  assert.equal(result.kind, "native-refused");
  assert.equal(result.code, "CSHARP_TUPLE_STORAGE_UNSUPPORTED");
  assert.equal(result.site === runtime.node, true, "unproven runtime demand cannot borrow the type-only exemption");
});

test("Native collection contracts retain exact arguments, vector rank and no copied covariance", () => {
  const host = createNativeConversionHost();
  const integer = primitive("int32");
  for (const contract of [csharpEnumerableTargetType(integer), csharpReadOnlyListTargetType(integer)]) {
    assert.equal(csharpNativeTypeImplements(host, { kind: "array", element: integer }, contract), true);
    assert.equal(csharpNativeTypeImplements(host, csharpJsArrayTargetType(integer), contract), true);
    assert.equal(csharpNativeTypeImplements(host, { kind: "array", rank: 2, element: integer }, contract), false);
  }
  assert.equal(csharpNativeTypeImplements(host, { kind: "array", element: csharpStringTargetType() },
    csharpEnumerableTargetType(csharpObjectTargetType())), false);
});

test("identical Native scalar carriers cannot bypass overflow through identity, nullable or union injection", () => {
  const context = fixture("export const huge = 2147483648; export declare function take(target: int32): void;");
  const original = scalar(context, "2147483648");
  const evidence = context.endpoint("target").evidence;
  const source = { ...original, carrier: primitive("int32") };
  for (const carrier of [primitive("int32"), csharpNullableTargetType(primitive("int32")),
    csharpRuntimeUnionTargetType([primitive("int32"), primitive("bool")])]) {
    assert.equal(carrier !== undefined, true);
    const result = write(context, source, { evidence, carrier });
    assert.equal(result.kind, "native-refused");
    assert.equal(result.code, "CSHARP_NATIVE_WRITE_CARRIER_MISMATCH");
    assert.equal(result.site === original.node, true);
  }
});

function arrayReceipt(context, contribution, elementCarrier) {
  const construction = resolvedSourceValue(context.source.facts.values.construction(contribution), "original array construction");
  assert.equal(construction.kind, "present");
  const original = construction.value;
  const carrier = { kind: "array", element: elementCarrier };
  const contributions = original.evaluation.map(entry => {
    const values = entry.form === "spread" ? entry.value.type.kind === "tuple"
      ? entry.value.type.elements.map((_, index) => resolvedSourceValue(context.source.facts.descriptors.component(entry.value,
        { kind: "tuple-element", index }), "the original spread component"))
      : [resolvedSourceValue(context.source.facts.descriptors.component(entry.value, { kind: "array-element" }), "the spread element")]
      : [entry.value];
    return { original: entry, elements: values.map(evidence => ({ site: entry.occurrence,
      source: { evidence, carrier: evidence.type.kind === "primitive" ? primitive(evidence.type.primitive) : elementCarrier },
      destination: { evidence, carrier: elementCarrier } })) };
  });
  const receipt = { kind: "array", carrier, construction: original, contributions };
  const endpoints = { source: { evidence: original.value, carrier }, destination: { evidence: original.value, carrier } };
  return { receipt, obligation: { kind: "literal-admission", site: contribution, ...endpoints, construction: { kind: "present", value: receipt } } };
}

for (const [name, values, accepted] of [
  ["overflowing spread element", "[2147483648] as const", false],
  ["fitting spread elements", "[1, 2] as const", true],
  ["overflowing tuple element", "[1, 2147483648] as const", false],
  ["known plus unknown spread elements", "[1, unknownValue] as const", false],
]) {
  test(`original grouped construction checks ${name} without losing any unknown contribution`, () => {
    const context = fixture(`export function values(unknownValue: int64) { return [...(${values})]; }`);
    const node = context.source.facts.values.occurrences().find(node => context.source.ast.is.IsArrayLiteralExpression(node) &&
      context.source.ast.is.IsReturnStatement(context.source.ast.parent(node)));
    assert.equal(node !== undefined, true);
    const { obligation, receipt } = arrayReceipt(context, node, primitive("int32"));
    const result = obligations.checkCsharpNativeTypeObligation(nativeHost(context), obligation);
    assert.equal(result.kind === "represented", accepted, name);
    if (!accepted) {
      assert.equal(result.code, "CSHARP_NATIVE_WRITE_CARRIER_MISMATCH");
      assert.equal(receipt.contributions.some(entry => entry.elements.some(element => element.site === result.site)), true);
    }
    assert.equal(receipt.contributions.every((entry, index) => entry.original === receipt.construction.evaluation[index]), true);
  });
}

test("aggregate Native admission requires the original complete grouping including empty spreads", () => {
  const context = fixture("export function values() { return [...([] as const), 1]; }");
  const node = context.source.facts.values.occurrences().find(node => context.source.ast.is.IsArrayLiteralExpression(node) &&
    context.source.ast.is.IsReturnStatement(context.source.ast.parent(node)));
  const { obligation, receipt } = arrayReceipt(context, node, primitive("int64"));
  assert.equal(obligations.checkCsharpNativeTypeObligation(nativeHost(context), obligation).kind, "represented");
  assert.equal(receipt.contributions[0].elements.length, 0);
  assert.throws(() => obligations.checkCsharpNativeTypeObligation(nativeHost(context), {
    ...obligation, construction: { kind: "present", value: { ...receipt, contributions: receipt.contributions.slice(1) } },
  }), TypeError, "an empty spread still belongs to authored evaluation order");
  assert.throws(() => obligations.checkCsharpNativeTypeObligation(nativeHost(context), {
    ...obligation, construction: { kind: "present", value: { ...receipt, contributions: [...receipt.contributions].reverse() } },
  }), TypeError, "equivalent leaf data cannot replace the original ordered contributions");
});

for (const surface of ["native", "js"]) {
  test(`partial ${surface} array admission checks unknown leaves normally and retains known overflow`, () => {
    const context = fixture("export function values(input: float32) { return [input, 1]; }", surface);
    const node = context.source.facts.values.occurrences().find(node => context.source.ast.is.IsArrayLiteralExpression(node));
    const { obligation } = arrayReceipt(context, node, primitive("float32"));
    assert.equal(obligations.checkCsharpNativeTypeObligation(nativeHost(context), obligation).kind, "represented");
    const overflow = fixture("export function values(input: int32) { return [input, 2147483648]; }", surface);
    const badNode = overflow.source.facts.values.occurrences().find(node => overflow.source.ast.is.IsArrayLiteralExpression(node));
    const bad = arrayReceipt(overflow, badNode, primitive("int32"));
    const rejected = obligations.checkCsharpNativeTypeObligation(nativeHost(overflow), bad.obligation);
    assert.equal(rejected.kind, "native-refused");
    assert.equal(rejected.code, "CSHARP_NATIVE_WRITE_CARRIER_MISMATCH");
    assert.equal(overflow.source.ast.text(rejected.site), "2147483648");
  });
}

test("Native broad boolean writes use admitted boxing rather than a numeric range classifier", () => {
  const context = fixture("export const value = false; export declare function take(broad: unknown, integer: int32): void;");
  const original = scalar(context, "false");
  const source = { ...original, carrier: primitive("bool") };
  assert.equal(write(context, source, { evidence: context.endpoint("broad").evidence, carrier: csharpTsValueTargetType() }).kind, "represented");
  const rejected = write(context, source, context.endpoint("integer"));
  assert.equal(rejected.kind, "native-refused");
  assert.equal(rejected.code, "CSHARP_NATIVE_WRITE_CARRIER_MISMATCH");
});

test("nullable Native write lifts retain width and optional values cannot be implicitly unwrapped", () => {
  const names = ["float32", "float64", "int32", "int64"];
  const context = fixture(`export declare function values(${names.flatMap(name => [
    `${name}Value: ${name}`, `${name}Optional: ${name} | undefined`]).join(",")}): void;`);
  for (const name of names) {
    const value = context.endpoint(`${name}Value`);
    const optional = context.endpoint(`${name}Optional`);
    assert.equal(write(context, value, optional).kind, "represented");
    const rejected = write(context, optional, value);
    assert.equal(rejected.kind, "native-refused");
    assert.equal(rejected.code, "CSHARP_NATIVE_WRITE_CARRIER_MISMATCH");
    assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(optional.carrier), value.carrier), true);
  }
});

test("Native constraints retain the original Source binder and actual nonempty lowered bounds", () => {
  const context = fixture("export function bound<T extends number>(argument: T): T { return argument; }");
  const declaration = context.nodes.find(node => context.source.ast.is.IsTypeParameterDeclaration(node));
  const parameter = context.source.facts.descriptors.typeParameter(declaration);
  const lowered = context.program.representation.parameter(parameter, declaration);
  assert.equal(lowered.kind, "represented");
  assert.equal(lowered.value.csharpDeclaration === declaration, true);
  assert.equal(lowered.value.csharpConstraints.kind, "resolved");
  assert.equal(lowered.value.csharpConstraints.constraints.length > 0, true, "numeric Native capabilities are not fabricated emptiness");
  const value = context.endpoint("argument");
  assert.equal(value.carrier.identity, lowered.value.identity);
  assert.throws(() => context.program.representation.parameter({ ...parameter }, declaration), TypeError);
});

test("nonempty Native value and unmanaged constraints reject an opposite reference requirement", () => {
  const context = fixture("export function bound<T>(value: T): T { return value; }");
  const original = context.nodes.find(node => context.source.ast.is.IsTypeParameterDeclaration(node));
  const parameter = context.source.facts.descriptors.typeParameter(original);
  const value = { evidence: context.endpoint("value").evidence, carrier: primitive("int32") };
  const base = { kind: "constraint", site: original, source: value, parameter };
  assert.equal(obligations.checkCsharpNativeTypeObligation(nativeHost(context), {
    ...base, constraints: [{ kind: "value-type" }, { kind: "unmanaged" }],
  }).kind, "represented");
  const failure = obligations.checkCsharpNativeTypeObligation(nativeHost(context), { ...base, constraints: [{ kind: "reference-type" }] });
  assert.equal(failure.kind, "native-refused");
  assert.equal(failure.code, "CSHARP_NATIVE_CONSTRAINT_UNSATISFIED");
  assert.equal(failure.message, "The argument is not a proven C# reference type.");
  assert.equal(failure.site === original, true);
});

test("exact Native generic interfaces never accept substituted argument or variance guesses", () => {
  const integer = primitive("int32");
  const wide = primitive("int64");
  const named = (name, value) => csharpTargetNamedType(`fixture.${name}\`1`, [value],
    csharpQualifiedTypeRenderShape("fixture", name), { allowsRefLikeTypeArguments: [false] });
  const chosen = named("Box", integer);
  const required = named("IBound", integer);
  const different = named("IBound", wide);
  const host = createNativeConversionHost({ heritage: [{ carrier: chosen, supertypes: [required] }] });
  assert.equal(csharpNativeTypeImplements(host, chosen, required), true);
  assert.equal(csharpNativeTypeImplements(host, chosen, different), false);
});

for (const purpose of ["interface", "read-only"]) {
  test(`${purpose} obligation checks the existing exact Native contract, never fills Source`, () => {
    const context = fixture("export declare function take(value: int32, wrong: int64): void;");
    const value = context.endpoint("value");
    const check = destination => obligations.checkCsharpNativeTypeObligation(nativeHost(context), {
      kind: "contract", site: value.node, source: value, destination,
    });
    assert.equal(check(value).kind, "represented");
    const failure = check(context.endpoint("wrong"));
    assert.equal(failure.kind, "native-refused");
    assert.equal(failure.code, "CSHARP_NATIVE_CONTRACT_MISMATCH");
  });
}

test("only the actual original int64 read and admitted Native int32 index may narrow", () => {
  const context = fixture("export function read(index: int64): int64 { return index; }");
  const occurrence = context.source.facts.values.occurrences().find(node => context.source.ast.is.IsIdentifier(node) &&
    context.source.ast.text(node) === "index" && context.source.ast.is.IsReturnStatement(context.source.ast.parent(node)));
  assert.equal(occurrence !== undefined, true);
  const operand = { occurrence, value: resolvedSourceValue(context.source.facts.values.type(occurrence), "the original index read") };
  const from = primitive("int64");
  const to = primitive("int32");
  const use = { kind: "index", occurrence, type: to, passingMode: "by-value" };
  const select = (selected, source = from, target = to) => integerUses.selectCsharpNativeIndexConversion(
    context.source.facts.descriptors, operand, selected, source, target);
  assert.equal(select(use)?.kind, "checked-native-integer");
  for (const selected of [{ ...use, occurrence: context.parameter("index") }, { ...use, type: from },
    ...["byref-readonly", "byref-readwrite", "out"].map(passingMode => ({ ...use, passingMode }))]) {
    assert.equal(select(selected), undefined, "foreign occurrence, wrong ABI and byref uses cannot borrow index admission");
  }
  assert.equal(select(use, to, to), undefined, "wrong actual source width");
  assert.throws(() => select(undefined), TypeError, "there is no omitted Native admission overload");
});

test("Native parameters and all six shift counts share checked narrowing without retargeting results", () => {
  const context = fixture("export function read(index: int64): int64 { return index; }");
  const occurrence = context.source.facts.values.occurrences().find(node => context.source.ast.is.IsIdentifier(node) &&
    context.source.ast.text(node) === "index" && context.source.ast.is.IsReturnStatement(context.source.ast.parent(node)));
  const operand = { occurrence, value: resolvedSourceValue(context.source.facts.values.type(occurrence), "the original count read") };
  const from = primitive("int64");
  const to = primitive("int32");
  const result = primitive("uint64");
  assert.equal(integerUses.selectCsharpNativeIndexConversion(context.source.facts.descriptors, operand,
    { kind: "parameter", occurrence, type: to, passingMode: "by-value" }, from, to)?.kind, "checked-native-integer");
  for (const sourceOperator of ["<<", ">>", ">>>", "<<=", ">>=", ">>>=", "+"]) {
    const operation = { kind: "resolved", sourceOperator, right: occurrence, rightInputType: from, rightType: from, resultType: result };
    assert.equal(targetTypeRefEquals(integerUses.csharpNativeShiftCountType(operation), sourceOperator === "+" ? from : to), true);
    const selected = integerUses.selectCsharpNativeIndexConversion(context.source.facts.descriptors, operand,
      { kind: "shift-count", operation }, from, to);
    assert.equal(selected?.kind === "checked-native-integer", sourceOperator !== "+");
    assert.equal(operation.rightInputType === from && operation.rightType === from && operation.resultType === result, true);
  }
  assert.throws(() => integerUses.csharpNativeShiftCountType({ sourceOperator: "<<", rightInputType: undefined }), TypeError);
  assert.equal(integerUses.csharpNativeShiftCountType({ sourceOperator: "+", rightInputType: undefined }), undefined,
    "a genuinely dead non-shift RHS has no fake Native carrier");
});
