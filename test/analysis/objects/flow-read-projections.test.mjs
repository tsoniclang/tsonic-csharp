import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { checkCsharpSource, assertCsharpCheckingSucceeded, compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpTargetProgram } from "../../../dist/analysis/program/index.js";
import { createCsharpProviderRelationResolver } from "../../../dist/providers/native/relations/resolver.js";
import { createCsharpTargetConfiguration } from "../../../dist/options/csharp-target-options.js";
import { planFlowReadUseSiteProjection } from "../../../dist/backend/planner/expressions/flow-read-projections.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

function fixture(sourceText, surface = "native") {
  const checked = checkCsharpSource({ sourceText, surface });
  assertCsharpCheckingSucceeded(checked);
  const original = createTargetSourceProgram(checked.source);
  let closed = false;
  const source = { ...original, ast: { ...original.ast,
    parent(node) { assert.equal(closed, false, "parent queries finish before publication"); return original.ast.parent(node); },
  } };
  const result = analyzeCsharpTargetProgram({
    input: { source, sourcePackages: checked.sourcePackages, project: checked.project, target: checked.target,
      runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: checked.paths },
    configuration: createCsharpTargetConfiguration(checked.target, checked.paths.projectRoot, checked.paths.targetOutputRoot),
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
  });
  assert.equal(result.kind === "resolved", true, result.diagnostics.map(value => value.message).join("\n"));
  const nodes = [];
  function visit(node) {
    nodes.push(node);
    original.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  }
  for (const file of original.navigation.sourceFiles) visit(file);
  closed = true;
  return { program: result.value, nodes, ast: original.ast };
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
    const compiled = compileCsharpSource({ sourceText, surface });
    assertCsharpCompilationSucceeded(compiled);
    const generated = compiled.artifacts.get("src/Index.cs");
    assert.match(generated, /radius/u);
    assert.match(generated, /side/u);
    assert.doesNotMatch(generated, /shape\.radius|shape\.side/u);
  }
});
