import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles, providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { createTargetSourceProgram, sourceTypeDescriptorMemberOriginsEqual, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { resolveCsharpSourceTypeDescriptor } from "../../../../dist/analysis/source-evidence/types/resolution/effective-types.js";
import { resolveCsharpProjectionArguments } from "../../../../dist/analysis/source-evidence/types/resolution/projection-arguments.js";
import { createCsharpSourceUnionDefinitions } from "../../../../dist/analysis/source-evidence/types/resolution/union-definitions.js";
import { createCsharpObjectShapeMemberResolver } from "../../../../dist/analysis/objects/shapes/member-evidence.js";
import { createCsharpObjectShapePolicy } from "../../../../dist/analysis/objects/shapes/api.js";
import { createCsharpNativeConstructionDemandQuery } from "../../../../dist/analysis/objects/native-construction-demand.js";
import { resolveProviderObjectLiteralShape } from "../../../../dist/analysis/objects/shapes/provider-construction.js";
import { createCsharpLiteralShapeResolver } from "../../../../dist/analysis/objects/shapes/literal-construction.js";
import { selectCsharpHostLiteralCorrespondence } from "../../../../dist/analysis/objects/shapes/host-correspondence.js";
import { createCsharpProjectShapeProjection } from "../../../../dist/analysis/objects/shapes/project-construction.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpDelegateSignature } from "../../../../dist/target-model/types/carriers/delegates.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { csharpRuntimeUnionTargetType } from "../../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpSourceTypeParameter } from "../../../../dist/source/extension/type-parameters.js";
import { csharpProjectedType } from "../../../../dist/target-model/types/projections.js";
import { targetTypeRefEquals } from "../../../../dist/target-model/types/equality.js";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { csharpProgramObjectLiteralShapes, csharpProgramSourceFiles } from "../../../helpers/program-source-files.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../../csharp-nodejs/dist/index.js";

const unexpected = () => assert.fail("a published instantiation never reopens checker types or a competing member inventory");
const primitive = name => ({ kind: "primitive", primitive: name });

function providerMemberFixture(empty = false, aliased = false, sourceText) {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: { "/src/index.ts": sourceText ?? `
    interface ${aliased ? "Original" : "Options"} { ${empty ? "" : "mode?: number;"} }
    ${aliased ? "type First = Original; type Options = First;" : ""}
    interface Foreign { mode?: number; }
    declare const options: Options; declare const foreign: Foreign;
    function read(): Options { return options; } function readForeign(): Foreign { return foreign; }
    function make(): Options { return {}; }
  ` }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  const queries = source.semantics.forFile(file);
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  visit(file);
  const returned = name => nodes.find(node => source.ast.is.IsIdentifier(node) && source.ast.text(node) === name &&
    source.ast.is.IsReturnStatement(source.ast.parent(node)));
  const occurrence = returned("options");
  const foreign = returned("foreign");
  const literal = nodes.find(node => source.ast.is.IsObjectLiteralExpression(node));
  let publication = source.effectiveTypes.get(occurrence);
  assert.equal(publication !== undefined && publication.kind !== "refused" && publication.type.kind === "declared", true);
  const descriptor = publication.type;
  const structure = sourceTypeDescriptorStructure(descriptor);
  assert.equal(structure.kind === "shape" && structure.members.length === (empty ? 0 : 1), true);
  const type = queries.types.expressionType(occurrence);
  const properties = queries.types.propertyInfos(type);
  const typeSubjects = queries.facts.typeSubjects(type);
  const typeFact = Object.freeze({ id: "Options" });
  const memberFact = Object.freeze({ id: "Options.mode" });
  const target = { kind: "target-named", id: "test.Provider.Options", csharpAllowsRefLikeTypeArguments: [] };
  const storage = csharpNullableTargetType(csharpSourcePrimitiveTargetType("int32"));
  const binding = { id: target.id, target: "csharp", csharpType: target };
  const sourceIdentity = { providerId: "fixture", providerVersion: "1", providerModuleId: "options", moduleSpecifier: "fixture",
    exportId: "Options", exportName: "Options" };
  const represent = described => {
    if (described.kind === "declared" && described.declaration === descriptor.declaration) return target;
    const selected = sourceTypeDescriptorStructure(described);
    if (selected.kind === "primitive") return csharpSourcePrimitiveTargetType(selected.primitive);
    const value = selected.kind === "optional" ? represent(selected.value) : undefined;
    return value === undefined ? undefined : csharpNullableTargetType(value);
  };
  const host = { ast: source.ast, navigation: source.navigation, effectiveTypes: { get: node => node === occurrence ? publication : source.effectiveTypes.get(node) },
    semantics: source.semantics.forFile, semanticsFor: source.semantics.forNode, hasSemantics: source.semantics.includes,
    sourceFacts: { getFact(subject, key) {
      if (key === providerVirtualDeclarationFactKey) {
        if (subject === descriptor.declaration || typeSubjects.includes(subject)) return typeFact;
        if (properties.some(property => subject === property.symbol || property.rootSymbols.includes(subject))) return memberFact;
      }
      return source.sourceFacts.getFact(subject, key);
    } },
    providers: {
      resolveType: () => ({ kind: "resolved", relations: [{ kind: "type", targetBinding: binding,
        source: { kind: "type", ...sourceIdentity }, bindingTypeParameters: [], objectLiteralConstruction: { kind: "object-initializer" } }] }),
      resolveMember: () => ({ kind: "resolved", relations: [{ kind: "member", targetBinding: binding,
        source: { kind: "member", ...sourceIdentity, memberId: "Options.mode", memberStatic: false, memberKey: { kind: "property-key", name: "mode" } },
        targetMember: { kind: "property", id: "native.mode", targetName: "nativeMode", declaringType: target, parameters: [], returnType: storage },
        receiver: { kind: "instance" }, bindingTypeParameters: [], bindingTypeArgumentSource: "receiver" }] }),
    },
    typeResolver: { resolveDescriptor: represent },
    projectTypeCatalog: { definitionForDeclaration: () => undefined, definitionForTarget: () => undefined },
    typeParameterConstraints: { resolve: unexpected },
  };
  const resolver = createCsharpObjectShapeMemberResolver(host);
  const input = { type, descriptor, occurrence, queries, host, selectedTarget: target, state: { depth: 0 },
    publishedShapeDescriptor: resolver.publishedShapeDescriptor, resolvePublishedProperty: resolver.resolvePublishedProperty };
  return { source, file, occurrence, foreign, literal, publication, descriptor, structure, properties, resolver, input, target, storage,
    publish: selected => { publication = selected; } };
}

function fixture() {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: { "/src/index.ts": `
    interface Box<Value> { value: Value; items: Value[]; }
    type Selected<Value> = Value extends number ? number : string;
    type Recursive = number | readonly Recursive[];
    function outer<Outer>() { class Local<Inner> {} return Local; }
  ` }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  visit(file);
  const named = (kind, name) => nodes.find(node => source.ast.is[kind](node) && source.ast.text(source.ast.name(node)) === name);
  const box = named("IsInterfaceDeclaration", "Box");
  const alias = named("IsTypeAliasDeclaration", "Selected");
  const recursive = named("IsTypeAliasDeclaration", "Recursive");
  const local = named("IsClassDeclaration", "Local");
  const outer = named("IsFunctionDeclaration", "outer");
  const parameter = source.ast.typeParameters(box)[0];
  const queries = source.semantics.forFile(file);
  const boxDefinition = { declaration: box, outerTypeParameters: [], typeParameters: [parameter],
    typeProjections: [], outerTypeProjections: [], kind: "interface" };
  const localDefinition = { declaration: local, outerTypeParameters: source.ast.typeParameters(outer),
    typeParameters: source.ast.typeParameters(local), typeProjections: [], outerTypeProjections: [], kind: "class", abstract: false };
  const definitions = [boxDefinition, localDefinition];
  const target = (declaration, typeArguments) => ({ kind: "target-named", id: declaration === box ? "test.Box" : "test.Local",
    csharpSourceDeclarationKind: declaration === box ? "interface" : "class", typeArguments,
    csharpAllowsRefLikeTypeArguments: typeArguments.map(() => false) });
  const host = { ast: source.ast, hasSemantics: () => true,
    semanticsFor: () => ({ sourceFile: file, declarations: { declaredType: unexpected }, types: new Proxy({}, { get: unexpected }) }),
    navigation: { isProjectDeclaration: () => true },
    representations: { scopedTargetType: () => undefined, genericProjections: () => [] },
    projectTypeCatalog: { definitionForDeclaration: declaration => definitions.find(definition => definition.declaration === declaration),
      targetTypeForDeclaration: target },
  };
  const scope = { host, resolveDirectSourceFacts: () => undefined, resolveProviderType: unexpected };
  scope.sourceUnionDefinitions = createCsharpSourceUnionDefinitions(host, unexpected);
  return { source, file, nodes, box, alias, recursive, local, outer, parameter, queries, definitions, target, scope };
}

test("complete alias applications cache the exact published definition identity, never only their represented arguments", () => {
  const input = fixture();
  const registry = createCsharpSourceUnionDefinitions(input.scope.host, unexpected);
  const arguments_ = [csharpStringTargetType()];
  let evaluated = 0;
  const definitions = [];
  for (const width of ["int32", "int64", "int64", "uint32"]) {
    const definition = Object.freeze(primitive(width));
    definitions.push(definition);
    const target = csharpSourcePrimitiveTargetType(width);
    const selected = registry.resolveDescriptor(input.alias, arguments_, definition, actual => {
      assert.equal(actual === definition, true, "the materializer receives that exact published body");
      evaluated += 1;
      return target;
    });
    assert.equal(targetTypeRefEquals(selected, target), true, width);
  }
  assert.equal(evaluated, 4, "distinct definition objects are each materialized, including equal bodies");
  assert.equal(targetTypeRefEquals(registry.resolveDescriptor(input.alias, arguments_, definitions[0], unexpected),
    csharpSourcePrimitiveTargetType("int32")), true, "the same immutable definition identity reuses only its own result");
  assert.equal(registry.resolveDescriptor(input.alias, arguments_, primitive("int16"), () => undefined) === undefined, true,
    "a later unresolved application never reuses the previous complete result");
  assert.throws(() => registry.resolveDescriptor(input.alias, arguments_, primitive("uint16"),
    () => { throw new Error("exact body failure"); }), /exact body failure/u);
  assert.equal(registry.resolveDescriptor(input.alias, arguments_, undefined, unexpected) === undefined, true,
    "neither scalar results nor a failed application become an identity-only recursive reference");
});

test("same-body recursive aliases validate distinct definitions without changing their nominal carrier", () => {
  const input = fixture();
  const records = [];
  let registrations = 0;
  const typeDefinitions = {
    sourceUnionArms: carrier => records.find(record => targetTypeRefEquals(record.carrier, carrier))?.arms,
    registerSourceUnion(record) {
      registrations += 1;
      const previous = records.find(candidate => targetTypeRefEquals(candidate.carrier, record.carrier));
      if (previous !== undefined) return previous.arms.length === record.arms.length &&
        previous.arms.every((arm, index) => targetTypeRefEquals(arm, record.arms[index]));
      records.push(record);
      return true;
    },
  };
  const registry = createCsharpSourceUnionDefinitions({ ...input.scope.host, typeDefinitions }, unexpected);
  const references = [];
  let evaluated = 0;
  const definition = { kind: "union", types: [primitive("int64"), { kind: "array", readonly: true,
    element: { kind: "declared", declaration: input.recursive, typeArguments: [], cut: "recursion" } }] };
  const body = actual => {
    evaluated += 1;
    assert.equal(actual.kind === "union", true);
    const reference = registry.resolveDescriptor(input.recursive, [], undefined, unexpected);
    assert.equal(reference !== undefined, true, "the active recursion cut retains its nominal reference");
    references.push(reference);
    return csharpRuntimeUnionTargetType([csharpSourcePrimitiveTargetType("int64"), { kind: "array", element: reference }]);
  };
  const first = registry.resolveDescriptor(input.recursive, [], definition, body);
  const second = registry.resolveDescriptor(input.recursive, [], { ...definition }, body);
  assert.equal(first !== undefined && second !== undefined && targetTypeRefEquals(first, second), true,
    "revalidation does not rename a stable recursive carrier");
  assert.equal(evaluated === 2 && registrations === 2 && records.length === 1, true,
    "both distinct complete definitions reach the one canonical native validator");
  assert.equal(targetTypeRefEquals(registry.resolveDescriptor(input.recursive, [], definition, unexpected), first), true,
    "a repeated exact definition identity reuses its already validated result");
  assert.equal(references.every(reference => targetTypeRefEquals(reference, first)), true,
    "each recursive occurrence names the same nominal carrier");
  assert.equal(targetTypeRefEquals(registry.resolveDescriptor(input.recursive, [], undefined, unexpected), first), true,
    "an identity-only cut can retain the already validated recursive nominal result");
  const contradictory = { ...definition, types: [primitive("uint64"), definition.types[1]] };
  assert.equal(registry.resolveDescriptor(input.recursive, [], contradictory, () => {
    const reference = registry.resolveDescriptor(input.recursive, [], undefined, unexpected);
    return csharpRuntimeUnionTargetType([csharpSourcePrimitiveTargetType("uint64"), { kind: "array", element: reference }]);
  }) === undefined, true, "contradictory bodies cannot reuse an already registered nominal layout");
  assert.equal(registry.resolveDescriptor(input.recursive, [], undefined, unexpected) === undefined, true,
    "an incompatible complete application makes an unqualified later cut ambiguous");
});

test("published optional recursive aliases retain absence in active and completed identity-only cuts", () => {
  const input = fixture();
  const registry = createCsharpSourceUnionDefinitions({ ...input.scope.host,
    typeDefinitions: { sourceUnionArms: () => undefined, registerSourceUnion: () => true } }, unexpected);
  const definition = { kind: "optional", value: { kind: "union", types: [primitive("int64"),
    { kind: "array", readonly: true,
      element: { kind: "declared", declaration: input.recursive, typeArguments: [], cut: "recursion" } }] } };
  let active;
  const selected = registry.resolveDescriptor(input.recursive, [], definition, () => {
    active = registry.resolveDescriptor(input.recursive, [], undefined, unexpected);
    assert.equal(getCsharpNullableElementTargetType(active) !== undefined, true, "the active reference includes Source absence");
    return csharpNullableTargetType(csharpRuntimeUnionTargetType([
      csharpSourcePrimitiveTargetType("int64"), { kind: "array", element: active },
    ]));
  }, true);
  assert.equal(selected !== undefined && targetTypeRefEquals(active, selected), true);
  assert.equal(targetTypeRefEquals(registry.resolveDescriptor(input.recursive, [], undefined, unexpected), selected), true,
    "the validated identity-only result preserves exactly the same nullable nominal carrier");
});

test("a definition-less recursion cut cannot choose between two active published applications", () => {
  const input = fixture();
  const registry = createCsharpSourceUnionDefinitions(input.scope.host, unexpected);
  const arguments_ = [csharpStringTargetType()];
  const first = primitive("int32");
  const second = primitive("int64");
  assert.equal(registry.resolveDescriptor(input.alias, arguments_, undefined, unexpected) === undefined, true,
    "an unseen recursion cut has no represented definition");
  const selected = registry.resolveDescriptor(input.alias, arguments_, first, () => {
    const nested = registry.resolveDescriptor(input.alias, arguments_, second, () => {
      assert.equal(registry.resolveDescriptor(input.alias, arguments_, undefined, unexpected) === undefined, true,
        "a declaration and represented arguments cannot distinguish two active bodies");
      return csharpSourcePrimitiveTargetType("int64");
    });
    assert.equal(targetTypeRefEquals(nested, csharpSourcePrimitiveTargetType("int64")), true);
    return csharpSourcePrimitiveTargetType("int32");
  });
  assert.equal(targetTypeRefEquals(selected, csharpSourcePrimitiveTargetType("int32")), true);
});

test("raw checked-Type entries and published definition identities cannot reuse each other's completed results", () => {
  const input = fixture();
  const type = input.queries.declarations.declaredType(input.recursive);
  assert.equal(type !== undefined, true, "the raw metadata lane receives an actual checked recursive alias type");
  const application = input.queries.types.aliasApplication(type);
  assert.equal(application?.kind === "direct" && application.declaration === input.recursive &&
    application.bindings.length === 0, true, "the concrete metadata fixture has no binder reconstruction");
  const registry = createCsharpSourceUnionDefinitions({ ...input.scope.host,
    typeDefinitions: { sourceUnionArms: () => undefined, registerSourceUnion: unexpected } }, unexpected);
  const published = primitive("int32");
  assert.equal(targetTypeRefEquals(registry.resolveDescriptor(input.recursive, [], published,
    () => csharpSourcePrimitiveTargetType("int32")), csharpSourcePrimitiveTargetType("int32")), true);
  let constructed = 0;
  const checked = registry.resolve(type, input.queries, { depth: 0 }, () => {
    constructed += 1;
    return { carrier: csharpSourcePrimitiveTargetType("int64"), arms: [csharpSourcePrimitiveTargetType("int64")] };
  });
  assert.equal(targetTypeRefEquals(checked, csharpSourcePrimitiveTargetType("int64")), true,
    "the exact checked-Type entry does not borrow the published int32 result");
  assert.equal(registry.resolve(type, input.queries, { depth: 0 }, unexpected) === checked && constructed === 1, true,
    "only the same immutable checked-Type identity reuses that metadata result");
  assert.equal(targetTypeRefEquals(registry.resolveDescriptor(input.recursive, [], published, unexpected),
    csharpSourcePrimitiveTargetType("int32")), true, "the metadata entry cannot overwrite the published body");
});

test("published nominal arguments retain their complete outer and local declaration order without formal raw bindings", () => {
  const input = fixture();
  for (const [declaration, names] of [[input.box, ["int32"]], [input.local, ["int64", "uint16"]]]) {
    const descriptor = { kind: "declared", declaration, typeArguments: names.map(primitive),
      definition: { kind: "shape", members: [], indexes: [], calls: [], constructs: [] } };
    const state = { depth: 0 };
    const selected = resolveCsharpSourceTypeDescriptor(input.scope, descriptor, state, declaration);
    assert.equal(selected !== undefined && selected.kind === "target-named" &&
      selected.typeArguments.length === names.length, true, "the exact nominal arity is retained");
    for (const [index, name] of names.entries()) assert.equal(targetTypeRefEquals(selected.typeArguments[index],
      csharpSourcePrimitiveTargetType(name)), true, `argument ${index}: ${name}`);
    assert.equal(state.sourceBindings === undefined, true, "the caller's state was not given a raw-formal binding packet");
  }
});

test("conditional projections consume the concrete published alias definition and reject an absent or contradictory application", () => {
  const input = fixture();
  const parameter = input.source.ast.typeParameters(input.alias)[0];
  const nativeParameter = csharpSourceTypeParameter(parameter, input.source.ast);
  const integer = csharpSourcePrimitiveTargetType("int64");
  const projection = csharpProjectedType({ kind: "conditional", declaration: input.alias, identity: "published.Selected",
    sourceName: "Selected", sourceArguments: [], arguments: [nativeParameter] });
  const binding = { declaration: parameter, type: primitive("int64") };
  const reference = { kind: "declared", declaration: input.alias, typeArguments: [primitive("int64")],
    definition: primitive("int32") };
  const resolve = definitions => resolveCsharpProjectionArguments(input.scope, input.alias,
    { bindings: [binding], definitions }, [integer], { depth: 0 }, [projection], [parameter]);
  assert.equal(targetTypeRefEquals(resolve([reference])[0], csharpSourcePrimitiveTargetType("int32")), true,
    "the published branch, not the argument's width or a raw checker re-evaluation, determines the result");
  assert.equal(resolve([]) === undefined, true, "an unpublished application is not reconstructed");
  assert.equal(resolve([{ ...reference, definition: undefined, cut: "recursion" }]) === undefined, true,
    "a recursion cut is not a full conditional definition");
  assert.equal(resolve([{ ...reference, definition: undefined, cut: "unexpressible" }]) === undefined, true,
    "unexpressible structure is never reopened");
  const distinct = { ...reference, definition: primitive("uint32") };
  assert.equal(resolve([reference, distinct]) === undefined, true, "contradictory matching applications do not select the first one");
  assert.equal(resolveCsharpProjectionArguments(input.scope, input.alias,
    { bindings: [{ declaration: input.parameter, type: primitive("int64") }], definitions: [reference] },
    [integer], { depth: 0 }, [projection], [parameter]) === undefined, true, "foreign binders do not match by argument position");
  assert.equal(resolveCsharpProjectionArguments(input.scope, input.alias, [{}], [integer], { depth: 0 },
    [projection], [parameter]) === undefined, true, "the removed raw-Type argument vector is not an accepted input form");
});

test("published projection lookup uses exact outer native bindings without reading their raw Source types", () => {
  const input = fixture();
  const outer = input.source.ast.typeParameters(input.outer)[0];
  const inner = input.source.ast.typeParameters(input.local)[0];
  const outerType = csharpSourceTypeParameter(outer, input.source.ast);
  const projection = csharpProjectedType({ kind: "conditional", declaration: input.alias, identity: "published.OuterSelected",
    sourceName: "Selected", sourceArguments: [], arguments: [outerType] });
  const reference = { kind: "declared", declaration: input.alias, typeArguments: [primitive("int64")],
    definition: primitive("uint16") };
  const selected = resolveCsharpProjectionArguments(input.scope, input.local,
    { bindings: [{ declaration: inner, type: primitive("int32") }], definitions: [reference] },
    [csharpSourcePrimitiveTargetType("int32")], { depth: 0, sourceBindings: new Map([[outer, {
      get sourceType() { return unexpected(); }, targetType: csharpSourcePrimitiveTargetType("int64"),
    }]]) }, [projection], [inner]);
  assert.equal(selected !== undefined && targetTypeRefEquals(selected[0], csharpSourcePrimitiveTargetType("uint16")), true,
    "the outer receiver binding is independent of the local method or class binding");
});

test("one published member inventory retains exact width and origin without raw property enumeration", () => {
  const input = fixture();
  const declarations = input.source.ast.members(input.box);
  const descriptor = { kind: "declared", declaration: input.box, typeArguments: [primitive("int64")],
    definition: { kind: "shape", members: declarations.map((declaration, index) => ({
      name: input.source.ast.text(input.source.ast.name(declaration)), optional: false,
      origin: { kind: "declared", declaration }, type: index === 0 ? primitive("int64")
        : { kind: "array", readonly: false, element: primitive("int64") },
    })), indexes: [], calls: [], constructs: [] } };
  const queries = { ...input.queries, types: new Proxy({}, { get: unexpected }) };
  const host = { ast: input.source.ast, navigation: input.source.navigation,
    hasSemantics: file => file === input.file,
    semantics: () => queries, semanticsFor: () => queries,
    sourceStorage: { memberSubjectFor: () => undefined }, memoryBindings: { hasBoundField: () => false },
    representations: { genericProjections: () => [] },
    typeResolver: { resolveDescriptor: type => type.kind === "primitive" ? csharpSourcePrimitiveTargetType(type.primitive)
      : type.kind === "array" ? { kind: "array", element: csharpSourcePrimitiveTargetType(type.element.primitive) } : unexpected() },
  };
  const members = createCsharpObjectShapeMemberResolver(host).deriveMembers(descriptor, input.box, queries, { depth: 0 });
  assert.equal(members !== undefined && members.length === 2, true, "the full published member vector is retained");
  for (const [index, member] of members.entries()) {
    assert.equal(member.origins.length === 1 && sourceTypeDescriptorMemberOriginsEqual(member.origins[0], descriptor.definition.members[index].origin), true,
      member.sourceName);
    assert.equal(member.sourceTypes === undefined && member.sourceMemberEvidence === undefined, true,
      "no source Type or raw re-instantiation evidence accompanies the canonical origin");
  }
  assert.equal(targetTypeRefEquals(members[0].type, csharpSourcePrimitiveTargetType("int64")), true);
  assert.equal(targetTypeRefEquals(members[1].type.element, csharpSourcePrimitiveTargetType("int64")), true);
});

test("published declared members reject a missing or unowned actual source file before symbol lookup", () => {
  const input = fixture();
  const declaration = input.source.ast.members(input.box)[0];
  const descriptor = { kind: "shape", members: [{ name: "value", optional: false,
    origin: { kind: "declared", declaration }, type: primitive("int64") }], indexes: [], calls: [], constructs: [] };
  const foreign = createCompilerSessionFromFiles({ currentDirectory: "/foreign",
    files: { "/foreign/other.ts": "interface Foreign { value: number; }" },
    compilerOptions: { strict: true } }).checkSource().getSourceFile("/foreign/other.ts");
  assert.equal(foreign !== undefined, true);
  for (const [name, file] of [["missing", undefined], ["foreign-unowned", foreign]]) {
    let lookups = 0;
    const invalidLookup = () => { lookups += 1; return unexpected(); };
    const resolver = createCsharpObjectShapeMemberResolver({
      ast: { ...input.source.ast, getSourceFile: () => file },
      hasSemantics: actual => actual === input.file,
      navigation: { declarationSymbol: invalidLookup }, semantics: invalidLookup, semanticsFor: invalidLookup,
    });
    assert.equal(resolver.deriveMembers(descriptor, input.box, input.queries, { depth: 0 }) === undefined, true, name);
    assert.equal(lookups, 0, `${name}: the query file must never substitute for the declaration's own file`);
  }
});

test("project construction preserves nominal identity but cannot open recursion or unexpressible cuts", () => {
  const input = fixture();
  const target = input.target(input.box, [csharpSourcePrimitiveTargetType("int32")]);
  const host = { ast: input.source.ast, navigation: { isProjectDeclaration: () => true },
    semantics: () => ({ types: new Proxy({}, { get: unexpected }) }), typeParameterConstraints: {},
    typeResolver: { resolveDescriptor: () => target },
    projectTypeCatalog: { definitionForTarget: () => input.definitions[0] } };
  const project = createCsharpProjectShapeProjection(host, unexpected);
  for (const cut of ["recursion", "unexpressible"]) {
    const descriptor = { kind: "declared", declaration: input.box, typeArguments: [primitive("int32")], cut };
    const selected = project(target, descriptor, input.box, input.file);
    assert.equal(selected.kind === "rejected", true, `${cut} cannot become an empty or raw-built shape`);
    assert.equal(targetTypeRefEquals(resolveCsharpSourceTypeDescriptor(input.scope, descriptor, { depth: 0 }, input.box), target),
      true, `${cut} still retains nominal identity for an identity-only consumer`);
  }
});

test("member-only construction never drops a published call, construct or index inventory", () => {
  const resolver = createCsharpObjectShapeMemberResolver({});
  for (const inventory of ["indexes", "calls", "constructs"]) {
    const descriptor = { kind: "shape", members: [], indexes: [], calls: [], constructs: [], [inventory]: [{}] };
    assert.equal(resolver.deriveMembers(descriptor, {}, {}, { depth: 0 }) === undefined, true, inventory);
  }
});

const widths = ["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64",
  "nativeInt", "nativeUint", "int128", "uint128"];

for (const surface of ["native", "js"]) for (const width of widths) {
  test(`published ${surface} ${width} generic definitions retain direct, nested, alias and transformed member widths`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { ${width} } from "@tsonic/core/types.js";
interface Box<Value> { value: Value; items: Value[]; }
interface Nested<Value> { inner: Box<Value>; }
type Alias<Value> = Box<Value>;
type Mapped<Value> = { [Key in keyof Value]: Value[Key] };
type Conditional<Value> = Value extends object ? Value : Box<Value>;
type Indexed<Value> = { item: Value }[keyof { item: Value }];
class Cell<Value> { value: Value; constructor(value: Value) { this.value = value; } }
export function direct(value: Box<${width}>): ${width} { return value.value; }
export function nested(value: Nested<${width}>): ${width} { return value.inner.value; }
export function alias(value: Alias<${width}>): ${width} { return value.value; }
export function mapped(value: Mapped<Box<${width}>>): ${width} { return value.value; }
export function conditional(value: Conditional<${width}>): ${width} { return value.value; }
export function indexed(value: Indexed<${width}>): ${width} { return value; }
export function classField(value: Cell<${width}>): ${width} { return value.value; }
export function construction(value: ${width}): Box<${width}> {
  const selected: Box<${width}> = { value, items: [value] }; return selected;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    const nodes = [];
    const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
    for (const file of csharpProgramSourceFiles(program)) visit(file);
    const expectedName = width === "nativeInt" ? "native-int" : width === "nativeUint" ? "native-uint" : width;
    for (const name of ["direct", "nested", "alias", "mapped", "conditional", "indexed", "classField"]) {
      const declaration = nodes.find(node => ast.is.IsFunctionDeclaration(node) && ast.text(ast.name(node)) === name);
      const returned = ast.statements(ast.body(declaration)).find(node => ast.is.IsReturnStatement(node));
      const expression = ast.as.AsReturnStatement(returned).Expression;
      const outcome = program.source.effectiveTypes.get(expression);
      assert.equal(outcome !== undefined && outcome.kind !== "refused", true, `${name}: one Host outcome`);
      const descriptor = sourceTypeDescriptorStructure(outcome.type);
      assert.equal(descriptor.kind === "primitive" && descriptor.primitive === expectedName, true, `${name}: Host width`);
      assert.equal(targetTypeRefEquals(program.records.nodeTargetType.get(expression),
        csharpSourcePrimitiveTargetType(expectedName)), true, `${name}: same represented width`);
    }
    const literal = nodes.find(node => ast.is.IsObjectLiteralExpression(node));
    const shape = program.records.nodeObjectShape.get(literal);
    const box = nodes.find(node => ast.is.IsInterfaceDeclaration(node) && ast.text(ast.name(node)) === "Box");
    const declaration = ast.members(box).find(node => ast.text(ast.name(node)) === "value");
    const member = shape?.members.find(selected => selected.sourceName === "value");
    assert.equal(member !== undefined && member.origins?.length === 1 && sourceTypeDescriptorMemberOriginsEqual(member.origins[0],
      { kind: "declared", declaration }), true, "construction retains the actual generic declaration origin");
    assert.equal(targetTypeRefEquals(member.type, csharpSourcePrimitiveTargetType(expectedName)), true,
      "the construction member never reverts to the checker declaration's number or bigint");
  });
}

for (const surface of ["native", "js"]) {
  test(`published ${surface} literal-argument aliases do not share a cached primitive body`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32, int64 } from "@tsonic/core/types.js";
type Pick<Value> = Value extends "left" ? int32 : int64;
export function left(value: Pick<"left">): int32 { return value; }
export function right(value: Pick<"right">): int64 { return value; }
export function again(value: Pick<"right">): int64 { return value; }
` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    const functions = [];
    const visit = node => {
      if (ast.is.IsFunctionDeclaration(node)) functions.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    for (const [name, width] of [["left", "int32"], ["right", "int64"], ["again", "int64"]]) {
      const owner = functions.find(declaration => ast.text(ast.name(declaration)) === name);
      const parameter = ast.parameters(owner)[0];
      const outcome = program.source.effectiveTypes.get(parameter);
      assert.equal(outcome !== undefined && outcome.kind !== "refused", true, name);
      const structure = sourceTypeDescriptorStructure(outcome.type);
      assert.equal(structure.kind === "primitive" && structure.primitive === width, true, `${name}: actual Host body`);
      assert.equal(targetTypeRefEquals(program.records.nodeTargetType.get(parameter),
        csharpSourcePrimitiveTargetType(width)), true, `${name}: same actual Native body`);
    }
  });

  test(`published ${surface} recursive same-body aliases retain their one nominal target`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int64 } from "@tsonic/core/types.js";
type Tree = int64 | readonly Tree[];
export function first(value: Tree): Tree { return value; }
export function second(value: Tree): Tree { return value; }
` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    const parameters = [];
    const visit = node => {
      if (ast.is.IsFunctionDeclaration(node) && ["first", "second"].includes(ast.text(ast.name(node)))) {
        parameters.push(ast.parameters(node)[0]);
      }
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    const targets = parameters.map(parameter => program.records.nodeTargetType.get(parameter));
    assert.equal(targets.length === 2 && targets.every(target => target?.kind === "target-named" &&
      typeof target.csharpSourceUnionIdentity === "string") && targetTypeRefEquals(targets[0], targets[1]), true,
      "the second complete publication validates the same recursive native definition");
  });

  test(`published ${surface} callable interface signatures use their instantiated parameter and result vector`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int64 } from "@tsonic/core/types.js";
interface Transform<Value> { (value: Value): Value; }
export function apply(callback: Transform<int64>, value: int64): int64 { return callback(value); }
` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    let callback;
    const visit = node => {
      if (ast.is.IsParameterDeclaration(node) && ast.text(ast.name(node)) === "callback") callback = node;
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    const signature = getCsharpDelegateSignature(program.records.nodeTargetType.get(callback));
    const integer = csharpSourcePrimitiveTargetType("int64");
    assert.equal(signature !== undefined && signature.parameters.length === 1 &&
      targetTypeRefEquals(signature.parameters[0], integer) && targetTypeRefEquals(signature.returnType, integer), true,
      "neither signature position can reopen the checker's generic formal");
  });

  test(`published ${surface} local generic classes retain outer and local binder widths independently`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32, int64 } from "@tsonic/core/types.js";
function wrap<Outer>(first: Outer) {
  class Local<Inner> {
    first: Outer;
    value: Inner;
    constructor(first: Outer, value: Inner) { this.first = first; this.value = value; }
  }
  return new Local<int64>(first, 3n);
}
export function run(first: int32): int64 { return wrap(first).value; }
` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    const nodes = [];
    const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
    csharpProgramSourceFiles(program).forEach(visit);
    const call = nodes.find(node => ast.is.IsCallExpression(node) &&
      ast.text(ast.as.AsCallExpression(node).Expression) === "wrap");
    const outcome = program.source.effectiveTypes.get(call);
    assert.equal(outcome !== undefined && outcome.kind !== "refused" && outcome.type.kind === "declared", true,
      "the real call retains the local nominal declaration");
    assert.equal(outcome.type.typeArguments.length === 2, true, "outer and local binders are both published");
    for (const [index, width] of ["int32", "int64"].entries()) {
      const type = sourceTypeDescriptorStructure(outcome.type.typeArguments[index]);
      assert.equal(type.kind === "primitive" && type.primitive === width, true, `published binder ${index}`);
    }
    const target = program.records.nodeTargetType.get(call);
    assert.equal(target?.kind === "target-named" && target.typeArguments.length === 2, true,
      "the Native reference retains the same two binders");
    for (const [index, width] of ["int32", "int64"].entries()) assert.equal(
      targetTypeRefEquals(target.typeArguments[index], csharpSourcePrimitiveTargetType(width)), true, `native binder ${index}`);
  });
}

