// Source type flow in C# (ported from the c2529 after-image to the nextgen facts, C-2542). Representation tests drive
// the one descriptor -> TargetTypeRef mapping (representation/, I6) with real Host facts. Obligation tests prove only
// the CLR half: the Host decided the Source relation; C# checks that the chosen .NET carrier can hold it, and refuses
// with CSHARP_TYPE_FLOW_UNREPRESENTABLE (I7; the former CSHARP_UNSUPPORTED_AST is split by .NET reason, AGENT-D1-NOTES §1.5).
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { csharpRepresentationContext, isCsharpRefusal, representSourceType, representObject } from "../../../dist/representation/index.js";
import { checkCsharpSourceTypeFlowObligation, checkCsharpSourceTypeFlowObligations } from "../../../dist/policy/types/source-type-flow/obligations.js";
import { selectCsharpSourceTypeFlowIndexConversion, csharpSourceTypeFlowShiftCountType } from "../../../dist/policy/conversions/source-type-flow-index.js";
import { analyzeCsharpSourceTypeFlowObligations } from "../../../dist/analysis/source-evidence/type-flow-obligations.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpArrayLiteralElementTargetType, csharpEnumerableTargetType, csharpReadOnlyListTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourceTypeFlowInterfaceAccepts } from "../../../dist/policy/types/source-type-flow/relations.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";

const primitive = name => Object.freeze({ kind: "primitive", primitive: name });
const unexpected = () => assert.fail("a primitive unit must not query declarations, shapes or an unrelated native child");
const unrepresentable = "CSHARP_TYPE_FLOW_UNREPRESENTABLE";

let base;
const program = () => base ??= hostProgram(`
  export enum Token { Ready = 1, Done = 2 }
  export interface Fields { value: number; }
  export interface Presence { value?: number | undefined; }
  export interface Required { value: number | undefined; }
  export class Box { field: number = 1; }
  export function run(input: number): number {
    const value: number = input;
    const { item } = { item: value };
    const record = { value, value2: value };
    const box = new Box();
    return value + item + record.value + record["value"] + box.field;
  }`);

/** Representation at a fresh occurrence over the shared program view, native or JS profile. */
function representAt(profile = "native", overrides = {}) {
  const services = representationServices(program(), { profile, ...overrides });
  const site = program().files[0];
  return descriptor => representSourceType(descriptor, csharpRepresentationContext(services, site, "storage"));
}

/** The obligation host of checkCsharpSourceTypeFlowObligation over the real representation. */
function obligationHost(profile = "native", overrides = {}) {
  const represent = representAt(profile);
  return {
    projectTypes: { directSupertypes: () => [] },
    providers: { findTargetBindingByTargetId: () => undefined, findTargetBindingByMetadataName: () => undefined },
    target: { id: "csharp", ...(profile === "js" ? { surfaces: ["js"] } : {}) },
    typeDefinitions: representationServices(program()).typeDefinitions,
    constraintHost: {},
    represent: descriptor => {
      const selected = represent(descriptor);
      return isCsharpRefusal(selected) ? undefined : selected;
    },
    literal: () => undefined,
    valueType: unexpected,
    arrayLiteral: unexpected,
    literalAdmission: unexpected,
    requiredType: unexpected,
    nativeConstraints: unexpected,
    ...overrides,
  };
}

const integerLiteral = integer => Object.freeze({ form: "numeric", integer, number: Number(integer),
  numeric: Object.freeze({ kind: "authored", token: Object.freeze({ coefficient: integer, exponent: 0n, negative: false,
    decimalText: `${integer}` }) }) });

