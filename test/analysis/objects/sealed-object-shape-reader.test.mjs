import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpObjectShapes } from "../../../dist/analysis/objects/analyze.js";
import { instantiateCsharpObjectShape } from "../../../dist/policy/types/objects/object-shape-policy/instantiation.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { emptyCsharpTypeDefinitions } from "../../../dist/target-model/types/source-union-definitions.js";

const integer = { kind: "source-primitive", name: "int64" };
const string = { kind: "source-primitive", name: "string" };
const parameter = { kind: "type-parameter", name: "Value", identity: "test.Shape.Value" };
const member = type => ({ sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "value",
  memberKind: "property", type });
const template = { targetType: { kind: "target-named", id: "Shape", typeArguments: [parameter] }, members: [member(parameter)] };
const component = { kind: "target-named", id: "Shape", typeArguments: [integer] };
const holder = { targetType: { kind: "target-named", id: "Holder" }, members: [member(component)] };

function harness({ resolvesComponent }) {
  const files = { holder: {}, template: {} };
  const counts = { policy: 0 };
  let closed = false;
  const native = (name, answer) => (...args) => {
    assert.equal(closed, false, `native ${name} runs before publication`);
    counts.policy += 1;
    return answer(...args);
  };
  const policy = {
    ast: { is: { IsObjectLiteralExpression: () => false }, forEachChild: () => {}, parent: () => undefined,
      properties: () => [], authoredRange: () => ({ kind: "unauthored" }) },
    sourceFiles: [files.holder, files.template], typeDefinitions: emptyCsharpTypeDefinitions,
    projectTypes: { directSupertypes: () => undefined },
    objectShapes: {
      resolveNode: native("resolveNode", node => node === files.holder ? holder : node === files.template ? template : undefined),
      resolveTarget: native("resolveTarget", type => {
        if (targetTypeRefEquals(type, holder.targetType)) return holder;
        if (targetTypeRefEquals(type, template.targetType)) return template;
        return resolvesComponent && targetTypeRefEquals(type, component) ? instantiateCsharpObjectShape(template, type) : undefined;
      }),
      resolveCopyShape: native("resolveCopyShape", () => undefined),
    },
  };
  const builder = analyzeCsharpObjectShapes(policy, { targetTypes: [], compileTimeMetadata: { get: () => false } },
    { selectedCall: { get: () => undefined }, selectedConstruction: { get: () => undefined } });
  const sealed = builder.seal();
  closed = true;
  return { builder, sealed, files, counts };
}

test("sealed generic instances are completed at seal and read back as the same published record", () => {
  for (const resolvesComponent of [false, true]) {
    const { sealed, counts } = harness({ resolvesComponent });
    const before = counts.policy;
    const first = sealed.resolveTarget(component);
    assert.equal(first !== undefined, true, `demanded component instance is published (native ${resolvesComponent})`);
    assert.equal(Object.isFrozen(first), true, "published instance is immutable");
    assert.equal(targetTypeRefEquals(first.members[0].type, integer), true, "exact substitution happened before publication");
    for (let index = 0; index < 8; index += 1) {
      assert.equal(sealed.resolveTarget(component) === first, true, "every read returns the identical record");
    }
    assert.equal(counts.policy, before, "no native policy query after seal");
  }
});

test("an instance no producer demanded is a negative lookup, never a late instantiation", () => {
  const { sealed, counts } = harness({ resolvesComponent: false });
  const before = counts.policy;
  for (const argument of [string, { kind: "array", element: integer }]) {
    const undemanded = { kind: "target-named", id: "Shape", typeArguments: [argument] };
    assert.equal(sealed.resolveTarget(undemanded) === undefined, true, `undemanded ${targetTypeRefKey(undemanded)} is absent`);
  }
  assert.equal(sealed.resolveTarget(undefined) === undefined, true, "absent input is absent");
  assert.equal(counts.policy, before, "negative lookups make no native query");
});