function publishedMemberFixture() {
  const input = fixture();
  const declaration = input.source.ast.members(input.box)[0];
  const descriptor = { kind: "shape", members: [{ name: "value", optional: false, type: primitive("int64"),
    origin: { kind: "declared", declaration } }], indexes: [], calls: [], constructs: [] };
  let publication = { kind: "resolved", type: descriptor, provenance: { occurrence: input.box } };
  const queries = { ...input.queries, types: new Proxy({}, { get: unexpected }) };
  const host = { ast: input.source.ast, navigation: input.source.navigation,
    effectiveTypes: { get: node => node === input.box ? publication : undefined }, hasSemantics: file => file === input.file,
    semantics: () => queries, semanticsFor: () => queries,
    sourceStorage: { memberSubjectFor: () => undefined }, memoryBindings: { hasBoundField: () => false },
    representations: { genericProjections: () => [] },
    typeResolver: { resolveDescriptor: type => csharpSourcePrimitiveTargetType(type.primitive) },
  };
  const resolver = createCsharpObjectShapeMemberResolver(host);
  const members = resolver.deriveMembers(descriptor, input.box, queries, { depth: 0 });
  assert.equal(members?.length === 1, true);
  return { ...input, host, queries, descriptor, resolver, members, publish: selected => { publication = selected; } };
}

