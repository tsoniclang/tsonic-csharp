// Source union projections (c2529 acceptance, ported to the nextgen facts, C-2542). The Host publishes each family,
// application, arm and role (facts.sums, facts.instantiations); C# maps them with the one mapping (I6): closed sums to
// positional Union<...> (R6), open sums to a SourceUnionStorage projection over the Host roles, role operations to the
// runtime SourceUnions structs. C# never forms, substitutes, sorts or dedupes a Source sum itself.
import assert from "node:assert/strict";
import test from "node:test";
import { sourceTypeDescriptorsEqual } from "@tsonic/target-api/source";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { representSourceSum, representSourceUnionOperations, representSourceUnionRole, csharpRepresentationContext } from "../../../dist/representation/index.js";
import { csharpProjectedType, getCsharpGenericSourceUnionParts } from "../../../dist/target-model/types/projections.js";
import { snapshotCsharpTargetTypes } from "../../../dist/target-model/types/snapshot.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpRuntimeUnionTargetType, getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpReadOnlyListTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpClosedInvocationMatches } from "../../../dist/policy/types/callables/value-type.js";

const indexText = `import { reverse } from "./reverse.js";
  export function forward<T>(value: string | T): string | T { return value; }
  export function partial<U>(value: string | number | U): string | number | U {
    return forward<number | U>(value);
  }
  export function run(value: number): string | number { return forward<number>(value); }
  export function coincident(value: string): string { return forward<string>(value); }
  export function other<Other>(value: Other): Other { return value; }
  export function optional<T>(value: T | undefined): string | T | undefined { return value; }
  export function optionalNumeric(value: number | undefined): string | number | undefined {
    return optional<number>(value);
  }
  export function arrayRole(value: string | number[]): string | number[] { return value; }
  export function opposite(value: number | string): number | string { return reverse(value); }`;
const reverseText = "export function reverse(value: number | string): number | string { return value; }";

let retained;
function fixture() {
  if (retained !== undefined) return retained;
  const program = hostProgram(indexText, { files: { "reverse.ts": reverseText } });
  const { ast, nodes, facts } = program;
  const named = name => program.named(name, node => ast.is.IsFunctionDeclaration(node));
  const forward = named("forward");
  const parameter = ast.typeParameters(forward)[0];
  const union = nodes.find(node => ast.is.IsUnionTypeNode(node) && ast.parent(node) === ast.parameters(forward)[0]);
  const open = program.type(union);
  assert.equal(open.kind, "union", "the authored open union component has its Host publication");
  const calls = nodes.filter(node => ast.is.IsCallExpression(node) && ast.text(ast.as.AsCallExpression(node).Expression) === "forward");
  const instantiations = calls.map(call => facts.instantiations.at(call));
  assert.equal(instantiations.length === 3 && instantiations.every(selected => selected?.kind !== "refused" &&
    selected?.method.length === 1 && selected.method[0].declaration === parameter), true,
  "concrete, partial and coincident bindings are the Host instantiations of the actual calls (G4)");
  const numeric = instantiations.find(selected => selected.method[0].type.kind === "primitive").method[0].type;
  const text = instantiations.find(selected => selected.method[0].type.kind === "string").method[0].type;
  const partial = instantiations.find(selected => selected.method[0].type.kind === "union").method[0].type;
  const services = representationServices(program);
  const represent = representations(services);
  const at = descriptor => represent.type(descriptor, union, "storage");
  retained = { program, ast, nodes, facts, named, forward, parameter, union, open, calls, instantiations,
    numeric, text, partial, services, represent: descriptor => represented(at(descriptor)) };
  return retained;
}

/** The Host record of the open family under `bindings`, and its arms represented positionally. */
function closure(input, bindings) {
  const open = input.program.sum(input.open);
  const application = open.identity.application.map(argument => input.facts.sums.substitute(argument, bindings));
  const record = input.facts.sums.sum({ family: open.identity.family, application });
  return { record, arms: record.arms.map(arm => input.represent(arm.type)) };
}

