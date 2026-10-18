import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpObjectShapes } from "../../../dist/analysis/objects/analyze.js";
import { instantiateCsharpObjectShape } from "../../../dist/policy/types/objects/object-shape-policy/instantiation.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../dist/target-model/types/equality.js";
import { emptyCsharpTypeDefinitions } from "../../../dist/target-model/types/source-union-definitions.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { resolveCsharpOptionalStorage } from "../../../dist/target-model/types/carriers/optional-storage.js";
import { analyzeCsharpProjectCallableAdapters } from "../../../dist/analysis/project-types/callable-adapters.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/relations/resolver.js";

const integer = { kind: "source-primitive", name: "int64" };
const string = { kind: "source-primitive", name: "string" };
const parameter = { kind: "type-parameter", name: "Value", identity: "test.Shape.Value" };
const member = type => ({ sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "value",
  memberKind: "property", type });
const template = { targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "Shape", typeArguments: [parameter] }, members: [member(parameter)] };
const component = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "Shape", typeArguments: [integer] };
const holder = { targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "Holder" }, members: [member(component)] };

const refusesMutation = (mutate) => {
  try {
    mutate();
    return false;
  } catch (error) {
    return error instanceof TypeError;
  }
};

function harness({ resolvesComponent, shapeTemplate = template, aliases = [] }) {
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
    projectTypes: { directSupertypes: () => undefined, catalog: { definitionForTarget: () => undefined } },
    objectShapes: {
      resolveNode: native("resolveNode", node => node === files.holder ? holder : node === files.template ? shapeTemplate : undefined),
      resolveTarget: native("resolveTarget", type => {
        if (targetTypeRefEquals(type, holder.targetType)) return holder;
        if (aliases.some(alias => targetTypeRefEquals(type, alias))) return holder;
        if (targetTypeRefEquals(type, shapeTemplate.targetType)) return shapeTemplate;
        return resolvesComponent && targetTypeRefEquals(type, component) ? instantiateCsharpObjectShape(shapeTemplate, type) : undefined;
      }),
      resolveCopyShape: native("resolveCopyShape", () => undefined),
    },
  };
  const builder = analyzeCsharpObjectShapes(policy, { targetTypes: aliases, compileTimeMetadata: { get: () => false } },
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
    const undemanded = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "Shape", typeArguments: [argument] };
    assert.equal(sealed.resolveTarget(undemanded) === undefined, true, `undemanded ${targetTypeRefKey(undemanded)} is absent`);
  }
  assert.equal(sealed.resolveTarget(undefined) === undefined, true, "absent input is absent");
  assert.equal(counts.policy, before, "negative lookups make no native query");
});

