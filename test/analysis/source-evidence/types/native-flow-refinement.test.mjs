import { assertNoTargetDiagnostics } from "../../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { selectCsharpNativeFlowMembers } from "../../../../dist/analysis/source-evidence/types/resolution/native-flow-refinement.js";
import { csharpJsArrayTargetType, csharpJsDateTargetType, csharpJsRegExpTargetType } from "../../../../dist/target-model/types/carriers/js.js";
import { csharpStringTargetType, csharpObjectTargetType, csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { csharpRuntimeUnionTargetType, getCsharpRuntimeUnionArms } from "../../../../dist/target-model/types/carriers/runtime-carriers.js";
import { resolveCsharpInstanceType } from "../../../../dist/analysis/source-evidence/types/resolution/instance-tests.js";
import { resolveSelectedValueWithState, resolveSelectedValueResultWithState } from "../../../../dist/analysis/source-evidence/types/resolution/public-api.js";
import { csharpSourceValueResult } from "../../../../dist/analysis/source-evidence/types/resolution/call-results.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../../dist/target-model/types/equality.js";
import { combineCsharpTargetUnionMembers } from "../../../../dist/target-model/types/carriers/runtime-carriers.js";
import { retainCsharpUnionObjectShapes } from "../../../../dist/analysis/source-evidence/types/resolution/source-union-refinement.js";

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
  const first = {};
  const second = {};
  const string = csharpStringTargetType();
  const regexp = csharpJsRegExpTargetType();
  const select = (signatures, resolve) => resolveCsharpInstanceType({ get: node => node !== constructor ? undefined : {
    kind: "resolved", provenance: { occurrence: constructor },
    type: { kind: "callable", calls: [], constructs: signatures.map(signature => ({ result: signature.returnType })) },
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
  const nominalDeclarations = new Map();
  const visit = node => {
    if (source.ast.is.IsClassDeclaration(node)) nominalDeclarations.set(source.ast.text(source.ast.name(node)), node);
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
  const nativeCarriers = new Map([[nominalDeclarations.get("Bytes"), bytes], [nominalDeclarations.get("Packet"), packet]]);
  assert.equal([...nativeCarriers.keys()].every(declaration => declaration !== undefined), true,
    "the Native guard unit boundary maps real checked class declarations, not source primitive facts");
  const host = {
      ast: source.ast, navigation: source.navigation, sourceFacts: source.sourceFacts,
      effectiveTypes: source.effectiveTypes,
      semanticsFor: node => source.semantics.forNode(node),
      closedTypeGuard: () => undefined,
      resolveNodeWithState: () => { assert.fail("a proven native subset must not reconstruct its checker carrier"); },
  };
  const selected = reads.map(node => {
      assert.equal(source.navigation.referenceFor(node)?.declaration === declaration, true,
        "the completed native result belongs to this checked parameter read");
      const published = source.effectiveTypes.get(node);
      assert.equal(published?.kind !== "refused" && published?.provenance.occurrence === node, true,
        "this Native guard unit boundary retains the matching real Source occurrence, not an invented Source carrier");
      const members = selectCsharpNativeFlowMembers(host, node, storage, guard => {
        assert.equal(source.navigation.sourceReferenceFor(guard.sourceConstructor)?.declaration === guard.declaration, true,
          "the Native nominal guard retains its actual selected constructor declaration");
        return nativeCarriers.get(guard.declaration);
      });
      const carrier = members === undefined ? storage : combineCsharpTargetUnionMembers(members);
      return retainCsharpUnionObjectShapes(carrier, selected => targetTypeRefEquals(selected, packet) ? shape : undefined);
  });
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

function guardedArraySelection(body) {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: { "/src/index.ts": `
    declare function list(value: unknown): value is unknown[];
    declare function observe(value: unknown): void;
    function run(value: string | readonly string[] | bigint | undefined, other: unknown): void { ${body} }
  ` }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assertNoTargetDiagnostics(checked.diagnostics);
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  const reads = [];
  let guardDeclaration;
  const visit = node => {
    if (source.ast.is.IsFunctionDeclaration(node) && source.ast.text(source.ast.name(node)) === "list") {
      guardDeclaration = node;
    }
    const call = source.semantics.forNode(node).operations.call(node);
    if (source.ast.text(call?.sourceCallee.expression) === "observe") reads.push(call.sourceArguments[0].expression);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  assert.equal(guardDeclaration !== undefined, true, "the selected fixture guard has an exact declaration");
  const string = csharpStringTargetType();
  const integer = csharpSourcePrimitiveTargetType("int64");
  const array = csharpJsArrayTargetType(string);
  const storage = csharpNullableTargetType(csharpRuntimeUnionTargetType([string, array, integer]));
  const declaration = source.navigation.referenceFor(reads[0]).declaration;
  const host = {
      ast: source.ast, navigation: source.navigation, sourceFacts: source.sourceFacts,
      effectiveTypes: source.effectiveTypes,
      semanticsFor: node => source.semantics.forNode(node),
      closedTypeGuard(node) {
        const semantics = source.semantics.forNode(node);
        const call = semantics.operations.call(node);
        return call === undefined || semantics.declarations.signatureDeclaration(call.selectedSignature) !== guardDeclaration
          ? undefined : { sourceOperand: call.sourceArguments[0].expression, predicate: { kind: "array" } };
      },
    resolveNodeWithState: () => { assert.fail("scoped native storage must not reconstruct a checker carrier"); },
    resolveTypeWithState: () => { assert.fail("retained exact native source members must not be reclassified"); },
  };
  const selected = reads.map(node => {
      assert.equal(source.navigation.referenceFor(node)?.declaration === declaration, true,
        "the completed native result belongs to this checked parameter read");
      const published = source.effectiveTypes.get(node);
      assert.equal(published?.kind !== "refused" && published?.provenance.occurrence === node, true,
        "a Native guard unit boundary uses the real occurrence publication without relabelling its primitive type");
      const members = selectCsharpNativeFlowMembers(host, node, storage,
        () => assert.fail("these exact array/typeof guards have no nominal constructor query"));
      return members === undefined ? storage : combineCsharpTargetUnionMembers(members);
  });
  return { selected, string, integer, array, storage };
}

test("checked union refinements cannot widen an exact native array guard", () => {
  for (const body of [
    "if (list(value)) observe(value);",
    "if (list(value) && value.length > 0) { value[0] = 'next'; observe(value); }",
    "if (!list(value)) return; observe(value);",
  ]) {
    const result = guardedArraySelection(body);
    assert.equal(result.selected.length, 1);
    assert.equal(targetTypeRefEquals(result.selected[0], result.array), true, body);
    assert.equal(getCsharpNullableElementTargetType(result.selected[0]) === undefined, true, body);
  }
});

test("native and checked guard intersections retain every surviving exact member and native integer width", () => {
  const result = guardedArraySelection("if (list(value) || typeof value === 'bigint') observe(value);");
  const arms = getCsharpRuntimeUnionArms(result.selected[0]);
  assert.equal(arms?.length, 2);
  assert.equal(arms.some(arm => targetTypeRefEquals(arm, result.array)), true);
  assert.equal(arms.some(arm => targetTypeRefEquals(arm, result.integer)), true);
  assert.equal(arms.some(arm => targetTypeRefEquals(arm, result.string)), false);
  assert.equal(getCsharpNullableElementTargetType(result.selected[0]) === undefined, true);
});

test("foreign-operand guards cannot refine native storage", () => {
  const result = guardedArraySelection("if (list(other)) observe(value);");
  assert.equal(targetTypeRefEquals(result.selected[0], result.storage), true);
});

test("exact nominal subclass evidence remains authoritative inside a native guard", () => {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files: { "/src/index.ts": `
    class Base { base(): void {} }
    class Child extends Base { child(): void {} }
    declare function observe(value: unknown): void;
    function run(value: Base | string | undefined): void { if (value instanceof Child) observe(value); }
  ` }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assertNoTargetDiagnostics(checked.diagnostics);
  const source = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  let read;
  const visit = node => {
    const call = source.semantics.forNode(node).operations.call(node);
    if (source.ast.text(call?.sourceCallee.expression) === "observe") read = call.sourceArguments[0].expression;
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  assert.equal(read !== undefined, true);
  const base = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "fixture.Base", csharpSourceDeclarationKind: "class" };
  const child = { kind: "target-named", csharpAllowsRefLikeTypeArguments: [], id: "fixture.Child", csharpSourceDeclarationKind: "class" };
  const storage = csharpNullableTargetType(csharpRuntimeUnionTargetType([base, csharpStringTargetType()]));
  const declaration = source.navigation.referenceFor(read).declaration;
  const scope = {
    resolveSelectedValueResultWithState: (...args) => resolveSelectedValueResultWithState(scope, ...args),
    resolveNodeValueWithState(node, sourceFile, state) {
      assert.equal(source.navigation.referenceFor(node)?.declaration === declaration, true,
        "the completed native result belongs to this checked parameter read");
      assert.equal(node === read && sourceFile === file && state.depth === 0, true,
        "the canonical occurrence reader retains the checked read, file and bounded state");
      const published = source.effectiveTypes.get(node);
      const selected = published?.kind === "refused" ? undefined : published?.type;
      assert.equal(published?.kind !== "refused" && published?.provenance.occurrence === node, true,
        "nominal narrowing consumes this read's real Host publication");
      const declarations = [];
      const collect = selected => {
        if (source.ast.is.IsClassDeclaration(selected) && source.ast.text(source.ast.name(selected)) === "Child") declarations.push(selected);
        source.ast.forEachChild(selected, nested => { if (nested !== undefined) collect(nested); });
      };
      collect(file);
      assert.equal(declarations.length, 1, "the real Child declaration is unique in this checked Source program");
      return csharpSourceValueResult(selected?.kind === "declared" && selected.declaration === declarations[0] ? child : undefined);
    },
    resolveTypeWithState: () => { assert.fail("nominal refinement must not retry a raw checked Type"); },
    resolveNodeWithState: () => { assert.fail("nominal refinement must retain its exact scoped native storage"); },
  };
  const selected = resolveSelectedValueWithState(scope, read,
    source.semantics.forNode(read).types.expressionType(read), file, { depth: 0 });
  assert.equal(targetTypeRefEquals(selected, child), true);
});
