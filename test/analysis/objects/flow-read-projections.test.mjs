import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { resolvedTargetStage, runTargetCompilationStages } from "@tsonic/target-api/artifacts";
import { checkCsharpSource, assertCsharpCheckingSucceeded, compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpTargetProgram } from "../../../dist/analysis/program/index.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/relations/resolver.js";
import { createCsharpTargetConfiguration } from "../../../dist/options/csharp-target-options.js";
import { planFlowReadUseSiteProjection } from "../../../dist/backend/planner/expressions/flow-read-projections.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

function analysisRequest(sourceText, surface = "native") {
  const checked = checkCsharpSource({ sourceText, surface });
  assertCsharpCheckingSucceeded(checked);
  const source = createTargetSourceProgram(checked.source);
  return { source, request: {
    input: { source, sourcePackages: checked.sourcePackages, project: checked.project, target: checked.target,
      runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: checked.paths },
    configuration: createCsharpTargetConfiguration(checked.target, checked.paths.projectRoot, checked.paths.targetOutputRoot),
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
  } };
}

function fixture(sourceText, surface = "native") {
  const { source: original, request } = analysisRequest(sourceText, surface);
  let closed = false;
  const source = { ...original, ast: { ...original.ast,
    parent(node) { assert.equal(closed, false, "parent queries finish before publication"); return original.ast.parent(node); },
  } };
  const result = analyzeCsharpTargetProgram({
    ...request,
    input: { ...request.input, source },
  });
  assert.equal(result.kind === "resolved", true, result.diagnostics.map(value => value.message).join("\n"));
  const nodes = [];
  function visit(node) {
    nodes.push(node);
    original.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  }
  for (const file of original.navigation.sourceFiles) visit(file);
  closed = true;
  return { program: result.value, nodes, ast: original.ast, navigation: original.navigation };
}

for (const surface of ["native", "js"]) {
  test(`sealed ${surface} per-read projections preserve narrowed class and generic native carriers`, () => {
    const value = fixture(`
      import type { int32, int64 } from "@tsonic/core/types.js";
      class Base {}
      class Derived extends Base { name: string = "derived"; }
      class Box<Value> { constructor(public value: Value) {} }
      export function wide(box: Box<int64>): int64 { return box.value; }
      export function small(box: Box<int32>): int32 { return box.value; }
      export function read(value: Base): string | undefined {
        if (value instanceof Derived) return value.name;
        return undefined;
      }
    `, surface);
    const reads = value.nodes.filter(node => value.ast.is.IsPropertyAccessExpression(node));
    const generic = reads.filter(node => value.ast.text(value.ast.name(node)) === "value");
    assert.equal(generic.length, 2, "both actual native generic contexts are retained");
    const carriers = generic.map(node => value.program.records.readStorageTargetType.get(node));
    assert.equal(carriers[0]?.kind === "source-primitive" && carriers[0].name === "int64", true);
    assert.equal(carriers[1]?.kind === "source-primitive" && carriers[1].name === "int32", true);
    assert.equal(targetTypeRefEquals(carriers[0], carriers[1]), false, "native contexts cannot collapse");
    const conversions = value.nodes.filter(node => value.program.records.flowReadProjection.get(node)?.kind === "conversion");
    assert.equal(conversions.length > 0, true, "narrowed receiver has an analyzed native projection");
    for (const node of [...generic, ...conversions]) {
      const projection = value.program.records.flowReadProjection.get(node);
      assert.equal(Object.isFrozen(projection), true);
      assert.equal(value.program.records.flowReadProjection.get(node) === projection, true, "completed reads preserve decision identity");
    }
    assert.equal(Object.hasOwn(value.program.records, "closedArrayStorage"), false);
    assert.equal(Object.hasOwn(value.program.records, "inspectClosedArrayStorage"), false);
    assert.equal(value.program.records.flowReadProjection.get({}) === undefined, true, "foreign source identity has no decision");
  });
}