test("one Host order governs authored reversals in another file and every native carrier (C-2459, R6)", () => {
  const input = fixture();
  const closed = input.nodes.filter(node => input.ast.is.IsUnionTypeNode(node)).flatMap(node => {
    const outcome = input.facts.values.type(node);
    return outcome.kind !== "refused" && outcome.type.kind === "union" &&
      outcome.type.types.every(type => type.kind === "primitive" || type.kind === "string") ? [outcome.type] : [];
  });
  assert.equal(closed.length >= 3, true, "the programs include both authored orders across two source files");
  const first = input.represent(closed[0]);
  for (const descriptor of closed) assert.equal(targetTypeRefEquals(input.represent(descriptor), first), true,
    "C# consumes the Host order; no second key-based chooser exists");
  const record = input.program.sum(closed[0]);
  assert.deepEqual(getCsharpRuntimeUnionArms(first).map(targetTypeRefKey), record.arms.map(arm => targetTypeRefKey(input.represent(arm.type))),
    "the runtime union arms are the Host arms, positional");
  assert.equal(first.csharpRuntimeUnionSemantics, "source-sum");
});

test("open storage snapshots retain the Host record, its roles and the binder identity", () => {
  const input = fixture();
  const storage = input.represent(input.open);
  const parts = getCsharpGenericSourceUnionParts(storage);
  assert.equal(parts !== undefined && parts.members.length === 2, true, "a generic union defers physical storage");
  const [snapshot] = snapshotCsharpTargetTypes([storage]);
  const record = input.program.sum(input.open);
  assert.equal(snapshot.csharpProjection.sum.record === record, true, "the Host sum record identity is retained, not cloned");
  assert.equal(snapshot.csharpProjection.sum.roles.every(role => {
    const arms = record.roles[role.role].arms;
    return arms.length === 1 ? role.type === record.arms[arms[0]].type : role.type.kind === "union";
  }), true, "ABI roles are the Host role components");
  assert.equal(snapshot.csharpProjection.sum.roles.some(role => role.type.kind === "declared" && role.type.declaration === input.parameter), true,
    "the compiler Node is an opaque identity, never an AST snapshot");
  assert.equal(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.csharpProjection.sum.roles), true,
    "published physical metadata is frozen without mutating Source objects");
});

test("a single-arm role reuses its already selected native materialization", () => {
  const input = fixture();
  const storage = input.represent(input.open);
  const projection = storage.csharpProjection;
  assert.equal(projection.arguments.length === 2 && projection.roleArguments.length === 2, true,
    "the open storage is a two-role projection");
  for (const [index, role] of projection.sum.roles.entries()) {
    const arms = input.program.sum(input.open).roles[role.role].arms;
    if (arms.length === 1) assert.equal(targetTypeRefEquals(projection.roleArguments[index], projection.arguments[arms[0]]), true,
      "the role argument is the selected arm carrier, not a second materialization");
  }
});

test("distinct Host families share canonical storage without overwriting role provenance", () => {
  const input = fixture();
  const returned = input.program.type(input.ast.typeNode(input.forward));
  const first = input.represent(input.open);
  const second = input.represent(returned);
  assert.equal(first.csharpProjection.sum.record !== second.csharpProjection.sum.record, true,
    "parameter and return retain distinct Host family records");
  assert.equal(targetTypeRefEquals(first, second) && first.name === second.name, true,
    "the same Source vector and .NET representation have one storage parameter");
  for (const carrier of [first, second]) assert.equal(input.facts.sums.sum(carrier.csharpProjection.sum.record.identity) ===
    carrier.csharpProjection.sum.record, true, "each family's physical witness is the Host's record for its identity");
});

test("a missing sum is an invariant failure; a foreign program's descriptor is not this program's sum", () => {
  const input = fixture();
  const missing = representationServices(input.program, {
    facts: Object.freeze({ ...input.facts, sums: Object.freeze({ ...input.facts.sums, sumOf: () => undefined }) }),
  });
  assert.throws(() => representations(missing).type(input.open, input.union, "storage"), /published closed sum/u,
    "an absent open component does not license a syntax or shape reconstruction (I4)");
  const record = input.program.sum(input.open);
  assert.equal(input.facts.sums.sum(record.identity) === record && input.facts.sums.sum({ ...record.identity }) === record, true,
    "the Host answers one frozen record per family/application");
  const foreign = hostProgram("export function foreign<T>(value: string | T): string | T { return value; }");
  assert.throws(() => foreign.facts.sums.sumOf(input.open),
    "a foreign program cannot adopt another program's otherwise valid Source descriptor");
  assert.throws(() => foreign.facts.sums.substitute(input.open, new Map()),
    "substitution belongs to the descriptor's own program (the sole substitution, I6)");
});

