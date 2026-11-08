import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { getCsharpGenericOptionalParts } from "../../../dist/target-model/types/projections.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { applyCsharpNativeCallableMember } from "../../../dist/policy/conversions/generic-callable.js";
import * as representations from "../../../dist/policy/types/source-type-flow/representation.js";

function fixture(text) {
  const compiled = analyzeCsharpSource({ sourceText:
    'import type { int64 } from "@tsonic/core/types.js";' + text });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved", "a genuine normal program owns the representation view");
  const source = compiled.source;
  const program = compiled.analysis.value;
  const nodes = [];
  const visit = node => {
    nodes.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.sourceFiles) if (!source.ast.isDeclarationFile(file)) visit(file);
  const parameter = nodes.find(node => source.ast.is.IsParameterDeclaration(node) &&
    source.ast.text(source.ast.name(node)) === "input");
  assert.equal(parameter !== undefined, true, "the exact original parameter is present");
  const evidence = resolvedSourceValue(source.facts.values.declaredSlot(parameter), "original parameter storage").type;
  return { compiled, source, program, nodes, parameter, evidence,
    registry: program.analysis.typeSystem.objectShapes };
}

function record(rejectedIndex, count = 3) {
  return fixture(`export interface Fields {
    ${Array.from({ length: count }, (_, index) =>
      `${index === 2 ? "readonly " : ""}field${index}${index === 1 ? "?" : ""}: ${index === rejectedIndex ? "[int64, string, ...int64[]]" : "int64"};`).join("\n")}
  }
  export declare function inspect(input: Fields): void;`);
}

function represent(input) {
  return input.program.representation.represent(input.evidence, "storage", input.parameter);
}

function shape(input) {
  const represented = represent(input);
  assert.equal(represented.kind, "represented");
  const selected = input.registry.resolveTarget(represented.value.carrier);
  assert.equal(selected !== undefined, true, "the complete canonical Native shape is registered");
  return selected;
}

test("structural members stop at the first unavailable carrier without publishing a partial shape", () => {
  for (const rejectedIndex of [0, 1, 2]) {
    const input = record(rejectedIndex);
    const before = input.registry.knownShapes();
    const rejected = represent(input);
    assert.equal(rejected.kind, "native-refused", `rejected field${rejectedIndex}`);
    assert.equal(rejected.code, "CSHARP_TUPLE_STORAGE_UNSUPPORTED");
    assert.equal(rejected.site === input.parameter, true);
    assert.equal(input.registry.knownShapes().length, before.length,
      "a failed complete record never publishes its representable prefix");
    assert.equal(input.registry.knownShapes().every((entry, index) => entry === before[index]), true,
      "failure preserves every previously completed Native shape");
  }
});

test("a wide structural record cannot publish later members after its first unavailable carrier", () => {
  const input = record(0, 256);
  const before = input.registry.knownShapes();
  const rejected = represent(input);
  assert.equal(rejected.kind, "native-refused");
  assert.equal(rejected.code, "CSHARP_TUPLE_STORAGE_UNSUPPORTED");
  assert.equal(input.registry.knownShapes().length, before.length,
    "none of the 255 later valid members constitutes a successful partial publication");
});

test("complete structural records preserve native carriers and original optional readonly member evidence", () => {
  const input = record(-1);
  const physical = shape(input);
  const definition = input.evidence.type.kind === "declared"
    ? resolvedSourceValue(input.source.facts.descriptors.definition(input.evidence), "the original complete definition")
    : input.evidence;
  assert.equal(definition.type.kind, "shape");
  assert.deepEqual(physical.members.map(member => member.sourceName), ["field0", "field1", "field2"]);
  const integer = csharpSourcePrimitiveTargetType("int64");
  assert.equal(targetTypeRefEquals(physical.members[0].type, integer), true);
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(physical.members[1].type), integer), true);
  assert.equal(physical.members[1].optional, true);
  assert.equal(physical.members[2].readonly, true);
  assert.equal(physical.members.every((member, index) =>
    member.origins.length === 1 && member.origins[0] === definition.type.members[index].origin &&
    member.sourceDeclarations.includes(definition.type.members[index].origin.declaration)), true,
  "the Native slots retain the identical Source origins and actual declaration inventory");
  assert.equal(Object.isFrozen(physical.members) && physical.members.every(Object.isFrozen), true);
});

