import assert from "node:assert/strict";
import test from "node:test";
import { representCsharpSourceType } from "../../../dist/policy/types/source-type-flow/representation.js";
import { checkCsharpSourceTypeFlowObligation, checkCsharpSourceTypeFlowObligations } from "../../../dist/policy/types/source-type-flow/obligations.js";
import { selectCsharpSourceTypeFlowIndexConversion } from "../../../dist/policy/conversions/source-type-flow-index.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpArrayLiteralElementTargetType, csharpEnumerableTargetType, csharpReadOnlyListTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { createCsharpTypeParameterEnvironment } from "../../../dist/analysis/source-evidence/types/resolution/type-parameter-environment.js";
import { csharpSourceTypeFlowInterfaceAccepts } from "../../../dist/policy/types/source-type-flow/relations.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";

const primitive = name => Object.freeze({ kind: "primitive", primitive: name });
const unexpected = () => assert.fail("a primitive unit must not query declarations shapes or an unrelated native child");
const representationHost = surface => ({ target: { id: "csharp", ...(surface === "js" ? { surfaces: ["js"] } : {}) },
  typeParameterConstraints: {}, declaredType: unexpected, retainShape: unexpected });

test("representation maps each exact Host primitive and keeps native versus JS array carriers", () => {
  for (const surface of ["native", "js"]) for (const name of ["int32", "int64", "float32", "float64", "uint32", "uint64", "decimal"]) {
    const descriptor = Object.freeze({ kind: "array", readonly: false, element: primitive(name) });
    const selected = representCsharpSourceType(representationHost(surface), descriptor);
    assert.equal(getCsharpArrayLiteralElementTargetType(selected)?.name, name, `${surface}/${name}: no width choice at representation`);
    assert.equal(surface === "native" ? selected?.kind === "array" : selected?.kind === "target-named", true,
      `${surface}: the pre-JS-semantics carrier remains unchanged`);
    assert.equal(Object.isFrozen(descriptor) && descriptor.element.primitive === name, true, "representation does not rewrite the Host fact");
  }
});

test("declared representation keeps nominal identity ordered arguments and the exact Source component", () => {
  const declaration = {};
  const source = {};
  const expected = { kind: "target-named", id: "fixture.Pair`2" };
  let calls = 0;
  const selected = representCsharpSourceType({ ...representationHost("native"), declaredType(owner, arguments_, component) {
    calls += 1;
    assert.equal(owner === declaration && component === source, true, "the exact declaration and component are retained");
    assert.deepEqual(arguments_.map(argument => argument.name), ["int64", "float32"], "declared argument order is unchanged");
    assert.equal(Object.isFrozen(arguments_), true);
    return expected;
  } }, { kind: "declared", declaration, source, typeArguments: [primitive("int64"), primitive("float32")] });
  assert.equal(selected === expected && calls === 1, true, "the actual declared producer is called once");
});

test("a declared optional value keeps one native absence without another wrapper", () => {
  const selected = representCsharpSourceType(representationHost("native"), { kind: "optional", value: primitive("int32") });
  const element = getCsharpNullableElementTargetType(selected);
  assert.equal(element?.kind === "source-primitive" && element.name === "int32" && getCsharpNullableElementTargetType(element) === undefined, true,
    "optional(int32) has one exact nullable integer carrier");
});

test("literal admission uses the retained authored value and rejects before publication with the target diagnostic", () => {
  const site = {};
  const literal = Object.freeze({ form: "numeric", integer: 2147483648n,
    numeric: Object.freeze({ kind: "authored", token: Object.freeze({ coefficient: 2147483648n, exponent: 0n,
      negative: false, decimalText: "2147483648" }) }) });
  let reads = 0;
  const host = { ...representationHost("native"), literalValues: { literalValue: { get(node) {
    reads += 1;
    assert.equal(node === site, true, "the literal input is the exact retained value occurrence");
    return literal;
  } } } };
  const issue = checkCsharpSourceTypeFlowObligation(host, { kind: "literal-admission", site, required: site, value: site, type: primitive("int32") });
  assert.equal(issue?.sourceNode === site && issue.code === "CSHARP_UNSUPPORTED_AST" && issue.source === "tsonic-csharp", true);
  assert.equal(issue.message, "The retained source literal is not representable as 'source:int32'.");
  assert.equal(reads, 1, "no late source query or literal reconstruction");
});

