// Physical (value-storage) object shapes and logical reads (nextgen C-2542, I2, I6).
// The logical carrier of a declaration, its literal and its reads is the represented Host shape descriptor (one
// mapping, one source). The native value-storage carrier is a separate, canonical projection of that registered shape
// (createCsharpObjectShapeValueStorage); it never changes the Host publication, and a registered physical carrier for a
// Native class / interface / struct identity keeps the same members and Source origins.
// The read-side authority that once let a read select the physical carrier (selectedPhysicalRead in the deleted
// resolution/nodes.ts, and the literal obligation physical projection in type-flow obligations) has no successor in
// the current source yet; see AGENT-C3-NOTES-F4.md requests R-F4-2 and R-F4-3.
import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpObjectShapePolicy } from "../../../dist/analysis/objects/shapes/api.js";
import { createCsharpObjectShapeValueStorage } from "../../../dist/policy/types/objects/shape-carriers.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { csharpObjectShapeMemberContractKey } from "../../../dist/target-model/types/object-shape-identity.js";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";

function fixture() {
  const program = hostProgram(`function takeNumber(value: number): void { void value; }
function run(): void {
  const selected = { chosen: 1, unchanged: 2 };
  const earlier = { chosen: 3, unchanged: 4 };
  takeNumber(selected.chosen); void selected.unchanged; takeNumber(earlier.chosen); void earlier;
}`);
  const { ast } = program;
  const declaration = program.named("selected");
  const earlier = program.named("earlier");
  const literal = ast.as.AsVariableDeclaration(declaration).Initializer;
  const reference = program.nodes.find(node => ast.is.IsIdentifier(node) && ast.text(node) === "selected" &&
    ast.is.IsPropertyAccessExpression(ast.parent(node)));
  for (const node of [declaration, earlier, reference]) {
    assert.equal(program.type(node).kind, "shape", "the occurrence, principal and opposite owner have complete shape publications");
  }
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
  return { program, services, shapes, represent, declaration, earlier, literal, reference, logical, shape, physical };
}

test("declaration, literal and read share one logical carrier: the represented Host shape", () => {
  const input = fixture();
  for (const node of [input.declaration, input.literal]) {
    assert.equal(targetTypeRefEquals(represented(input.represent.value(node)), input.logical), true,
      "the same Host member set is the same generated .NET shape");
  }
  assert.deepEqual(input.shape.members.map(member => member.sourceName), ["chosen", "unchanged"], "Host member order");
  assert.equal(input.shape.members.every(member => member.origins?.length === 1), true, "every member keeps its Source origin");
});

test("the value-storage carrier is a distinct canonical projection that leaves the logical publication unchanged", () => {
  const input = fixture();
  const before = input.program.facts.values.type(input.reference);
  assert.notEqual(input.physical, undefined, "an all-data object shape has native value storage");
  assert.equal(targetTypeRefEquals(input.physical.targetType, input.logical), false,
    "the native value-storage carrier is distinct from its logical reference representation");
  assert.equal(input.physical.targetType.csharpValueType, true);
  assert.equal(input.shapes.retainShape(input.physical, undefined) !== undefined, true, "the actual Native registry owns the carrier");
  assert.equal(targetTypeRefEquals(createCsharpObjectShapeValueStorage(input.shape).targetType, input.physical.targetType), true,
    "one canonical projection per registered shape");
  assert.equal(input.program.facts.values.type(input.reference) === before, true, "the Source publication is untouched");
  assert.equal(targetTypeRefEquals(represented(input.represent.value(input.reference)), input.logical), true,
    "the read's represented logical carrier does not change after registering the physical carrier");
});

for (const declarationKind of ["class", "interface", "struct"]) {
  test(`a registered Native ${declarationKind} identity keeps the physical members and Source origins`, () => {
    const input = fixture();
    const native = csharpTargetNamedType(`fixture.${declarationKind}`, [], { kind: "named", name: "Selected" },
      { sourceDeclarationKind: declarationKind, allowsRefLikeTypeArguments: [] });
    const registered = input.shapes.retainShape({ ...input.physical, targetType: native }, undefined);
    assert.equal(registered?.members.length === input.physical.members.length && registered.members.every((member, index) =>
      csharpObjectShapeMemberContractKey(member) === csharpObjectShapeMemberContractKey(input.physical.members[index]) &&
      member.origins?.length === input.physical.members[index].origins?.length), true,
    "the opposite has the same complete physical members and genuine Source origins");
    assert.equal(targetTypeRefEquals(represented(input.represent.value(input.reference)), input.logical), true,
      "a registered Native identity does not replace the logical read carrier");
  });
}

test("a shape the value-storage projection cannot carry has no physical carrier", () => {
  const input = fixture();
  for (const changed of [
    { ...input.shape, members: [] },
    { ...input.shape, members: [{ ...input.shape.members[0], optional: true }, ...input.shape.members.slice(1)] },
    { ...input.shape, members: [{ ...input.shape.members[0], memberKind: "method" }, ...input.shape.members.slice(1)] },
    { ...input.shape, implements: [input.logical] },
  ]) assert.equal(createCsharpObjectShapeValueStorage(changed), undefined);
});
