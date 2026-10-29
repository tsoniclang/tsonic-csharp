import assert from "node:assert/strict";
import test from "node:test";
import { providerVirtualDeclarationFactKey, sourcePrimitiveFactKey } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { createCsharpNativeConstructionDemandQuery } from "../../../dist/analysis/objects/native-construction-demand.js";
import { createCsharpObjectShapeMemberResolver } from "../../../dist/analysis/objects/shapes/member-evidence.js";
import { mergeCsharpObjectShapeSubjects } from "../../../dist/analysis/objects/shapes/construction.js";
import { createCsharpObjectLiteralShapeKey, sealCsharpObjectShapeClassifications } from "../../../dist/analysis/program/records/objects/object-shapes.js";
import { checkCsharpSource, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
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
  const shape = selected.constructionFor(literal).shape;
  assert.equal(Object.isFrozen(shape) && Object.isFrozen(shape.members) && shape.members.every(Object.isFrozen), true,
    "the exact native record and ordered checked members are immutable at their producer");
  assert.throws(() => shape.members.reverse(), TypeError, "sealed native field order cannot be rewritten");
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

function memberProvenanceFixture() {
  const checked = checkCsharpSource({ sourceText: `
    type Slot = { value?: number };
    type Other = { value?: number };
    type Required = { value: number };
    export const omitted: Slot = {};
    export const present: Slot = { value: 1 };
    export const other: Other = {};
    export const required: Required = { value: 1 };
    export const fresh: Slot = {};
  ` });
  assert.equal(checked.sourceDiagnosticsText, "", "all owner evidence comes from valid checked declarations");
  const source = createTargetSourceProgram(checked.source);
  const ast = source.ast;
  const declarations = new Map();
  const visit = node => {
    if (ast.is.IsVariableDeclaration(node)) declarations.set(ast.text(ast.name(node)), node);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  source.navigation.sourceFiles.forEach(visit);
  const queries = source.semantics.forNode(declarations.get("omitted"));
  const owner = name => queries.types.authoredType(ast.typeNode(declarations.get(name)));
  const actual = name => queries.types.expressionType(ast.as.AsVariableDeclaration(declarations.get(name)).Initializer);
  const resolver = createCsharpObjectShapeMemberResolver({});
  const member = ownerType => {
    const selected = queries.types.structuralMembers(ownerType, ownerType, "correspondence");
    assert.equal(selected.kind === "available" && selected.members.length === 1 && selected.members[0].kind === "present",
      true, "one checked declared property owns the native slot");
    const declared = selected.members[0].destination;
    const property = declared.property;
    return { sourceKey: { kind: "property", name: "value" }, sourceName: "value", targetName: "value",
      sourceSubjects: [property.symbol, ...property.rootSymbols, ...declared.declarations], sourceTypes: [property.type],
      memberKind: "property", type: property.optional ? csharpNullableTargetType(floating) : floating,
      ...(property.optional ? { optional: true } : {}) };
  };
  const declared = ownerType => {
    const selected = resolver.retainMemberDeclarationEvidence([member(ownerType)], ownerType, queries);
    assert.equal(selected !== undefined, true, "the declared member has checked typed ownership evidence");
    return selected;
  };
  return { queries, resolver, owner, actual, declared };
}

test("typed optional member evidence survives literal, declared value and read publication", () => {
  const value = memberProvenanceFixture();
  const owner = value.owner("omitted");
  const actual = value.actual("omitted");
  const literal = value.resolver.instantiateMemberEvidence(value.declared(owner), actual, value.queries, owner);
  assert.equal(literal?.length === 1 && literal[0].optional === true &&
    literal[0].sourceMemberEvidence[0].ownerType === owner && literal[0].sourceMemberEvidence[0].sourceType === actual &&
    literal[0].sourceMemberEvidence[0].correspondence.kind === "absent", true,
  "the physical optional slot keeps its declared owner without fabricating a present source property");
  const declaration = value.resolver.instantiateMemberEvidence(literal, owner, value.queries, actual);
  assert.equal(declaration?.length === 1 && declaration[0].sourceMemberEvidence[0].ownerType === owner &&
    declaration[0].sourceMemberEvidence[0].correspondence.kind === "present", true,
  "the declared value revalidates the same exact optional member");
  const read = value.resolver.instantiateMemberEvidence(declaration, owner, value.queries, owner);
  assert.equal(read?.length === 1 && targetTypeRefEquals(read[0].type, literal[0].type), true,
    "a later read retains the same native carrier without a missing-member fallback");
});

test("typed optional native construction publishes an actual omitted slot without origin repair", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function run(): boolean {
      const optional: { useGrouping?: boolean } = {};
      const alias = optional;
      return alias.useGrouping === undefined;
    }
  ` });
  assert.equal(compiled.sourceDiagnosticsText, "", "the original declared optional context is source-valid");
  assert.equal(compiled.targetDiagnostics.length, 0,
    compiled.targetDiagnostics.map(({ code, message }) => `${code}: ${message}`).join("; "));
  assert.equal(compiled.artifacts.size > 0, true, "the physical optional field survives publication and its absence read");
  executeCsharpConstruction(compiled, "typed-optional-member-publication", false, false, [], `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("declared optional slot preserves native absence through an alias");
`);
});

test("typed member evidence never admits a missing required slot", () => {
  const value = memberProvenanceFixture();
  const owner = value.owner("required");
  assert.equal(value.resolver.instantiateMemberEvidence(value.declared(owner), value.actual("omitted"), value.queries, owner) === undefined,
    true, "a checked absent result cannot initialize a required native field");
});

test("missing, foreign, stale and mismatched member evidence cannot inherit optional absence", () => {
  const value = memberProvenanceFixture();
  const owner = value.owner("omitted");
  const selected = value.declared(owner)[0];
  const evidence = selected.sourceMemberEvidence[0];
  const { sourceMemberEvidence: _removed, ...missing } = selected;
  const controls = [
    ["missing evidence", missing],
    ["foreign declared owner", { ...selected, sourceMemberEvidence: [{ ...evidence, ownerType: value.owner("other") }] }],
    ["stale absence", { ...selected, sourceMemberEvidence: [{ ...evidence,
      correspondence: { kind: "absent", destination: evidence.correspondence.destination } }] }],
    ["mismatched present property", { ...selected, sourceMemberEvidence: [{ ...evidence,
      correspondence: { ...evidence.correspondence, source: { ...evidence.correspondence.source,
        property: { ...evidence.correspondence.source.property, symbol: {} } } } }] }],
  ];
  for (const [label, member] of controls) assert.equal(
    value.resolver.instantiateMemberEvidence([member], value.actual("omitted"), value.queries, owner) === undefined,
    true, `${label}: no native slot is published from missing or unrelated proof`);
});

test("canonical member merging retains separate owners without transferring an absence proof", () => {
  const value = memberProvenanceFixture();
  const firstOwner = value.owner("omitted");
  const secondOwner = value.owner("other");
  const firstType = value.actual("omitted");
  const secondType = value.actual("other");
  const first = value.resolver.instantiateMemberEvidence(value.declared(firstOwner), firstType, value.queries, firstOwner);
  const second = value.resolver.instantiateMemberEvidence(value.declared(secondOwner), secondType, value.queries, secondOwner);
  const merged = mergeCsharpObjectShapeSubjects({ targetType: structural, sourceType: firstType, members: first },
    { targetType: structural, sourceType: secondType, members: second });
  const evidence = merged.members[0].sourceMemberEvidence;
  assert.equal(evidence.length === 2 && evidence.includes(first[0].sourceMemberEvidence[0]) &&
    evidence.includes(second[0].sourceMemberEvidence[0]), true, "each checked source/declaration/member alternative remains intact");
  assert.equal(value.resolver.instantiateMemberEvidence(merged.members, secondType, value.queries, merged.sourceType)?.length === 1,
    true, "the exact second source selects only its own retained proof");
  assert.equal(value.resolver.instantiateMemberEvidence(merged.members, value.actual("fresh"), value.queries, merged.sourceType) === undefined,
    true, "another empty source cannot inherit absence merely because its physical shape key matches");
});

test("ambiguous optional declaration owners never choose a first matching proof", () => {
  const value = memberProvenanceFixture();
  const firstOwner = value.owner("omitted");
  const secondOwner = value.owner("other");
  const actual = value.actual("omitted");
  const first = value.resolver.instantiateMemberEvidence(value.declared(firstOwner), actual, value.queries, firstOwner);
  const second = value.resolver.instantiateMemberEvidence(value.declared(secondOwner), actual, value.queries, secondOwner);
  const merged = mergeCsharpObjectShapeSubjects({ targetType: structural, sourceType: actual, members: first },
    { targetType: structural, sourceType: actual, members: second });
  assert.equal(value.resolver.instantiateMemberEvidence(merged.members, actual, value.queries, actual) === undefined,
    true, "different checked owners associated with the same source are ambiguous, not a success fallback");
});

test("live and sealed literal inputs retain exact checked owners through immutable shape wrappers", () => {
  const value = memberProvenanceFixture();
  const owner = value.owner("omitted");
  const actual = value.actual("omitted");
  const members = value.resolver.instantiateMemberEvidence(value.declared(owner), actual, value.queries, owner);
  assert.equal(members !== undefined, true, "the original optional correspondence is checked");
  const shape = { targetType: structural, sourceType: actual, members };
  const literal = {};
  const literalKey = createCsharpObjectLiteralShapeKey();
  const result = Object.freeze({ kind: "resolved", shape });
  const sealed = sealCsharpObjectShapeClassifications({ issues: [], propertyOrders: {},
    structuralDefinitionIds: new Set(), structuralImplementations: new Map(), structuralImplementationTypes: [],
    targetShapes: {}, nodes: new Map(), knownShapes: [shape], copies: new Map(), copiedMethodImplementations: new Set(),
    literalKey, literals: [{ literal, results: new Map([[literalKey(shape), result]]), unions: new Map() }],
  });
  const wrapper = Object.freeze({ ...shape, members: Object.freeze(members.map(member => Object.freeze({ ...member }))) });
  assert.equal(sealed.resolveObjectLiteralTargetShape(wrapper, literal) === result, true,
    "a fresh immutable wrapper preserves the SAME semantic/native input instead of requiring object identity");
  assert.equal(sealed.resolveObjectLiteralTargetShape({ ...wrapper, sourceType: value.actual("fresh") }, literal) === undefined,
    true, "physical equality never supplies another actual checked source");
  const member = members[0];
  const retained = member.sourceMemberEvidence[0];
  for (const [label, evidence] of [
    ["foreign declared owner", { ...retained, ownerType: value.owner("other") }],
    ["stale destination readonly", { ...retained, correspondence: { ...retained.correspondence,
      destination: { ...retained.correspondence.destination, property: { ...retained.correspondence.destination.property,
        readonly: !retained.correspondence.destination.property.readonly } } } }],
    ["stale destination read", { ...retained, correspondence: { ...retained.correspondence,
      destination: { ...retained.correspondence.destination, read: "unavailable" } } }],
  ]) {
    const foreign = { ...shape, members: [{ ...member, sourceMemberEvidence: [evidence] }] };
    assert.equal(sealed.resolveObjectLiteralTargetShape(foreign, literal) === undefined, true,
      `${label} cannot borrow the admitted optional-absence result`);
  }
  assert.equal(sealed.resolveObjectLiteralTargetShape(wrapper, {}) === undefined, true,
    "an unadmitted literal cannot inherit another occurrence's result");
});