test("published tuple slots reuse native parameter-list absence and rest storage", () => {
  for (const surface of ["native", "js"]) {
    const represent = representAt(surface);
    const descriptor = { kind: "tuple", readonly: false, elements: [
      { kind: "required", type: primitive("int64") },
      { kind: "optional", type: primitive("int64") },
    ] };
    const selected = represent(descriptor);
    assert.equal(selected?.kind === "tuple" && selected.elements.length === 2, true, `${surface}: exact tuple slots`);
    assert.equal(targetTypeRefEquals(selected.elements[0], csharpSourcePrimitiveTargetType("int64")), true,
      `${surface}: present width is retained`);
    assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(selected.elements[1]), selected.elements[0]), true,
      `${surface}: optional slot has one native absence`);
    const rest = { kind: "rest", type: { kind: "array", readonly: false, element: primitive("int64") } };
    const homogeneous = represent({ ...descriptor, elements: [...descriptor.elements, rest] });
    assert.equal(targetTypeRefEquals(getCsharpArrayLiteralElementTargetType(homogeneous), selected.elements[0]), true,
      `${surface}: homogeneous rest uses the same native collection element`);
    assert.equal(represent({ ...descriptor, elements: [{ kind: "required", type: primitive("float64") }, rest] }).code,
      "CSHARP_REST_PARAMETER", `${surface}: incompatible rest widths do not manufacture a common element`);
    assert.equal(represent({ ...descriptor, elements: [rest, rest] }).code, "CSHARP_REST_PARAMETER",
      `${surface}: multiple rest slots still refuse`);
  }
});

test("declarations and reads use only their Host outcome: resolved, default, refused, foreign", () => {
  const input = program();
  const { ast, nodes } = input;
  const named = (node, name) => ast.text(ast.name(node)) === name;
  const cases = [
    ["variable", node => ast.is.IsVariableDeclaration(node) && named(node, "value")],
    ["parameter", node => ast.is.IsParameterDeclaration(node) && named(node, "input")],
    ["binding", node => ast.is.IsBindingElement(node) && named(node, "item")],
    ["field", node => ast.is.IsPropertyDeclaration(node) && named(node, "field")],
    ["identifier read", node => ast.is.IsIdentifier(node) && ast.text(node) === "value" && ast.is.IsBinaryExpression(ast.parent(node))],
    ["property read", node => ast.is.IsPropertyAccessExpression(node) && named(node, "value")],
    ["element read", node => ast.is.IsElementAccessExpression(node)],
  ];
  for (const [name, predicate] of cases) {
    const node = nodes.find(predicate);
    assert.equal(node !== undefined, true, name);
    const actual = input.facts.values.type(node);
    assert.equal(actual.kind !== "refused" && actual.provenance.occurrence === node, true, `${name}: the Host value boundary`);
    const refusal = Object.freeze({ kind: "refused", source: "tsonic", code: "TSONIC_LOCAL_TYPE_CONFLICT", site: node,
      reason: "The original Source group has conflicting declared fills." });
    for (const [stateName, outcome] of [
      ["resolved", { ...actual, kind: "resolved" }],
      ["default", { ...actual, kind: "default" }],
      ["refused", refusal],
      ["foreign", { ...actual, provenance: { ...actual.provenance, occurrence: input.files[0] } }],
    ]) {
      const label = `${name}/${stateName}`;
      const facts = Object.freeze({ ...input.facts, values: Object.freeze({ ...input.facts.values,
        type(selected) { assert.equal(selected === node, true, label); return outcome; } }) });
      const value = () => representations(representationServices(input, { facts })).value(node);
      if (stateName === "foreign") {
        assert.throws(value, /exact value occurrence/u, `${label}: a foreign occurrence is an invariant failure (I4)`);
        continue;
      }
      const result = value();
      if (stateName === "refused") assert.equal(result, refusal, `${label}: the Host refusal is forwarded unchanged (R5)`);
      else assert.equal(targetTypeRefEquals(represented(result), represented(representAt()(outcome.type))), true,
        `${label}: the read is the one mapping of its own outcome, no second chooser`);
    }
  }
});

test("an enum declaration has zero .NET generic binders; an invented type argument is an arity refusal", () => {
  const input = program();
  const declaration = input.named("Token", node => input.ast.is.IsEnumDeclaration(node));
  const represent = representAt();
  assert.equal(represented(represent({ kind: "declared", declaration, typeArguments: [] })).id, "global::Fixture.Token");
  assert.equal(represent({ kind: "declared", declaration, typeArguments: [{ kind: "string" }] }).code, "CSHARP_TYPE_ARGUMENT_ARITY",
    "an enum cannot acquire an invented type argument");
});

