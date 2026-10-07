import { assertNoTargetDiagnostics } from "../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { selectCsharpNativeFlowMembers } from "../../../dist/policy/types/resolution/native-flow-refinement.js";
import { csharpJsArrayTargetType, csharpJsDateTargetType, csharpJsRegExpTargetType } from "../../../dist/policy/types/resolution/surface-types.js";
import { csharpStringTargetType, csharpObjectTargetType } from "../../../dist/target-model/types/scalar-types.js";
import { csharpRuntimeUnionTargetType, getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/runtime-carriers.js";
import { resolveCsharpInstanceType } from "../../../dist/policy/types/resolution/instance-tests.js";
import { resolveSelectedValueWithState } from "../../../dist/policy/types/resolution/public-api.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/nullable.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { createCsharpSourceUnionIndex } from "../../../dist/policy/types/resolution/source-unions.js";

test("native nominal guard selection completes partial typeof evidence through the exact constructor owner", () => {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: { "/src/index.ts": `
declare class Pattern { test(text: string): boolean; }
declare function observe(value: unknown): void;
function run(value: string | Pattern | string[]): void {
  if (typeof value === "string") return;
  if (value instanceof Pattern) observe(value);
}
` }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assertNoTargetDiagnostics(checked.diagnostics);
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  const reads = [];
  const visit = node => {
    if (source.ast.is.IsCallExpression(node)) {
      const call = source.semantics.forNode(node).operations.call(node);
      if (source.ast.text(call?.sourceCallee.expression) === "observe") reads.push(call.sourceArguments[0].expression);
    }
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  assert.equal(reads.length, 1);
  const context = { ast: source.ast, navigation: source.navigation, sourceFacts: source.sourceFacts,
    semanticsFor: node => source.semantics.forNode(node), closedTypeGuard: () => undefined };
  const string = csharpStringTargetType();
  const regexp = csharpJsRegExpTargetType();
  const array = csharpJsArrayTargetType(string);
  const carrier = csharpRuntimeUnionTargetType([string, regexp, array]);
  let queries = 0;
  const selected = selectCsharpNativeFlowMembers(context, reads[0], carrier, guard => {
    queries++;
    assert.equal(source.navigation.sourceReferenceFor(guard.sourceConstructor)?.declaration, guard.declaration);
    return regexp;
  });
  assert.equal(queries, 1);
  assert.deepEqual(selected, [regexp]);
  const unknown = selectCsharpNativeFlowMembers(context, reads[0], carrier, () => undefined);
  assert.equal(unknown.length, 2);
});

test("nominal constructor policy requires every selected construct signature to have one exact native result", () => {
  const constructor = {};
  const type = {};
  const first = {};
  const second = {};
  const string = csharpStringTargetType();
  const regexp = csharpJsRegExpTargetType();
  const select = (signatures, resolve) => resolveCsharpInstanceType({ types: {
    expressionType: node => node === constructor ? type : undefined,
    signatureInfos: (selected, kind) => selected === type && kind === "construct" ? signatures : [],
  } }, constructor, resolve);
  assert.deepEqual(select([{ returnType: first }, { returnType: second }], () => regexp), regexp);
  assert.equal(select([], () => regexp), undefined);
  assert.equal(select([{ returnType: first }, {}], () => regexp), undefined);
  assert.equal(select([{ returnType: first }, { returnType: second }], selected => selected === first ? regexp : string), undefined);
  assert.equal(select([{ returnType: first }], () => undefined), undefined);
});

test("literal guards retain exact native integer widths and broad unknown payloads", () => {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: { "/src/index.ts": `
    declare function observe(value: unknown): void;
    function run(value: unknown): void {
      if (value === 1) observe(value);
      if (value === 1n) observe(value);
      if (value === "route") observe(value);
    }
  ` }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assertNoTargetDiagnostics(checked.diagnostics);
  const source = createTargetSourceProgram(checked);
  const reads = [];
  const visit = node => {
    const call = source.semantics.forNode(node).operations.call(node);
    if (source.ast.text(call?.sourceCallee.expression) === "observe") reads.push(call.sourceArguments[0].expression);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(checked.getSourceFile("/src/index.ts"));
  assert.equal(reads.length, 3);
  const context = { ast: source.ast, navigation: source.navigation, sourceFacts: source.sourceFacts,
    semanticsFor: node => source.semantics.forNode(node), closedTypeGuard: () => undefined };
  const carriers = [{ kind: "source-primitive", name: "int32" }, { kind: "source-primitive", name: "int64" },
    csharpObjectTargetType(), csharpStringTargetType()];
  const carrier = csharpRuntimeUnionTargetType(carriers);
  const selected = reads.map(reference => selectCsharpNativeFlowMembers(context, reference, carrier, () => undefined));
  assert.deepEqual(selected, [carriers.slice(0, 3), carriers.slice(0, 3), carriers.slice(2)]);
});

test("selected native values materialize all surviving exact union arms and retain object evidence", () => {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: { "/src/index.ts": `
    declare class Bytes { bytes: number; }
    declare class Packet { tag: string; }
    declare function observe(value: unknown): void;
    function run(value: string | number | Bytes | Packet | null): void {
      if (value == null) return;
      if (value instanceof Bytes) return;
      observe(value);
      if (typeof value === "string") observe(value);
    }
  ` }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0);
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  const reads = [];
  const visit = node => {
    const call = source.semantics.forNode(node).operations.call(node);
    if (source.ast.text(call?.sourceCallee.expression) === "observe") reads.push(call.sourceArguments[0].expression);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  assert.equal(reads.length, 2);
  const string = csharpStringTargetType();
  const integer = { kind: "source-primitive", name: "int64" };
  const bytes = csharpJsRegExpTargetType();
  const packet = csharpJsDateTargetType();
  const shape = { targetType: packet, members: [] };
  const storage = csharpNullableTargetType(csharpRuntimeUnionTargetType([string, integer, bytes, packet]));
  const declaration = source.navigation.referenceFor(reads[0]).declaration;
  const queries = source.semantics.forFile(file);
  const sourceUnions = createCsharpSourceUnionIndex();
  const declared = queries.declarations.declaredValueType(declaration);
  const nominal = new Map([["Bytes", bytes], ["Packet", packet]]);
  const members = queries.types.unionOrIntersectionTypes(declared).filter(type => !queries.types.isNullish(type))
    .map(type => {
      const symbol = queries.declarations.typeSymbol(type);
      const carrier = queries.types.isStringLike(type) ? string : queries.types.isNumberLike(type) ? integer
        : symbol === undefined ? undefined : nominal.get(queries.declarations.symbolName(symbol));
      assert.equal(carrier !== undefined, true, "each checked union member has its exact fixture carrier");
      return { source: type, carrier };
    });
  sourceUnions.retain(storage, members, queries, { depth: 0 });
  const scope = {
    sourceUnions,
    host: {
      ast: source.ast, navigation: source.navigation, sourceFacts: source.sourceFacts,
      semantics: selectedFile => source.semantics.forFile(selectedFile),
      semanticsFor: node => source.semantics.forNode(node),
      representations: { scopedTargetType: node => node === declaration ? storage : undefined },
      structuralTypes: { resolveTarget: carrier => targetTypeRefEquals(carrier, packet) ? shape : undefined },
      closedTypeGuard: () => undefined,
    },
    sourceValueDeclaration: (_node, referenced) => referenced,
    resolveTypeWithState: () => bytes,
    resolveNodeWithState: () => { assert.fail("a proven native subset must not reconstruct its checker carrier"); },
  };
  const selected = reads.map(node => resolveSelectedValueWithState(scope, node,
    source.semantics.forNode(node).types.expressionType(node), file, { depth: 0 }));
  const arms = getCsharpRuntimeUnionArms(selected[0]);
  assert.equal(arms?.length, 3);
  for (const carrier of [string, integer, packet]) {
    assert.equal(arms?.filter(arm => targetTypeRefEquals(arm, carrier)).length, 1);
  }
  assert.equal(arms?.some(arm => targetTypeRefEquals(arm, bytes)), false);
  assert.equal(getCsharpNullableElementTargetType(selected[0]) === undefined, true);
  assert.equal(selected[0]?.csharpRuntimeUnionObjectShapes?.some(retained => retained === shape), true);
  assert.equal(targetTypeRefEquals(selected[1], string), true);
});
