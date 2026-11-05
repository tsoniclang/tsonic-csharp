import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram, sourceTypeDescriptorMemberOriginsEqual, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { resolveCsharpSourceTypeDescriptor } from "../../../../dist/analysis/source-evidence/types/resolution/effective-types.js";
import { resolveCsharpProjectionArguments } from "../../../../dist/analysis/source-evidence/types/resolution/projection-arguments.js";
import { createCsharpSourceUnionDefinitions } from "../../../../dist/analysis/source-evidence/types/resolution/union-definitions.js";
import { createCsharpObjectShapeMemberResolver } from "../../../../dist/analysis/objects/shapes/member-evidence.js";
import { createCsharpProjectShapeProjection } from "../../../../dist/analysis/objects/shapes/project-construction.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpDelegateSignature } from "../../../../dist/target-model/types/carriers/delegates.js";
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
  return { source, file, nodes, box, alias, local, outer, parameter, queries, definitions, target, scope };
}

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
    semantics: () => queries, semanticsFor: () => queries,
    sourceStorage: { memberSubjectFor: () => undefined }, memoryBindings: { hasBoundField: () => false },
    representations: { genericProjections: () => [] },
    typeResolver: { resolveDescriptor: type => type.kind === "primitive" ? csharpSourcePrimitiveTargetType(type.primitive)
      : type.kind === "array" ? { kind: "array", element: csharpSourcePrimitiveTargetType(type.element.primitive) } : unexpected() },
  };
  const members = createCsharpObjectShapeMemberResolver(host).deriveMembers(descriptor, input.box, queries, { depth: 0 });
  assert.equal(members !== undefined && members.length === 2, true, "the full published member vector is retained");
  for (const [index, member] of members.entries()) {
    assert.equal(sourceTypeDescriptorMemberOriginsEqual(member.origin, descriptor.definition.members[index].origin), true,
      member.sourceName);
    assert.equal(member.sourceTypes === undefined && member.sourceMemberEvidence === undefined, true,
      "no source Type or raw re-instantiation evidence accompanies the canonical origin");
  }
  assert.equal(targetTypeRefEquals(members[0].type, csharpSourcePrimitiveTargetType("int64")), true);
  assert.equal(targetTypeRefEquals(members[1].type.element, csharpSourcePrimitiveTargetType("int64")), true);
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
    assert.equal(member !== undefined && member.origin !== undefined && sourceTypeDescriptorMemberOriginsEqual(member.origin,
      { kind: "declared", declaration }), true, "construction retains the actual generic declaration origin");
    assert.equal(targetTypeRefEquals(member.type, csharpSourcePrimitiveTargetType(expectedName)), true,
      "the construction member never reverts to the checker declaration's number or bigint");
  });
}

for (const surface of ["native", "js"]) {
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
