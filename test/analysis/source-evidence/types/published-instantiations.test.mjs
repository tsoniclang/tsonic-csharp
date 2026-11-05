import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram, sourceTypeDescriptorMemberOriginsEqual, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { resolveCsharpSourceTypeDescriptor } from "../../../../dist/analysis/source-evidence/types/resolution/effective-types.js";
import { resolveCsharpProjectionArguments } from "../../../../dist/analysis/source-evidence/types/resolution/projection-arguments.js";
import { createCsharpSourceUnionDefinitions } from "../../../../dist/analysis/source-evidence/types/resolution/union-definitions.js";
import { createCsharpObjectShapeMemberResolver } from "../../../../dist/analysis/objects/shapes/member-evidence.js";
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
import { csharpProgramSourceFiles } from "../../../helpers/program-source-files.mjs";

const unexpected = () => assert.fail("a published instantiation never reopens checker types or a competing member inventory");
const primitive = name => ({ kind: "primitive", primitive: name });

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