test("representation maps each Host primitive and keeps native versus JS array carriers", () => {
  for (const surface of ["native", "js"]) for (const name of ["int32", "int64", "float32", "float64", "uint32", "uint64", "decimal"]) {
    const descriptor = Object.freeze({ kind: "array", readonly: false, element: primitive(name) });
    const selected = represented(representAt(surface)(descriptor));
    assert.equal(getCsharpArrayLiteralElementTargetType(selected)?.name, name, `${surface}/${name}: no width choice at representation`);
    assert.equal(surface === "native" ? selected.kind === "array" : selected.kind === "target-named", true,
      `${surface}: native T[] or JSArray<T>`);
    assert.equal(Object.isFrozen(descriptor) && descriptor.element.primitive === name, true, "representation does not rewrite the Host fact");
  }
});

test("a declared project type keeps nominal identity and ordered arguments", () => {
  const input = program();
  const declaration = input.named("Box", node => input.ast.is.IsClassDeclaration(node));
  let calls = 0;
  const projectTypes = representationServices(input).projectTypes;
  const represent = representAt("native", { projectTypes: { ...projectTypes, targetTypeForDeclaration(owner, arguments_) {
    calls += 1;
    assert.equal(owner === declaration && arguments_.length === 0, true, "the exact declaration and its argument vector are retained");
    return projectTypes.targetTypeForDeclaration(owner, arguments_);
  } } });
  assert.equal(represented(represent({ kind: "declared", declaration, typeArguments: [] })).id, "global::Fixture.Box");
  assert.equal(calls, 1, "the project-type catalog is asked once");
});

test("an optional value keeps one native absence without another wrapper", () => {
  const element = getCsharpNullableElementTargetType(represented(representAt()({ kind: "optional", value: primitive("int32") })));
  assert.equal(element?.kind === "source-primitive" && element.name === "int32" && getCsharpNullableElementTargetType(element) === undefined, true,
    "optional(int32) has one exact nullable integer carrier");
});

test("object shapes keep the Host member declaration, readonly-ness and optional presence", () => {
  const input = program();
  const shapeOf = name => {
    const declaration = input.named(name, node => input.ast.is.IsInterfaceDeclaration(node));
    const descriptor = { kind: "declared", declaration, typeArguments: [] };
    const members = input.facts.objects.members(descriptor);
    assert.equal(Array.isArray(members) && members.length === 1, true, `${name}: the Host publishes its member inventory`);
    return { descriptor, members };
  };
  const headers = [];
  const services = representationServices(input, { shapes: Object.freeze({ retainShape: shape => { headers.push(shape); return shape; },
    resolveCallableValue: unexpected }) });
  const context = csharpRepresentationContext(services, input.files[0], "storage");
  for (const name of ["Required", "Presence"]) {
    const { descriptor, members } = shapeOf(name);
    assert.equal(isCsharpRefusal(representObject(descriptor, members, context)), false);
    const member = headers.at(-1).members[0];
    assert.equal(member.optional, members[0].optional, `${name}: presence comes from the Host member, not the value type`);
    assert.equal(member.sourceDeclarations[0] === members[0].declarations[0], true, `${name}: the declaration identity is kept`);
    assert.equal(getCsharpNullableElementTargetType(member.type)?.name, "float64", `${name}: the optional value keeps its absence`);
  }
  assert.notEqual(targetTypeRefKey(headers[0].targetType), targetTypeRefKey(headers[1].targetType),
    "the shape identity distinguishes optional presence, not the value type");
  const changed = representationServices(input, { shapes: Object.freeze({ retainShape: shape => ({ ...shape, members: [] }),
    resolveCallableValue: unexpected }) });
  const { descriptor, members } = shapeOf("Fields");
  assert.equal(representObject(descriptor, members, csharpRepresentationContext(changed, input.files[0], "storage")).code,
    "CSHARP_SHAPE_REGISTRY", "a second physical answer from the registry is refused, not repaired");
});

test("bound and unbound members retain the Host declaration and the native binding fact", () => {
  const input = program();
  const declaration = input.named("Fields", node => input.ast.is.IsInterfaceDeclaration(node));
  const descriptor = { kind: "declared", declaration, typeArguments: [] };
  const members = input.facts.objects.members(descriptor);
  const carriers = [];
  for (const bound of [false, true]) {
    let retained;
    let reads = 0;
    const services = representationServices(input, {
      memoryBindings: Object.freeze({ hasBoundField(declarations) {
        reads += 1;
        assert.equal(declarations[0] === members[0].declarations[0], true, "only the published declaration supplies binding");
        return bound;
      } }),
      shapes: Object.freeze({ retainShape: shape => { retained = shape; return shape; }, resolveCallableValue: unexpected }),
    });
    const carrier = represented(representObject(descriptor, members, csharpRepresentationContext(services, input.files[0], "storage")));
    assert.equal(reads, 1, "one binding read finishes one representation");
    assert.equal(retained.members[0].bound === true, bound, "bound storage is retained");
    assert.equal(retained.members[0].type.name, "float64", "binding never retypes the member");
    carriers.push(carrier);
  }
  assert.notEqual(targetTypeRefKey(carriers[0]), targetTypeRefKey(carriers[1]),
    "the shape distinguishes bound and ordinary storage");
});

