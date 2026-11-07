// Physical (value-storage) object-shape reads (nextgen C-2542; K-2664 / C-2550; WP0 A5; BF16 fix-forward C-2524 / C-2525).
//
// A declaration whose native storage selection chose struct value storage (createCsharpObjectShapeValueStorage of its
// registered shape) is read through that storage: no class allocation and no copy. The owner of the read-side choice is
// analysis/source-evidence/physical-reads.ts (selectCsharpPhysicalRead), composed by CsharpTypeQueries.value as
// `physicalRead(node, logical) ?? logical`; the literal-admission obligation reaches it through `types.value`
// (type-flow-obligations.ts retainedLiteralShape). These tests drive those two owners with a real program's Host facts,
// the real representation services and the real object-shape registry. Restored purposes of the d1d217189 test:
// - 3 physical sites (declaration, literal through its A5 principal, read) select the exact registered carrier;
// - 3 Native identities (class, interface, struct) are never replaced by the anonymous physical carrier (BF16);
// - an unrelated registered carrier with the same members is not the canonical projection (BF16);
// - 9 opposites keep the logical carrier: missing occurrence or principal storage, different storage, unregistered,
//   foreign principal, different principal descriptor, missing origins, foreign same-width origin, different width;
// - 12 literal-obligation cases: only the exact A5 principal (independent of the solved group) represents the
//   obligation through its proven physical allocation; every other case keeps the ordinary C# conversion proof.
// The Host publication of every node is unchanged in every case. The BF16/BF17 execution rows
// (test/analysis/operations/source-effective-local-rules.test.mjs "a data object's member fill ...") and the 19-case
// corpus of C-2524 (published-struct-member-correspondence negatives, published-struct-markers controls, generated
// nested width) stay in their own files.
// Basis for replacing the old engine doubles: the engine (resolution/nodes.ts selectedPhysicalRead,
// effectiveTypes.get) is deleted (ARCHITECTURE-AND-PLAN.md §2, I2, I6); Host facts are overridden only through the
// current SourceProgramFacts contract.
import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpObjectShapePolicy } from "../../../dist/analysis/objects/shapes/api.js";
import { selectCsharpPhysicalRead } from "../../../dist/analysis/source-evidence/physical-reads.js";
import { analyzeCsharpSourceTypeFlowObligations } from "../../../dist/analysis/source-evidence/type-flow-obligations.js";
import { createCsharpObjectShapeValueStorage } from "../../../dist/policy/types/objects/shape-carriers.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpObjectShapeMemberContractKey } from "../../../dist/target-model/types/object-shape-identity.js";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";

/** `base` with `overrides` as own properties; the frozen Host records stay untouched and every other member is inherited. */
function overriding(base, overrides) {
  const result = Object.create(base);
  for (const [key, value] of Object.entries(overrides)) Object.defineProperty(result, key, { value, enumerable: true });
  return result;
}