test("canonical retained members preserve the same Native contract without reopening raw property evidence", () => {
  const input = publishedMemberFixture();
  const prior = [{ ...input.members[0], exactNumericStorage: true,
    get sourceTypes() { return unexpected(); }, get sourceMemberEvidence() { return unexpected(); } }];
  const selected = input.resolver.retainPublishedMembers(prior, input.descriptor, input.box, input.queries, { depth: 0 });
  assert.equal(selected?.length === 1 && selected[0].origins?.length === 1 && selected[0].origins[0] === input.descriptor.members[0].origin, true);
  assert.equal(targetTypeRefEquals(selected[0].type, csharpSourcePrimitiveTargetType("int64")) &&
    selected[0].exactNumericStorage === true, true, "the same Native width and physical field contract survive");
  assert.equal(selected[0].sourceTypes === undefined && selected[0].sourceMemberEvidence === undefined, true);
  assert.equal(typeof input.resolver.instantiateMemberEvidence, "undefined", "the raw reconstruction entrypoint is removed");
});

test("canonical retained members reject missing, foreign, stale, duplicate or width-conflicting publication inputs", () => {
  const input = publishedMemberFixture();
  const retain = (members = input.members, descriptor = input.descriptor) =>
    input.resolver.retainPublishedMembers(members, descriptor, input.box, input.queries, { depth: 0 });
  for (const [label, members] of [["missing origin", [{ ...input.members[0], origins: undefined }]],
    ["removed single-origin form", [{ ...input.members[0], origins: undefined, origin: input.descriptor.members[0].origin }]],
    ["foreign origin", [{ ...input.members[0], origins: [{ kind: "declared", declaration: input.parameter }] }]],
    ["duplicate origin", [input.members[0], input.members[0]]],
    ["different width", [{ ...input.members[0], type: csharpSourcePrimitiveTargetType("int32") }]]]) {
    assert.equal(retain(members) === undefined, true, label);
  }
  assert.equal(retain(input.members, { ...input.descriptor }) === undefined, true, "a copied descriptor is not this publication");
  for (const [label, publication] of [["missing", undefined], ["refused", { kind: "refused" }],
    ["foreign occurrence", { kind: "resolved", type: input.descriptor, provenance: { occurrence: input.outer } }]]) {
    input.publish(publication);
    assert.equal(retain() === undefined, true, label);
  }
  const signature = { typeParameters: [], parameters: [], result: input.descriptor };
  const mixed = { kind: "callable", calls: [signature], constructs: [signature] };
  input.publish({ kind: "resolved", type: mixed, provenance: { occurrence: input.box } });
  assert.equal(input.resolver.publishedShapeDescriptor(input.box) === mixed, true, "a mixed callable inventory is not discarded");
  assert.equal(input.resolver.deriveMembers(mixed, input.box, input.queries, { depth: 0 }) === undefined, true,
    "the property-shape consumer cannot silently select only one of the mixed inventories");
});