test("write checks keep the projected descriptor and do not ask another native value owner", () => {
  const site = {};
  const value = {};
  const binder = {};
  const variable = Object.freeze({ node: value, path: Object.freeze([
    Object.freeze({ kind: "binder", declaration: binder }), Object.freeze({ kind: "element" }),
    Object.freeze({ kind: "tuple", index: 0 }), Object.freeze({ kind: "member", name: "count" }),
  ]) });
  const host = { ...representationHost("native"), literalValues: { literalValue: { get: () => undefined } },
    valueType: unexpected };
  const issue = checkCsharpSourceTypeFlowObligation(host, { kind: "write-fit", site, required: site,
    value, valueType: primitive("int32"), valueVariable: variable, type: primitive("int32") });
  assert.equal(issue === undefined, true, "the same actual projected int32 value fits int32 storage");
  assert.equal(variable.node === value && variable.path[0].declaration === binder && Object.isFrozen(variable.path), true,
    "the original Box RHS and full binder metadata path are kept, never interpreted as a runtime access or retyped as Box");
  assert.deepEqual(variable.path.map(part => part.kind), ["binder", "element", "tuple", "member"],
    "no metadata path kind is removed or converted into a runtime property path");
  const missing = checkCsharpSourceTypeFlowObligation(host, { kind: "write-fit", site, required: site,
    value, valueVariable: variable, type: primitive("int32") });
  assert.equal(missing?.sourceNode === site && missing.code === "CSHARP_UNSUPPORTED_AST", true);
  assert.equal(missing.message, "A native write check requires the exact projected value's Host-selected representation.");
});

test("actual retained shapes keep exact declared properties and reject a different retained Native answer", () => {
  const declaration = {};
  const environment = createCsharpTypeParameterEnvironment(unexpected);
  const descriptor = Object.freeze({ kind: "shape", members: Object.freeze([
    Object.freeze({ name: "count", declaration, readonly: true, type: primitive("int32") }),
  ]) });
  let retained;
  const host = { ...representationHost("native"), typeParameterConstraints: environment, retainShape(shape) {
    retained = shape;
    assert.equal(shape.members[0].sourceDeclarations[0] === declaration && shape.members[0].readonly === true, true,
      "the actual Native header keeps the original property identity and readonly fact");
    assert.equal(shape.members[0].type.name, "int32");
    return shape;
  } };
  const selected = representCsharpSourceType(host, descriptor);
  assert.equal(selected === retained.targetType && retained.constructible === true, true, "one retained Native shape is the actual representation");
  const changed = representCsharpSourceType({ ...host, retainShape: shape => ({ ...shape, targetType: csharpSourcePrimitiveTargetType("int32") }) }, descriptor);
  assert.equal(changed === undefined, true, "a second physical answer is rejected, not repaired");
});

test("native collection obligations preserve exact arguments and reject variance rank changes and copies", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  const text = csharpStringTargetType();
  const broad = csharpSourcePrimitiveTargetType("object");
  const host = { projectTypes: { directSupertypes: () => [] }, providers: {
    findTargetBindingByTargetId: () => undefined, findTargetBindingByMetadataName: () => undefined,
  } };
  for (const contract of [csharpEnumerableTargetType(integer), csharpReadOnlyListTargetType(integer)]) {
    assert.equal(csharpSourceTypeFlowInterfaceAccepts(host, { kind: "array", element: integer }, contract), true,
      "a native vector directly implements the identical element contract");
    assert.equal(csharpSourceTypeFlowInterfaceAccepts(host, { kind: "array", rank: 2, element: integer }, contract), false,
      "a multidimensional array does not acquire vector interfaces from its element metadata");
    assert.equal(csharpSourceTypeFlowInterfaceAccepts(host, csharpJsArrayTargetType(integer), contract), true,
      "the existing JSArray directly implements the identical native collection contracts");
  }
  assert.equal(csharpSourceTypeFlowInterfaceAccepts(host, { kind: "array", element: text }, csharpEnumerableTargetType(broad)), false,
    "native covariance is not used to choose a source type or manufacture a copied array");
});