function fixture() {
  const program = hostProgram(`function takeNumber(value: number): void { void value; }
function run(): void {
  const selected = { chosen: 1, unchanged: 2 };
  const earlier = { chosen: 3, unchanged: 4 };
  takeNumber(selected.chosen); void selected.unchanged; takeNumber(earlier.chosen); void earlier;
}`);
  const { ast, facts } = program;
  const declaration = program.named("selected");
  const earlier = program.named("earlier");
  const literal = ast.as.AsVariableDeclaration(declaration).Initializer;
  const reference = program.nodes.find(node => ast.is.IsIdentifier(node) && ast.text(node) === "selected" &&
    ast.is.IsPropertyAccessExpression(ast.parent(node)));
  const principal = facts.values.type(declaration);
  const foreign = facts.values.type(earlier);
  const current = facts.values.type(literal);
  for (const outcome of [facts.values.type(reference), principal, foreign, current]) {
    assert.equal(outcome.kind !== "refused" && outcome.type.kind === "shape", true,
      "the exact occurrence, principal and opposite owner have complete shape publications");
  }
  assert.equal(current.provenance.principal?.declaration === declaration && current.provenance.principal.initializer === literal, true,
    "the literal carries its A5 principal association (direct unannotated initializer)");
  let shapes;
  const services = representationServices(program, { shapes: Object.freeze({
    retainShape: shape => shapes.retainShape(shape), resolveCallableValue: () => assert.fail("no callable members") }) });
  const sourceStorage = new Proxy({}, { get: (_target, key) => () => assert.fail(`data shapes read no storage (${String(key)})`) });
  shapes = createCsharpObjectShapePolicy({ ast, sourceStorage, projectTypeCatalog: services.projectTypes,
    typeParameterConstraints: services.typeParameters, representation: () => services });
  const represent = representations(services);
  const logical = represented(represent.value(reference));
  const shape = shapes.resolveTarget(logical);
  assert.notEqual(shape, undefined, "the represented literal shape is registered");
  const physical = createCsharpObjectShapeValueStorage(shape);
  assert.equal(physical !== undefined && !targetTypeRefEquals(logical, physical.targetType), true,
    "the native value-storage carrier is distinct from its logical reference representation");
  assert.equal(shapes.retainShape(physical, undefined) !== undefined, true, "the actual Native registry owns the carrier");
  // The native storage selection's result (native-construction-demand selectLocalValue): literal, declaration and reads.
  const scoped = new Map([declaration, literal, reference].map(node => [node, physical.targetType]));
  const host = Object.freeze({
    facts,
    syntax: ast,
    scopedTargetType: node => scoped.get(node),
    closedInputContract: () => assert.fail("a shape read reads no closed callable contract"),
    objectShapes: shapes,
  });
  /** CsharpTypeQueries.value as type-system.ts composes it: the logical mapping, then the physical read owner. */
  const value = (node, readHost = host) => {
    const selected = represented(represent.value(node));
    return selectCsharpPhysicalRead(readHost, node, selected) ?? selected;
  };
  return { program, facts, services, shapes, represent, host, value, scoped, declaration, earlier, literal, reference,
    principal, foreign, logical, shape, physical };
}

test("the logical mapping is one carrier for the declaration, its literal and its read", () => {
  const input = fixture();
  for (const node of [input.declaration, input.literal]) {
    assert.equal(targetTypeRefEquals(represented(input.represent.value(node)), input.logical), true,
      "the same Host member set is the same generated .NET shape");
  }
  assert.deepEqual(input.shape.members.map(member => member.sourceName), ["chosen", "unchanged"], "Host member order");
  assert.equal(input.shape.members.every(member => member.origins?.length >= 1), true, "every member keeps its Source origin");
  assert.equal(targetTypeRefEquals(createCsharpObjectShapeValueStorage(input.shape).targetType, input.physical.targetType), true,
    "one canonical value-storage projection per registered shape");
  assert.equal(input.physical.targetType.csharpValueType, true, "the projection is a .NET value type");
});

for (const site of ["declaration", "literal", "reference"]) {
  test(`physical shape ${site} reads its exact registered value-storage carrier`, () => {
    const input = fixture();
    const before = input.facts.values.type(input[site]);
    const selected = input.value(input[site]);
    assert.equal(targetTypeRefEquals(selected, input.physical.targetType), true,
      "the same canonical Native value carrier is read without copying or reference allocation");
    assert.equal(input.facts.values.type(input[site]) === before, true, "the actual logical Source publication remains unchanged");
  });
}

