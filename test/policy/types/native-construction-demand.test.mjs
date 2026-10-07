import assert from "node:assert/strict";
import test from "node:test";
import { providerVirtualDeclarationFactKey, sourcePrimitiveFactKey } from "@tsonic/tsts";
import { createCsharpNativeConstructionDemandQuery } from "../../../dist/policy/types/objects/native-construction-demand.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/nullable.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { maximumCsharpMetadataEntries } from "../../../dist/target-model/metadata/immutable.js";
import { csharpStringTargetType } from "../../../dist/target-model/types/scalar-types.js";
import { csharpTsValueTargetType } from "../../../dist/target-model/types/runtime-carriers.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int64" });
const floating = Object.freeze({ kind: "source-primitive", name: "float64" });
const boolean = Object.freeze({ kind: "source-primitive", name: "bool" });
const native = Object.freeze({ kind: "target-named", id: "native.Counters" });
const structural = Object.freeze({ kind: "target-named", id: "source.Shape" });

function fixture() {
  const sourceFile = {};
  const rows = new Map();
  const providers = new Map();
  const nodes = [];
  const subjects = [];
  const nodeSubjects = new Map();
  const subjectTypes = new Map();
  const incoming = new Map();
  const existing = new Map();
  const explicit = new Set();
  const unresolved = new Map();
  const fresh = new Set();
  const foreign = new Set();
  const originFailures = new Map();
  const primitive = {};
  let failure;
  let relationshipQueries = 0;
  const row = (fields, target = structural, options = {}) => {
    const type = {};
    const selections = fields.map((field, index) => {
      const property = { name: `checked-${index}`, type: primitive, symbol: {}, rootSymbols: [],
        optional: field.optional ?? false, readonly: field.readonly ?? false };
      const member = { sourceKey: { kind: "property", name: `checked-${index}` }, sourceName: `checked-${index}`,
        sourceSubjects: [property.symbol], sourceTypes: [primitive],
        targetName: `${target.id}-${index}`, type: field.carrier ?? integer, memberKind: "property",
        ...(field.optional ? { optional: true } : {}),
        ...(options.provider ? { exactNumericStorage: true } : {}), ...field.member };
      return { identity: field.identity, property, symbol: property.symbol, rootSymbols: [], declarations: [],
        getters: [], setters: [], read: field.read ?? "property", member };
    });
    const shape = { sourceType: type, targetType: target, members: selections.map(field => field.member),
      ...(options.provider ? { constructible: true } : {}), ...options.shape };
    rows.set(type, { fields: selections, shape, calls: options.calls ?? [], constructs: options.constructs ?? [],
      indexes: options.indexes ?? [] });
    if (options.provider) providers.set(type, { target });
    return type;
  };
  const subject = (type, projection = []) => {
    const node = {};
    const value = Object.freeze({ kind: "value", node, projection });
    nodes.push(node);
    subjects.push(value);
    nodeSubjects.set(node, value);
    subjectTypes.set(value, type);
    incoming.set(value, []);
    return value;
  };
  const alias = value => {
    const node = {};
    nodes.push(node);
    nodeSubjects.set(node, value);
    return node;
  };
  const semantics = {
    sourceFile,
    facts: { typeSubjects: type => [type] },
    declarations: { symbolDeclarations: () => [] },
    types: {
      isUnion: type => type.union !== undefined,
      unionOrIntersectionTypes: type => type.union,
      isNullish: type => type.absent === true,
      isNumberLike: type => type === primitive,
      propertyInfos: type => rows.get(type)?.fields.map(field => field.property) ?? [],
      expressionType: node => subjectTypes.get(nodeSubjects.get(node)),
      isIdentical: (source, destination) => source === destination,
      constructSignatures: type => rows.get(type)?.constructs ?? [],
      structuralMembers(source, destination) {
        relationshipQueries += 1;
        const from = rows.get(source);
        const to = rows.get(destination);
        if (from === undefined || to === undefined) return { kind: "unavailable" };
        return { kind: "available", source: { type: source, ...from }, destination: { type: destination, ...to },
          members: to.fields.map(expected => {
            const actual = from.fields.find(field => field.identity === expected.identity);
            return actual === undefined ? { kind: "absent", destination: expected }
              : { kind: "present", source: actual, destination: expected };
          }) };
      },
    },
  };
  const host = {
    ast: { is: { IsObjectLiteralExpression: node => fresh.has(node) }, properties: node => node.properties ?? [] },
    navigation: { isProjectDeclaration: node => !foreign.has(node) },
    providers: { resolveType(fact) { return { kind: "resolved", relations: [{ kind: "type",
      objectLiteralConstruction: { kind: "object-initializer" }, targetBinding: fact.target }] }; } },
    sourceFacts: { getFact(value, key) {
      return key === providerVirtualDeclarationFactKey ? providers.get(value)
        : key === sourcePrimitiveFactKey && explicit.has(value) ? { name: "float64" } : undefined;
    } },
    semanticsFor: () => semantics,
    semantics: () => semantics,
    resolveShape: (type, file, authoredTypeRoot) => {
      const row = rows.get(type);
      return row?.requiresAuthoredRoot && !fresh.has(authoredTypeRoot) ? undefined : row?.shape;
    },
    scopedTargetType: node => existing.get(node),
    retainSourceShape: (node, type, shape) => shape,
  };
  const storage = {
    invocations: [],
    subjects, nodes, failureReason: () => failure,
    subjectFor: node => nodeSubjects.has(node) ? { kind: "resolved", subject: nodeSubjects.get(node) }
      : { kind: "unresolved", reason: "outside exact graph" },
    typeFor: value => unresolved.has(value) ? { kind: "unresolved", reason: unresolved.get(value) }
      : { kind: "resolved", type: subjectTypes.get(value), sourceFile },
    incomingFor: value => ({ kind: "resolved", subjects: incoming.get(value) ?? [] }),
    originsFor(value) {
      if (originFailures.has(value)) return { kind: "unresolved", reason: originFailures.get(value) };
      const visited = new Set();
      const origins = [];
      const pending = [value];
      for (const current of pending) {
        if (visited.has(current)) continue;
        visited.add(current);
        const parents = incoming.get(current) ?? [];
        if (parents.length === 0) origins.push({ subject: current, type: subjectTypes.get(current), sourceFile });
        else pending.push(...parents);
      }
      return origins.length === 0 ? { kind: "unresolved", reason: "A source storage cycle has no proven original owner." }
        : { kind: "resolved", origins };
    },
  };
  return { row, subject, alias, host, storage, rows, existing, explicit, primitive, unresolved, semantics, foreign, originFailures,
    literal(type, properties = [], projection = []) {
      const value = subject(type, projection);
      fresh.add(value.node);
      value.node.properties = properties;
      rows.get(type).requiresAuthoredRoot = true;
      return value;
    },
    connect(origin, destination) { incoming.get(destination).push(origin); },
    freeze: () => createCsharpNativeConstructionDemandQuery(storage, host),
    fail(value) { failure = value; },
    queryCount: () => relationshipQueries };
}