function nativeBinders() {
  const input = fixture("export interface View { read<Value>(value: Value | undefined): Value; } " +
    "export declare function inspect(input: View): void;");
  const member = shape(input).members.find(member => member.sourceName === "read");
  assert.equal(member?.memberKind, "method");
  assert.equal(member.methods.length, 1, "one original signature has one physical/value pair");
  const pair = member.methods[0];
  const declaration = input.nodes.find(node => input.source.ast.is.IsMethodSignatureDeclaration(node));
  assert.equal(declaration !== undefined, true);
  const original = input.source.ast.typeParameters(declaration)[0];
  return { ...input, pair, declaration, original };
}

test("native method binders contain the authored and complete canonical optional vector exactly once", () => {
  const input = nativeBinders();
  const parameters = input.pair.member.typeParameters;
  assert.equal(parameters.length, 3, "authored Value plus its exact storage and operations binders");
  const [authored, storage, operations] = parameters;
  assert.equal(authored.declaration === input.original, true, "authored identity keeps its actual parameter Node");
  assert.equal(authored.name, "Value");
  assert.equal(new Set(parameters.map(parameter => parameter.identity)).size, parameters.length);
  assert.equal(storage.declaration, undefined, "a generated binder does not counterfeit an authored Node");
  assert.equal(operations.declaration, undefined);
  const optional = getCsharpGenericOptionalParts(input.pair.member.signature.parameters[0]);
  assert.equal(optional !== undefined, true, "the parameter is the actual generic optional storage");
  assert.equal(storage.identity, input.pair.member.signature.parameters[0].identity);
  assert.equal(operations.identity, optional.operations.identity);
  assert.equal(targetTypeRefEquals(input.pair.member.signature.returnType, optional.element), true);
  assert.equal(parameters.every(parameter => Object.isFrozen(parameter) && Object.isFrozen(parameter.constraints)), true);
  assert.equal(Object.isFrozen(parameters), true);
  assert.equal(input.pair.value.typeParameters === parameters, true,
    "the physical owner and acquired callable value share the same complete producer-owned binder vector");
});

test("native method application rejects a duplicated canonical binder identity without a partial ABI", () => {
  const input = nativeBinders();
  const original = input.pair.member;
  const duplicate = { ...original,
    typeParameters: [original.typeParameters[0], original.typeParameters[1], original.typeParameters[1]] };
  const arguments_ = duplicate.typeParameters.map(() => csharpSourcePrimitiveTargetType("int64"));
  assert.equal(applyCsharpNativeCallableMember(input.program.analysis.policy, duplicate, arguments_), undefined,
    "duplicate Native identities fail before any constraint or substitution can publish an applied member");
  assert.equal(new Set(original.typeParameters.map(parameter => parameter.identity)).size, original.typeParameters.length);
  assert.equal(targetTypeRefKey(original.signature.parameters[0]), targetTypeRefKey(input.pair.value.signature.parameters[0]));
});

test("retired AST-only native binder and member-resolution forms are not compatibility paths", () => {
  const input = nativeBinders();
  assert.equal(Object.hasOwn(representations, "resolveCsharpCallableTypeParameters"), false);
  assert.equal(Object.hasOwn(representations, "createCsharpObjectShapeMemberResolver"), false);
  assert.throws(() => input.program.representation.applyRequirements(input.pair.member.typeParameters, undefined,
    input.declaration), TypeError, "Native requirements require the genuine original Source application");
  assert.throws(() => input.program.representation.represent({ ...input.evidence }, "storage", input.parameter), TypeError,
    "neither copied public evidence nor AST-only metadata can authorize a cached Native shape");
});
