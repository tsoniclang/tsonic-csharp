import { knownNativePlatform64 } from "../../../helpers/native-integer-platform.mjs";
import { assertNoTargetDiagnostics } from "../../../../../tsonic/test/scripts/diagnostic-assertions.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpUnionEquality } from "../../../../dist/policy/operations/operators/union-equality.js";
import { planCsharpUnionEquality } from "../../../../dist/backend/planner/expressions/union-equality.js";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType,
  csharpStringTargetType, csharpTargetNamedType } from "../../../../dist/target-model/types/index.js";
import { printCsharpExpression } from "../../../../dist/print/source/printer.js";
import { csharpPlannedValue } from "../../../../dist/backend/planner/expressions/planned-values.js";
import { analyzeCsharpUnionEquality } from "../../../../dist/analysis/operations/union-equality.js";
import { csharpTypeEmissionRecord } from "../../../helpers/planning-records.mjs";
import { csharpBigIntegerTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { selectCsharpExactLiteralConversion } from "../../../../dist/policy/conversions/literals.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";

// The union equality the analysis seals for one binary node, and the planning context that reads it.
function sealed(node, selection, exact = { exactLiteral: { get: () => ({ kind: "not-applicable" }) } }) {
  return analyzeCsharpUnionEquality([node], { binaryOperation: { get: subject => subject === node ? { target: selection } : undefined } }, exact);
}
function planning(analysis) {
  return { program: { source: { ast: { pos: () => 0 } }, records: { unionEquality: analysis.records.unionEquality,
    typeEmission: csharpTypeEmissionRecord(), nativeConstant: { get: () => false }, nativeAbsence: { get: () => false } } },
  scope: {}, names: { temporaryName: name => name } };
}

test("union literal arms consume sealed exact recipes without evaluating a BigInteger temporary", () => {
  const narrow = csharpSourcePrimitiveTargetType("int32");
  const wide = csharpSourcePrimitiveTargetType("int64");
  const union = csharpRuntimeUnionTargetType([narrow, wide]);
  const big = csharpBigIntegerTargetType();
  const literal = { form: "bigint", integer: 3n };
  for (const reversed of [false, true]) {
    const dynamic = {};
    const constant = {};
    const left = reversed ? constant : dynamic;
    const right = reversed ? dynamic : constant;
    const leftType = reversed ? big : union;
    const rightType = reversed ? union : big;
    const policy = { facts: { values: { literal: node => node === constant ? literal : undefined }, analyses: { platform: knownNativePlatform64 } },
      providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) }, objectShapes: { resolveTarget() {} },
      projectTypes: { catalog: { definitionForTarget() {} } } };
    const arms = selectCsharpUnionEquality(leftType, rightType, policy, { left, right });
    const selection = { kind: "resolved", sourceOperator: "===", left, right, leftType, rightType,
      resultType: csharpSourcePrimitiveTargetType("bool"), targetOperation: { kind: "union-equality", negated: false, arms } };
    const exact = { exactLiteral: { get: (node, target) => node === constant
      ? selectCsharpExactLiteralConversion(literal, big, target, knownNativePlatform64) : { kind: "not-applicable" } } };
    const node = {};
    const analysis = sealed(node, selection, exact);
    const seen = [];
    const diagnostics = [];
    const planned = planCsharpUnionEquality(node, selection, {}, planning(analysis), diagnostics, subject => {
      seen.push(subject);
      return csharpPlannedValue(union, { kind: "InvocationExpression",
        callee: { kind: "IdentifierName", name: "produceValue" }, arguments: [] });
    }, { nextTempIndex: 0, usedNames: new Set() });
    assertNoTargetDiagnostics(diagnostics);
    assert.deepEqual(seen, [dynamic], "only the dynamic operand is evaluated, exactly once");
    const output = printCsharpExpression(planned.completion.expression);
    assert.equal(output.match(/produceValue\(\)/gu)?.length, 1);
    assert.match(output, /3L/u);
    assert.doesNotMatch(output, /BigInteger|\.Item[12]|\bnew\b|\(double\)/u);
    assert.throws(() => sealed(node, selection, { exactLiteral: { get: () => undefined } }),
      /requires its exact literal endpoint/u, "a missing same-occurrence endpoint cannot be reconstructed by planning");
  }
});