test("native demand selects the literal producer and every sibling alias through exact shared transport", () => {
  const value = fixture();
  const expectedType = value.row([{ identity: "user" }, { identity: "system" }], native, { provider: true });
  const actualType = value.row([{ identity: "system" }, { identity: "user" }]);
  const producer = value.subject(actualType);
  const variable = value.subject(actualType);
  const sibling = value.subject(actualType);
  const destination = value.subject(expectedType);
  const read = value.alias(sibling);
  value.connect(producer, variable);
  value.connect(variable, destination);
  value.connect(variable, sibling);
  value.existing.set(variable.node, structural);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  for (const node of [producer.node, variable.node, sibling.node, destination.node, read]) {
    assert.equal(selected.constructionFor(node)?.targetType === native, true, "one original native allocation/carrier");
    assert.equal(selected.constructionFor(node)?.shape.sourceType === expectedType, true, "exact provider destination identity");
  }
  const queries = value.queryCount();
  selected.constructionFor(read);
  selected.constructionFor(producer.node);
  assert.equal(value.queryCount(), queries, "frozen lookup does not rerun checking");
  assert.equal(Object.isFrozen(selected), true);
  assert.equal(Object.isFrozen(selected.issues), true);
});

test("native demand keeps optional fields absent and collapses null/undefined into one native absence", () => {
  const value = fixture();
  const expectedType = value.row([{ identity: "user" },
    { identity: "system", optional: true, carrier: csharpNullableTargetType(integer) }], native, { provider: true });
  const actualType = value.row([{ identity: "user" }]);
  const producer = value.subject(actualType);
  const absent = { absent: true };
  const alias = value.subject({ union: [actualType, absent, { absent: true }] });
  const destination = value.subject({ union: [expectedType, absent] });
  value.connect(producer, alias);
  value.connect(alias, destination);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(producer.node)?.targetType === native, true);
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(selected.constructionFor(alias.node)?.targetType), native), true);
  assert.equal(selected.constructionFor(alias.node) === selected.constructionFor(destination.node), true, "one nullable native carrier");
  assert.equal(selected.constructionFor(alias.node)?.shape.members[1].optional, true);
  assert.equal(selected.constructionFor(alias.node)?.shape.targetType === native, true, "absence belongs to value storage, not the object contract");
  assert.equal(selected.constructionFor(alias.node)?.shape === selected.constructionFor(producer.node)?.shape, true,
    "present and absent storage share one exact object contract");
  assert.equal(Object.isFrozen(selected.constructionFor(alias.node)), true);
});

