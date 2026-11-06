import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, createSourceSemanticsExtension, providerVirtualDeclarationFactKey, sourcePrimitive } from "@tsonic/tsts";
import { createTargetSourceProgram, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { resolveProviderObjectLiteralShape } from "../../../dist/analysis/objects/shapes/provider-construction.js";
import { createCsharpObjectShapeMemberResolver } from "../../../dist/analysis/objects/shapes/member-evidence.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int64" });
const floating = Object.freeze({ kind: "source-primitive", name: "float64" });
const selectedTarget = Object.freeze({ kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "native.Counters" });

function fixture(options = {}) {
  const annotation = options.sourceType === floating ? options.primitiveFact ? "float64" : "number" : "int64";
  const fields = `${options.readonly ? "readonly " : ""}value${options.optional ? "?" : ""}: ${annotation}`;
  const ownerText = options.rootFact ? `interface Original { ${fields}; } type Counters = Pick<Original, "value">;`
    : `interface Counters { ${fields}; }`;
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: {
    "/src/node_modules/@test/widths/package.json": JSON.stringify({ name: "@test/widths", version: "1.0.0", type: "module", exports: { ".": "./index.d.ts" } }),
    "/src/node_modules/@test/widths/index.d.ts": "export type int64 = bigint; export type float64 = number;",
    "/src/index.ts": `import type { int64, float64 } from "@test/widths"; ${ownerText}
      interface Other { value: number; }
      declare const current: Counters; declare const foreign: Other;
      function read(): Counters { return current; } function readForeign(): Other { return foreign; }`,
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext", moduleResolution: "bundler" },
  extensionHostOptions: { extensions: [createSourceSemanticsExtension({ modules: [{ moduleSpecifier: "@test/widths", packageName: "@test/widths",
    exports: [sourcePrimitive("int64", "int64", "bigint", true, 64), sourcePrimitive("float64", "float64", "number", true, 64)] }] })] } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  const queries = source.semantics.forFile(file);
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  visit(file);
  const returned = name => nodes.find(node => source.ast.is.IsIdentifier(node) && source.ast.text(node) === name &&
    source.ast.is.IsReturnStatement(source.ast.parent(node)));
  const occurrence = returned("current");
  const foreign = returned("foreign");
  let publication = source.effectiveTypes.get(occurrence);
  assert.equal(publication !== undefined && publication.kind !== "refused" && publication.type.kind === "declared", true,
    "the real Source owner publishes its complete descriptor");
  const descriptor = publication.type;
  const type = queries.types.expressionType(occurrence);
  const [property] = queries.types.propertyInfos(type);
  const propertyType = property.type;
  const propertySymbol = property.symbol;
  const rootSymbol = property.rootSymbols[0];
  const published = sourceTypeDescriptorStructure(descriptor);
  assert.equal(published.kind === "shape" && published.members.length === 1 && published.members[0].origin.kind === "declared", true);
  const declaration = published.members[0].origin.declaration;
  const typeFact = {};
  const memberFact = {};
  const selectedMember = options.memberType ?? integer;
  const binding = { target: "csharp", id: selectedTarget.id, csharpType: selectedTarget };
  const sourceIdentity = { providerId: "fixture", providerVersion: "1", providerModuleId: "module",
    moduleSpecifier: "fixture", exportId: "counter", exportName: "Counters" };
  const typeRelation = { kind: "type", targetBinding: binding, source: { kind: "type", ...sourceIdentity },
    bindingTypeParameters: [], objectLiteralConstruction: { kind: "object-initializer" }, ...options.typeRelation };
  const memberRelation = { kind: "member", targetBinding: binding,
    source: { kind: "member", ...sourceIdentity, memberId: "counter.value", memberStatic: false,
      memberKey: { kind: "property-key", name: "value" }, ...options.memberSource },
    targetMember: { kind: "field", id: "native.value", sourceName: "value", targetName: "nativeValue",
      declaringType: selectedTarget, parameters: [], returnType: selectedMember, ...options.targetMember },
    receiver: { kind: "instance" }, bindingTypeParameters: [], bindingTypeArgumentSource: "receiver",
    ...options.memberRelation };
  const factOwner = options.rootFact ? rootSymbol : propertySymbol;
  const typeSubjects = queries.facts.typeSubjects(type);
  const represent = described => {
    const structure = sourceTypeDescriptorStructure(described);
    if (structure.kind === "primitive") return csharpSourcePrimitiveTargetType(structure.primitive);
    const value = structure.kind === "optional" ? represent(structure.value) : undefined;
    return value === undefined ? undefined : csharpNullableTargetType(value);
  };
  const host = {
      ast: source.ast, navigation: source.navigation,
      effectiveTypes: { get: node => node === occurrence ? publication : undefined },
      semantics: source.semantics.forFile, semanticsFor: source.semantics.forNode, hasSemantics: source.semantics.includes,
      sourceFacts: { getFact(subject, key) {
        if (key === providerVirtualDeclarationFactKey) {
          if ((subject === descriptor.declaration || typeSubjects.includes(subject)) && !options.missingTypeFact) return typeFact;
          if (subject === factOwner && !options.missingMemberFact) return memberFact;
        }
        return source.sourceFacts.getFact(subject, key);
      } },
      providers: {
        resolveType: () => options.typeResolution ?? { kind: "resolved", relations: [typeRelation] },
        resolveMember: () => options.memberResolution ?? { kind: "resolved", relations: [memberRelation] },
      },
      typeResolver: { resolveDescriptor: represent },
  };
  const resolver = createCsharpObjectShapeMemberResolver(host);
  const input = { type, descriptor, occurrence, queries, selectedTarget: options.selectedTarget ?? selectedTarget,
    state: { depth: 0 }, host, publishedShapeDescriptor: resolver.publishedShapeDescriptor,
    resolvePublishedProperty: resolver.resolvePublishedProperty };
  return { input, type, propertyType, propertySymbol, rootSymbol, declaration, memberRelation, typeRelation,
    descriptor, publication, source, foreign, resolver, publish: selected => { publication = selected; } };
}

test("provider construction retains its exact destination type and native field identity", () => {
  const value = fixture();
  const shape = resolveProviderObjectLiteralShape(value.input);
  assert.equal(shape?.sourceType === value.type, true, "opaque checked destination identity");
  assert.equal(shape?.targetType === selectedTarget, true, "no replacement native carrier");
  assert.equal(shape?.constructible, true);
  assert.equal(shape?.members[0].targetName, "nativeValue");
  assert.equal(shape?.members[0].type === integer, true, "native int64 is not floating-point storage");
  assert.equal(shape?.members[0].sourceSubjects.length, 2);
  assert.equal(shape?.members[0].sourceSubjects[0] === value.propertySymbol, true);
  assert.equal(shape?.members[0].sourceSubjects[1] === value.declaration, true);
  assert.equal(Object.isFrozen(shape?.members[0].sourceSubjects), true);
});

test("provider construction resolves root-symbol facts without property-name matching", () => {
  const value = fixture({ rootFact: true });
  const shape = resolveProviderObjectLiteralShape(value.input);
  assert.equal(shape?.members.length, 1);
  assert.equal(shape.members[0].sourceSubjects.length, 3);
  assert.equal(shape.members[0].sourceSubjects[0] === value.propertySymbol, true);
  assert.equal(shape.members[0].sourceSubjects[1] === value.rootSymbol, true);
  assert.equal(shape.members[0].sourceSubjects[2] === value.declaration, true);
  assert.equal(shape.members[0].sourceTypes[0] === value.propertyType, true, "selected checker field type");
});

test("optional provider fields preserve exact native integer storage and one absence", () => {
  const optionalInteger = csharpNullableTargetType(integer);
  const value = fixture({ optional: true, sourceType: integer, memberType: optionalInteger });
  const shape = resolveProviderObjectLiteralShape(value.input);
  assert.equal(shape?.members[0].optional, true);
  assert.equal(targetTypeRefEquals(shape?.members[0].type, optionalInteger), true,
    "the exact immutable native carrier survives type-parameter substitution");
  assert.equal(resolveProviderObjectLiteralShape(fixture({ optional: true, memberType: integer }).input) === undefined,
    true, "optional source cannot occupy nonnullable native storage");
});

test("provider construction requires the exact published numeric field width", () => {
  assert.equal(resolveProviderObjectLiteralShape(fixture({ sourceType: floating }).input) === undefined, true,
    "an erased numeric declaration cannot select a different native width");
  const shape = resolveProviderObjectLiteralShape(fixture().input);
  assert.equal(shape?.members[0].type === integer, true, "full-width native integer selected at the producer");
  assert.equal(resolveProviderObjectLiteralShape(fixture({ sourceType: floating, primitiveFact: true }).input) === undefined,
    true, "explicit source numeric metadata is authoritative");
});

test("provider construction fails closed on missing, contradictory or unrelated native relations", () => {
  const cases = [
    { missingTypeFact: true },
    { missingMemberFact: true },
    { selectedTarget: { ...selectedTarget, id: "native.Other" } },
    { typeResolution: { kind: "missing" } },
    { memberResolution: { kind: "missing" } },
    { typeRelation: { objectLiteralConstruction: undefined } },
    { targetMember: { declaringType: { ...selectedTarget, id: "native.Other" } } },
    { targetMember: { returnType: undefined } },
    { memberSource: { memberKey: { kind: "property-key", name: "other" } } },
    { targetMember: { readonly: true } },
    { memberSource: { memberStatic: true } },
    { targetMember: { static: true } },
    { memberRelation: { receiver: { kind: "none" } } },
    { targetMember: { parameters: [{ name: "index", type: integer, passingMode: "by-value" }] } },
  ];
  for (const [index, options] of cases.entries()) {
    assert.equal(resolveProviderObjectLiteralShape(fixture(options).input) === undefined, true, `relation control ${index}`);
  }
});

test("provider construction rejects two distinct field bindings for the same exact source identity", () => {
  const value = fixture();
  value.input.host.providers.resolveMember = () => ({ kind: "resolved", relations: [
    value.memberRelation,
    { ...value.memberRelation, targetMember: { ...value.memberRelation.targetMember, targetName: "otherValue" } },
  ] });
  assert.equal(resolveProviderObjectLiteralShape(value.input) === undefined, true, "contradictory native field selection");
});

test("provider construction requires its actual whole Source publication, never a missing or foreign inventory", () => {
  const value = fixture();
  const select = (descriptor = value.descriptor) => resolveProviderObjectLiteralShape({ ...value.input, descriptor });
  value.publish(undefined);
  assert.equal(select() === undefined, true, "the old raw-carrier callback cannot authorize construction");
  value.publish(value.source.effectiveTypes.get(value.foreign));
  assert.equal(select() === undefined, true, "another owner's same-named field is not this publication");
  value.publish(value.publication);
  assert.equal(select({ ...value.descriptor }) === undefined, true, "the descriptor is the exact immutable published object");
  const structure = sourceTypeDescriptorStructure(value.descriptor);
  for (const members of [[], [...structure.members, ...structure.members]]) {
    const descriptor = { ...value.descriptor, definition: { ...structure, members } };
    value.publish({ ...value.publication, type: descriptor });
    assert.equal(select(descriptor) === undefined, true, "missing or ambiguous members cannot be rebuilt from the checked type");
  }
  assert.equal(typeof value.resolver.resolvePropertyType, "undefined", "the superseded raw-only callback is removed");
});