test("literal construction keeps canonical origins and Native storage without requiring raw checker member handles", () => {
  const input = publishedMemberFixture();
  for (const [kind, sourceText] of [["property", "interface Slot { value: number; } const literal: Slot = { value: 1 };"],
    ["getter", "interface Slot { readonly value: number; } const literal: Slot = { get value() { return 1; } };"],
    ["getter-setter", "interface Slot { value: number; } const literal: Slot = { get value() { return 1; }, set value(next: number) {} };"]]) {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/literal", files: {
    "/literal/index.ts": sourceText,
  }, compilerOptions: { strict: true } }).checkSource();
  assert.equal(checked.diagnostics.length, 0, kind);
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/literal/index.ts");
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  visit(file);
  const literal = nodes.find(node => source.ast.is.IsObjectLiteralExpression(node));
  const owner = nodes.find(node => source.ast.is.IsInterfaceDeclaration(node));
  const declaration = source.ast.members(owner)[0];
  const properties = source.ast.properties(literal);
  const origin = { kind: "declared", declaration };
  const descriptor = { ...input.descriptor, members: [{ ...input.descriptor.members[0], origin,
    ...(kind === "getter" ? { readonly: true } : {}) }] };
  const queries = source.semantics.forFile(file);
  const host = { ...input.host, ast: source.ast, navigation: source.navigation, hasSemantics: actual => actual === file,
    semantics: () => queries, semanticsFor: () => queries,
    effectiveTypes: { get: node => node === literal ? { kind: "resolved", type: descriptor,
      provenance: { occurrence: literal }, memberCorrespondence: properties.map(property => ({ property, origin })) } : undefined } };
  const resolver = createCsharpObjectShapeMemberResolver(host);
  const members = resolver.deriveMembers(descriptor, literal, queries, { depth: 0 });
  const storage = { kind: "target-named", id: "test.CanonicalStorage", typeArguments: [] };
  const expected = { targetType: storage, members, implements: [input.target(input.box, [csharpSourcePrimitiveTargetType("int64")])] };
  const select = createCsharpLiteralShapeResolver(host, { ...resolver, resolveNode: unexpected, rememberTargetShape: shape => shape });
  const selected = select(expected, literal, file);
  assert.equal(selected.kind === "resolved", true, kind);
  assert.equal(kind === "property" ? selected.shape.targetType === storage :
    selected.shape.members[0].accessor?.getter === true && selected.shape.members[0].accessor.setter === (kind === "getter-setter"), true,
    "Native field storage and accessor ABI are retained, not projected from raw checker properties");
  assert.equal(selected.shape.members[0].origins?.some(selectedOrigin => sourceTypeDescriptorMemberOriginsEqual(selectedOrigin, origin)) &&
    targetTypeRefEquals(selected.shape.members[0].type, csharpSourcePrimitiveTargetType("int64")), true);
  assert.equal(properties.every(property => selected.shape.members[0].sourceDeclarations.includes(property)), true,
    "the C49 origin links every actual authored property or accessor");
  assert.equal(selected.shape.members[0].sourceTypes === undefined && selected.shape.members[0].sourceMemberEvidence === undefined, true);
  if (kind === "property") {
    const foreign = { kind: "declared", declaration: properties[0] };
    const retained = { ...expected, members: [{ ...members[0], origins: [origin, foreign] }] };
    const publication = { ...host.effectiveTypes.get(literal), memberCorrespondence: [{ property: properties[0], origin: foreign }] };
    assert.equal(selectCsharpHostLiteralCorrespondence(source.ast, literal, publication, retained, storage).kind === "rejected", true,
      "a different retained origin cannot replace the origin in this current published descriptor");
    const ambiguous = { ...expected, members: [members[0], { ...members[0], sourceKey: { kind: "property", name: "other" },
      sourceName: "other", targetName: "other", origins: [origin, { ...origin }] }] };
    const complete = { ...host.effectiveTypes.get(literal), type: { ...descriptor,
      members: [...descriptor.members, { ...descriptor.members[0], name: "other", origin: foreign }] } };
    assert.equal(selectCsharpHostLiteralCorrespondence(source.ast, literal, complete, ambiguous, storage).kind === "rejected", true,
      "two distinct destination members matching the same current origin remain an ambiguous rejection");
  }
  }
});