test("native numeric demand selects full int64 storage but cannot override an explicit marker", () => {
  for (const explicit of [false, true]) {
    const value = fixture();
    const expectedType = value.row([{ identity: "user" }], native, { provider: true });
    const actualType = value.row([{ identity: "user", carrier: floating }]);
    const producer = value.subject(actualType);
    const destination = value.subject(expectedType);
    value.connect(producer, destination);
    if (explicit) value.explicit.add(value.primitive);
    const selected = value.freeze();
    assert.equal(selected.issues.length !== 0, explicit, "explicit authored storage remains authoritative");
    assert.equal(selected.constructionFor(producer.node) === undefined, explicit);
    if (!explicit) assert.equal(selected.constructionFor(producer.node)?.shape.members[0].type === integer, true);
  }
});

test("native demand rejects conflicting native targets rather than choosing the first", () => {
  const value = fixture();
  const first = value.row([{ identity: "user" }], native, { provider: true });
  const second = value.row([{ identity: "user" }], { kind: "target-named", id: "native.Other" }, { provider: true });
  const producer = value.subject(value.row([{ identity: "user" }]));
  value.connect(producer, value.subject(first));
  value.connect(producer, value.subject(second));
  const selected = value.freeze();
  assert.equal(selected.issues.some(issue => /incompatible native construction carriers/.test(issue.message)), true);
  assert.equal(selected.constructionFor(producer.node) === undefined, true, "no partial or arbitrary carrier");
  assert.equal(Object.isFrozen(selected.issues[0]), true);
});