test("write checks reject an out-of-range authored literal despite identical Native types", () => {
  const value = {};
  const site = {};
  const token = integer => Object.freeze({ form: "numeric", integer, number: Number(integer),
    numeric: Object.freeze({ kind: "authored", token: Object.freeze({ coefficient: integer, exponent: 0n, negative: false, decimalText: `${integer}` }) }) });
  const literal = token(2147483648n);
  const variable = Object.freeze({ node: value, path: Object.freeze([]) });
  const host = { ...representationHost("native"), literalValues: { literalValue: { get: node => node === value ? literal : undefined } }, valueType: unexpected };
  const issue = checkCsharpSourceTypeFlowObligation(host, { kind: "write-fit", site, required: site,
    value, valueType: primitive("int32"), valueVariable: variable, type: primitive("int32") });
  assert.equal(issue?.code === "CSHARP_UNSUPPORTED_AST" && issue.sourceNode === site, true,
    "identical int32 carriers never bypass the original literal's full-token range");
  assert.equal(issue.message, "The written literal does not fit the existing 'source:int32' storage.");
  assert.equal(variable.node === value && variable.path.length === 0, true,
    "the literal receipt retains its exact value occurrence");
});

for (const [name, elements, path, valueType, expected] of [
  ["overflowing spread element", [2147483648n], [{ kind: "element" }], "int32", "The written literal does not fit the existing 'source:int32' storage."],
  ["fitting spread elements", [1n, 2n], [{ kind: "element" }], "int32", undefined],
  ["overflowing tuple element", [1n, 2147483648n], [{ kind: "tuple", index: 1 }], "int32", "The written literal does not fit the existing 'source:int32' storage."],
  ["known plus unknown spread elements", [1n, undefined], [{ kind: "element" }], "int64", "No exact C# implicit conversion relates 'source:int64' to 'source:int32'."],
]) {
  test(`projected literal metadata checks ${name} before Native identity without losing unknown inputs`, () => {
    const rhs = {};
    const site = {};
    const values = Object.freeze(elements.map(integer => integer === undefined ? undefined : Object.freeze({
      form: "numeric", integer, number: Number(integer), numeric: Object.freeze({ kind: "authored",
        token: Object.freeze({ coefficient: integer, exponent: 0n, negative: false, decimalText: `${integer}` }) }),
    })));
    const literal = Object.freeze({ form: "array", elements: values });
    const variable = Object.freeze({ node: rhs, path: Object.freeze(path.map(part => Object.freeze(part))) });
    const providers = { findTargetBindingByTargetId: () => undefined, findTargetBindingByMetadataName: () => undefined };
    const host = { ...representationHost("native"), providers, projectTypes: { directSupertypes: () => [] },
      literalValues: { literalValue: { get(node) {
        assert.equal(node === rhs, true, "the original retained RHS owns the literal index entry");
        return literal;
      } } }, valueType: unexpected };
    const issue = checkCsharpSourceTypeFlowObligation(host, { kind: "write-fit", site, required: site, value: rhs,
      valueVariable: variable, valueType: primitive(valueType), type: primitive("int32") });
    if (expected === undefined) assert.equal(issue === undefined, true, "every exact known projected token fits");
    else {
      assert.equal(issue?.sourceNode === site && issue.source === "tsonic-csharp" && issue.code === "CSHARP_UNSUPPORTED_AST", true,
        "the original write site retains the exact Native refusal");
      assert.equal(issue.message, expected);
    }
    assert.equal(literal.elements === values && values.length === elements.length && variable.node === rhs, true,
      "projection neither copies the Source token rows nor compacts an unknown element");
    assert.equal(variable.path.length === path.length && variable.path.every((part, index) => part.kind === path[index].kind), true,
      "the exact element or tuple metadata path remains unchanged");
  });
}