test("write checks keep the projected descriptor and do not ask another native value owner", () => {
  const site = {};
  const value = {};
  const binder = {};
  const variable = Object.freeze({ node: value, path: Object.freeze([
    Object.freeze({ kind: "binder", declaration: binder }), Object.freeze({ kind: "element" }),
    Object.freeze({ kind: "tuple", index: 0 }), Object.freeze({ kind: "member", name: "count" }),
  ]) });
  const host = obligationHost();
  assert.equal(checkCsharpSourceTypeFlowObligation(host, { kind: "write-fit", site, required: site,
    value, valueType: primitive("int32"), valueVariable: variable, type: primitive("int32") }), undefined,
  "the projected int32 value fits int32 storage");
  assert.deepEqual(variable.path.map(part => part.kind), ["binder", "element", "tuple", "member"],
    "no metadata path kind is removed or converted into a runtime property path");
  const missing = checkCsharpSourceTypeFlowObligation(host, { kind: "write-fit", site, required: site,
    value, valueVariable: variable, type: primitive("int32") });
  assert.equal(missing?.sourceNode === site && missing.code === unrepresentable, true);
  assert.equal(missing.message, "A native write check requires the exact projected value's Host-selected representation.");
});

test("literal admission uses the Host literal value and refuses with the .NET range reason", () => {
  const site = {};
  let reads = 0;
  const host = obligationHost("native", { literal(node) {
    reads += 1;
    assert.equal(node === site, true, "the literal input is the exact value occurrence");
    return integerLiteral(2147483648n);
  } });
  const issue = checkCsharpSourceTypeFlowObligation(host, { kind: "literal-admission", authority: "declared", site,
    required: site, value: site, type: primitive("int32") });
  assert.equal(issue?.sourceNode === site && issue.code === unrepresentable && issue.source === "tsonic-csharp", true);
  assert.equal(issue.message, "Source bigint literal is outside the exact 'int32' range.");
  assert.equal(reads, 1, "no late source query or literal reconstruction");
});

test("write checks reject an out-of-range authored literal despite identical native types", () => {
  const value = {};
  const site = {};
  const variable = Object.freeze({ node: value, path: Object.freeze([]) });
  const host = obligationHost("native", { literal: node => node === value ? integerLiteral(2147483648n) : undefined });
  const issue = checkCsharpSourceTypeFlowObligation(host, { kind: "write-fit", site, required: site,
    value, valueType: primitive("int32"), valueVariable: variable, type: primitive("int32") });
  assert.equal(issue?.code === unrepresentable && issue.sourceNode === site, true,
    "identical int32 carriers never bypass the literal's full-token range");
  assert.equal(issue.message, "The written literal does not fit the existing 'source:int32' storage.");
});

for (const [name, elements, path, valueType, expected] of [
  ["overflowing spread element", [2147483648n], [{ kind: "element" }], "int32", "The written literal does not fit the existing 'source:int32' storage."],
  ["fitting spread elements", [1n, 2n], [{ kind: "element" }], "int32", undefined],
  ["overflowing tuple element", [1n, 2147483648n], [{ kind: "tuple", index: 1 }], "int32", "The written literal does not fit the existing 'source:int32' storage."],
  ["known plus unknown spread elements", [1n, undefined], [{ kind: "element" }], "int64", "No exact C# implicit conversion relates 'source:int64' to 'source:int32'."],
]) {
  test(`projected literal metadata checks ${name} before native identity without losing unknown inputs`, () => {
    const rhs = {};
    const site = {};
    const values = Object.freeze(elements.map(integer => integer === undefined ? undefined : integerLiteral(integer)));
    const literal = Object.freeze({ form: "array", elements: values });
    const variable = Object.freeze({ node: rhs, path: Object.freeze(path.map(part => Object.freeze(part))) });
    const host = obligationHost("native", { literal(node) {
      assert.equal(node === rhs, true, "the retained RHS owns the literal");
      return literal;
    } });
    const issue = checkCsharpSourceTypeFlowObligation(host, { kind: "write-fit", site, required: site, value: rhs,
      valueVariable: variable, valueType: primitive(valueType), type: primitive("int32") });
    if (expected === undefined) assert.equal(issue, undefined, "every known projected token fits");
    else {
      assert.equal(issue?.sourceNode === site && issue.source === "tsonic-csharp" && issue.code === unrepresentable, true,
        "the write site carries the .NET refusal");
      assert.equal(issue.message, expected);
    }
    assert.equal(literal.elements === values && values.length === elements.length && variable.node === rhs, true,
      "projection neither copies the token rows nor compacts an unknown element");
  });
}