test("deferred generic constructor fields are analyzed once and reconstructed without source navigation", () => {
  const value = fixture(`
    export class Box<Value> {
      value: Value;
      read: () => Value;
      constructor(value: Value) { this.value = value; this.read = () => this.value; }
      direct(): Value { return this.value; }
    }
  `);
  const deferred = value.nodes.filter(node => value.program.records.flowReadProjection.get(node)?.kind === "non-null");
  assert.equal(deferred.length, 1, "only the deferred field read selects the null-forgiving syntax");
  const expression = { kind: "IdentifierName", name: "field" };
  const input = { program: value.program,
    types: { classifications: {
      resolveNode() { throw new Error("planner cannot reselect a read carrier"); },
      resolveReadStorage() { throw new Error("planner cannot reselect a storage carrier"); },
    } } };
  const diagnostics = [];
  const planned = planFlowReadUseSiteProjection(deferred[0], expression, {}, input, diagnostics);
  assert.equal(planned?.kind, "PostfixUnaryExpression");
  assert.equal(planned.operand === expression, true);
  assert.equal(diagnostics.length, 0);
});

test("struct value-union narrowed payloads retain sealed native projection on both surfaces", () => {
  const sourceText = `
    import { field, struct } from "@tsonic/core/lang.js";
    export const Circle = struct({ kind: field<"circle">(), radius: field<number>() });
    export type Circle = typeof Circle;
    export const Square = struct({ kind: field<"square">(), side: field<number>() });
    export type Square = typeof Square;
    export function area(shape: Circle | Square): number {
      return shape.kind === "circle" ? shape.radius * shape.radius : shape.side * shape.side;
    }
  `;
  for (const surface of ["native", "js"]) {
    const value = fixture(sourceText, surface);
    const projections = value.nodes.map(node => value.program.records.flowReadProjection.get(node))
      .filter(projection => projection?.kind === "conversion");
    assert.equal(projections.some(projection => projection.selection.kind === "runtime-union-projection"), true,
      `${surface}: value payload is extracted before member access`);
    const discriminant = value.nodes.find(node => value.ast.is.IsPropertyAccessExpression(node) &&
      value.ast.text(value.ast.name(node)) === "kind");
    assert.equal(value.navigation.sourceReferenceFor(discriminant) === undefined, true,
      "a shared union field has no single declaration to recover from the reference index");
    assert.equal(value.program.records.flowReadProjection.get(discriminant)?.kind, "identity",
      "the exact selected source member still owns that field read");
    const compiled = compileCsharpSource({ sourceText, surface });
    assertCsharpCompilationSucceeded(compiled);
    const generated = compiled.artifacts.get("src/Index.cs");
    assert.match(generated, /radius/u);
    assert.match(generated, /side/u);
    assert.doesNotMatch(generated, /shape\.radius|shape\.side/u);
  }
});