test("sealed structural implementations, property orders and node shapes are lookups of fixed records", () => {
  const { sealed, files, counts } = harness({ resolvesComponent: false });
  const before = counts.policy;
  const none = sealed.structuralImplementations(holder.targetType);
  assert.equal(none.length === 0 && Object.isFrozen(none), true, "a type without implementations reads the fixed empty record");
  assert.equal(sealed.structuralImplementations(integer) === none, true, "non-named types read the same fixed record");
  const node = sealed.resolveNode(files.holder);
  assert.equal(node !== undefined && sealed.resolveNode(files.holder) === node, true, "node shape identity is stable");
  const order = sealed.propertyOrder(node, undefined, "keys");
  assert.equal(order.kind === "rejected" && sealed.propertyOrder(node, undefined, "keys") === order, true,
    "an unproven property order is one fixed rejection");
  const foreign = { ...node, members: [...node.members] };
  const missing = sealed.propertyOrder(foreign, undefined, "keys");
  assert.equal(missing.kind === "rejected" && sealed.propertyOrder(foreign, undefined, "values") === missing, true,
    "a shape outside the sealed index reads one fixed rejection");
  const assignment = sealed.assignmentSourceOrder(foreign);
  assert.equal(assignment.kind === "rejected" && sealed.assignmentSourceOrder(foreign) === assignment, true,
    "a missing assignment-source order is one fixed rejection");
  assert.equal(sealed.knownShapes() === sealed.knownShapes(), true, "the catalog is one published array");
  assert.equal(counts.policy, before, "no native policy query after seal");
});

test("structural implementations are materialized at seal and an unrecorded instantiation fails closed", () => {
  const symbol = {};
  const sourceType = {};
  const carrier = (id, argument) => ({ kind: "target-named", id, csharpStructuralContract: true,
    ...(argument === undefined ? {} : { typeArguments: [argument] }) });
  const shape = targetType => ({ targetType, sourceType, members: [{ ...member(integer), sourceSubjects: [symbol] }] });
  const source = shape(carrier("tsonic.shape:source"));
  const destination = shape(carrier("tsonic.shape:destination"));
  const shapes = new Map([source, destination].map(value => [targetTypeRefKey(value.targetType), value]));
  let closed = false;
  let queries = 0;
  const policy = {
    ast: { is: { IsObjectLiteralExpression: () => false }, forEachChild: () => {}, parent: () => undefined,
      properties: () => [], authoredRange: () => ({ kind: "unauthored" }) },
    sourceFiles: [], typeDefinitions: emptyCsharpTypeDefinitions,
    objectShapes: {
      resolveTarget: type => { assert.equal(closed, false, "native selection precedes publication"); queries += 1; return shapes.get(targetTypeRefKey(type)); },
      resolveCopyShape: () => { assert.equal(closed, false, "copy selection precedes publication"); return undefined; },
    },
    projectTypes: { directSupertypes: () => [] },
    semanticsFor: () => ({ types: { expressionType: () => sourceType, structuralMembers: () => ({
      kind: "available", destination: { calls: [], constructs: [], indexes: [] }, members: [{ kind: "present",
        source: { property: { symbol, rootSymbols: [] }, declarations: [] },
        destination: { property: { symbol, rootSymbols: [] }, declarations: [] },
      }],
    }) } }),
  };
  const builder = analyzeCsharpObjectShapes(policy, { targetTypes: [], compileTimeMetadata: { get: () => false } },
    { selectedCall: { get: () => undefined }, selectedConstruction: { get: () => undefined } });
  assert.equal(builder.registerStructuralInterface({}, source.targetType, destination.targetType), true, "structural interface admitted");
  const sealed = builder.seal();
  closed = true;
  const before = queries;
  const selected = sealed.structuralImplementations(source.targetType);
  assert.equal(selected.length === 1 && Object.isFrozen(selected), true, "one immutable implementation record");
  assert.equal(sealed.structuralImplementations(source.targetType) === selected, true, "no substitution per read");
  assert.equal(sealed.structuralImplementations({ ...source.targetType }) === selected, true, "the record is keyed by exact type identity");
  assert.equal(selected[0].interfaceType.id === destination.targetType.id, true, "the implementation names its interface");
  assert.throws(() => sealed.structuralImplementations(carrier("tsonic.shape:source", integer)),
    /no structural-implementation record for 'target:tsonic\.shape:source<source:int64>'/u,
    "an owner instantiation no producer demanded fails instead of being substituted late");
  assert.equal(queries, before, "no native query after seal");
});