test("native demand rejects lost members, accessors, methods, incompatible storage and nominal allocations", () => {
  const cases = [
    { fields: [{ identity: "user" }, { identity: "extra" }] },
    { fields: [] },
    { fields: [{ identity: "user", read: "accessor" }] },
    { fields: [{ identity: "user", member: { accessor: { getter: true, setter: true } } }] },
    { fields: [{ identity: "user", member: { memberKind: "method" } }] },
    { fields: [{ identity: "user", member: { bound: true } }] },
    { fields: [{ identity: "user", carrier: boolean }] },
    { fields: [{ identity: "user", optional: true, carrier: csharpNullableTargetType(integer) }] },
    { fields: [{ identity: "user" }], options: { calls: [{}] } },
    { fields: [{ identity: "user" }], options: { indexes: [{}] } },
    ...["class", "struct", "enum"].map(kind => ({ fields: [{ identity: "user" }],
      target: { kind: "target-named", id: "source.Nominal", csharpSourceDeclarationKind: kind } })),
    { fields: [{ identity: "user" }], options: { shape: { sourceType: undefined } } },
  ];
  for (const [index, control] of cases.entries()) {
    const value = fixture();
    const expectedType = value.row([{ identity: "user" }], native, { provider: true });
    const actualType = value.row(control.fields, control.target ?? structural, control.options ?? {});
    const producer = value.subject(actualType);
    value.connect(producer, value.subject(expectedType));
    const selected = value.freeze();
    assert.equal(selected.issues.length > 0, true, `control ${index}`);
    assert.equal(selected.constructionFor(producer.node) === undefined, true, `control ${index} rejects before emission`);
  }
});

test("native demand uses exact selected subjects, not matching names or storage positions", () => {
  const value = fixture();
  const expectedType = value.row([{ identity: "user" }], native, { provider: true });
  const actualType = value.row([{ identity: "user" }]);
  value.rows.get(actualType).shape.members[0].sourceSubjects = [{}];
  const producer = value.subject(actualType);
  value.connect(producer, value.subject(expectedType));
  const selected = value.freeze();
  assert.equal(selected.issues.length > 0, true);
  assert.equal(selected.constructionFor(producer.node) === undefined, true);
});

test("native demand rejects incompatible preselected storage and accepts exactly the same carrier", () => {
  for (const conflict of [false, true]) {
    const value = fixture();
    const expectedType = value.row([{ identity: "user" }], native, { provider: true });
    const producer = value.subject(value.row([{ identity: "user" }]));
    value.connect(producer, value.subject(expectedType));
    value.existing.set(producer.node, conflict ? { kind: "target-named", id: "selected.Other" } : native);
    const selected = value.freeze();
    assert.equal(selected.issues.length !== 0, conflict);
    assert.equal(selected.constructionFor(producer.node) === undefined, conflict);
  }
});

test("unrelated unresolved storage is ignored but demanded unresolved storage is rejected", () => {
  for (const demanded of [false, true]) {
    const value = fixture();
    const expectedType = value.row([{ identity: "user" }], native, { provider: true });
    const producer = value.subject(value.row([{ identity: "user" }]));
    value.unresolved.set(producer, "missing exact checked origin");
    const destination = value.subject(expectedType);
    if (demanded) value.connect(producer, destination);
    const selected = value.freeze();
    assert.equal(selected.issues.length !== 0, demanded);
    if (demanded) assert.equal(selected.issues[0].message, "missing exact checked origin");
  }
});

test("native demand checks cycles and diamonds once per canonical storage subject", () => {
  const value = fixture();
  const expectedType = value.row([{ identity: "user" }], native, { provider: true });
  const actualType = value.row([{ identity: "user" }]);
  const producer = value.subject(actualType);
  const left = value.subject(actualType);
  const right = value.subject(actualType);
  const destination = value.subject(expectedType);
  for (const [from, to] of [[producer, left], [producer, right], [left, destination],
    [right, destination], [left, producer]]) value.connect(from, to);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(value.queryCount(), 1, "one structural compatibility proof; the identical native shape is already sealed");
  assert.equal(selected.constructionFor(producer.node)?.targetType === native, true);
});

test("constructor-valued native types do not demand object-literal instance members", () => {
  const value = fixture();
  const constructor = value.row([], native, { provider: true, constructs: [{}] });
  const producer = value.subject(constructor);
  value.host.resolveShape = () => { throw new Error("constructor type must not instantiate instance fields"); };
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(producer.node) === undefined, true);
});