test("Host substitution closes storage but retains two coincident ABI roles", () => {
  const input = fixture();
  const bindings = new Map([[input.parameter, input.text]]);
  const selected = input.facts.sums.substitute(input.open, bindings);
  assert.equal(selected.kind, "string", "coincident arms collapse at the Source owner");
  const storage = input.represent(selected);
  const roles = input.open.types.map(role => input.represent(input.facts.sums.substitute(role, bindings)));
  const proof = closure(input, bindings);
  const operations = representSourceUnionOperations(storage, roles, proof.record, proof.arms, [0, 1]);
  assert.equal(roles.length === 2 && roles.every(role => targetTypeRefEquals(role, storage)), true,
    "role cardinality survives logical collapse");
  assert.equal(operations?.id, "Tsonic.CSharp.Runtime.SourceUnionOperations2`5",
    "both static role operations share the same native scalar storage");
});

test("partial Host substitution preserves role association through a composed sum", () => {
  const input = fixture();
  const bindings = new Map([[input.parameter, input.partial]]);
  const selected = input.facts.sums.substitute(input.open, bindings);
  assert.equal(selected.kind === "union" && selected.types.length === 3, true, "the partial closure flattens at the Source owner");
  const physical = input.represent(selected);
  assert.equal(physical.csharpProjection.sum.roles.length === 2 && physical.csharpProjection.source.types.length === 3, true,
    "storage has three Source arms while the family retains two irreducible ABI roles");
  const originalRoles = input.open.types.map(role => input.facts.sums.substitute(role, bindings));
  assert.equal(originalRoles.length === 2 && originalRoles.some(role => role.kind === "union" && role.types.length === 2), true,
    "the method's second role is not replaced by flattened storage arms");
  const projected = csharpProjectedType({ kind: "source-union", part: "operations", source: selected,
    sum: physical.csharpProjection.sum, arguments: [physical, ...originalRoles.map(input.represent)] });
  assert.equal(projected.csharpProjection.sum.roles.length, 2, "operations retain the method ABI's two roles");
  assert.equal(sourceTypeDescriptorsEqual(physical.csharpProjection.source, selected), true,
    "operations and storage refer to the same Host closure");
});

test("generic arguments come from the Host instantiation, never from a bound .NET argument", () => {
  const input = fixture();
  const other = input.ast.typeParameters(input.named("other"))[0];
  for (const instantiation of input.instantiations) {
    assert.equal(instantiation.signature === input.forward, true, "the selected signature is the original declaration");
    assert.equal(instantiation.method[0].declaration === input.parameter && instantiation.method[0].declaration !== other, true,
      "a same-shaped foreign binder is not the selected binder");
  }
  const run = input.instantiations.find(selected => selected.method[0].type.kind === "primitive");
  assert.equal(targetTypeRefEquals(input.represent(run.method[0].type), csharpSourcePrimitiveTargetType("float64")), true,
    "the number argument is the Host descriptor represented, not a raw .NET argument");
});