test("aggregate literal admission consumes the native construction receipt at the retained site", () => {
  const site = {};
  const carrier = Object.freeze({ kind: "array", element: csharpSourcePrimitiveTargetType("int32") });
  let queries = 0;
  const host = obligationHost("native", { literalAdmission(node, selected) {
    queries += 1;
    assert.equal(node === site && targetTypeRefEquals(selected, carrier), true,
      "the aggregate occurrence and Host-selected carrier reach the native admission owner");
    return { kind: "resolved", type: carrier };
  } });
  const obligation = { kind: "literal-admission", authority: "declared", site, required: site,
    type: { kind: "array", readonly: false, element: primitive("int32") } };
  assert.equal(checkCsharpSourceTypeFlowObligation(host, obligation) === undefined && queries === 1, true);
  const unavailable = checkCsharpSourceTypeFlowObligation({ ...host, literalAdmission: () => undefined }, obligation);
  assert.equal(unavailable?.sourceNode === site && unavailable.code === unrepresentable, true);
  assert.equal(unavailable.message, "An aggregate literal requires its completed native construction admission for the Host-selected representation.");
  const subject = {};
  const rejected = checkCsharpSourceTypeFlowObligation({ ...host, literalAdmission: () => ({
    kind: "rejected", subject, code: "CSHARP_OBJECT_LITERAL_CONSTRUCTION", reason: "retained native literal refusal",
  }) }, obligation);
  assert.equal(rejected.sourceNode === subject && rejected.code === "CSHARP_OBJECT_LITERAL_CONSTRUCTION" &&
    rejected.message === "retained native literal refusal", true, "native admission's subject, code and reason are forwarded unchanged");
});

for (const surface of ["native", "js"]) {
  test(`partial ${surface} array write receipts range-check only constant leaves without replacing aggregate admission`, () => {
    const site = {};
    const descriptor = Object.freeze({ kind: "array", readonly: false, element: primitive("float32") });
    const carrier = represented(representAt(surface)(descriptor));
    const literal = Object.freeze({ form: "array", elements: Object.freeze([undefined, integerLiteral(1n)]) });
    let admissions = 0;
    const host = obligationHost(surface, { literal: node => node === site ? literal : undefined,
      literalAdmission(node, selected) {
        admissions += 1;
        assert.equal(node === site && targetTypeRefEquals(selected, carrier), true, "the aggregate admission stays mandatory");
        return { kind: "resolved", type: carrier };
      } });
    const issues = checkCsharpSourceTypeFlowObligations(host, [
      { kind: "literal-admission", authority: "declared", site, required: site, type: descriptor },
      { kind: "write-fit", site, required: site, value: site, valueType: descriptor, type: descriptor },
    ]);
    assert.equal(issues.length === 0 && admissions === 1, true,
      "a nonconstant float32 element is checked by its published descriptor, not treated as a missing literal");
    const overflow = Object.freeze({ form: "array", elements: Object.freeze([undefined, integerLiteral(2147483648n)]) });
    const integerArray = Object.freeze({ kind: "array", readonly: false, element: primitive("int32") });
    const issue = checkCsharpSourceTypeFlowObligation({ ...host, literal: () => overflow },
      { kind: "write-fit", site, required: site, value: site, valueType: integerArray, type: integerArray });
    assert.equal(issue?.code === unrepresentable && issue.sourceNode === site && issue.message.includes("written literal does not fit"), true,
      "unknown siblings never waive the range of a constant leaf");
  });
}

