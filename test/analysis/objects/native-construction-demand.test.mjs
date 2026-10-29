import assert from "node:assert/strict";
import test from "node:test";
import { providerVirtualDeclarationFactKey, sourcePrimitiveFactKey } from "@tsonic/tsts";
import { createCsharpNativeConstructionDemandQuery } from "../../../dist/analysis/objects/native-construction-demand.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { maximumCsharpMetadataEntries } from "../../../dist/target-model/metadata/immutable.js";
import { csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpTsValueTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int64" });
const floating = Object.freeze({ kind: "source-primitive", name: "float64" });
const boolean = Object.freeze({ kind: "source-primitive", name: "bool" });
const native = Object.freeze({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "native.Counters" });
const structural = Object.freeze({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "source.Shape" });

function fixture() {
  const sourceFile = { kind: "file" };
  const rows = new Map();
  const providers = new Map();
  const nodes = [];
  const types = new Map();
  const contexts = new Map();
  const references = new Map();
  const existing = new Map();
  const explicit = new Set();
  const foreign = new Set();
  const primitive = {};
  let relationshipQueries = 0;
  const canonical = type => type?.equivalentTo ?? type;
  const row = (fields, target = structural, options = {}) => {
    const type = {};
    const selections = fields.map((field, index) => {
      const property = { name: `checked-${index}`, type: primitive, symbol: {}, rootSymbols: [],
        optional: field.optional ?? false, readonly: field.readonly ?? false };
      const member = { sourceKey: { kind: "property", name: `checked-${index}` }, sourceName: `checked-${index}`,
        sourceSubjects: [property.symbol], sourceTypes: [primitive], targetName: `${target.id}-${index}`,
        type: field.carrier ?? integer, memberKind: "property",
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
  const node = (type, context, kind = "literal") => {
    const selected = { kind, properties: Array(rows.get(canonical(type))?.fields.length ?? 0).fill({}) };
    nodes.push(selected);
    types.set(selected, type);
    if (context !== undefined) contexts.set(selected, context);
    return selected;
  };
  const semantics = {
    sourceFile,
    facts: { typeSubjects: type => [canonical(type)] },
    declarations: { symbolDeclarations: () => [] },
    types: {
      isUnion: type => type.union !== undefined,
      unionOrIntersectionTypes: type => type.union,
      isNullish: type => type.absent === true,
      isAny: type => type.any === true,
      isUnknown: type => type.unknown === true,
      isNumberLike: type => type === primitive,
      propertyInfos: type => rows.get(canonical(type))?.fields.map(field => field.property) ?? [],
      expressionType: selected => types.get(selected),
      contextualValueSelection: selected => contexts.has(selected)
        ? { kind: "selected", component: { selectedType: contexts.get(selected) } } : { kind: "unavailable" },
      isIdentical: (source, destination) => canonical(source) === canonical(destination),
      constructSignatures: type => rows.get(canonical(type))?.constructs ?? [],
      structuralMembers(source, destination, purpose) {
        assert.equal(purpose, "read", "construction requires readable members");
        relationshipQueries += 1;
        const from = rows.get(canonical(source));
        const to = rows.get(canonical(destination));
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
    sourceFiles: [sourceFile],
    ast: {
      is: {
        IsObjectLiteralExpression: selected => selected?.kind === "literal",
        IsVariableDeclaration: selected => selected?.kind === "variable",
        IsVariableDeclarationList: () => false,
        IsVariableStatement: () => false,
        IsParenthesizedExpression: () => false,
        IsBlock: () => false,
        IsBindingElement: () => false,
        IsReturnStatement: () => false,
        IsArrowFunction: () => false,
        IsFunctionExpression: () => false,
      },
      as: { AsVariableDeclaration: selected => selected?.kind === "variable" ? selected : undefined },
      parent: selected => selected?.parent,
      children: () => [],
      forEachChild: (selected, visit) => { if (selected === sourceFile) nodes.forEach(visit); },
      properties: selected => selected.properties ?? [],
    },
    navigation: {
      isProjectDeclaration: selected => !foreign.has(selected),
      referencesToDeclaration: selected => references.get(selected) ?? [],
    },
    providers: { resolveType(fact) { return { kind: "resolved", relations: [{ kind: "type",
      objectLiteralConstruction: { kind: "object-initializer" }, targetBinding: fact.target }] }; } },
    sourceFacts: { getFact(value, key) {
      return key === providerVirtualDeclarationFactKey ? providers.get(canonical(value))
        : key === sourcePrimitiveFactKey && explicit.has(value) ? { name: "float64" } : undefined;
    } },
    semanticsFor: () => semantics,
    resolveShape: type => {
      const shape = rows.get(canonical(type))?.shape;
      return shape === undefined || canonical(type) === type ? shape : { ...shape, sourceType: type };
    },
    resolveLiteralShape: shape => ({ kind: "resolved", shape }),
    scopedTargetType: selected => existing.get(selected),
    retainSourceShape: (_node, _type, shape) => shape,
  };
  return {
    row, node, rows, types, contexts, references, existing, explicit, primitive, foreign, semantics, host,
    declare(literal) {
      const declaration = { kind: "variable", Initializer: literal };
      literal.parent = declaration;
      types.set(declaration, types.get(literal));
      return declaration;
    },
    freeze: () => createCsharpNativeConstructionDemandQuery(host),
    queryCount: () => relationshipQueries,
  };
}

test("native construction uses the literal's declared context and freezes its lookup", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }, { identity: "system" }], native, { provider: true });
  const source = value.row([{ identity: "system" }, { identity: "user" }]);
  const literal = value.node(source, expected);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(literal)?.targetType === native, true, "one original native allocation");
  const queries = value.queryCount();
  selected.constructionFor(literal);
  assert.equal(value.queryCount(), queries, "sealed lookup does not recompute");
  assert.equal(Object.isFrozen(selected) && Object.isFrozen(selected.issues), true);
});

test("declared native construction preserves optional fields and one nullable alias state", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" },
    { identity: "system", optional: true, carrier: csharpNullableTargetType(integer) }], native, { provider: true });
  const source = value.row([{ identity: "user" }]);
  const literal = value.node(source, expected);
  const declaration = value.declare(literal);
  const reference = value.node({ union: [source, { absent: true }, { absent: true }] }, undefined, "reference");
  value.references.set(declaration, [reference]);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(selected.constructionFor(reference)?.targetType), native), true);
  assert.equal(selected.constructionFor(literal)?.shape.members[1].optional, true);
  assert.equal(selected.constructionFor(literal)?.shape === selected.constructionFor(reference)?.shape, true);
});