test("canonical provider members retain their published origin and the proven nullable native ABI", () => {
  const input = providerMemberFixture();
  const selected = input.resolver.resolvePublishedProperty(input.properties[0], input.descriptor, input.occurrence,
    input.input.queries, { depth: 0 });
  assert.equal(selected?.member === input.structure.members[0], true, "the original published member is not reconstructed");
  assert.equal(input.resolver.deriveMembers(input.descriptor, input.occurrence, input.input.queries, { depth: 0 }, input.target) === undefined,
    true, "an unprepared provider representation cannot be guessed from a descriptor");
  const shape = input.resolver.resolveProviderShape(input.input.type, input.descriptor, input.occurrence,
    input.input.queries, { depth: 0 }, input.target);
  assert.equal(shape !== undefined && shape.members.length === 1, true);
  const member = shape.members[0];
  assert.equal(member.origins?.length === 1 && member.origins[0] === input.structure.members[0].origin, true);
  assert.equal(member.type === input.storage && member.optional === true && member.exactNumericStorage === true &&
    member.targetName === "nativeMode", true, "number is represented by the selected nullable int32 field, not a second Source width choice");
  const retained = input.resolver.retainPublishedMembers(shape.members, input.descriptor, input.occurrence,
    input.input.queries, { depth: 0 }, input.target);
  assert.equal(retained?.length === 1 && retained[0].type === input.storage && retained[0].origins[0] === member.origins[0] &&
    retained[0].exactNumericStorage === true && retained[0].optional === true && retained[0].targetName === "nativeMode", true);
  assert.equal(input.resolver.deriveMembers(input.descriptor, input.occurrence, input.input.queries,
    { depth: 0 }, { ...input.target })?.[0].type === input.storage, true, "the same represented target identity consumes the completed ABI");
  assert.equal(input.resolver.deriveMembers(input.descriptor, input.occurrence, input.input.queries,
    { depth: 0 }, { ...input.target, id: "test.Provider.Other" }) === undefined, true, "a different target has no completed representation");
  assert.equal(input.resolver.resolveProviderShape(input.input.type, input.descriptor, input.occurrence,
    input.input.queries, { depth: 0 }, { ...input.target, id: "test.Provider.Other" }) === undefined &&
    input.resolver.deriveMembers(input.descriptor, input.occurrence, input.input.queries,
      { depth: 0 }, input.target)?.[0].type === input.storage, true, "a rejected different target does not poison the actual target's contract");
  assert.equal(input.resolver.deriveMembers({ ...input.descriptor }, input.occurrence, input.input.queries,
    { depth: 0 }, input.target) === undefined, true, "equal descriptor structure does not reuse another published object's ABI");
  input.publish(input.source.effectiveTypes.get(input.foreign));
  assert.equal(input.resolver.deriveMembers(input.descriptor, input.occurrence, input.input.queries,
    { depth: 0 }, input.target) === undefined, true, "an old complete entry never overrides this occurrence's current publication");
  input.publish(input.publication);
  for (const changed of [{ ...member, type: csharpNullableTargetType(csharpSourcePrimitiveTargetType("int64")) },
    { ...member, type: csharpSourcePrimitiveTargetType("int32") }, { ...member, origins: undefined },
    { ...member, targetName: "anotherField" }]) assert.equal(
      input.resolver.retainPublishedMembers([changed], input.descriptor, input.occurrence, input.input.queries, { depth: 0 }, input.target) === undefined,
      true, "canonical origins never waive the actual provider ABI, absence or destination member");
  assert.equal(typeof input.resolver.resolvePropertyType, "undefined", "there is no raw-carrier-only provider callback");
});