test("native write-fit checks broad storage through its boxing conversion, not as a numeric range", () => {
  const site = {};
  const host = obligationHost("native", { literal: node => node === site ? Object.freeze({ form: "false" }) : undefined });
  assert.equal(checkCsharpSourceTypeFlowObligation(host, { kind: "write-fit", site, required: site, value: site,
    valueType: primitive("bool"), type: { kind: "intrinsic", intrinsic: "unknown" } }), undefined,
  "a bool is boxed into the closed unknown storage, not range-checked as unknown");
  const rejected = checkCsharpSourceTypeFlowObligation(host, { kind: "write-fit", site, required: site, value: site,
    valueType: primitive("bool"), type: primitive("int32") });
  assert.equal(rejected?.code === unrepresentable && rejected.sourceNode === site, true,
    "a bool literal still cannot become a native integer through broad-storage admission");
});

test("native write-fit admits the nullable lift without narrowing optional values", () => {
  const site = {};
  const host = obligationHost();
  for (const name of ["float32", "float64", "int32", "int64"]) {
    const type = primitive(name);
    const optional = Object.freeze({ kind: "optional", value: type });
    assert.equal(checkCsharpSourceTypeFlowObligation(host, { kind: "write-fit", site, required: site, value: site,
      valueType: type, type: optional }), undefined, `${name}: the implicit nullable conversion is not a Source width choice`);
    const unwrapping = checkCsharpSourceTypeFlowObligation(host, { kind: "write-fit", site, required: site, value: site,
      valueType: optional, type });
    assert.equal(unwrapping?.code === unrepresentable && unwrapping.sourceNode === site, true,
      `${name}: an optional source still cannot implicitly lose absence`);
  }
});

test("constraint obligations consume the lowered native bounds of the obligation's binder", () => {
  const site = {};
  const required = {};
  const obligation = { kind: "constraint", site, required, type: primitive("int32") };
  let queries = 0;
  const host = obligationHost("native", { nativeConstraints(selected, type) {
    queries += 1;
    assert.equal(selected === obligation && type.name === "int32", true, "the native owner receives the obligation and chosen carrier");
    return Object.freeze([]);
  } });
  assert.equal(checkCsharpSourceTypeFlowObligation(host, obligation) === undefined && queries === 1, true,
    "explicit empty bounds are consumed once");
  const missing = checkCsharpSourceTypeFlowObligation({ ...host, nativeConstraints: () => undefined }, obligation);
  assert.equal(missing?.sourceNode === site && missing.code === unrepresentable, true, "unavailable native constraints are not an empty list");
  assert.equal(missing.message, "A source constraint requires its actual lowered C# declaration constraints.");
  const valueBounds = obligationHost("native", { nativeConstraints: () => Object.freeze([
    Object.freeze({ kind: "value-type" }), Object.freeze({ kind: "unmanaged" })]) });
  assert.equal(checkCsharpSourceTypeFlowObligation(valueBounds, obligation), undefined,
    "the native validator accepts value-type and unmanaged bounds for int32");
  const issue = checkCsharpSourceTypeFlowObligation(obligationHost("native", { nativeConstraints: () => Object.freeze([
    Object.freeze({ kind: "reference-type" })]) }), obligation);
  assert.equal(issue?.sourceNode === site && issue.code === unrepresentable, true);
  assert.equal(issue.message, "The argument is not a proven C# reference type.");
});

test("lowered interface bounds keep the exact native binder arguments rather than a variance guess", () => {
  const input = program();
  const declaration = input.named("Box", node => input.ast.is.IsClassDeclaration(node));
  const site = {};
  const integer = csharpSourcePrimitiveTargetType("int32");
  const chosen = represented(representAt()({ kind: "declared", declaration, typeArguments: [] }));
  const required = Object.freeze({ kind: "target-named", id: "fixture.IBound`1", typeArguments: Object.freeze([integer]) });
  const different = Object.freeze({ ...required, typeArguments: Object.freeze([csharpSourcePrimitiveTargetType("int64")]) });
  const obligation = { kind: "constraint", site, required: {}, type: { kind: "declared", declaration, typeArguments: [] } };
  const host = obligationHost("native", {
    projectTypes: { directSupertypes: type => targetTypeRefEquals(type, chosen) ? [required] : [] },
    nativeConstraints(selected, represented) {
      assert.equal(selected === obligation && targetTypeRefEquals(represented, chosen), true);
      return Object.freeze([Object.freeze({ kind: "implements", contract: required })]);
    },
  });
  assert.equal(checkCsharpSourceTypeFlowObligation(host, obligation), undefined,
    "the identical directly implemented contract is accepted");
  const issue = checkCsharpSourceTypeFlowObligation({ ...host,
    nativeConstraints: () => [Object.freeze({ kind: "implements", contract: different })] }, obligation);
  assert.equal(issue?.sourceNode === site && issue.code === unrepresentable, true);
  assert.equal(issue.message, `Native type '${targetTypeRefKey(chosen)}' does not directly implement '${targetTypeRefKey(different)}' with identical type arguments.`);
});