for (const surface of ["native", "js"]) {
  test(`${surface} flow reads exclude declaration, type, member-name and write-only occurrences`, () => {
    const sourceText = `
      import type { int32, int64 } from "@tsonic/core/types.js";
      interface Shape { value: int64; }
      type Alias = Shape;
      class Box<Value> { constructor(public value: Value) {} }
      export function read(box: Box<int64>, other: Alias): int64 {
        let result = box["value"];
        result = other.value;
        return result;
      }
      export const shorthand = (value: int32) => ({ value });
      export const indexed = (values: int64[], key: int32): int64 => values[key];
    `;
    const value = fixture(sourceText, surface);
    let reads = 0;
    let nonReads = 0;
    let memberNames = 0;
    let indexedReads = 0;
    let nativeIndexerReads = 0;
    let shorthandReads = 0;
    for (const node of value.nodes) {
      const projection = value.program.records.flowReadProjection.get(node);
      if (value.ast.is.IsElementAccessExpression(node)) {
        indexedReads += 1;
        const element = value.program.records.selectedElement.get(node);
        if (element.sourceOwned !== undefined) {
          assert.equal(projection?.kind, "identity", "the checked indexed source-field read is retained");
        } else {
          nativeIndexerReads += 1;
          assert.equal(element.target?.kind, "resolved", "the selected native element operation owns reconstruction");
          assert.equal(element.target.source.expression === node, true, "the owner retains this exact checked access");
          assert.equal(element.target.source.accessMode, "read");
          assert.equal(element.target.source.callCallee, false);
          assert.equal(projection === undefined, true, "a native indexer is reconstructed from its element owner, not a second read projection");
          const carrier = value.program.records.readStorageTargetType.get(node);
          assert.equal(carrier?.kind === "source-primitive" && carrier.name === "int64", true,
            "the actual native indexed storage remains exact int64 on both surfaces");
        }
      }
      if (!value.ast.is.IsIdentifier(node)) continue;
      const selected = value.navigation.sourceReferenceFor(node);
      const use = selected === undefined ? undefined : value.navigation.declarationUses(selected.declaration)
        .find(candidate => candidate.reference === node);
      const runtime = use !== undefined && use.kind !== "type-only" && use.kind !== "source-linkage" &&
        (use.role !== "write" || use.throughMember);
      if (runtime) {
        reads += 1;
        assert.equal(projection !== undefined, true, `runtime read at ${value.ast.pos(node)}`);
      } else {
        nonReads += 1;
        assert.equal(projection === undefined, true, `non-read at ${value.ast.pos(node)}`);
      }
      const parent = value.ast.parent(node);
      if (parent !== undefined && value.ast.is.IsPropertyAccessExpression(parent) && value.ast.name(parent) === node) {
        memberNames += 1;
        assert.equal(projection === undefined, true, "a member-name token is not an independently evaluated read");
      }
      if (parent !== undefined && value.ast.is.IsShorthandPropertyAssignment(parent)) {
        shorthandReads += 1;
        assert.equal(projection?.kind, "identity", "the shorthand is an actual checked value read");
      }
    }
    assert.equal(reads > 0, true);
    assert.equal(nonReads > reads, true, "declaration/type/linkage occurrences were actually examined");
    assert.equal(memberNames, 1);
    assert.equal(indexedReads, 2);
    assert.equal(nativeIndexerReads, 1);
    assert.equal(shorthandReads, 1);
    const compiled = compileCsharpSource({ sourceText, surface });
    assertCsharpCompilationSucceeded(compiled);
    const generated = compiled.artifacts.get("src/Index.cs");
    const storage = surface === "native" ? "long[]" : "Tsonic.CSharp.Js.JSArray<long>";
    assert.equal(generated.includes(`public static long indexed(${storage} values, int key)`), true,
      "native indexed transport cannot widen int64 to bigint or floating point");
    assert.equal(generated.includes("return values[key];"), true, "the native indexed read is emitted directly");
  });

  test(`${surface} a narrowed receiver is still projected when the selected field is written`, () => {
    const sourceText = `
      class Base {}
      class Derived extends Base { value: number = 0; }
      export function update(target: Base): void {
        if (target instanceof Derived) target.value = 1;
      }
    `;
    const value = fixture(sourceText, surface);
    const access = value.nodes.find(node => value.ast.is.IsPropertyAccessExpression(node));
    assert.equal(access !== undefined, true);
    const receiver = value.ast.as.AsPropertyAccessExpression(access).Expression;
    assert.equal(value.program.records.flowReadProjection.get(access) === undefined, true, "the write uses its exact native storage");
    assert.equal(value.program.records.flowReadProjection.get(receiver)?.kind, "conversion", "the receiver must still be read and narrowed");
    assertCsharpCompilationSucceeded(compileCsharpSource({ sourceText, surface }));
  });

  test(`${surface} ambiguous runtime-read evidence rejects before program publication or planning`, () => {
    const { source: original, request } = analysisRequest("export function read(value: number): number { return value; }", surface);
    const declaration = original.ast.statements(original.navigation.sourceFiles[0])[0];
    const statement = original.ast.statements(original.ast.body(declaration))[0];
    const subject = original.ast.as.AsReturnStatement(statement).Expression;
    const source = { ...original, semantics: { ...original.semantics,
      selectValueTypeRefinement(node) {
        const selected = original.semantics.selectValueTypeRefinement(node);
        if (node !== subject) return selected;
        assert.equal(selected.kind, "resolved", "the negative case keeps the exact checked declaration/type identities");
        return { ...selected, refinement: { kind: "ambiguous" } };
      },
    } };
    let planned = 0;
    let materialized = 0;
    const result = runTargetCompilationStages({
      analyze: () => analyzeCsharpTargetProgram({ ...request, input: { ...request.input, source } }),
      plan() { planned += 1; throw new Error("rejected source must not reach planning"); },
      materialize() { materialized += 1; throw new Error("rejected source must not emit artifacts"); },
    });
    assert.equal(result.kind, "rejected");
    assert.equal(Object.hasOwn(result, "value"), false, "no sealed program or output escapes rejection");
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0].code, "CSHARP_FLOW_READ_PROJECTION_NOT_PROVEN");
    assert.equal(result.diagnostics[0].sourceNode === subject, true, "the exact failed read is retained");
    assert.equal(result.diagnostics[0].source, "tsonic-csharp");
    assert.match(result.diagnostics[0].message, /checked source value refinement is ambiguous/u);
    assert.equal(planned, 0);
    assert.equal(materialized, 0);
  });
}