test("canonical provider inventories reject missing, foreign, ambiguous and incomplete publication including empty contracts", () => {
  const input = providerMemberFixture();
  const select = (descriptor = input.descriptor) => resolveProviderObjectLiteralShape({ ...input.input, descriptor });
  assert.equal(select() !== undefined, true);
  input.publish(undefined);
  assert.equal(select() === undefined, true, "a checked provider binding is not a Source publication");
  input.publish(input.source.effectiveTypes.get(input.foreign));
  assert.equal(select() === undefined, true, "the same spelling in another real owner cannot authorize this occurrence");
  input.publish(input.publication);
  assert.equal(select({ ...input.descriptor }) === undefined, true, "a copied descriptor is not this published descriptor");
  const ast = input.input.host.ast;
  input.input.host.ast = { ...ast, getSourceFile: node => node === input.structure.members[0].origin.declaration ? undefined : ast.getSourceFile(node) };
  assert.equal(select() === undefined, true, "a fileless member cannot be rebound through the querying file");
  input.input.host.ast = ast;
  for (const members of [[], [...input.structure.members, ...input.structure.members]]) {
    const descriptor = { ...input.descriptor, definition: { ...input.structure, members } };
    input.publish({ ...input.publication, type: descriptor });
    assert.equal(select(descriptor) === undefined, true, "the entire published member inventory must match exactly once");
    if (members.length > 0) assert.equal(input.resolver.resolvePublishedProperty(input.properties[0], descriptor,
      input.occurrence, input.input.queries, { depth: 0 }) === undefined, true, "a duplicated origin is not a unique selected property");
  }
  input.publish(input.publication);
  const empty = providerMemberFixture(true);
  assert.equal(resolveProviderObjectLiteralShape(empty.input)?.members.length === 0, true, "an empty published contract is valid");
  empty.publish(undefined);
  assert.equal(resolveProviderObjectLiteralShape(empty.input) === undefined, true, "zero members never skip publication validation");
  const unprepared = providerMemberFixture();
  const resolveMember = unprepared.input.host.providers.resolveMember;
  unprepared.input.host.providers.resolveMember = () => ({ kind: "missing" });
  assert.equal(unprepared.resolver.resolveProviderShape(unprepared.input.type, unprepared.descriptor, unprepared.occurrence,
    unprepared.input.queries, { depth: 0 }, unprepared.target) === undefined, true, "an initial missing proof is not a completed contract");
  unprepared.input.host.providers.resolveMember = resolveMember;
  assert.equal(unprepared.resolver.resolveProviderShape(unprepared.input.type, unprepared.descriptor, unprepared.occurrence,
    unprepared.input.queries, { depth: 0 }, unprepared.target) !== undefined, true, "materializing the first complete proof is not blocked by an earlier absence");
  const contradictory = providerMemberFixture();
  const prepare = () => contradictory.resolver.resolveProviderShape(contradictory.input.type, contradictory.descriptor,
    contradictory.occurrence, contradictory.input.queries, { depth: 0 }, contradictory.target);
  assert.equal(prepare() !== undefined, true);
  const prior = contradictory.input.host.providers.resolveMember;
  contradictory.input.host.providers.resolveMember = fact => {
    const selected = prior(fact);
    return { ...selected, relations: selected.relations.map(relation => ({ ...relation,
      targetMember: { ...relation.targetMember, targetName: "contradictoryField" } })) };
  };
  assert.equal(prepare() === undefined && contradictory.resolver.deriveMembers(contradictory.descriptor,
    contradictory.occurrence, contradictory.input.queries, { depth: 0 }, contradictory.target) === undefined, true,
  "a contradictory completed Native contract cannot reuse its earlier representation");
  contradictory.input.host.providers.resolveMember = prior;
  assert.equal(prepare() === undefined && contradictory.resolver.deriveMembers(contradictory.descriptor,
    contradictory.occurrence, contradictory.input.queries, { depth: 0 }, contradictory.target) === undefined, true,
  "restoring an earlier callback cannot erase the contradiction for that same descriptor and target");
  for (const empty of [false, true]) {
    const current = providerMemberFixture(empty, true);
    const expected = resolveProviderObjectLiteralShape(current.input);
    assert.equal(expected !== undefined, true, "the whole real aliased provider contract is independently proven");
    for (const entry of ["node", "type", "literal", "retain"]) {
      const policy = createCsharpObjectShapePolicy(current.input.host);
      const shape = entry === "node" ? policy.resolveNode(current.literal, current.file)
        : entry === "type" ? policy.resolveType(current.input.type, current.file, current.occurrence)
          : entry === "literal" ? policy.resolveObjectLiteralTargetShape(expected, current.literal, current.file).shape
            : policy.retainConstructionSource(current.literal, current.input.queries.types.expressionType(current.literal), expected, current.file);
      assert.equal(shape !== undefined && shape.members.length === expected.members.length &&
        shape.members.every(member => member.origins?.length === 1 && member.type === current.storage &&
          member.optional === true && member.exactNumericStorage === true), true, `${entry}, empty=${empty}: no entry order requires prior discovery`);
      const repeated = policy.resolveNode(current.literal, current.file);
      assert.equal(repeated !== undefined && targetTypeRefEquals(repeated.targetType, shape.targetType) &&
        repeated.members.length === shape.members.length, true, `${entry}, empty=${empty}: ordinary later discovery consumes the same contract`);
      if (!empty) {
        const actual = current.input.queries.types.expressionType(current.literal);
        assert.equal(actual !== undefined && !current.input.queries.types.isIdentical(actual, current.input.type), true,
          "the authored empty expression and its complete provider contract are distinct checked types");
        assert.equal(policy.resolveType(actual, current.file, current.literal) === undefined, true,
          `${entry}: an incomplete own-shape request is not a validated provider representation`);
        assert.equal(policy.resolveNode(current.literal, current.file)?.members.every(member => member.type === current.storage) === true, true,
          `${entry}: a raw own-shape request cannot veto the completed descriptor/Native target contract`);
      }
      if (!empty) {
        const prior = current.input.host.providers.resolveMember;
        current.input.host.providers.resolveMember = fact => {
          const selected = prior(fact);
          return { ...selected, relations: selected.relations.map(relation => ({ ...relation,
            targetMember: { ...relation.targetMember, targetName: "contradictoryField" } })) };
        };
        assert.equal(policy.resolveNodeWithState(current.literal, current.file, { depth: 0, sourceBindings: new Map() }) === undefined, true,
          `${entry}: contradictory revalidation cannot replace a completed provider contract`);
        current.input.host.providers.resolveMember = prior;
        assert.equal(policy.resolveNode(current.literal, current.file) === undefined, true,
          `${entry}: the node cache cannot bypass that descriptor's sticky contradiction`);
      }
    }
  }
});