for (const kind of ["interface", "read-only"]) {
  test(`${kind} obligations keep the required contract without asking it to choose a source type`, () => {
    const site = {};
    const owner = {};
    let queries = 0;
    const obligation = { kind, site, required: owner, type: primitive("int32") };
    const host = obligationHost("native", { requiredType(selected) {
      queries += 1;
      assert.equal(selected === obligation, true);
      return csharpSourcePrimitiveTargetType("int32");
    } });
    assert.equal(checkCsharpSourceTypeFlowObligations(host, [obligation]).length === 0 && queries === 1, true,
      "one identical native contract is checked, not used as a fill");
    const published = { ...obligation, requiredType: primitive("int32") };
    assert.equal(checkCsharpSourceTypeFlowObligations({ ...host, requiredType: unexpected }, [published]).length, 0,
      "a published required type is represented, never re-asked");
  });
}

test("runtime representation obligations exclude only compile-time metadata subtrees", () => {
  const input = hostProgram("const erased: { value: number } = { value: 1 }; const live: { value: number } = { value: 2 };");
  const literals = input.nodes.filter(node => input.ast.is.IsObjectLiteralExpression(node));
  assert.equal(literals.length, 2);
  const obligations = literals.map(site => ({ kind: "literal-admission", authority: "declared", site, required: site,
    type: input.type(site) }));
  const erased = input.ast.parent(literals[0]);
  for (const classification of [true, false, undefined]) {
    let representations = 0;
    const facts = Object.freeze({ ...input.facts, obligations: () => obligations,
      values: Object.freeze({ ...input.facts.values, has: () => true }) });
    const policy = { ast: input.ast, facts, providers: {}, projectTypes: {}, target: { id: "csharp" },
      typeDefinitions: representationServices(input).typeDefinitions,
      types: { represent(descriptor, site) {
        representations += 1;
        return Object.freeze({ kind: "csharp-refused", code: "CSHARP_SHAPE_REGISTRY", message: "unit double", site });
      } } };
    const issues = analyzeCsharpSourceTypeFlowObligations(policy, {}, { issues: [], constructionFor: () => undefined },
      { dictionaryLiteral: { get: () => undefined } }, { get: node => node === erased ? classification : false });
    assert.equal(issues.length, classification === true ? 1 : 2,
      "false or absent classification never grants runtime representation admission");
    assert.equal(representations, issues.length, "only the metadata subtree bypasses representation");
    assert.equal(issues.every(issue => issue.code === unrepresentable &&
      issue.message === "The Host-selected source type has no closed native C# representation." &&
      obligations.some(obligation => obligation.site === issue.sourceNode)), true,
    "non-metadata refusals keep the code, reason and occurrence");
  }
});

test("native collection obligations preserve exact arguments and reject variance, rank changes and copies", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  const host = { projectTypes: { directSupertypes: () => [] }, providers: {
    findTargetBindingByTargetId: () => undefined, findTargetBindingByMetadataName: () => undefined,
  } };
  for (const contract of [csharpEnumerableTargetType(integer), csharpReadOnlyListTargetType(integer)]) {
    assert.equal(csharpSourceTypeFlowInterfaceAccepts(host, { kind: "array", element: integer }, contract), true,
      "a native vector implements the identical element contract");
    assert.equal(csharpSourceTypeFlowInterfaceAccepts(host, { kind: "array", rank: 2, element: integer }, contract), false,
      "a multidimensional array does not acquire vector interfaces");
    assert.equal(csharpSourceTypeFlowInterfaceAccepts(host, csharpJsArrayTargetType(integer), contract), true,
      "JSArray implements the identical native collection contracts");
  }
  assert.equal(csharpSourceTypeFlowInterfaceAccepts(host, { kind: "array", element: csharpStringTargetType() },
    csharpEnumerableTargetType(csharpSourcePrimitiveTargetType("object"))), false,
  "native covariance is not used to choose a source type or manufacture a copied array");
});