for (const declarationKind of ["class", "interface", "struct"]) {
  test(`physical shape cannot replace the selected Native ${declarationKind} identity`, () => {
    const input = fixture();
    const native = csharpTargetNamedType(`fixture.${declarationKind}`, [], { kind: "named", name: "Selected" },
      { sourceDeclarationKind: declarationKind, allowsRefLikeTypeArguments: [] });
    const registered = input.shapes.retainShape({ ...input.physical, targetType: native }, undefined);
    assert.equal(registered?.members.length === input.physical.members.length && registered.members.every((member, index) =>
      csharpObjectShapeMemberContractKey(member) === csharpObjectShapeMemberContractKey(input.physical.members[index]) &&
      member.origins?.length === input.physical.members[index].origins?.length &&
      member.origins.every((origin, originIndex) => origin === input.physical.members[index].origins[originIndex])), true,
    "the opposite has the same complete physical members and genuine Source origins");
    const before = input.facts.values.type(input.reference);
    // The read's logical carrier is the declared Native identity; the scoped physical carrier is still registered.
    const selected = selectCsharpPhysicalRead(input.host, input.reference, native) ?? native;
    assert.equal(targetTypeRefEquals(selected, native), true,
      "equal Source publication and an anonymous scoped carrier cannot replace the selected Native declaration");
    assert.equal(input.facts.values.type(input.reference) === before, true,
      "the selected Native identity does not change the original Source publication");
  });
}

test("physical shape read requires the canonical value-storage projection, not an unrelated registered identity", () => {
  const input = fixture();
  const targetType = { ...input.physical.targetType, id: "fixture.other-physical",
    csharpRender: { kind: "named", name: "OtherPhysical" } };
  const other = input.shapes.retainShape({ ...input.physical, targetType }, undefined);
  assert.equal(other?.members.length === input.physical.members.length && other.members.every((member, index) =>
    csharpObjectShapeMemberContractKey(member) === csharpObjectShapeMemberContractKey(input.physical.members[index])), true,
  "the other registered Native carrier has exactly the same members and widths");
  input.scoped.set(input.reference, targetType);
  input.scoped.set(input.declaration, targetType);
  const before = input.facts.values.type(input.reference);
  assert.equal(targetTypeRefEquals(input.value(input.reference), input.logical), true,
    "Source equality is not authority for a different physical Native identity");
  assert.equal(input.facts.values.type(input.reference) === before, true, "the original Source publication remains the sole logical result");
});

for (const kind of ["missing-occurrence", "missing-principal", "different-storage", "unregistered", "foreign-principal",
  "different-current-descriptor", "missing-origins", "foreign-same-width-origin", "different-width"]) {
  test(`physical shape read refuses ${kind} as an alternative physical authority`, () => {
    const input = fixture();
    let readHost = input.host;
    if (kind === "missing-occurrence") input.scoped.delete(input.reference);
    if (kind === "missing-principal") input.scoped.delete(input.declaration);
    if (kind === "different-storage") input.scoped.set(input.declaration, input.logical);
    if (kind === "unregistered") readHost = { ...input.host, objectShapes: overriding(input.shapes, { resolveTarget: type =>
      targetTypeRefEquals(type, input.physical.targetType) ? undefined : input.shapes.resolveTarget(type) }) };
    if (kind === "foreign-principal" || kind === "different-current-descriptor") {
      const values = input.facts.values;
      const type = node => node === input.declaration
        ? kind === "foreign-principal" ? input.foreign : { ...input.principal, type: input.foreign.type }
        : values.type(node);
      readHost = { ...input.host, facts: overriding(input.facts, { values: overriding(values, { type }) }) };
    }
    if (kind === "missing-origins" || kind === "foreign-same-width-origin" || kind === "different-width") {
      const member = input.physical.members[0];
      const opposite = kind === "missing-origins" ? { ...member, origins: undefined }
        : kind === "foreign-same-width-origin" ? { ...member, origins: [input.foreign.type.members[0].origin] }
        : { ...member, type: { kind: "source-primitive", name: "bool" } };
      const shape = { ...input.physical, members: [opposite, ...input.physical.members.slice(1)] };
      readHost = { ...input.host, objectShapes: overriding(input.shapes, { resolveTarget: type =>
        targetTypeRefEquals(type, input.physical.targetType) ? shape : input.shapes.resolveTarget(type) }) };
    }
    const before = input.facts.values.type(input.reference);
    assert.equal(targetTypeRefEquals(input.value(input.reference, readHost), input.logical), true,
      "a missing or contradictory physical proof cannot replace the unchanged logical Source representation");
    assert.equal(input.facts.values.type(input.reference) === before, true,
      "refusing a physical substitution never fabricates or changes the Source outcome");
  });
}