test("optional payload domains retain the absence index and reject lost or foreign roles", () => {
  const input = fixture();
  const declaration = input.named("optional");
  const parameter = input.ast.typeParameters(declaration)[0];
  const declared = input.program.type(input.ast.typeNode(declaration));
  const template = input.program.sum(declared);
  const bindings = new Map([[parameter, input.numeric]]);
  const descriptor = input.facts.sums.substitute(declared, bindings);
  const record = input.facts.sums.sum({ family: template.identity.family,
    application: template.identity.application.map(type => input.facts.sums.substitute(type, bindings)) });
  assert.equal(record.arms.some(arm => arm.type.kind === "intrinsic" && arm.type.intrinsic === "absence"), true,
    "the complete Host record still includes its one absence arm");
  const arms = record.arms.map(arm => input.represent(arm.type));
  const storage = input.represent(descriptor);
  const payload = getCsharpNullableElementTargetType(storage);
  const number = input.represent(input.numeric);
  const text = input.represent(input.text);
  const roleFor = predicate => template.roles.find(role => role.arms.some(index => predicate(template.arms[index].type))).role;
  const numberRole = roleFor(type => type.kind === "declared" && type.declaration === parameter);
  const textRole = roleFor(type => type.kind === "string");
  const absentRole = roleFor(type => type.kind === "intrinsic" && type.intrinsic === "absence");
  const payloadRoles = [textRole, numberRole];
  const wholeRoles = record.roles.map(role => role.role);
  assert.equal(payload !== undefined && representSourceUnionOperations(payload, [text, number], record, arms, payloadRoles) !== undefined,
    true, "the payload-role domain projects only its exact present storage");
  assert.notEqual(representSourceUnionRole(storage, number, record, arms, numberRole, wholeRoles), undefined,
    "the whole physical domain preserves the absence boundary");
  assert.equal(representSourceUnionRole(payload, number, record, arms, numberRole, wholeRoles), undefined,
    "payload storage cannot silently discard absence from a whole-domain proof");
  for (const roles of [[], [numberRole, numberRole], [textRole], [numberRole, 999], [absentRole]])
    assert.equal(representSourceUnionRole(payload, number, record, arms, numberRole, roles), undefined,
      "missing, duplicate, foreign or absent-only domains cannot acquire the numeric role");
  assert.equal(representSourceUnionRole(payload, csharpSourcePrimitiveTargetType("uint32"), record, arms, numberRole, payloadRoles),
    undefined, "a foreign native width cannot replace the published numeric role");
  assert.equal(representSourceUnionRole(payload, number, record, arms.slice(1), numberRole, payloadRoles), undefined,
    "missing physical arms do not shift Host indexes");
  assert.equal(representSourceUnionRole(csharpRuntimeUnionTargetType([text, number]), number, record, arms, numberRole, payloadRoles),
    undefined, "a fixed native-ordered ABI cannot impersonate the Source payload");
});

test("static role selection refuses foreign widths, missing arms and native-ordered reinterpretation", () => {
  const text = csharpStringTargetType();
  const narrow = csharpSourcePrimitiveTargetType("int32");
  const number = csharpSourcePrimitiveTargetType("float64");
  const input = fixture();
  const bindings = new Map([[input.parameter, input.numeric]]);
  const storage = input.represent(input.facts.sums.substitute(input.open, bindings));
  const ordered = csharpRuntimeUnionTargetType([text, number]);
  const proof = closure(input, bindings);
  const roles = proof.record.roles.map(selected => selected.role);
  for (const role of [narrow, csharpNullableTargetType(number), ordered])
    assert.equal(representSourceUnionRole(storage, role, proof.record, proof.arms, 1, roles), undefined,
      "an absent width, optional role or ordered runtime role cannot become a Source union arm");
  assert.equal(representSourceUnionRole(ordered, number, proof.record, proof.arms, 1, roles), undefined,
    "an explicit native-ordered union stays atomic rather than acquiring Source role semantics");
  assert.equal(representSourceUnionOperations(storage, [text], proof.record, proof.arms, [0]), undefined,
    "a missing role is not filled from storage");
  assert.notEqual(representSourceUnionOperations(storage, [text, number], proof.record, proof.arms, [0, 1]), undefined,
    "the complete role inventory has a static unboxed witness");
});

test("projection creation rejects missing and oversized role vectors", () => {
  const input = fixture();
  const storage = input.represent(input.open);
  for (const roles of [[], [{ role: 0, type: input.text }], Array.from({ length: 9 }, (_, role) => ({ role, type: input.text }))])
    assert.throws(() => csharpProjectedType({ ...storage.csharpProjection, sum: { ...storage.csharpProjection.sum, roles } }), TypeError,
      "storage cannot invent a role from the normalized Source sum");
  assert.notEqual(targetTypeRefKey(storage), targetTypeRefKey(csharpRuntimeUnionTargetType(getCsharpRuntimeUnionArms(storage) ?? [])),
    "deferred Source storage never erases the native-ordered ABI distinction");
});