test("native demand rejects multi-carrier unions rather than silently choosing one", () => {
  const value = fixture();
  const expectedType = value.row([{ identity: "user" }], native, { provider: true });
  const first = value.row([{ identity: "user" }]);
  const second = value.row([{ identity: "user" }]);
  const producer = value.subject({ union: [first, second] });
  value.connect(producer, value.subject(expectedType));
  const selected = value.freeze();
  assert.equal(selected.issues.some(issue => /one exact non-absent/.test(issue.message)), true);
  assert.equal(selected.constructionFor(producer.node) === undefined, true);
});

test("a native component demand cannot replace its enclosing container's carrier", () => {
  const value = fixture();
  const expectedType = value.row([{ identity: "user" }], native, { provider: true });
  const element = value.subject(value.row([{ identity: "user" }]));
  const container = value.subject(expectedType, [{ kind: "array-element" }]);
  value.connect(element, container);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(element.node)?.targetType === native, true);
  assert.equal(selected.constructionFor(container.node) === undefined, true, "projection is not whole-object storage");
});

test("native demand preserves transport and immutable metadata budget failures", () => {
  const value = fixture();
  const producer = value.subject(value.row([{ identity: "user" }], native, { provider: true }));
  value.fail("shared source storage exceeds its finite query budget");
  let selected = value.freeze();
  assert.equal(selected.issues.some(issue => /shared source storage/.test(issue.message)), true);
  assert.equal(selected.constructionFor(producer.node) === undefined, true);
  value.fail(undefined);
  value.semantics.facts.typeSubjects = type => Array(maximumCsharpMetadataEntries).fill(type);
  selected = value.freeze();
  assert.equal(selected.issues.some(issue => /finite target metadata budget/.test(issue.message)), true);
  assert.equal(selected.constructionFor(producer.node) === undefined, true);
});

test("empty native construction retains exact authored origins through aliases, returns and cycles", () => {
  const value = fixture();
  const expectedType = value.row([{ identity: "user", optional: true }, { identity: "system", optional: true }],
    native, { provider: true });
  const actualType = value.row([]);
  const producer = value.literal(actualType);
  const binding = value.subject(actualType);
  const returned = value.subject(actualType);
  const sibling = value.subject(actualType);
  const destination = value.subject(expectedType);
  value.connect(producer, binding);
  value.connect(binding, returned);
  value.connect(returned, sibling);
  value.connect(sibling, binding);
  value.connect(returned, destination);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  for (const subject of [producer, binding, returned, sibling, destination]) {
    assert.equal(selected.constructionFor(subject.node)?.targetType === native, true, "one native allocation and carrier");
  }
  const queries = value.queryCount();
  selected.constructionFor(sibling.node);
  assert.equal(value.queryCount(), queries, "finalized provenance has no runtime or late checker work");
});

test("a shared empty semantic type cannot transfer fresh-allocation authority to an open parameter", () => {
  const value = fixture();
  const expectedType = value.row([{ identity: "user", optional: true }], native, { provider: true });
  const actualType = value.row([]);
  const producer = value.literal(actualType);
  const open = value.subject(actualType);
  const destination = value.subject(expectedType);
  value.connect(producer, destination);
  value.connect(open, destination);
  const selected = value.freeze();
  assert.equal(selected.issues.some(issue => issue.node === open.node), true, "open parameter is rejected independently");
  assert.equal(selected.issues.some(issue => issue.node === producer.node), false, "fresh owner remains exactly proven");
  assert.equal(selected.constructionFor(producer.node) === undefined, true, "failed analysis publishes no partial selection");
});