for (const kind of ["exact", "declared-destination", "foreign-source", "missing-current", "foreign-principal",
  "missing-association", "foreign-association", "unrelated-initializer", "self-principal", "solved-group-independent",
  "unregistered", "different-width"]) {
  test(`literal obligation physical projection preserves ${kind} authority`, () => {
    const input = fixture();
    const original = input.facts.obligations().find(obligation => obligation.kind === "literal-admission" &&
      (obligation.value ?? obligation.site) === input.literal);
    assert.equal(original?.authority === "inferred" && original.type.kind === "shape", true,
      "the original inferred object obligation has an exact Source destination");
    const obligation = kind === "declared-destination" ? { ...original, authority: "declared" }
      : kind === "foreign-source" ? { ...original, type: input.foreign.type } : original;
    const values = input.facts.values;
    const current = values.type(input.literal);
    const type = node => {
      if (kind === "missing-current" && node === input.literal) return Object.freeze({ kind: "refused", source: "tsonic",
        code: "TSONIC_LOCAL_TYPE_UNSUPPORTED", site: node, reason: "fixture: the literal has no current publication" });
      if (kind === "foreign-principal" && node === input.declaration) return input.foreign;
      if (node === input.literal && kind === "solved-group-independent") return {
        ...current, provenance: { ...current.provenance, group: input.literal },
      };
      if (node === input.literal && ["missing-association", "foreign-association", "unrelated-initializer", "self-principal"].includes(kind)) return {
        ...current, provenance: { ...current.provenance, principal: kind === "missing-association" ? undefined : {
          declaration: kind === "foreign-association" ? input.foreign.provenance.occurrence
            : kind === "self-principal" ? input.literal : input.declaration,
          initializer: kind === "unrelated-initializer" ? input.reference : input.literal,
        } },
      };
      return values.type(node);
    };
    const facts = overriding(input.facts, { values: overriding(values, { type }), obligations: () => Object.freeze([obligation]) });
    let objectShapes = input.shapes;
    if (kind === "unregistered" || kind === "different-width") {
      const shape = kind === "unregistered" ? undefined : { ...input.physical, members: [
        { ...input.physical.members[0], type: { kind: "source-primitive", name: "bool" } }, ...input.physical.members.slice(1)] };
      objectShapes = overriding(input.shapes, { resolveTarget: type =>
        targetTypeRefEquals(type, input.physical.targetType) ? shape : input.shapes.resolveTarget(type) });
    }
    const readHost = { ...input.host, facts, objectShapes };
    const policy = {
      ast: input.program.ast,
      facts,
      target: { id: "csharp" },
      providers: input.services.providers,
      projectTypes: { catalog: input.services.projectTypes, directSupertypes: () => [] },
      objectShapes,
      types: {
        represent: (descriptor, occurrence, position) => input.represent.type(descriptor, occurrence, position),
        value: node => input.value(node, readHost),
        resolveArrayLiteral: () => assert.fail("an object-literal obligation reads no array literal"),
        typeParameterConstraints: () => assert.fail("a literal admission reads no binder constraints"),
      },
    };
    const nativeConstruction = { issues: [], constructionFor: node => node === input.literal
      ? { targetType: input.physical.targetType, shape: input.physical } : undefined };
    const before = input.facts.values.type(input.literal);
    const result = analyzeCsharpSourceTypeFlowObligations(policy, objectShapes, nativeConstruction,
      { dictionaryLiteral: { get: () => undefined } }, { get: () => false });
    const admitted = kind === "exact" || kind === "solved-group-independent";
    assert.equal(result.length, admitted ? 0 : 1,
      "only the same inferred principal may represent this obligation through its proven physical allocation");
    if (!admitted) assert.equal(result[0].code === "CSHARP_TYPE_FLOW_UNREPRESENTABLE" &&
      (result[0].sourceNode === original.site || result[0].sourceNode === input.literal), true,
    "a foreign or unavailable physical contract does not waive the ordinary Native conversion");
    assert.equal(input.facts.values.type(input.literal) === before, true, "the Host publication of the literal is unchanged");
  });
}
