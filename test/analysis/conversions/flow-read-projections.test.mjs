import assert from "node:assert/strict";
import test from "node:test";
import { resolvedTargetStage, runTargetCompilationStages } from "@tsonic/target-api/artifacts";
import { compileCsharpSource, assertCsharpCompilationSucceeded, withCsharpSessionRequest } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpAnalysisProgram } from "../../../dist/analysis/program/index.js";
import { planFlowReadUseSiteProjection } from "../../../dist/backend/planner/expressions/flow-read-projections.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { selectCsharpFlowReadCarrier } from "../../../dist/policy/conversions/flow-read.js";
import { selectCsharpNativeOperandUses } from "../../../dist/analysis/operations/control-flow/native-operands.js";
import { csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";
import { arrayRecordRefinementSource } from "../../../../tsonic/test/fixtures/recursive-array-refinement.mjs";

function fixture(sourceText, surface = "native") {
  return withCsharpSessionRequest({ sourceText, surface }, request => {
    const original = request.input.source;
    let closed = false;
    const source = { ...original, ast: { ...original.ast,
      parent(node) { assert.equal(closed, false, "parent queries finish before publication"); return original.ast.parent(node); },
    } };
    const result = analyzeCsharpAnalysisProgram({ ...request, input: { ...request.input, source } });
    assert.equal(result.kind === "resolved", true, result.diagnostics.map(value => value.message).join("\n"));
    const nodes = [];
    function visit(node) {
      nodes.push(node);
      original.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    }
    for (const file of original.navigation.sourceFiles) visit(file);
    closed = true;
    return { program: result.value, nodes, ast: original.ast, navigation: original.navigation };
  }).value;
}

test("a proved native flow selection survives unchanged logical source types without widening unproved native reads", () => {
  const integer = csharpSourcePrimitiveTargetType("int32");
  const floating = csharpSourcePrimitiveTargetType("float64");
  const text = csharpStringTargetType();
  const storage = csharpRuntimeUnionTargetType([integer, text]);
  const input = { exactSourceRead: true, nativeSourceRead: true,
    unrelatedSourceTypesShareTargetRepresentation: false, selectedTargetType: text,
    readStorageTargetType: storage, memberTargetTypes: undefined };
  assert.equal(selectCsharpFlowReadCarrier(input), text, "the canonical native guard's selected physical payload remains authoritative");
  assert.equal(selectCsharpFlowReadCarrier({ ...input, nativeSourceRead: false }), storage,
    "logical identity without native flow proof does not invent a projection");
  assert.equal(selectCsharpFlowReadCarrier({ ...input, nativeSourceRead: false,
    selectedTargetType: floating, readStorageTargetType: integer }), integer,
  "an unchanged source number cannot discard an exact native integer carrier");
});

test("actual array and record branches publish exact physical receiver projections before sealing", () => {
  const value = fixture(arrayRecordRefinementSource, "js");
  const receivers = value.nodes.filter(node => value.ast.is.IsPropertyAccessExpression(node) &&
    value.ast.text(value.ast.as.AsPropertyAccessExpression(node).Name) === "length")
    .map(node => value.ast.as.AsPropertyAccessExpression(node).Expression);
  assert.equal(receivers.length > 0, true, "the actual checked source contains the native member reads");
  for (const receiver of receivers) {
    const projection = value.program.records.flowReadProjection.get(receiver);
    assert.equal(projection?.kind === "conversion" && projection.selection.kind === "runtime-union-projection", true,
      "both array and record branches consume a selected native payload instead of reading fields on the union struct");
  }
});

for (const surface of ["native", "js"]) test(`${surface} native write locations keep their storage after read narrowing`, () => {
  const value = fixture(`
    class Slot { value: string | number = "before"; }
    export function local(value: string | number): string | number {
      if (typeof value === "string") { value = 4; return value; }
      return value;
    }
    export function member(slot: Slot): string | number {
      if (typeof slot.value === "string") { (slot.value) = 5; return slot.value; }
      return slot.value;
    }
    export function element(values: (string | number)[]): string | number {
      if (typeof values[0] === "string") { values[0] = 6; return values[0]; }
      return values[0];
    }
  `, surface);
  const records = value.program.records;
  const input = {
    ast: value.ast, navigation: value.program.sourceNavigation,
    evidence: records, operations: records, valueReads: records,
    classFactories: { classFactory: records.classFactory, factories: value.program.classFactories },
    bindingPatterns: records,
    unusedDefault: { get: () => false },
    callableCreation: { get: () => assert.fail("a write location does not create a callable") },
  };
  const writes = value.nodes.filter(node => value.ast.is.IsBinaryExpression(node) && value.ast.operatorKindName(node) === "KindEqualsToken");
  assert.equal(writes.length, 3, "local, parenthesized member and element writes are all retained");
  let narrowed = 0;
  for (const write of writes) {
    const location = value.ast.as.AsBinaryExpression(write).Left;
    const read = records.valueRead.get(location);
    const operation = records.binaryOperation.get(write)?.target;
    const selected = selectCsharpNativeOperandUses(input, location, "location");
    assert.equal(operation?.kind === "resolved", true, "the actual native assignment was selected");
    assert.equal(read?.flowReadStorage !== undefined, true, "the exact writable storage carrier is sealed");
    assert.equal(selected.refusal === undefined, true, "the native location form is admitted");
    assert.equal(targetTypeRefEquals(selected.carrier, read.flowReadStorage), true, "locations consume storage, not the narrowed read");
    assert.equal(targetTypeRefEquals(selected.carrier, operation.leftInputType), true, "the actual assignment ABI agrees independently");
    if (!targetTypeRefEquals(read.value, read.flowReadStorage)) narrowed += 1;
    const missingStorage = selectCsharpNativeOperandUses({ ...input, valueReads: {
      valueRead: { get: node => node === location ? { ...read, flowReadStorage: undefined } : records.valueRead.get(node) },
    } }, location, "location");
    assert.equal(missingStorage.carrier === undefined, true, "missing physical storage cannot fall back to a read projection");
  }
  assert.equal(narrowed > 0, true, "the controls contain an actual read/storage distinction");
});

for (const surface of ["native", "js"]) {
  test(`${surface} annotated destructuring keeps nullable storage at absence consumers`, () => {
    const sourceText = `
      import type { int } from "@tsonic/csharp/types.js";
      class View { value: int = 7; }
      export function run(): number {
        const { value }: { value: number } = new View();
        const { a }: { a: number } = { a: 1 };
        const [first, second]: [number, number] = [2, 3];
        const { maybe }: { maybe?: number } = { maybe: 4 };
        return value + a + first + second + (maybe ?? 0);
      }
    `;
    const compiled = compileCsharpSource({ sourceText, surface });
    assertCsharpCompilationSucceeded(compiled);
    const generated = compiled.artifacts.get("src/Index.cs");
    // The literal keeps its surface's source representation (checkpoint output): an int32 token on native, float64 on js.
    assert.equal(generated.includes(surface === "js" ? "maybe ?? 0D" : "maybe ?? 0)"), true,
      "the absence consumer reads the native nullable once");
    assert.equal(executeCsharpConstruction(compiled, `absence-binding-${surface}`, false, false, [],
      "System.Console.WriteLine(Tsonic.Generated.Index.run());"), "17\n");
  });

  test(`${surface} absence reads preserve lazy operands, checked comparisons and narrowed value reads`, () => {
    const sourceText = `
      let touches = 0;
      function absent(): void { touches += 1; }
      function fallback(): number { touches += 100; return 9; }
      export function run(): boolean {
        touches = 0;
        const { present }: { present?: number } = { present: 7 };
        const { missing }: { missing?: number } = {};
        const kept = ((present) satisfies number | undefined) ?? fallback();
        const selected = missing ?? fallback();
        const compared = present != null && null != present &&
          present !== undefined && undefined !== present &&
          missing == null && null == missing &&
          missing === undefined && undefined === missing &&
          present != void absent() && (void absent()) != present;
        return kept === 7 && selected === 9 && compared && touches === 102 &&
          typeof present === "number" && present + 1 === 8;
      }
    `;
    const compiled = compileCsharpSource({ sourceText, surface });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(executeCsharpConstruction(compiled, `absence-effects-${surface}`), "");
  });

  test(`${surface} present narrowed bindings retain native absence checks without allocation`, () => {
    const sourceText = `
      let calls = 0;
      function absent(): void { calls += 1; }
      function fallback(): number { calls += 100; return 9; }
      export function pick(value: number | undefined): number { return value ?? 9; }
      export function run(): boolean {
        calls = 0;
        const { present }: { present?: number } = { present: 7 };
        const kept = ((present) satisfies number | undefined) ?? fallback();
        const compared = present != null && null != present &&
          present !== undefined && undefined !== present &&
          (present == null) === false && (null == present) === false &&
          (present === undefined) === false && (undefined === present) === false &&
          present != void absent() && (void absent()) != present;
        return kept === 7 && compared && calls === 2 &&
          typeof present === "number" && present + 1 === 8;
      }
    `;
    const compiled = compileCsharpSource({ sourceText, surface });
    assertCsharpCompilationSucceeded(compiled);
    const nativeProgram = `
      if (!Tsonic.Generated.Index.run()) throw new System.Exception("native absence effects or value read");
      for (int index = 0; index < 100000; index++) {
        double? value = index % 2 == 0 ? 7D : null;
        _ = NativeBaseline.Read(value);
        _ = Tsonic.Generated.Index.pick(value);
      }
      for (int repeat = 0; repeat < 3; repeat++) {
        long before = System.GC.GetAllocatedBytesForCurrentThread();
        double nativeChecksum = 0D;
        for (int index = 0; index < 100000; index++) {
          double? value = index % 2 == 0 ? 7D : null;
          nativeChecksum += NativeBaseline.Read(value);
        }
        long nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
        before = System.GC.GetAllocatedBytesForCurrentThread();
        double generatedChecksum = 0D;
        for (int index = 0; index < 100000; index++) {
          double? value = index % 2 == 0 ? 7D : null;
          generatedChecksum += Tsonic.Generated.Index.pick(value);
        }
        long generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
        if (nativeChecksum != 800000D || generatedChecksum != nativeChecksum ||
          nativeBytes != 0 || generatedBytes != nativeBytes) {
          throw new System.Exception($"native {nativeBytes}/{nativeChecksum}, generated {generatedBytes}/{generatedChecksum}");
        }
        System.Console.WriteLine($"{nativeBytes}:{generatedBytes}:{generatedChecksum}");
      }
      public static class NativeBaseline {
        public static double Read(double? value) => value ?? 9D;
      }
    `;
    assert.equal(executeCsharpConstruction(compiled, `absence-native-cost-${surface}`, false, false, [], nativeProgram),
      "0:0:800000\n".repeat(3));
  });
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
    withCsharpSessionRequest({ sourceText: "export function read(value: number): number { return value; }", surface }, request => {
    const original = request.input.source;
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
      analyze: () => analyzeCsharpAnalysisProgram({ ...request, input: { ...request.input, source } }),
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
