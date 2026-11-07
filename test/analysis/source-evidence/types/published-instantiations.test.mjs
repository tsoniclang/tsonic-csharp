// Published instantiations (nextgen C-2542). Emission programs keep their expected C# output and now read the Host
// through SourceProgramFacts (facts.values / facts.objects) and the syntax reader. The unit tests of the retired engine
// (alias-application caches, union definitions, projection arguments, member/literal/provider/project construction
// resolvers) are replaced by representation tests over real Host facts (I6) at the end of this file; AGENT-C3-NOTES-F3
// lists each replaced test and its successor.
import assert from "node:assert/strict";
import test from "node:test";
import { sourceTypeDescriptorMemberOriginsEqual, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { getCsharpDelegateSignature } from "../../../../dist/target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../../dist/target-model/types/equality.js";
import { csharpRepresentationContext, representObject } from "../../../../dist/representation/index.js";
import { createCsharpTypeDefinitionRegistry } from "../../../../dist/analysis/project-types/type-definitions.js";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { csharpProgramObjectLiteralShapes, csharpProgramSourceFiles } from "../../../helpers/program-source-files.mjs";
import { hostProgram, representationServices, representations, represented } from "../../../representation/host-fixture.mjs";
import { createTsonicPlugin as nodejsCapability } from "../../../../../csharp-nodejs/dist/index.js";

test("C2377 class forwarding keeps the declared instance and its published member origins", () => {
  for (const surface of ["native", "js"]) {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int32 } from "@tsonic/core/types.js";
      interface View { read(value?: int32): int32; }
      class Reader { read(value: int32 = 7): int32 { return value; } }
      export function run(): int32 { const value: View = new Reader(); return value.read(); }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.syntax;
    const facts = program.source.facts;
    const pending = [...csharpProgramSourceFiles(program)];
    let declaration;
    while (pending.length > 0) {
      const node = pending.pop();
      if (ast.is.IsClassDeclaration(node) && ast.text(ast.name(node)) === "Reader") declaration = node;
      ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
    }
    assert.equal(declaration !== undefined, true, surface + ": original declaration");
    const members = facts.objects.members({ kind: "declared", declaration, typeArguments: [] });
    const shape = program.objectShapes.resolveNode(declaration);
    assert.equal(Array.isArray(members) && members.length === 1 && shape !== undefined && shape.members.length === 1,
      true, surface + ": the full class instance member inventory survives forwarding");
    const original = members[0];
    const member = shape.members[0];
    assert.equal(original.kind === "method" && ast.is.IsMethodDeclaration(original.declarations[0]) &&
      member.origins?.some(origin => sourceTypeDescriptorMemberOriginsEqual(origin, { kind: "declared", declaration: original.declarations[0] })) === true,
    true, surface + ": the native member keeps its declared origin");
    const signature = getCsharpDelegateSignature(member.type);
    assert.equal(signature !== undefined && targetTypeRefEquals(signature.returnType, csharpSourcePrimitiveTargetType("int32")),
      true, surface + ": the declared native result width is unchanged");
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
    const ast = program.source.syntax;
    const nodes = [];
    const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
    for (const file of csharpProgramSourceFiles(program)) visit(file);
    const expectedName = width === "nativeInt" ? "native-int" : width === "nativeUint" ? "native-uint" : width;
    for (const name of ["direct", "nested", "alias", "mapped", "conditional", "indexed", "classField"]) {
      const declaration = nodes.find(node => ast.is.IsFunctionDeclaration(node) && ast.text(ast.name(node)) === name);
      const returned = ast.statements(ast.body(declaration)).find(node => ast.is.IsReturnStatement(node));
      const expression = ast.as.AsReturnStatement(returned).Expression;
      const outcome = program.source.facts.values.type(expression);
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
    const ast = program.source.syntax;
    const functions = [];
    const visit = node => {
      if (ast.is.IsFunctionDeclaration(node)) functions.push(node);
      ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    csharpProgramSourceFiles(program).forEach(visit);
    for (const [name, width] of [["left", "int32"], ["right", "int64"], ["again", "int64"]]) {
      const owner = functions.find(declaration => ast.text(ast.name(declaration)) === name);
      const parameter = ast.parameters(owner)[0];
      const outcome = program.source.facts.values.type(parameter);
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
    const ast = program.source.syntax;
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
    const ast = program.source.syntax;
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
    const ast = program.source.syntax;
    const nodes = [];
    const visit = node => { nodes.push(node); ast.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
    csharpProgramSourceFiles(program).forEach(visit);
    const call = nodes.find(node => ast.is.IsCallExpression(node) &&
      ast.text(ast.as.AsCallExpression(node).Expression) === "wrap");
    const outcome = program.source.facts.values.type(call);
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
    assert.equal(mode?.optional === true &&
      targetTypeRefEquals(getCsharpNullableElementTargetType(mode.type), csharpSourcePrimitiveTargetType("int32")), true);
    assert.equal(recursive?.optional === true &&
      targetTypeRefEquals(getCsharpNullableElementTargetType(recursive.type), csharpSourcePrimitiveTargetType("bool")), true);
    const nodes = [];
    const visit = node => { nodes.push(node); program.source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
    csharpProgramSourceFiles(program).forEach(visit);
    const literal = nodes.find(node => program.source.syntax.is.IsObjectLiteralExpression(node));
    const outcome = program.source.facts.values.type(literal);
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
    assert.equal(mode?.optional === true && mode.origins?.length > 0 &&
      targetTypeRefEquals(getCsharpNullableElementTargetType(mode.type), csharpSourcePrimitiveTargetType("int32")), true,
    "published Source origins do not erase optional provider Native mode storage");
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal([...output.matchAll(/new Tsonic\.CSharp\.Node\.MakeDirectoryOptions\b/gu)].length === 1, true);
    assert.doesNotMatch(output, /TsObject|Activator|DynamicInvoke|System\.Reflection|\.Clone\(|\.ToArray\(/u);
  }
});


test("a provider numeric field retains only compatible authored literal storage through its canonical origin", () => {
  for (const [initializer, admitted] of [["493", true], ["493 as int32", true],
    ["493 as float64", false], ["(493 as float64)", false]]) {
    const compiled = compileCsharpSource({ surface: "js", capabilities: [nodejsCapability()], sourceText: `
      import type { int32, float64 } from "@tsonic/core/types.js";
      import type { MakeDirectoryOptions } from "node:fs";
      export function make(): MakeDirectoryOptions { return { mode: ${initializer} }; }
    ` });
    assert.equal(compiled.sourceDiagnosticsText, "", "the authored field is valid Source");
    assert.equal(compiled.targetDiagnostics.some(issue => issue.code.startsWith("TSONIC_")), false,
      "Source publication is not replaced by a Native storage decision");
    if (!admitted) {
      assert.equal(compiled.targetDiagnostics.some(issue => issue.code === "CSHARP_NATIVE_CONSTRUCTION_NOT_PROVEN"), true,
        "a published authored float64 cannot be narrowed into the provider's int32 storage");
      continue;
    }
    assertCsharpCompilationSucceeded(compiled);
    const shape = csharpProgramObjectLiteralShapes(compiled.result.program).find(selected =>
      selected.targetType.kind === "target-named" && selected.targetType.id === "Tsonic.CSharp.Node.MakeDirectoryOptions");
    const mode = shape?.members.find(member => member.sourceName === "mode");
    assert.equal(mode?.optional === true, true, "the provider's optional absence is retained");
    assert.equal(targetTypeRefEquals(getCsharpNullableElementTargetType(mode.type), csharpSourcePrimitiveTargetType("int32")), true,
      "an ordinary number or matching authored width retains the same provider storage");
  }
});

// ---- Representation over Host facts (successors of the retired engine unit tests) ----

const memberProgram = () => hostProgram(`
  import type { int64 } from "@tsonic/core/types.js";
  interface Box<Value> { value: Value; items: Value[]; }
  type First = int64 | readonly First[];
  type Second = int64 | readonly Second[];
  declare const box: Box<int64>;
  declare const first: First;
  declare const second: Second;
`);

test("same-body recursive aliases keep distinct nominal carriers, one registered union each", () => {
  const program = memberProgram();
  const registry = createCsharpTypeDefinitionRegistry();
  const represent = representations(representationServices(program, { typeDefinitions: registry }));
  const variable = name => program.named(name, node => program.ast.is.IsVariableDeclaration(node));
  const first = represented(represent.slot(variable("first")));
  const second = represented(represent.slot(variable("second")));
  assert.equal(first.kind === "target-named" && second.kind === "target-named" && first.id !== second.id, true,
    "the alias identity, not the represented argument vector, names the carrier");
  assert.equal(registry.sourceUnions().length, 2);
  assert.equal(targetTypeRefEquals(represented(represent.slot(variable("first"))), first), true, "a second read is identical");
});

test("one published member inventory keeps exact width and declaration origin", () => {
  const program = memberProgram();
  const box = program.named("box", node => program.ast.is.IsVariableDeclaration(node));
  const descriptor = program.slot(box);
  const members = program.facts.objects.members(descriptor);
  assert.equal(Array.isArray(members) && members.length === 2, true);
  const value = members.find(member => member.name === "value");
  assert.equal(sourceTypeDescriptorStructure(value.type).primitive, "int64", "the instantiated member width is a Host fact");
  const boxDeclaration = program.named("Box", node => program.ast.is.IsInterfaceDeclaration(node));
  assert.equal(program.ast.parent(value.declarations[0]) === boxDeclaration, true, "the origin is the generic declaration member");
  let retained;
  const services = representationServices(program, { shapes: Object.freeze({ retainShape: shape => { retained = shape; return shape; },
    resolveCallableValue: () => assert.fail("no callable member") }) });
  represented(representObject(descriptor, members, csharpRepresentationContext(services, box, "storage")));
  const member = retained.members.find(selected => selected.sourceName === "value");
  assert.equal(targetTypeRefEquals(member.type, csharpSourcePrimitiveTargetType("int64")), true, "never the checker's number");
  assert.equal(member.sourceDeclarations[0] === value.declarations[0], true);
});

test("construction never drops a published call, construct or index inventory and never opens an unexpressible cut", () => {
  const program = memberProgram();
  const box = program.named("box", node => program.ast.is.IsVariableDeclaration(node));
  const represent = representations(representationServices(program));
  const member = { name: "value", optional: false, type: { kind: "string" },
    origin: { kind: "declared", declaration: box } };
  const signature = { typeParameters: [], parameters: [], result: { kind: "string" } };
  assert.equal(represent.type({ kind: "shape", members: [member], indexes: [], calls: [signature], constructs: [] }, box, "storage").code,
    "CSHARP_SHAPE_CALLABLE_MEMBERS");
  assert.equal(represent.type({ kind: "shape", members: [member], calls: [], constructs: [],
    indexes: [{ key: { kind: "string" }, type: { kind: "string" }, readonly: false }] }, box, "storage").code, "CSHARP_INDEX_SIGNATURES");
  const alias = program.named("First", node => program.ast.is.IsTypeAliasDeclaration(node));
  assert.equal(represent.type({ kind: "declared", declaration: alias, typeArguments: [], cut: "unexpressible" }, box, "storage").code,
    "CSHARP_DECLARATION_UNEXPRESSIBLE", "an unexpressible declaration is refused, never rebuilt");
});