test("real empty provider constructions retain optional canonical origins and exact Native mode storage through local aliases", () => {
  for (const body of ["return {};", "const options: MakeDirectoryOptions = {}; const alias = options; return alias;",
    "const base = {}; let options: MakeDirectoryOptions = base; return options;",
    "type First = MakeDirectoryOptions; type Second = First; const options: Second = {}; return options;"]) {
    const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: `
      import type { MakeDirectoryOptions } from "node:fs";
      export function make(): MakeDirectoryOptions { ${body} }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const [shape] = csharpProgramObjectLiteralShapes(program);
    assert.equal(shape !== undefined && shape.targetType.kind === "target-named" &&
      shape.targetType.id === "Tsonic.CSharp.Node.MakeDirectoryOptions" && shape.members.length === 2, true);
    const mode = shape.members.find(member => member.sourceName === "mode");
    const recursive = shape.members.find(member => member.sourceName === "recursive");
    assert.equal(mode?.optional === true && mode.exactNumericStorage === true &&
      targetTypeRefEquals(getCsharpNullableElementTargetType(mode.type), csharpSourcePrimitiveTargetType("int32")), true);
    assert.equal(recursive?.optional === true &&
      targetTypeRefEquals(getCsharpNullableElementTargetType(recursive.type), csharpSourcePrimitiveTargetType("bool")), true);
    const nodes = [];
    const visit = node => { nodes.push(node); program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
    csharpProgramSourceFiles(program).forEach(visit);
    const literal = nodes.find(node => program.source.ast.is.IsObjectLiteralExpression(node));
    const outcome = program.source.effectiveTypes.get(literal);
    const descriptor = outcome?.kind === "refused" ? undefined : outcome?.type;
    const structure = descriptor === undefined ? undefined : sourceTypeDescriptorStructure(descriptor);
    assert.equal(structure?.kind === "shape" && structure.members.length === 2 && shape.members.every(member =>
      member.origins?.some(origin => structure.members.some(published => sourceTypeDescriptorMemberOriginsEqual(origin, published.origin))) === true), true,
    "provider fields retain the actual published destination origins despite the empty authored literal");
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal([...output.matchAll(/new Tsonic\.CSharp\.Node\.MakeDirectoryOptions\b/gu)].length === 1, true);
    assert.doesNotMatch(output, /TsObject|Activator|DynamicInvoke|System\.Reflection|\.Clone\(|\.ToArray\(/u);
  }
});

test("native construction consumes only the completed canonical provider contract and retains its safety refusals", () => {
  for (const empty of [false, true]) {
    const current = providerMemberFixture(empty, true);
    const policy = createCsharpObjectShapePolicy(current.input.host);
    const expected = policy.resolveNode(current.literal, current.file);
    assert.equal(expected !== undefined, true, "the actual preparation boundary validates the provider ABI first");
    const demand = shape => createCsharpNativeConstructionDemandQuery({ ...current.input.host,
      sourceFiles: [current.file],
      resolveEffectiveShape: () => shape,
      resolveShape: unexpected,
      resolveLiteralShape: (selected, node, file) => policy.resolveObjectLiteralTargetShape(selected, node, file),
      retainSourceShape: unexpected,
      publishedShapeTarget: node => {
        const descriptor = current.resolver.publishedShapeDescriptor(node);
        return descriptor === undefined ? undefined : current.input.host.typeResolver.resolveDescriptor(descriptor);
      },
      scopedTargetType: () => undefined,
    });
    const selected = demand(expected);
    assert.equal(selected.issues.length, 0, "canonical proof never reopens raw own-member evidence");
    const retained = selected.constructionFor(current.literal)?.shape;
    assert.equal(retained !== undefined && retained.members.length === expected.members.length && retained.members.every(member =>
      member.optional === true && member.exactNumericStorage === true && member.type === current.storage &&
      member.origins?.length === 1 && member.origins[0] === current.structure.members[0].origin), true,
    "even the empty literal retains the complete selected provider ABI and its actual published origins");
    if (empty) continue;
    const member = expected.members[0];
    for (const changed of [
      { ...expected, members: [{ ...member, origins: undefined }] },
      { ...expected, members: [{ ...member, origins: [{ kind: "declared", declaration: current.foreign }] }] },
      { ...expected, members: [{ ...member, type: csharpSourcePrimitiveTargetType("int64") }] },
      { ...expected, members: [{ ...member, targetName: "unselectedField" }] },
      { ...expected, targetType: { ...expected.targetType, id: "foreign.Provider" } },
    ]) {
      const rejected = demand(changed);
      assert.equal(rejected.issues.length === 1 && rejected.issues[0].code === "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN" &&
        rejected.issues[0].node === current.literal && rejected.constructionFor(current.literal) === undefined, true,
      "missing, foreign or contradictory Native contract facts never publish a partial construction");
    }
  }
});

test("canonical provider construction retains parameter, property, direct and populated destination entry paths", () => {
  for (const body of [
    "const options: MakeDirectoryOptions = {}; return options;",
    "function accept(options: MakeDirectoryOptions): MakeDirectoryOptions { return options; } return accept({});",
    "const holder: { options: MakeDirectoryOptions } = { options: {} }; return holder.options;",
    "return { recursive: true };",
    "const options: MakeDirectoryOptions = { mode: 493 }; const alias = options; return alias;",
  ]) {
    const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: `
      import type { MakeDirectoryOptions } from "node:fs";
      export function make(): MakeDirectoryOptions { ${body} }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const shapes = csharpProgramObjectLiteralShapes(compiled.result.program).filter(shape =>
      shape.targetType.kind === "target-named" && shape.targetType.id === "Tsonic.CSharp.Node.MakeDirectoryOptions");
    assert.equal(shapes.length === 1 && shapes[0].members.length === 2, true,
      "the declared provider destination selects exactly one original Native allocation in every existing entry path");
    const mode = shapes[0].members.find(member => member.sourceName === "mode");
    assert.equal(mode?.optional === true && mode.exactNumericStorage === true && mode.origins?.length > 0 &&
      targetTypeRefEquals(getCsharpNullableElementTargetType(mode.type), csharpSourcePrimitiveTargetType("int32")), true,
    "published Source origins do not erase optional provider Native mode storage");
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal([...output.matchAll(/new Tsonic\.CSharp\.Node\.MakeDirectoryOptions\b/gu)].length === 1, true);
    assert.doesNotMatch(output, /TsObject|Activator|DynamicInvoke|System\.Reflection|\.Clone\(|\.ToArray\(/u);
  }
});

test("an indexed provider needs no indexer ABI for zero writes but refuses a dynamic entry precisely", () => {
  for (const [indexType, value] of [["number", "1"], ["string", '"v"']]) {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: { "/src/index.ts": `
    interface Indexed { [key: string]: ${indexType}; }
    declare const current: Indexed;
    function read(): Indexed { return current; }
    function empty(): Indexed { return {}; }
    function dynamic(key: string): Indexed { return { [key]: ${value} }; }
  ` }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  const queries = source.semantics.forFile(file);
  const nodes = [];
  const visit = node => { nodes.push(node); source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  visit(file);
  const declaration = nodes.find(node => source.ast.is.IsInterfaceDeclaration(node) && source.ast.text(source.ast.name(node)) === "Indexed");
  const occurrence = nodes.find(node => source.ast.is.IsIdentifier(node) && source.ast.text(node) === "current" &&
    source.ast.is.IsReturnStatement(source.ast.parent(node)));
  const literals = nodes.filter(node => source.ast.is.IsObjectLiteralExpression(node));
  assert.equal(declaration !== undefined && occurrence !== undefined && literals.length === 2, true);
  const type = queries.types.expressionType(occurrence);
  assert.equal(type !== undefined, true, "the exact checked provider receiver is retained");
  const subjects = queries.facts.typeSubjects(type);
  const target = { kind: "target-named", id: "test.Provider.Indexed", csharpAllowsRefLikeTypeArguments: [] };
  const binding = { target: "csharp", id: target.id, csharpType: target };
  const host = { ast: source.ast, navigation: source.navigation, effectiveTypes: source.effectiveTypes,
    sourceFiles: [file], semanticsFor: source.semantics.forNode, semantics: source.semantics.forFile, hasSemantics: source.semantics.includes,
    sourceFacts: { getFact(subject, key) {
      return key === providerVirtualDeclarationFactKey && (subject === declaration || subjects.includes(subject))
        ? { id: "Indexed" } : source.sourceFacts.getFact(subject, key);
    } },
    providers: { resolveType: () => ({ kind: "resolved", relations: [{ kind: "type", targetBinding: binding,
      bindingTypeParameters: [], objectLiteralConstruction: { kind: "object-initializer" } }] }), resolveMember: unexpected },
    typeResolver: { resolveDescriptor: () => target },
  };
  const resolver = createCsharpObjectShapeMemberResolver(host);
  for (const literal of literals) {
    const descriptor = resolver.publishedShapeDescriptor(literal);
    const structure = descriptor === undefined ? undefined : sourceTypeDescriptorStructure(descriptor);
    assert.equal(descriptor?.kind === "declared" && descriptor.declaration === declaration &&
      structure?.kind === "shape" && structure.members.length === 0 && structure.indexes.length === 1, true,
      "both exact current occurrences retain the same declared Source index inventory");
  }
  const selected = createCsharpNativeConstructionDemandQuery({ ...host,
    resolveEffectiveShape: literal => {
      const descriptor = resolver.publishedShapeDescriptor(literal);
      return descriptor === undefined ? undefined : resolver.resolveProviderShape(type, descriptor, literal, queries, { depth: 0 }, target);
    },
    resolveLiteralShape: (shape, literal) => {
      const descriptor = resolver.publishedShapeDescriptor(literal);
      const members = descriptor === undefined ? undefined : resolver.retainPublishedMembers(shape.members,
        descriptor, literal, queries, { depth: 0 }, target);
      return members === undefined ? { kind: "rejected", subject: literal, reason: "Missing current provider representation." }
        : { kind: "resolved", shape: { ...shape, members } };
    },
    resolveShape: unexpected, retainSourceShape: unexpected, publishedShapeTarget: () => target, scopedTargetType: () => undefined,
  });
  assert.equal(selected.constructionFor(literals[0])?.targetType === target && selected.constructionFor(literals[1]) === undefined, true,
    "zero index writes retain their one original Native allocation; a dynamic write is not silently discarded");
  assert.equal(selected.issues.length === 1 && selected.issues[0].node === literals[1] &&
    selected.issues[0].code === "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN" &&
    selected.issues[0].message === "Object-literal index entries require an exact selected C# provider indexer relation.", true);
  }
});

test("a retained provider alias validates its current publication and target without changing allocation identity", () => {
  for (const changed of ["current", "missing", "foreign-origin", "foreign-target"]) {
    const current = providerMemberFixture(false, false, `
      interface Options { mode?: number; }
      interface Foreign { mode?: number; }
      declare const options: Options; declare const foreign: Foreign;
      function read(): Options { return options; } function readForeign(): Foreign { return foreign; }
      function make(): Options { const value: Options = {}; void value; return value; }
    `);
    const nodes = [];
    const ast = current.source.ast;
    const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
    visit(current.file);
    const alias = nodes.find(node => ast.is.IsIdentifier(node) && ast.text(node) === "value" && ast.is.IsReturnStatement(ast.parent(node)));
    const foreign = sourceTypeDescriptorStructure(current.source.effectiveTypes.get(current.foreign).type).members[0].origin;
    const original = current.input.host.effectiveTypes.get;
    const publication = original(alias);
    assert.equal(alias !== undefined && publication !== undefined && publication.kind !== "refused" && publication.type.kind === "declared", true);
    const different = { ...publication, type: { ...publication.type, definition: { ...current.structure,
      members: current.structure.members.map(member => ({ ...member, origin: foreign })) } } };
    current.input.host.effectiveTypes = { get: node => node !== alias ? original(node) : changed === "missing" ? undefined
      : changed === "foreign-origin" ? different : publication };
    const policy = createCsharpObjectShapePolicy(current.input.host);
    const selected = createCsharpNativeConstructionDemandQuery({ ...current.input.host, sourceFiles: [current.file],
      resolveEffectiveShape: (node, file) => policy.resolveNode(node, file),
      resolveShape: unexpected,
      resolveLiteralShape: (shape, node, file) => policy.resolveObjectLiteralTargetShape(shape, node, file),
      retainSourceShape: (node, type, shape, file) => policy.retainConstructionSource(node, type, shape, file),
      publishedShapeTarget: node => node === alias && changed === "foreign-target" ? { ...current.target, id: "foreign.Provider" }
        : policy.publishedShapeTarget(node),
      scopedTargetType: () => undefined,
    });
    const literal = selected.constructionFor(current.literal);
    const retained = selected.constructionFor(alias);
    assert.equal(literal !== undefined, true, "a different alias publication cannot erase the separately proven original construction");
    assert.equal(retained !== undefined, changed === "current", "missing, foreign-origin and foreign-target publications cannot inherit a stale construction");
    if (changed === "current") assert.equal(retained.shape === literal.shape && retained.targetType === literal.targetType, true,
      "current canonical validation preserves the original proven allocation identity");
  }
});