test("declared native numeric storage keeps int64 and cannot override an explicit marker", () => {
  for (const explicit of [false, true]) {
    const value = fixture();
    const expected = value.row([{ identity: "user" }], native, { provider: true });
    const literal = value.node(value.row([{ identity: "user", carrier: floating }]), expected);
    if (explicit) value.explicit.add(value.primitive);
    const selected = value.freeze();
    assert.equal(selected.issues.length !== 0, explicit, "explicit authored storage remains authoritative");
    assert.equal(selected.constructionFor(literal) === undefined, explicit);
    if (!explicit) assert.equal(selected.constructionFor(literal)?.shape.members[0].type === integer, true);
  }
});

test("unrelated native declarations never retarget the original literal", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const other = value.row([{ identity: "user" }], { ...native, id: "native.Other" }, { provider: true });
  const literal = value.node(value.row([{ identity: "user" }]), expected);
  value.node(other, undefined, "parameter");
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(literal)?.targetType === native, true, "only the literal's context selects storage");
});

test("declared native construction rejects lost fields, accessors, methods, incompatible widths and nominal storage", () => {
  const controls = [
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
      target: { ...structural, csharpSourceDeclarationKind: kind } })),
    { fields: [{ identity: "user" }], options: { shape: { sourceType: undefined } } },
  ];
  for (const [index, control] of controls.entries()) {
    const value = fixture();
    const expected = value.row([{ identity: "user" }], native, { provider: true });
    const literal = value.node(value.row(control.fields, control.target, control.options), expected);
    const selected = value.freeze();
    assert.equal(selected.issues.length > 0, true, `control ${index}: precise rejection`);
    assert.equal(selected.constructionFor(literal) === undefined, true, `control ${index}: no invalid publication`);
  }
});

test("native construction requires exact checked member subjects, not field spelling", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const source = value.row([{ identity: "user" }]);
  value.rows.get(source).shape.members[0].sourceSubjects = [{}];
  const literal = value.node(source, expected);
  const selected = value.freeze();
  assert.equal(selected.issues.length > 0, true);
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

test("native construction preserves an exact preselected carrier and rejects an incompatible one", () => {
  for (const conflict of [false, true]) {
    const value = fixture();
    const expected = value.row([{ identity: "user" }], native, { provider: true });
    const literal = value.node(value.row([{ identity: "user" }]), expected);
    value.existing.set(literal, conflict ? { ...native, id: "selected.Other" } : native);
    const selected = value.freeze();
    assert.equal(selected.issues.length !== 0, conflict);
    assert.equal(selected.constructionFor(literal) === undefined, conflict);
  }
});

test("an unrelated annotation issue never hides another literal's valid record", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user", optional: true }], native, { provider: true });
  const source = value.row([]);
  const valid = value.node(source, expected);
  const invalid = value.node(source);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 1);
  assert.equal(selected.issues[0].node === invalid, true);
  assert.equal(selected.issues[0].code, "TSONIC_UNTYPED_OBJECT_LITERAL");
  assert.equal(selected.constructionFor(valid)?.targetType === native, true);
  assert.equal(selected.constructionFor(invalid) === undefined, true);
});