test("aggregate literal admission consumes the existing Native construction receipt at the retained site", () => {
  const site = {};
  const carrier = Object.freeze({ kind: "array", element: csharpSourcePrimitiveTargetType("int32") });
  let queries = 0;
  const host = { ...representationHost("native"), literalAdmission(node, selected) {
    queries += 1;
    assert.equal(node === site && targetTypeRefEquals(selected, carrier), true,
      "the actual aggregate occurrence and Host-selected carrier reach the existing Native admission owner");
    return { kind: "resolved", type: carrier };
  } };
  const obligation = { kind: "literal-admission", site, required: site,
    type: { kind: "array", readonly: false, element: primitive("int32") } };
  assert.equal(checkCsharpSourceTypeFlowObligation(host, obligation) === undefined && queries === 1, true,
    "the actual producer's site-only literal obligation needs no fabricated Host value field");
  const unavailable = checkCsharpSourceTypeFlowObligation({ ...host, literalAdmission: () => undefined }, obligation);
  assert.equal(unavailable?.sourceNode === site && unavailable.code === "CSHARP_UNSUPPORTED_AST", true);
  assert.equal(unavailable.message, "An aggregate literal requires its completed native construction admission for the Host-selected representation.");
  const subject = {};
  const rejected = checkCsharpSourceTypeFlowObligation({ ...host, literalAdmission: () => ({
    kind: "rejected", subject, code: "CSHARP_UNSUPPORTED_AST", reason: "exact retained native literal refusal",
  }) }, obligation);
  assert.equal(rejected.sourceNode === subject && rejected.message === "exact retained native literal refusal", true,
    "Native admission's original subject and reason are forwarded unchanged");
});

test("constraint obligations retain the Native owner's lowered bounds source file and association", () => {
  const site = {};
  const required = {};
  const sourceFile = {};
  const association = { occurrence: site, sourceFile };
  const syntheticConstraints = Object.freeze([]);
  let queries = 0;
  const host = { ...representationHost("native"), nativeConstraints(owner, type, packet) {
    queries += 1;
    assert.equal(owner === required && packet === association && type.name === "int32", true,
      "only the exact Native constraint owner receives the actual chosen representation and retained Source association");
    return { sourceFile, constraints: syntheticConstraints };
  } };
  const issue = checkCsharpSourceTypeFlowObligation(host, { kind: "constraint", site, required, association, type: primitive("int32") });
  assert.equal(issue === undefined && queries === 1, true, "explicit monomorphic unit bounds are consumed once, not inferred as production emptiness");
  const missing = checkCsharpSourceTypeFlowObligation({ ...host, nativeConstraints: () => undefined },
    { kind: "constraint", site, required, association, type: primitive("int32") });
  assert.equal(missing?.sourceNode === site && missing.code === "CSHARP_UNSUPPORTED_AST", true, "unavailable Native constraints do not become an empty list");
  assert.equal(missing.message, "A source constraint requires its actual lowered C# declaration constraints.");
});

test("nonempty lowered Native constraints are checked without substituting a guessed source bound", () => {
  const site = {};
  const required = {};
  const sourceFile = {};
  const association = Object.freeze({ occurrence: site, sourceFile, component: {} });
  const constraints = Object.freeze([Object.freeze({ kind: "value-type" }), Object.freeze({ kind: "unmanaged" })]);
  const host = { ...representationHost("native"), constraintHost: {}, nativeConstraints(owner, represented, retained) {
    assert.equal(owner === required && represented.name === "int32" && retained === association, true,
      "the actual binder owner and selected Source component are not replaced");
    return { sourceFile, constraints };
  } };
  assert.equal(checkCsharpSourceTypeFlowObligation(host, { kind: "constraint", site, required, association, type: primitive("int32") }) === undefined, true,
    "the existing Native validator accepts the actual nonempty value-type and unmanaged bounds");
  const issue = checkCsharpSourceTypeFlowObligation({ ...host, nativeConstraints: () => ({ sourceFile,
    constraints: Object.freeze([Object.freeze({ kind: "reference-type" })]),
  }) }, { kind: "constraint", site, required, association, type: primitive("int32") });
  assert.equal(issue?.sourceNode === site && issue.code === "CSHARP_UNSUPPORTED_AST", true);
  assert.equal(issue.message, "The argument is not a proven C# reference type.");
});