for (const surface of ["native", "js"]) test(`${surface} union literal equality retains native width and single evaluation`,
  { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      import type { int32, int64 } from "@tsonic/core/types.js";
      let calls: int32 = 0;
      function narrow(): int32 { return 3; }
      function wide(): int64 { return 9007199254740993n; }
      function produce(flag: boolean): int32 | int64 { calls++; if (flag) return narrow(); return wide(); }
      export function run(): boolean {
        const first = produce(true) === 3n;
        const second = 3n !== produce(false);
        const third = produce(false) === 9007199254740993n;
        return first && second && third && calls === 3;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.doesNotMatch(output, /BigInteger|Convert\.ToDouble|\(double\)/u,
      "exact fitting comparison constants add no arbitrary-precision allocation or floating round trip");
    executeCsharpConstruction(compiled, `union-literal-equality-${surface}`);
  });

test("union equality rejects stale carriers, paths, operations, coverage and polarity", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const string = csharpStringTargetType();
  const union = csharpRuntimeUnionTargetType([integer, string]);
  const policy = { facts: { values: { literal: () => undefined }, analyses: { platform: knownNativePlatform64 } },
    providers: { findTargetBindingByTargetId() { return { kind: "missing" }; } }, objectShapes: { resolveTarget() {} },
    projectTypes: { catalog: { definitionForTarget() {} } } };
  const arms = selectCsharpUnionEquality(union, string, policy, { left: {}, right: {} });
  const operation = { kind: "union-equality", negated: false, arms };
  const selection = { kind: "resolved", sourceOperator: "===", targetOperation: operation,
    left: {}, right: {}, leftType: union, rightType: string, resultType: csharpSourcePrimitiveTargetType("bool") };
  const node = {};
  const analysis = sealed(node, selection);
  assert.deepEqual(analysis.issues, []);
  const input = planning(analysis);
  const diagnostics = [];
  const state = () => ({ nextTempIndex: 0, usedNames: new Set() });
  const plan = node => csharpPlannedValue(node === selection.left ? union : string,
    { kind: "IdentifierName", name: "operand" });
  const planned = planCsharpUnionEquality(node, selection, {}, input, diagnostics, plan, state());
  assertNoTargetDiagnostics(diagnostics);
  assert.equal(planned.completion.expression.kind, "SwitchExpression");
  assert.equal(planned.completion.expression.expression.elements.length, 2);
  assert.deepEqual(planned.prelude, []);
  // The analysis seals union equality from the operation classification and refuses a result carrier or polarity that
  // disagrees with it; the planner no longer re-validates the sealed classification's carriers, paths or arms.
  for (const mutation of [{ resultType: integer }, { sourceOperator: "!==" }, { targetOperation: { ...operation, negated: true } }]) {
    const refused = sealed(node, { ...selection, ...mutation });
    assert.equal(refused.issues.length, 1);
    assert.equal(refused.records.unionEquality.get(node), undefined, "a refused equality publishes no plan");
  }
});

test("nullable union equality plans canonical native presence guards with each operand evaluated once in order", () => {
  const integer = csharpSourcePrimitiveTargetType("int64");
  const text = csharpStringTargetType();
  const base = csharpTargetNamedType("fixture.Base", [], { kind: "named", name: "Base" }, { allowsRefLikeTypeArguments: [], sourceDeclarationKind: "class" });
  const policy = { facts: { values: { literal: () => undefined }, analyses: { platform: knownNativePlatform64 } },
    providers: { findTargetBindingByTargetId() { return { kind: "missing" }; } }, objectShapes: { resolveTarget() {} },
    projectTypes: { catalog: { definitionForTarget() {} } } };
  const union = csharpNullableTargetType(csharpRuntimeUnionTargetType([integer, text, base]));
  for (const rightType of [union, csharpNullableTargetType(text), csharpNullableTargetType(base), integer]) {
    const arms = selectCsharpUnionEquality(union, rightType, policy, { left: {}, right: {} });
    assert.ok(arms !== undefined);
    for (const negated of [false, true]) {
      const left = {};
      const right = {};
      const selection = { kind: "resolved", sourceOperator: negated ? "!==" : "===",
        targetOperation: { kind: "union-equality", negated, arms }, left, right, leftType: union, rightType,
        resultType: csharpSourcePrimitiveTargetType("bool") };
      const node = {};
      const analysis = sealed(node, selection);
      assert.deepEqual(analysis.issues, []);
      const input = planning(analysis);
      const seen = [];
      const diagnostics = [];
      const planned = planCsharpUnionEquality(node, selection, {}, input, diagnostics, node => {
        seen.push(node);
        return csharpPlannedValue(node === left ? union : rightType, { kind: "InvocationExpression",
          callee: { kind: "IdentifierName", name: node === left ? "produceLeft" : "produceRight" }, arguments: [] });
      }, { nextTempIndex: 0, usedNames: new Set() });
      assertNoTargetDiagnostics(diagnostics);
      assert.deepEqual(seen, [left, right]);
      assert.deepEqual(planned.prelude, []);
      const output = printCsharpExpression(planned.completion.expression);
      assert.equal(output.match(/produceLeft\(\)/gu)?.length, 1);
      assert.equal(output.match(/produceRight\(\)/gu)?.length, 1);
      assert.ok(output.indexOf("produceLeft()") < output.indexOf("produceRight()"));
      assert.match(output, /\.Item1\?\.Is\d\(\) == true/u);
      assert.match(output, /\.Item1!\.Value\.As\d\(\)/u);
      if (rightType !== integer) assert.match(output, /\.Item1 is null.*\.Item2 is null/u);
      if (rightType !== union && rightType !== integer) assert.match(output, /\.Item2 is (?:string|Base) /u);
      assert.doesNotMatch(output, /\bnew\b|\bClone\b|\bDynamicInvoke\b|\(object\)|\.ToArray\(|\.ToList\(/u);
      if (negated) assert.match(output, /^!/u);
    }
  }
});
