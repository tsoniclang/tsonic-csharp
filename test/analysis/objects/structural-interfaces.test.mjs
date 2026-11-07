import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpStructuralInterface } from "../../../dist/analysis/objects/structural-interfaces.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpProjectedType } from "../../../dist/target-model/types/projections.js";
import { resolveCsharpOptionalStorage } from "../../../dist/policy/types/storage/optional-storage.js";

const element = { kind: "type-parameter", identity: "interface:Element", name: "Element" };
const captured = { kind: "type-parameter", identity: "class:Element", name: "Element" };
const integer = { kind: "source-primitive", name: "int64" };
const sourceSymbol = {};
const destinationSymbol = {};
const expression = {};
// Published descriptors (nextgen C-2542): the selected source value type and the destination interface type.
const sourceType = { kind: "declared", declaration: {}, typeArguments: [] };
const destinationType = { kind: "declared", declaration: {}, typeArguments: [] };
const valueKey = { kind: "string", value: "value" };
const objectMember = declaration => ({ key: valueKey, name: "value", kind: "property", declarations: [declaration],
  type: { kind: "optional", value: { kind: "primitive", primitive: "int64" } }, optional: true, readonly: false, static: false,
  owner: {}, inherited: false });
const optional = type => csharpNullableTargetType(type);
const slot = type => ({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [false, false, false], id: "test.Slot", csharpSourceDeclarationKind: "interface",
  typeArguments: [type, resolveCsharpOptionalStorage({ kind: "optional", part: "operations", arguments: [element] }, type), optional(type)] });
const field = (symbol, type) => ({ sourceName: "value", targetName: "value", sourceKey: { kind: "property", name: "value" },
  sourceSubjects: [symbol], memberKind: "property", type });
const destinationTemplate = { targetType: slot(element), sourceType: destinationType, members: [field(destinationSymbol, optional(element))] };
const destination = { targetType: slot(integer), sourceType: destinationType, members: [field(destinationSymbol, optional(integer))],
  declarationTemplate: destinationTemplate };
// Member correspondence comes from Host object facts: objects.members(destination) and objects.member(source, key).
// nextgen C-2542: the old `purpose === "read"` assertion checked a checker structuralMembers argument; facts.objects
// has no purpose parameter (the member's read type is its `type`), so that assertion is removed.
const policy = { projectTypes: { directSupertypes: () => [], catalog: { definitionForTarget: () => undefined } },
  facts: { objects: {
    indexes: () => [],
    members(type) {
      assert.equal(type, destinationType, "destination members come from the destination's published descriptor");
      return [objectMember(destinationSymbol)];
    },
    member(type, key) {
      assert.equal(type, sourceType, "the source member comes from the selected source descriptor");
      assert.deepEqual(key, valueKey);
      return objectMember(sourceSymbol);
    },
  } } };

test("structural optional interfaces bind their payload and every dependent native argument", () => {
  for (const generic of [false, true]) {
    const template = { targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: generic ? [false] : [], id: "test.Record", typeArguments: generic ? [captured] : [] },
      members: [field(sourceSymbol, optional(generic ? captured : integer))] };
    const source = { targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: generic ? [false] : [], id: "test.Record", typeArguments: generic ? [integer] : [] },
      members: [field(sourceSymbol, optional(integer))], declarationTemplate: template };
    const selected = selectCsharpStructuralInterface(policy, expression, source, destination, sourceType);
    assert.deepEqual(selected, { sourceNode: expression, sourceType: template.targetType, interfaceType: slot(generic ? captured : integer), methods: [],
      properties: [{ sourceName: "value", sourceType: template.members[0].type,
        member: { ...destinationTemplate.members[0], type: optional(generic ? captured : integer) } }],
    });
    const mismatched = { ...source, members: [field(sourceSymbol, optional({ kind: "source-primitive", name: "uint64" }))] };
    assert.equal(selectCsharpStructuralInterface(policy, expression, mismatched, destination, sourceType), undefined);
    const incomplete = { ...destination, declarationTemplate: { ...destinationTemplate,
      targetType: { ...destinationTemplate.targetType, typeArguments: [...destinationTemplate.targetType.typeArguments,
        csharpProjectedType({ kind: "optional", part: "operations", arguments: [{ ...element, identity: "unbound:Element" }] })] },
    } };
    assert.equal(selectCsharpStructuralInterface(policy, expression, source, incomplete, sourceType), undefined);
  }
});

test("structural interface property forwarding preserves writes and direct native accessors", () => {
  const memberType = optional(integer);
  const source = { targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "test.Record" }, members: [field(sourceSymbol, memberType)] };
  const target = { targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "test.ReadView", csharpSourceDeclarationKind: "interface" },
    sourceType: destinationType, members: [{ ...field(destinationSymbol, memberType), readonly: true }] };
  const readonly = selectCsharpStructuralInterface(policy, expression, source, target, sourceType);
  assert.equal(readonly?.properties.length, 1);
  assert.equal(readonly?.properties[0].member.readonly, true);
  const writable = { ...target, members: [{ ...target.members[0], readonly: false }] };
  assert.equal(selectCsharpStructuralInterface(policy, expression, source, writable, sourceType)?.properties.length, 1);
  for (const changes of [{ readonly: true }, { accessor: { getter: true, setter: false } }]) {
    assert.equal(selectCsharpStructuralInterface(policy, expression,
      { ...source, members: [{ ...source.members[0], ...changes }] }, writable, sourceType) === undefined, true);
  }
  assert.equal(selectCsharpStructuralInterface(policy, expression,
    { ...source, members: [{ ...source.members[0], accessor: { getter: true, setter: false } }] }, target, sourceType)?.properties.length, 0);
});