test("native indexed construction preserves empty allocation provenance and exact native aliases", () => {
  const value = fixture();
  const expectedType = value.row([], native, { provider: true, indexes: [{}] });
  const actualType = value.row([]);
  const producer = value.literal(actualType);
  const alias = value.subject(actualType);
  const destination = value.subject(expectedType);
  const nativeAlias = value.subject(expectedType);
  value.connect(producer, alias);
  value.connect(alias, destination);
  value.connect(destination, nativeAlias);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  for (const subject of [producer, alias, destination, nativeAlias]) {
    assert.equal(selected.constructionFor(subject.node)?.targetType === native, true, "one native indexed allocation");
  }
});

test("native indexed construction rejects open, populated and incompatible indexed sources", () => {
  for (const control of ["open", "populated", "indexed", "required", "conflicting"]) {
    const value = fixture();
    const expectedType = value.row(control === "required" ? [{ identity: "required" }] : [], native,
      { provider: true, indexes: [{}] });
    const actualType = value.row(control === "populated" ? [{ identity: "extra" }] : [], structural,
      control === "indexed" ? { indexes: [{}] } : {});
    const producer = control === "open" ? value.subject(actualType) : value.literal(actualType);
    value.connect(producer, value.subject(expectedType));
    if (control === "conflicting") {
      value.connect(producer, value.subject(value.row([], { kind: "target-named", id: "native.Other" },
        { provider: true, indexes: [{}] })));
    }
    const selected = value.freeze();
    assert.equal(selected.issues.length > 0, true, control);
    assert.equal(selected.constructionFor(producer.node) === undefined, true, control);
  }
});

test("empty alias transport uses exact checker identity while literal ownership keeps expression identity", () => {
  for (const identical of [false, true]) {
    const value = fixture();
    const expectedType = value.row([{ identity: "user", optional: true }], native, { provider: true });
    const literalType = value.row([]);
    const bindingType = value.row([]);
    const producer = value.literal(literalType);
    const binding = value.subject(bindingType);
    value.connect(producer, binding);
    value.connect(binding, value.subject(expectedType));
    value.semantics.types.isIdentical = (source, destination) => source === destination ||
      identical && source === bindingType && destination === literalType;
    const selected = value.freeze();
    assert.equal(selected.issues.length === 0, identical, "only exact checked regular/fresh equivalence admits transport");
    assert.equal(selected.constructionFor(binding.node)?.targetType === native, identical);
  }
});

test("fresh expression queries may return noninterned but exactly checker-identical types", () => {
  const value = fixture();
  const expectedType = value.row([{ identity: "user", optional: true }], native, { provider: true });
  const actualType = value.row([]);
  const producer = value.literal(actualType);
  value.connect(producer, value.subject(expectedType));
  value.semantics.types.expressionType = () => ({ equivalentTo: actualType });
  value.semantics.types.isIdentical = (source, destination) => source === destination || source.equivalentTo === destination;
  assert.equal(value.semantics.types.expressionType(producer.node) === value.semantics.types.expressionType(producer.node), false);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(producer.node)?.targetType === native, true);
});

test("empty native construction rejects nonfresh, foreign, projected, mixed and unresolved origins", () => {
  const controls = [
    (value, type) => value.subject(type),
    (value, type) => { const owner = value.literal(type); value.foreign.add(owner.node); return owner; },
    (value, type) => value.literal(type, [], [{ kind: "array-element" }]),
    (value, type) => value.literal(type, [{}]),
    (value, type) => {
      const owner = value.literal(type);
      value.semantics.types.expressionType = () => ({});
      return owner;
    },
    (value, type) => {
      const owner = value.subject(type);
      value.connect(value.literal(type), owner);
      value.connect(value.subject(type), owner);
      return owner;
    },
    (value, type) => { const owner = value.subject(type); value.connect(owner, owner); return owner; },
    (value, type) => {
      const owner = value.literal(type);
      value.originFailures.set(owner, "exact origin evidence exceeds its bounded budget");
      return owner;
    },
  ];
  for (const [index, control] of controls.entries()) {
    const value = fixture();
    const expectedType = value.row([{ identity: "user", optional: true }], native, { provider: true });
    const actualType = value.row([]);
    const producer = control(value, actualType);
    value.connect(producer, value.subject(expectedType));
    const selected = value.freeze();
    assert.equal(selected.issues.length > 0, true, `origin control ${index}`);
    assert.equal(selected.constructionFor(producer.node) === undefined, true, `origin control ${index} fails closed`);
  }
});