test("one immutable completed target index retains alias keys and instantiated shapes without reindexing the catalog", () => {
  const alias = Object.freeze({ kind: "target-named", id: "HolderAlias", csharpAllowsRefLikeTypeArguments: Object.freeze([]) });
  for (const resolvesComponent of [false, true]) {
    const { sealed, counts, files } = harness({ resolvesComponent, aliases: [alias] });
    const before = counts.policy;
    const data = sealed.targetShapes;
    const adapters = analyzeCsharpProjectCallableAdapters({}, { declarationContracts: [] }, sealed,
      { runtimeDefault: { get: () => assert.fail("a graph without callable obligations never resolves defaults") } },
      { get: () => assert.fail("a graph without callable obligations never derives native projection metadata") });
    assert.equal(adapters.objectShapes.targetShapes === data, true,
      "the completed callable adapter publication retains the identical canonical data reference");
    assert.equal(Object.isFrozen(data), true, "the canonical completed exact-key publication is immutable");
    assert.equal(data[targetTypeRefKey(alias)] === sealed.resolveTarget(alias) &&
      data[targetTypeRefKey(alias)] === sealed.resolveTarget(holder.targetType), true,
    "a producer alias retains the identical published shape rather than being lost by a shape-target reindex");
    assert.equal(sealed.resolveNode(files.holder) === data[targetTypeRefKey(holder.targetType)] &&
      sealed.knownShapes().find(shape => targetTypeRefEquals(shape.targetType, holder.targetType)) ===
        data[targetTypeRefKey(holder.targetType)], true,
    "node and catalog consumers share that canonical completed physical carrier after subject merging");
    assert.equal(sealed.knownShapes().some(shape => targetTypeRefEquals(shape.targetType, alias)), false,
      "the alias is an actual index key, not a separate catalog declaration");
    assert.equal(data[targetTypeRefKey(component)] !== undefined &&
      data[targetTypeRefKey(component)] === sealed.resolveTarget(component), true,
    "the actual pre-seal completed generic instance is in the same index");
    assert.equal(sealed.resolveTarget(csharpNullableTargetType(component)) === data[targetTypeRefKey(component)], true,
      "the existing single native absence normalization selects that same exact record");
    const missing = { ...component, typeArguments: [string] };
    assert.equal(data[targetTypeRefKey(missing)] === undefined && sealed.resolveTarget(missing) === undefined, true,
      "an unrecorded instantiation remains absent, without a late native query");
    assert.equal(refusesMutation(() => { data[targetTypeRefKey(alias)] = undefined; }), true,
      "consumers cannot replace the canonical alias record");
    assert.equal(refusesMutation(() => { delete data[targetTypeRefKey(component)]; }), true,
      "consumers cannot delete a published instance");
    assert.equal(counts.policy, before, "all data and reader lookups share completed records without policy recomputation");
  }
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
  const carrier = (id, argument) => ({ kind: "target-named", csharpAllowsRefLikeTypeArguments: argument === undefined ? [] : [false], id, csharpStructuralContract: true,
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
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
    objectShapes: {
      resolveTarget: type => { assert.equal(closed, false, "native selection precedes publication"); queries += 1; return shapes.get(targetTypeRefKey(type)); },
      resolveCopyShape: () => { assert.equal(closed, false, "copy selection precedes publication"); return undefined; },
    },
    projectTypes: { directSupertypes: () => [], catalog: { definitionForTarget: () => undefined } },
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

test("a sealed generic instance owns frozen members, type parameters and captures and reads back canonically", () => {
  const capture = { declaration: {}, reference: {}, fieldName: "captured", type: parameter, mutable: false };
  const methodParameter = { identity: "test.Shape.pick.Item", name: "Item", constraints: [] };
  const rich = { targetType: template.targetType, members: [member(parameter), { ...member(parameter),
    sourceKey: { kind: "property", name: "pick" }, sourceName: "pick", targetName: "pick", memberKind: "method",
    typeParameters: [methodParameter] }],
  methodImplementation: { declaration: {}, identity: "test.Shape.methods", methods: [], captures: [capture] } };
  for (const resolvesComponent of [false, true]) {
    const { sealed } = harness({ resolvesComponent, shapeTemplate: rich });
    const instance = sealed.resolveTarget(component);
    const label = `(native ${resolvesComponent})`;
    assert.equal(instance !== undefined && instance.members.length === 2, true, `non-empty generic instance is published ${label}`);
    assert.equal(targetTypeRefEquals(instance.members[0].type, integer) &&
      targetTypeRefEquals(instance.methodImplementation.captures[0].type, integer), true, `member and capture are substituted ${label}`);
    for (const [name, mutate] of [
      ["root field", () => { instance.members = []; }],
      ["members array", () => instance.members.push(member(string))],
      ["members length", () => { instance.members.length = 0; }],
      ["member entry", () => { instance.members[0].type = string; }],
      ["type-parameter array", () => instance.members[1].typeParameters.push(methodParameter)],
      ["type-parameter entry", () => { instance.members[1].typeParameters[0].name = "Other"; }],
      ["method implementation", () => { instance.methodImplementation.identity = "other"; }],
      ["capture array", () => instance.methodImplementation.captures.push(capture)],
      ["capture entry", () => { instance.methodImplementation.captures[0].type = string; }],
    ]) {
      assert.equal(refusesMutation(mutate), true, `${name} refuses mutation ${label}`);
    }
    const again = sealed.resolveTarget(component);
    assert.equal(again === instance && again.members[0] === instance.members[0] &&
      targetTypeRefEquals(again.members[0].type, integer), true, `later reads return the same canonical record ${label}`);
    assert.equal(Object.isFrozen(rich.members) || Object.isFrozen(capture) || Object.isFrozen(capture.declaration), false,
      `borrowed template, capture and source node objects are not frozen ${label}`);
  }
});

test("a generic structural implementation is substituted once at seal into frozen owned payloads", () => {
  const element = { kind: "type-parameter", identity: "interface:Element", name: "Element" };
  const captured = { kind: "type-parameter", identity: "class:Element", name: "Element" };
  const sourceSymbol = {};
  const destinationSymbol = {};
  const sourceType = {};
  const destinationType = {};
  const optional = type => csharpNullableTargetType(type);
  const slot = type => ({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [false, false, false], id: "test.Slot", csharpSourceDeclarationKind: "interface",
    typeArguments: [type, resolveCsharpOptionalStorage({ kind: "optional", part: "operations", arguments: [element] }, type), optional(type)] });
  const field = (symbol, type) => ({ sourceName: "value", targetName: "value", sourceKey: { kind: "property", name: "value" },
    sourceSubjects: [symbol], memberKind: "property", type });
  const destinationTemplate = { targetType: slot(element), sourceType: destinationType, members: [field(destinationSymbol, optional(element))] };
  const destination = { targetType: slot(integer), sourceType: destinationType, members: [field(destinationSymbol, optional(integer))],
    declarationTemplate: destinationTemplate };
  const recordTemplate = { targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "test.Record", typeArguments: [captured] },
    members: [field(sourceSymbol, optional(captured))] };
  const source = { targetType: { kind: "target-named", csharpAllowsRefLikeTypeArguments: [false], id: "test.Record", typeArguments: [integer] },
    members: [field(sourceSymbol, optional(integer))], declarationTemplate: recordTemplate };
  const shapes = new Map([source, destination, recordTemplate, destinationTemplate].map(value => [targetTypeRefKey(value.targetType), value]));
  let closed = false;
  let queries = 0;
  const policy = {
    ast: { is: { IsObjectLiteralExpression: () => false }, forEachChild: () => {}, parent: () => undefined,
      properties: () => [], authoredRange: () => ({ kind: "unauthored" }) },
    sourceFiles: [], typeDefinitions: emptyCsharpTypeDefinitions,
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
    objectShapes: {
      resolveTarget: type => { assert.equal(closed, false, "native selection precedes publication"); queries += 1; return shapes.get(targetTypeRefKey(type)); },
      resolveCopyShape: () => { assert.equal(closed, false, "copy selection precedes publication"); return undefined; },
    },
    projectTypes: { directSupertypes: () => [], catalog: { definitionForTarget: () => undefined } },
    semanticsFor: () => ({ types: { expressionType: () => sourceType, structuralMembers: () => ({
      kind: "available", destination: { calls: [], constructs: [], indexes: [] }, members: [{ kind: "present",
        source: { property: { symbol: sourceSymbol, rootSymbols: [] }, declarations: [] },
        destination: { property: { symbol: destinationSymbol, rootSymbols: [] }, declarations: [] },
      }],
    }) } }),
  };
  const builder = analyzeCsharpObjectShapes(policy, { targetTypes: [], compileTimeMetadata: { get: () => false } },
    { selectedCall: { get: () => undefined }, selectedConstruction: { get: () => undefined } });
  assert.equal(builder.registerStructuralInterface({}, source.targetType, destination.targetType), true, "generic structural interface admitted");
  const sealed = builder.seal();
  closed = true;
  const before = queries;
  const selected = sealed.structuralImplementations(source.targetType);
  assert.equal(selected.length === 1 && selected[0].properties.length === 1, true, "one non-empty generic implementation");
  const [implementation] = selected;
  const [property] = implementation.properties;
  assert.equal(targetTypeRefEquals(implementation.sourceType, source.targetType) &&
    targetTypeRefEquals(implementation.interfaceType, slot(integer)) &&
    targetTypeRefEquals(property.member.type, optional(integer)), true, "the instance binding is substituted at seal");
  assert.equal([selected, implementation, implementation.properties, property, property.member, implementation.methods]
    .every(value => Object.isFrozen(value)), true, "every owned container and entry is frozen");
  for (const [name, mutate] of [
    ["implementation array", () => selected.push(implementation)],
    ["implementation entry", () => { implementation.interfaceType = source.targetType; }],
    ["properties array", () => implementation.properties.push(property)],
    ["properties length", () => { implementation.properties.length = 0; }],
    ["property entry", () => { property.sourceName = "other"; }],
    ["property member", () => { property.member.type = integer; }],
    ["methods array", () => implementation.methods.push(property)],
  ]) {
    assert.equal(refusesMutation(mutate), true, `${name} refuses mutation`);
  }
  const again = sealed.structuralImplementations({ ...source.targetType });
  assert.equal(again === selected && again[0].properties[0].member === property.member &&
    targetTypeRefEquals(again[0].properties[0].member.type, optional(integer)), true, "later reads return the same canonical record");
  assert.equal(Object.isFrozen(recordTemplate.members) || Object.isFrozen(sourceSymbol), false, "borrowed source objects are not frozen");
  assert.equal(queries, before, "no native query after seal");
});