test("construction never reads storage origins, incoming graphs, histories or global failure", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const literal = value.node(value.row([{ identity: "user" }]), expected);
  Object.defineProperty(value.host, "sourceStorage", { get() { assert.fail("no source-storage authority in construction"); } });
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(literal)?.targetType === native, true);
});

test("constructor-valued expressions do not instantiate object-literal fields", () => {
  const value = fixture();
  const constructor = value.row([], native, { provider: true, constructs: [{}] });
  const literal = value.node(constructor, constructor);
  value.host.resolveShape = () => { throw new Error("constructor must not instantiate instance fields"); };
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

test("unrelated checked values never instantiate native object shapes", () => {
  const value = fixture();
  const unrelated = value.node(value.row([{ identity: "field" }]), undefined, "parameter");
  value.host.resolveShape = () => { throw new Error("unrelated value cannot instantiate a shape"); };
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(unrelated) === undefined, true);
});

test("an untyped empty literal is not assigned an arbitrary native destination", () => {
  const value = fixture();
  const literal = value.node(value.row([]));
  value.node(value.row([], native, { provider: true }), undefined, "parameter");
  const selected = value.freeze();
  assert.equal(selected.issues[0].code, "TSONIC_UNTYPED_OBJECT_LITERAL");
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

test("declared native construction never chooses one arm of a multi-carrier source union", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const first = value.row([{ identity: "user" }]);
  const second = value.row([{ identity: "user" }]);
  const literal = value.node({ union: [first, second] }, expected);
  const selected = value.freeze();
  assert.equal(selected.issues.some(issue => issue.code === "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN"), true,
    "multiple present source carriers cannot gain a single native allocation by choosing an arm");
  assert.equal(selected.constructionFor(literal) === undefined, true, "no partial union construction published");
});

test("a native literal selection never replaces its enclosing container", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const literal = value.node(value.row([{ identity: "user" }]), expected);
  const container = value.node(value.row([{ identity: "other" }]), undefined, "container");
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(literal)?.targetType === native, true);
  assert.equal(selected.constructionFor(container) === undefined, true);
});

test("native member metadata retains its finite resource guard", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const valid = value.node(value.row([{ identity: "user" }]), expected);
  const source = value.row([{ identity: "user" }]);
  const member = value.rows.get(source).shape.members[0];
  value.rows.get(source).shape.members = Array(maximumCsharpMetadataEntries).fill(member);
  const invalid = value.node(source, expected);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 1, "one local resource failure");
  const issue = selected.issues[0];
  assert.equal(issue.code === "TSONIC_COMPILER_RESOURCE_LIMIT" && issue.node === invalid &&
    issue.message === `Native construction of this object literal exceeded the finite metadata limit of ${maximumCsharpMetadataEntries} entries.`,
    true, "resource exhaustion names the affected literal and actual limit, not unsupported source");
  assert.equal(selected.constructionFor(invalid) === undefined, true, "no unproved failed-node selection");
  assert.equal(selected.constructionFor(valid)?.targetType === native, true, "unrelated valid construction remains published");
});

test("native construction does not reclassify unrelated malformed metadata as resource exhaustion", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  value.node(value.row([{ identity: "user" }]), expected);
  const failure = new TypeError("C# immutable metadata requires plain data records.");
  value.semantics.types.structuralMembers = () => { throw failure; };
  assert.throws(() => value.freeze(), error => error === failure, "the original invalid-metadata failure is preserved");
});

test("declared empty construction keeps fresh expression identity without origin transport", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user", optional: true }], native, { provider: true });
  const source = value.row([]);
  const first = value.node(source, expected);
  const second = value.node(source, expected);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(first) !== undefined && selected.constructionFor(second) !== undefined, true);
  assert.equal(first === second, false, "each authored literal is a distinct runtime allocation");
});

test("an open parameter sharing the same checker type gains no allocation authority", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user", optional: true }], native, { provider: true });
  const source = value.row([]);
  const literal = value.node(source, expected);
  const parameter = value.node(source, undefined, "parameter");
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(literal)?.targetType === native, true);
  assert.equal(selected.constructionFor(parameter) === undefined, true);
});