test("a published int64 at the same admitted native int32 index selects checked narrowing", () => {
  const occurrence = {};
  const declaration = {};
  const sourceFile = {};
  const source = csharpSourcePrimitiveTargetType("int64");
  const target = csharpSourcePrimitiveTargetType("int32");
  const outcome = { kind: "resolved", type: primitive("int64"), provenance: {
    group: declaration, occurrence, sourceFile, fixedRule: { kind: "loop-counter", declaration } } };
  const selection = { kind: "resolved", source: { argument: { expression: occurrence } },
    targetMember: { parameters: [{ type: target }] }, targetParameterIndex: 0 };
  const use = { kind: "element", selection };
  assert.equal(selectCsharpSourceTypeFlowIndexConversion(outcome, use, source, target)?.kind, "checked-native-integer");
  assert.equal(selectCsharpSourceTypeFlowIndexConversion({ ...outcome, provenance: { group: declaration, occurrence, sourceFile } },
    use, source, target)?.kind, "checked-native-integer", "ordinary integer creation needs no invented loop rule");
  for (const [label, chosen, admitted, from, to] of [
    ["foreign index occurrence", outcome, { kind: "element", selection: { ...selection, source: { argument: { expression: {} } } } }, source, target],
    ["wrong native parameter", outcome, { kind: "element", selection: { ...selection, targetMember: { parameters: [{ type: source }] } } }, source, target],
    ["no native admission", outcome, undefined, source, target],
    ["source-owned operation without native index admission", outcome, { kind: "element", selection: { kind: "source-owned", source: selection.source, reason: "unit source owner" } }, source, target],
    ["by-ref native argument", outcome, { kind: "element", selection: { ...selection, targetMember: { parameters: [{ type: target, passingMode: "byref-readwrite" }] } } }, source, target],
    ["wrong source width", outcome, use, target, target],
    ["retired selection-only API", outcome, selection, source, target],
  ]) assert.equal(selectCsharpSourceTypeFlowIndexConversion(chosen, admitted, from, to), undefined, label);
  assert.equal(targetTypeRefEquals(source, target), false, "checked narrowing never claims an identity conversion");
});

test("native parameter and all six shift-count uses share checked int64-to-int32 conversion without retargeting the result", () => {
  const occurrence = {};
  const source = csharpSourcePrimitiveTargetType("int64");
  const target = csharpSourcePrimitiveTargetType("int32");
  const result = csharpSourcePrimitiveTargetType("uint64");
  const outcome = { kind: "resolved", type: primitive("int64"), provenance: { occurrence, group: {}, sourceFile: {} } };
  assert.equal(selectCsharpSourceTypeFlowIndexConversion(outcome,
    { kind: "parameter", expression: occurrence, parameter: { type: target, passingMode: "by-value" } }, source, target)?.kind,
  "checked-native-integer");
  for (const passingMode of ["byref-readonly", "byref-readwrite", "out"]) {
    assert.equal(selectCsharpSourceTypeFlowIndexConversion(outcome,
      { kind: "parameter", expression: occurrence, parameter: { type: target, passingMode } }, source, target), undefined, passingMode);
  }
  for (const operator of ["<<", ">>", ">>>", "<<=", ">>=", ">>>=", "+"]) {
    const operation = { kind: "resolved", sourceOperator: operator, right: occurrence,
      rightInputType: source, rightType: source, resultType: result };
    assert.equal(targetTypeRefEquals(csharpSourceTypeFlowShiftCountType(operation), operator === "+" ? source : target), true, operator);
    assert.equal(selectCsharpSourceTypeFlowIndexConversion(outcome, { kind: "shift-count", operation }, source, target)?.kind ===
      "checked-native-integer", operator !== "+", operator);
    assert.equal(operation.rightInputType === source && operation.rightType === source && operation.resultType === result, true,
      `${operator}: the count and result records stay unchanged`);
  }
});
