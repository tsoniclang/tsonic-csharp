import assert from "node:assert/strict";
import test from "node:test";
import { booleanValueShortCircuitSource } from "../../../../tsonic/test/fixtures/boolean-value-short-circuit.mjs";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded, assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { assertPublishedRefusal, compileEffectiveSource } from "../../helpers/source-effective-types.mjs";

test("the original lazy width/effect fixture publishes exact control identities and Source-owned dispositions", () => {
  const compiled = analyzeCsharpSource({ sourceText: booleanValueShortCircuitSource });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved", compiled.analysis.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join("; ").slice(0, 1600));
  const source = compiled.analysis.value.source;
  const ast = source.ast;
  const operations = new Map();
  const names = new Map([
    ["KindAmpersandAmpersandToken", "and"], ["KindBarBarToken", "or"], ["KindQuestionQuestionToken", "coalesce"],
  ]);
  const text = node => {
    const range = ast.authoredRange(node);
    assert.equal(range.kind, "authored", "the actual original operation is authored");
    return ast.getSourceText(ast.getSourceFile(node)).slice(range.start, range.end);
  };
  for (const occurrence of source.facts.values.occurrences()) {
    const conditional = ast.is.IsConditionalExpression(occurrence);
    const binary = ast.is.IsBinaryExpression(occurrence);
    const kind = conditional ? "conditional" : binary ? names.get(ast.operatorKindName(occurrence)) : undefined;
    if (kind === undefined) continue;
    const operation = resolvedSourceValue(source.facts.values.operation(occurrence), "the original selected-value operation");
    assert.equal(operation.kind, kind);
    assert.equal(operation.occurrence === occurrence && operation.result !== undefined, true, "the complete operation retains its original use and result");
    source.facts.descriptors.assertEvidence(operation.result);
    const control = conditional ? ast.as.AsConditionalExpression(occurrence).Condition : ast.as.AsBinaryExpression(occurrence).Left;
    assert.equal(operation.control.occurrence === control, true, "the sole evaluation control is the exact original operand, including comma effects");
    source.facts.descriptors.assertEvidence(operation.control.value);
    if (conditional) {
      const original = ast.as.AsConditionalExpression(occurrence);
      assert.equal(operation.whenTrue.occurrence === original.WhenTrue && operation.whenFalse.occurrence === original.WhenFalse, true,
        "both original alternatives stay distinct from their execution disposition");
    } else if (kind === "and") {
      assert.equal(operation.whenTrue.occurrence === ast.as.AsBinaryExpression(occurrence).Right && operation.whenFalse === "control-false", true,
        "and preserves the selected RHS and original false control value");
    } else if (kind === "or") {
      assert.equal(operation.whenFalse.occurrence === ast.as.AsBinaryExpression(occurrence).Right && operation.whenTrue === "control-true", true,
        "or preserves the selected RHS and original true control value");
    }
    const originalText = text(occurrence);
    const prior = operations.get(originalText) ?? [];
    prior.push(operation);
    operations.set(originalText, prior);
  }
  for (const [expression, disposition] of [
    ["false && next()", "left"], ["true || next()", "left"], ["true && next()", "right"],
    ["(next(), false) || next()", "right"], ["enabled && next()", "dynamic"], ["enabled || next()", "dynamic"],
  ]) {
    const selected = operations.get(expression) ?? [];
    assert.equal(selected.length, 1, `one unchanged original expression ${expression}`);
    assert.equal(selected[0].disposition, disposition, `${expression}: only Source chooses the disposition`);
  }
});

test("present-left coalesces retain the exact produced value while optional storage and narrowed reads remain distinct", () => {
  const compiled = analyzeCsharpSource({ sourceText: `
    export function choose(value: number): number { return value ?? 1; }
    export function text(value: string): string { return value ?? "unused"; }
    export function flag(value: boolean): boolean { return value ?? true; }
    export function object(value: { count: number }): { count: number } { return value ?? { count: 1 }; }
    export function slots(): number {
      const { value }: { value?: number } = { value: 4 };
      const { other = 1 }: { other?: number } = {};
      const selected = value ?? 0;
      return selected + other;
    }
  ` });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved", "the supported present-left programs reach normal Native analysis");
  const source = compiled.analysis.value.source;
  const operations = source.facts.values.occurrences().filter(occurrence =>
    source.ast.operatorKindName(occurrence) === "KindQuestionQuestionToken");
  assert.equal(operations.length, 5, "every original present-left domain is covered");
  for (const occurrence of operations) {
    const operation = resolvedSourceValue(source.facts.values.operation(occurrence), "present-left operation");
    const original = source.ast.as.AsBinaryExpression(occurrence);
    assert.equal(operation.kind === "coalesce" && operation.disposition === "left", true,
      "Source alone publishes unconditional left selection");
    assert.equal(operation.control.occurrence === original.Left && operation.whenAbsent.occurrence === original.Right, true,
      "the original effectful control and unselected alternative retain their identities");
    assert.equal(operation.result === operation.control.value && operation.result.type.kind !== "optional", true,
      "a statically present read retains its exact descriptor without manufacturing optional storage");
    source.facts.descriptors.assertEvidence(operation.result);
  }
  const bindings = [];
  const visit = node => {
    if (source.ast.is.IsBindingElement(node)) bindings.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of source.sourceFiles.filter(file => !source.ast.isDeclarationFile(file))) visit(file);
  assert.equal(bindings.length, 2, "both original destructured slots remain");
  for (const binding of bindings) {
    const slot = resolvedSourceValue(source.facts.values.declaredSlot(binding), "declared pattern slot");
    const optional = source.ast.text(source.ast.name(binding)) === "value";
    assert.equal(slot.type.type.kind === "optional", optional, "only the binding's own default removes storage absence");
  }
});

for (const surface of ["native", "js"]) test(`${surface}: present-left coalescing evaluates control once, skips the RHS and retains abrupt completion`, { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface, sourceText: `
    import type { int32, uint64 } from "@tsonic/core/types.js";
    export function run(): boolean {
      let calls: int32 = 0;
      function ready(): int32 { calls++; return 7; }
      function effect(): void { calls++; }
      function fail(): never { throw new Error("abrupt"); }
      const direct = ready() ?? fail();
      const sequenced = (effect(), ready()) ?? fail();
      (ready(), ready()) ?? effect();
      if (calls !== 5 || direct !== 7 || sequenced !== 7) return false;
      try { (fail(), ready()) ?? effect(); } catch { return calls === 5; }
      return false;
    }
    export function wide(value: uint64): uint64 { return value ?? value; }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  executeCsharpConstruction(compiled, `present-left-coalesce-${surface}`, false, false, [], `
    if (!Tsonic.Generated.Index.run() || Tsonic.Generated.Index.wide(ulong.MaxValue) != ulong.MaxValue)
      throw new System.Exception("present-left coalescing changed effects or native width");
  `);
});

test("Q6 dense-array element reads retain their exact Source coalescing read-domain refusal", () => {
  const compiled = compileEffectiveSource("native", `
    export function read(values: number[]): number { return values[0] ?? 0; }
  `);
  assertPublishedRefusal(compiled, "TSONIC_LOCAL_TYPE_UNSUPPORTED", "values[0] ?? 0");
  assert.equal(compiled.result.diagnostics[0].message,
    "A dense-array element read cannot supply a nullable coalescing read domain.");
});