test("published array roles retain rank, width, readonly-ness and exact carrier identity", () => {
  const input = fixture();
  const declaration = input.named("arrayRole");
  const union = input.nodes.find(node => input.ast.is.IsUnionTypeNode(node) &&
    input.ast.parent(node) === input.ast.parameters(declaration)[0]);
  const descriptor = input.program.type(union);
  assert.equal(descriptor.kind, "union", "the array role comes from its authored Source component");
  const storage = input.represent(descriptor);
  const roles = getCsharpRuntimeUnionArms(storage);
  const array = roles.find(role => role.kind === "array");
  const record = input.program.sum(descriptor);
  const arms = record.arms.map(arm => input.represent(arm.type));
  const all = record.roles.map(selected => selected.role);
  const roleIndex = record.roles.find(role => role.arms.length === 1 && record.arms[role.arms[0]].type.kind === "array").role;
  assert.equal(array !== undefined && representSourceUnionRole(storage, array, record, arms, roleIndex, all) !== undefined, true,
    "the exact native array role has one static storage projection");
  for (const foreign of [{ ...array, rank: 2 }, { ...array, element: csharpSourcePrimitiveTargetType("int32") },
    csharpJsArrayTargetType(array.element), csharpReadOnlyListTargetType(array.element)])
    assert.equal(representSourceUnionRole(storage, foreign, record, arms, roleIndex, all), undefined,
      "a different rank, width, JS carrier or readonly role does not acquire the array identity");
  assert.equal(representSourceUnionOperations(storage, [roles[0]], record, arms, [0]), undefined,
    "missing role cardinality stays unavailable rather than inferring a storage arm");
});

test("callback ABI agreement keeps exact parameters and the same canonical array result", () => {
  const input = fixture();
  const descriptor = input.facts.sums.substitute(input.open, new Map([[input.parameter, input.numeric]]));
  const result = { kind: "array", element: input.represent(descriptor) };
  const integer = csharpSourcePrimitiveTargetType("int32");
  const source = csharpDelegateTargetType("System.Func", [integer], result);
  assert.equal(csharpClosedInvocationMatches(source, csharpDelegateTargetType("System.Func", [integer], result)), true,
    "a shared Source arm set already has one native result before callable matching");
  assert.equal(csharpClosedInvocationMatches(source,
    csharpDelegateTargetType("System.Func", [csharpSourcePrimitiveTargetType("float64")], result)), false,
  "Source union closure does not widen a callable parameter");
  assert.equal(csharpClosedInvocationMatches(source,
    csharpDelegateTargetType("System.Func", [integer], { kind: "array", element: integer })), false,
  "Source union closure does not replace a callable result with a different native width");
});

test("Source projection identities are local to each program view", () => {
  const independent = () => {
    const program = hostProgram("declare function select<Value>(value: string | Value): void;");
    const declaration = program.named("select", node => program.ast.is.IsFunctionDeclaration(node));
    const parameter = program.ast.parameters(declaration)[0];
    return represented(representations(representationServices(program)).value(parameter));
  };
  const first = independent();
  const input = fixture();
  assert.notEqual(input.represent(input.open), undefined, "another program may allocate its own projections between these views");
  const second = independent();
  assert.equal(first.name, second.name, "emitted names are independent of other program activity");
  assert.equal(first.identity, second.identity, "projection identities do not consume a module-global counter");
});

test("malformed Host sums (void arm, nested sum, optional arm, two absence arms) are invariant failures (A11)", () => {
  const input = fixture();
  const context = csharpRepresentationContext(input.services, input.union, "storage");
  const family = input.union;
  const sum = types => Object.freeze({ identity: Object.freeze({ family, application: Object.freeze([]) }),
    arms: Object.freeze(types.map((type, role) => Object.freeze({ role, type }))),
    roles: Object.freeze(types.map((_, role) => Object.freeze({ role, arms: Object.freeze([role]) }))) });
  for (const component of [{ kind: "intrinsic", intrinsic: "void" }, { kind: "optional", value: input.text }, input.open]) {
    assert.throws(() => representSourceSum(sum([input.text, component]), context), /flattened and publish void as absence/u);
  }
  const absence = { kind: "intrinsic", intrinsic: "absence" };
  assert.throws(() => representSourceSum(sum([input.text, absence, absence]), context), /at most one absence arm/u);
});