test("fresh empty origins retain required-field, callable, indexed and preselected-storage rejection", () => {
  const controls = [
    { required: true },
    { calls: [{}] },
    { indexes: [{}] },
    { shape: { methodImplementation: {} } },
    { shape: { targetType: { ...structural, csharpSourceDeclarationKind: "class" } } },
    { selected: { kind: "pointer", pointee: native } },
  ];
  for (const [index, control] of controls.entries()) {
    const value = fixture();
    const expectedType = value.row([{ identity: "user", optional: !control.required }], native, { provider: true });
    const actualType = value.row([], structural, control);
    const producer = value.literal(actualType);
    value.connect(producer, value.subject(expectedType));
    if (control.selected !== undefined) value.existing.set(producer.node, control.selected);
    const selected = value.freeze();
    assert.equal(selected.issues.length > 0, true, `storage control ${index}`);
    assert.equal(selected.constructionFor(producer.node) === undefined, true, `storage control ${index} fails before emission`);
  }
});

test("fresh empty construction keeps nullable aliases and full-width provider fields unchanged", () => {
  const value = fixture();
  const expectedType = value.row([{ identity: "user", optional: true, carrier: csharpNullableTargetType(integer) }],
    native, { provider: true });
  const actualType = value.row([]);
  const producer = value.literal(actualType);
  const absent = { absent: true };
  const alias = value.subject({ union: [actualType, absent, { absent: true }] });
  value.connect(producer, alias);
  value.connect(value.subject(absent), alias);
  value.connect(alias, value.subject({ union: [expectedType, absent] }));
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(selected.constructionFor(alias.node)?.targetType), native), true);
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(selected.constructionFor(producer.node)?.shape.members[0].type), integer), true);
});

test("an existing exact empty native carrier needs no fabricated literal allocation", () => {
  const value = fixture();
  const type = value.row([], native, { provider: true });
  const parameter = value.subject(type);
  value.storage.originsFor = () => { throw new Error("an exact native carrier needs no new construction origin"); };
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(parameter.node)?.targetType === native, true);
});

test("native opaque reference fields retain string payloads without admitting numeric heap boxing", () => {
  for (const [sourceCarrier, accepted] of [[csharpStringTargetType(), true], [integer, false],
    [floating, false], [boolean, false], [{ kind: "tuple", elements: [integer] }, false]]) {
    const value = fixture();
    const expectedType = value.row([{ identity: "user", carrier: csharpTsValueTargetType() }], native, { provider: true });
    const actualType = value.row([{ identity: "user", carrier: sourceCarrier }]);
    const producer = value.subject(actualType);
    value.connect(producer, value.subject(expectedType));
    const selected = value.freeze();
    assert.equal(selected.issues.length === 0, accepted, "only the native reference payload can retain its allocation");
    assert.equal(selected.constructionFor(producer.node) !== undefined, accepted, "no partial publication or boxed numeric storage");
  }
});

test("native storage publication requires exact source-member correspondence", () => {
  const value = fixture();
  const expectedType = value.row([{ identity: "user" }], native, { provider: true });
  const producer = value.subject(value.row([{ identity: "user" }]));
  value.connect(producer, value.subject(expectedType));
  value.host.retainSourceShape = () => undefined;
  const selected = value.freeze();
  assert.equal(selected.issues.some(issue => /source-member correspondence/u.test(issue.message)), true,
    "construction compatibility does not substitute for exact read/write correspondence");
  assert.equal(selected.constructionFor(producer.node) === undefined, true, "incomplete publication fails closed");
});
