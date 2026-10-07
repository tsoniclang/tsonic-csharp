import assert from "node:assert/strict";
import test from "node:test";
import { providerVirtualDeclarationFactKey, sourcePrimitiveFactKey } from "@tsonic/tsts";
import { createCsharpNativeConstructionDemandQuery } from "../../../dist/policy/types/objects/native-construction-demand.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/nullable.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { maximumCsharpMetadataEntries } from "../../../dist/target-model/metadata/immutable.js";

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
    ast: {},
    providers: { resolveType(fact) { return { kind: "resolved", relations: [{ kind: "type",
      objectLiteralConstruction: { kind: "object-initializer" }, targetBinding: fact.target }] }; } },
    sourceFacts: { getFact(value, key) {
      return key === providerVirtualDeclarationFactKey ? providers.get(value)
        : key === sourcePrimitiveFactKey && explicit.has(value) ? { name: "float64" } : undefined;
    } },
    semanticsFor: () => semantics,
    resolveShape: type => rows.get(type)?.shape,
    scopedTargetType: node => existing.get(node),
  };
  const storage = {
    subjects, nodes, failureReason: () => failure,
    subjectFor: node => nodeSubjects.has(node) ? { kind: "resolved", subject: nodeSubjects.get(node) }
      : { kind: "unresolved", reason: "outside exact graph" },
    typeFor: value => unresolved.has(value) ? { kind: "unresolved", reason: unresolved.get(value) }
      : { kind: "resolved", type: subjectTypes.get(value) },
    incomingFor: value => ({ kind: "resolved", subjects: incoming.get(value) ?? [] }),
  };
  return { row, subject, alias, host, storage, rows, existing, explicit, primitive, unresolved, semantics,
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
    assert.equal(selected.shapeFor(node)?.targetType === native, true, "one original native allocation/carrier");
    assert.equal(selected.shapeFor(node)?.sourceType === expectedType, true, "exact provider destination identity");
  }
  const queries = value.queryCount();
  selected.shapeFor(read);
  selected.shapeFor(producer.node);
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
  assert.equal(selected.shapeFor(producer.node)?.targetType === native, true);
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(selected.shapeFor(alias.node)?.targetType), native), true);
  assert.equal(selected.shapeFor(alias.node) === selected.shapeFor(destination.node), true, "one nullable native carrier");
  assert.equal(selected.shapeFor(alias.node)?.members[1].optional, true);
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
    assert.equal(selected.shapeFor(producer.node) === undefined, explicit);
    if (!explicit) assert.equal(selected.shapeFor(producer.node)?.members[0].type === integer, true);
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
  assert.equal(selected.shapeFor(producer.node) === undefined, true, "no partial or arbitrary carrier");
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
    assert.equal(selected.shapeFor(producer.node) === undefined, true, `control ${index} rejects before emission`);
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
  assert.equal(selected.shapeFor(producer.node) === undefined, true);
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
    assert.equal(selected.shapeFor(producer.node) === undefined, conflict);
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
  assert.equal(value.queryCount(), 2, "one exact semantic type/shape compatibility proof");
  assert.equal(selected.shapeFor(producer.node)?.targetType === native, true);
});

test("constructor-valued native types do not demand object-literal instance members", () => {
  const value = fixture();
  const constructor = value.row([], native, { provider: true, constructs: [{}] });
  const producer = value.subject(constructor);
  value.host.resolveShape = () => { throw new Error("constructor type must not instantiate instance fields"); };
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.shapeFor(producer.node) === undefined, true);
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
  assert.equal(selected.shapeFor(producer.node) === undefined, true);
});

test("a native component demand cannot replace its enclosing container's carrier", () => {
  const value = fixture();
  const expectedType = value.row([{ identity: "user" }], native, { provider: true });
  const element = value.subject(value.row([{ identity: "user" }]));
  const container = value.subject(expectedType, [{ kind: "array-element" }]);
  value.connect(element, container);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.shapeFor(element.node)?.targetType === native, true);
  assert.equal(selected.shapeFor(container.node) === undefined, true, "projection is not whole-object storage");
});

test("native demand preserves transport and immutable metadata budget failures", () => {
  const value = fixture();
  const producer = value.subject(value.row([{ identity: "user" }], native, { provider: true }));
  value.fail("shared source storage exceeds its finite query budget");
  let selected = value.freeze();
  assert.equal(selected.issues.some(issue => /shared source storage/.test(issue.message)), true);
  assert.equal(selected.shapeFor(producer.node) === undefined, true);
  value.fail(undefined);
  value.semantics.facts.typeSubjects = type => Array(maximumCsharpMetadataEntries).fill(type);
  selected = value.freeze();
  assert.equal(selected.issues.some(issue => /finite target metadata budget/.test(issue.message)), true);
  assert.equal(selected.shapeFor(producer.node) === undefined, true);
});