test("observed callers cannot supply an untyped producer's annotation", () => {
  const value = fixture();
  const literal = value.node(value.row([]));
  value.node(value.row([], native, { provider: true }), undefined, "call");
  const selected = value.freeze();
  assert.equal(selected.issues[0].node === literal, true);
  assert.equal(selected.issues[0].code, "TSONIC_UNTYPED_OBJECT_LITERAL");
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

test("declared native indexed construction retains one exact allocation", () => {
  const value = fixture();
  const expected = value.row([], native, { provider: true, indexes: [{}] });
  const literal = value.node(value.row([]), expected);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(literal)?.targetType === native, true);
});

test("native indexed construction preserves populated, indexed and required-field safety refusals", () => {
  for (const control of ["populated", "indexed", "required"]) {
    const value = fixture();
    const expected = value.row(control === "required" ? [{ identity: "required" }] : [], native,
      { provider: true, indexes: [{}] });
    const source = value.row(control === "populated" ? [{ identity: "extra" }] : [], structural,
      control === "indexed" ? { indexes: [{}] } : {});
    const literal = value.node(source, expected);
    const selected = value.freeze();
    assert.equal(selected.issues.length > 0, true, control);
    assert.equal(selected.constructionFor(literal) === undefined, true, control);
  }
});

test("noninterned exactly checker-equivalent literal types remain supported", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user", optional: true }], native, { provider: true });
  const source = value.row([]);
  const literal = value.node(source, expected);
  value.semantics.types.expressionType = selected => selected === literal ? { equivalentTo: source } : value.types.get(selected);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(literal)?.targetType === native, true);
});

test("foreign literals are not reclassified by the project's construction owner", () => {
  const value = fixture();
  const expected = value.row([], native, { provider: true });
  const literal = value.node(value.row([]), expected);
  value.foreign.add(literal);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

test("declared empty construction retains required, callable, indexed, nominal and selected-storage refusals", () => {
  const controls = [
    { required: true }, { calls: [{}] }, { indexes: [{}] },
    { shape: { methodImplementation: {} } },
    { shape: { targetType: { ...structural, csharpSourceDeclarationKind: "class" } } },
    { selected: { kind: "pointer", pointee: native } },
  ];
  for (const [index, control] of controls.entries()) {
    const value = fixture();
    const expected = value.row([{ identity: "user", optional: !control.required }], native, { provider: true });
    const literal = value.node(value.row([], structural, control), expected);
    if (control.selected !== undefined) value.existing.set(literal, control.selected);
    const selected = value.freeze();
    assert.equal(selected.issues.length > 0, true, `storage control ${index}`);
    assert.equal(selected.constructionFor(literal) === undefined, true, `storage control ${index}: no publication`);
  }
});

test("optional native fields keep the full-width provider carrier", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user", optional: true, carrier: csharpNullableTargetType(integer) }],
    native, { provider: true });
  const literal = value.node(value.row([]), expected);
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(selected.constructionFor(literal)?.shape.members[0].type), integer), true);
});

test("an existing exact native parameter needs no new literal allocation record", () => {
  const value = fixture();
  const parameter = value.node(value.row([], native, { provider: true }), undefined, "parameter");
  const selected = value.freeze();
  assert.equal(selected.issues.length, 0);
  assert.equal(selected.constructionFor(parameter) === undefined, true, "declared native carrier is unchanged");
});

test("native opaque reference fields keep strings without numeric or tuple heap boxing", () => {
  for (const [sourceCarrier, accepted] of [[csharpStringTargetType(), true], [integer, false],
    [floating, false], [boolean, false], [{ kind: "tuple", elements: [integer] }, false]]) {
    const value = fixture();
    const expected = value.row([{ identity: "user", carrier: csharpTsValueTargetType() }], native, { provider: true });
    const literal = value.node(value.row([{ identity: "user", carrier: sourceCarrier }]), expected);
    const selected = value.freeze();
    assert.equal(selected.issues.length === 0, accepted, "native reference payload retains its allocation");
    assert.equal(selected.constructionFor(literal) !== undefined, accepted, "no numeric boxing or partial publication");
  }
});

test("native storage publication still requires exact source-member correspondence", () => {
  const value = fixture();
  const expected = value.row([{ identity: "user" }], native, { provider: true });
  const literal = value.node(value.row([{ identity: "user" }]), expected);
  value.host.retainSourceShape = () => undefined;
  const selected = value.freeze();
  assert.equal(selected.issues.some(issue => /source-member correspondence/u.test(issue.message)), true);
  assert.equal(selected.constructionFor(literal) === undefined, true);
});

test("consumed any is refused without a dynamic object-construction path", () => {
  const value = fixture();
  const literal = value.node(value.row([{ identity: "user" }]), { any: true });
  const selected = value.freeze();
  assert.equal(selected.issues[0].code, "TSONIC_ANY_UNSUPPORTED");
  assert.equal(selected.constructionFor(literal) === undefined, true);
});