test("lowered interface bounds keep the exact Native binder arguments rather than a variance guess", () => {
  const declaration = {};
  const binder = {};
  const site = {};
  const sourceFile = {};
  const component = {};
  const integer = csharpSourcePrimitiveTargetType("int32");
  const wide = csharpSourcePrimitiveTargetType("int64");
  const chosen = Object.freeze({ kind: "target-named", id: "fixture.Box`1", typeArguments: Object.freeze([integer]) });
  const required = Object.freeze({ kind: "target-named", id: "fixture.IBound`1", typeArguments: Object.freeze([integer]) });
  const different = Object.freeze({ ...required, typeArguments: Object.freeze([wide]) });
  const constraints = Object.freeze([Object.freeze({ kind: "implements", contract: required })]);
  const association = Object.freeze({ occurrence: site, sourceFile, component });
  const host = { ...representationHost("native"),
    providers: { findTargetBindingByTargetId: () => undefined },
    projectTypes: { directSupertypes: type => type === chosen ? [required] : [] },
    declaredType(owner, arguments_, kept) {
      assert.equal(owner === declaration && kept === component && arguments_.length === 1 && targetTypeRefEquals(arguments_[0], integer), true,
        "the actual declared representation retains the ordered Native argument vector");
      return chosen;
    }, nativeConstraints(owner, represented, kept) {
      assert.equal(owner === binder && represented === chosen && kept === association, true,
        "the lowered Native bound keeps its actual binder owner Source file and Source association");
      return { sourceFile, constraints };
    },
  };
  const obligation = { kind: "constraint", site, required: binder, association,
    type: { kind: "declared", declaration, source: component, typeArguments: [primitive("int32")] } };
  assert.equal(checkCsharpSourceTypeFlowObligation(host, obligation) === undefined, true,
    "the identical directly implemented Native contract is accepted without choosing a different Source type");
  const issue = checkCsharpSourceTypeFlowObligation({ ...host, nativeConstraints: () => ({ sourceFile,
    constraints: [Object.freeze({ kind: "implements", contract: different })],
  }) }, obligation);
  assert.equal(issue?.sourceNode === site && issue.code === "CSHARP_UNSUPPORTED_AST", true);
  assert.equal(issue.message, `Native type '${targetTypeRefKey(chosen)}' does not directly implement '${targetTypeRefKey(different)}' with identical type arguments.`);
});

for (const kind of ["interface", "read-only"]) {
  test(`${kind} obligations keep the required contract without asking it to choose a source type`, () => {
    const site = {};
    const owner = {};
    const association = { occurrence: site, sourceFile: {} };
    let queries = 0;
    const host = { ...representationHost("native"), requiredType(required, packet) {
      queries += 1;
      assert.equal(required === owner && packet === association, true);
      return csharpSourcePrimitiveTargetType("int32");
    } };
    const issues = checkCsharpSourceTypeFlowObligations(host, [{ kind, site, required: owner, association, type: primitive("int32") }]);
    assert.equal(issues.length === 0 && queries === 1, true, "one exact identical Native contract is checked, not used as a fill");
  });
}

test("only actual B8 provenance at the same admitted index selects checked long-to-int narrowing", () => {
  const occurrence = {};
  const declaration = {};
  const sourceFile = {};
  const source = csharpSourcePrimitiveTargetType("int64");
  const target = csharpSourcePrimitiveTargetType("int32");
  const outcome = { kind: "resolved", type: primitive("int64"), provenance: {
    group: declaration, occurrence, sourceFile, fixedRule: { kind: "loop-counter", declaration } } };
  const selection = { kind: "resolved", source: { argument: { expression: occurrence } },
    targetMember: { parameters: [{ type: target }] }, targetParameterIndex: 0 };
  const conversion = selectCsharpSourceTypeFlowIndexConversion(outcome, selection, source, target);
  assert.equal(conversion?.kind, "checked-native-integer");
  for (const [label, chosen, admitted, from, to] of [
    ["same width without a Source rule", { ...outcome, provenance: { group: declaration, occurrence, sourceFile } }, selection, source, target],
    ["foreign index occurrence", outcome, { ...selection, source: { argument: { expression: {} } } }, source, target],
    ["wrong native parameter", outcome, { ...selection, targetMember: { parameters: [{ type: source }] } }, source, target],
    ["no native admission", outcome, undefined, source, target],
    ["source-owned operation without Native index admission", outcome, { kind: "source-owned", source: selection.source, reason: "unit source owner" }, source, target],
    ["by-ref native argument", outcome, { ...selection, targetMember: { parameters: [{ type: target, passingMode: "byref-readwrite" }] } }, source, target],
    ["non-counter source width", outcome, selection, target, target],
  ]) assert.equal(selectCsharpSourceTypeFlowIndexConversion(chosen, admitted, from, to) === undefined, true, label);
  assert.equal(targetTypeRefEquals(source, target), false, "checked narrowing never claims an identity conversion");
});