test("missing or malformed sealed flow projections fail only through the internal planner invariant", () => {
  const value = fixture("export function read(value: number): number { return value; }");
  const subject = value.nodes.find(node => value.ast.is.IsReturnStatement(node));
  const read = value.ast.as.AsReturnStatement(subject).Expression;
  const expression = { kind: "IdentifierName", name: "value" };
  const type = { kind: "source-primitive", name: "float64" };
  const malformed = [
    ["missing", undefined],
    ["rejected", { kind: "rejected", reason: "not a user-source planning diagnostic" }],
    ["unknown", { kind: "unknown" }],
    ["conversion without source", { kind: "conversion", target: type, selection: { kind: "identity" } }],
    ["conversion without target", { kind: "conversion", source: type, selection: { kind: "identity" } }],
    ["conversion without selection", { kind: "conversion", source: type, target: type }],
    ["rejected conversion", { kind: "conversion", source: type, target: type, selection: { kind: "rejected", reason: "invalid" } }],
    ["ambiguous conversion", { kind: "conversion", source: type, target: type, selection: { kind: "ambiguous", reason: "invalid", candidateIds: [] } }],
  ];
  for (const [label, projection] of malformed) {
    let materialized = 0;
    const diagnostics = [];
    const result = runTargetCompilationStages({
      analyze: () => resolvedTargetStage({ ...value.program, records: { ...value.program.records,
        flowReadProjection: { get(node) { assert.equal(node === read, true, label); return projection; } },
      } }),
      plan(program) {
        return resolvedTargetStage(planFlowReadUseSiteProjection(read, expression, {}, { program }, diagnostics));
      },
      materialize() { materialized += 1; throw new Error("an internal invariant must not publish artifacts"); },
    });
    assert.equal(result.kind, "rejected", label);
    assert.equal(result.diagnostics.length, 1, label);
    assert.equal(result.diagnostics[0].code, "TSONIC_INTERNAL_PLANNER_INVARIANT", label);
    assert.equal(result.diagnostics[0].sourceNode === read, true, label);
    assert.equal(result.diagnostics[0].source, "tsonic-csharp", label);
    assert.equal(diagnostics.length, 0, "the planner never appends a user-source rejection");
    assert.equal(materialized, 0, label);
  }
  const result = planFlowReadUseSiteProjection(read, expression, {}, {
    storageExpression: read,
    program: { records: { flowReadProjection: { get() { throw new Error("a native storage location is not a read"); } } } },
  }, []);
  assert.equal(result === expression, true, "explicit native storage use stays unprojected");
});
