import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { analyzeSourceLiteralValues, sourceTransparentExpressionOperand } from "@tsonic/target-api/source";
import { selectCsharpNativeBinaryOperation, selectCsharpNativeUnaryOperation, targetBinaryOperator } from "../../../dist/policy/operations/operators/rules.js";
import { validateBinaryTargetSemantics, validateUnaryTargetSemantics } from "../../../dist/policy/operations/operators/operator-validation.js";
import { csharpUnaryNumericPromotion, selectCsharpNumericCarrierPromotion } from "../../../dist/policy/operations/numeric/promotion.js";
import {
  decideSourcePrimitiveBinaryOperator, decideSourcePrimitiveUnaryOperator,
  sourcePrimitiveBinaryOperators, sourcePrimitiveOperatorKinds, sourcePrimitiveUnaryOperators,
} from "../../../../tsonic/packages/target-api/dist/source-semantics/local-type-flow/operator-decisions.js";
import {
  csharpBigIntegerTargetType, csharpNullableTargetType,
  csharpSourcePrimitiveTargetType, csharpStringTargetType, targetTypeRefEquals,
} from "../../../dist/target-model/types/index.js";
import { csharpJsArrayTargetType, csharpJsTypedArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpRuntimeUnionTargetType, getCsharpRuntimeUnionArms } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { getCsharpArrayLiteralElementTargetType } from "../../../dist/target-model/types/carriers/collections.js";
import { getCsharpNullableElementTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { isCsharpJsStringTargetType, isCsharpStringTargetType } from "../../../dist/target-model/types/identity.js";
import { csharpArrayLikeElement } from "../../../dist/target-model/types/carriers/array-like.js";
import { selectCsharpArrayCopy } from "../../../dist/policy/operations/source-profiles/js/array-copy.js";
import { arrayFromMember, arrayFromTypeArguments } from "../../../dist/policy/operations/source-profiles/js/array-statics.js";
import {
  acceptedEffectiveSource, assertPrimitiveOccurrences, assertPublishedRefusal, compileEffectiveSource, projectNodes,
} from "../../helpers/source-effective-types.mjs";
import { destinationBodies } from "../../analysis/operations/inferred-numeric-array-elements.fixtures.mjs";

const primitive = csharpSourcePrimitiveTargetType;
const narrowCounts = ["char", "int8", "uint8", "int16", "uint16", "int32", "int64"];
const wideCounts = ["uint32", "uint64", "native-int", "native-uint", "int128", "uint128", "float16", "float32", "float64", "decimal", "bool"];
const policy = {
  providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) },
  objectShapes: { resolveTarget: () => undefined },
  projectTypes: { catalog: { definitionForTarget: () => undefined } },
  integerRanges: { get: () => false },
};

test("D-A every primitive pair agrees with the Native family admission and promotion oracle", () => {
  const operators = new Map([
    ["add", "+"], ["subtract", "-"], ["multiply", "*"], ["divide", "/"], ["remainder", "%"], ["power", "**"],
    ["bit-and", "&"], ["bit-or", "|"], ["bit-xor", "^"],
    ["shift-left", "<<"], ["shift-right", ">>"], ["shift-right-unsigned", ">>>"],
    ["less", "<"], ["less-equal", "<="], ["greater", ">"], ["greater-equal", ">="],
    ["equal", "==="], ["not-equal", "!=="],
  ]);
  const comparison = new Set(["less", "less-equal", "greater", "greater-equal", "equal", "not-equal"]);
  const equality = new Set(["equal", "not-equal"]);
  const shifts = new Set(["shift-left", "shift-right", "shift-right-unsigned"]);
  const expectedAdmissions = new Map([
    ["add", 137], ["subtract", 137], ["multiply", 137], ["divide", 137], ["remainder", 137], ["power", 0],
    ["bit-and", 77], ["bit-or", 77], ["bit-xor", 77],
    ["shift-left", 91], ["shift-right", 91], ["shift-right-unsigned", 91],
    ["less", 137], ["less-equal", 137], ["greater", 137], ["greater-equal", 137], ["equal", 138], ["not-equal", 138],
  ]);
  assert.equal(sourcePrimitiveOperatorKinds.length, 18);
  assert.equal(sourcePrimitiveBinaryOperators.length, operators.size);
  for (const operator of sourcePrimitiveBinaryOperators) {
    const token = operators.get(operator);
    assert.equal(token !== undefined, true, operator);
    let classified = 0;
    let admitted = 0;
    for (const leftKind of sourcePrimitiveOperatorKinds) for (const rightKind of sourcePrimitiveOperatorKinds) {
      const left = primitive(leftKind);
      const right = primitive(rightKind);
      const source = decideSourcePrimitiveBinaryOperator(operator,
        { kind: "fixed", primitive: leftKind }, { kind: "fixed", primitive: rightKind });
      let native;
      if (targetBinaryOperator(token) !== undefined) {
        if (shifts.has(operator)) {
          const promoted = csharpUnaryNumericPromotion(left) ?? left;
          if (validateBinaryTargetSemantics(token, promoted, right, policy) === undefined) {
            native = { result: promoted, left: promoted, right };
          }
        } else if (leftKind === "bool" || rightKind === "bool") {
          if (equality.has(operator) && validateBinaryTargetSemantics(token, left, right, policy) === undefined) {
            native = { result: primitive("bool"), left, right };
          }
        } else {
          const promoted = selectCsharpNumericCarrierPromotion(left, right);
          if (promoted !== undefined && validateBinaryTargetSemantics(token, promoted.leftType, promoted.rightType, policy) === undefined) {
            native = { result: comparison.has(operator) ? primitive("bool") : promoted.resultType,
              left: promoted.leftType, right: promoted.rightType };
          }
        }
      }
      const label = `${operator}: ${leftKind}, ${rightKind}`;
      assert.equal(source.kind === "resolved", native !== undefined, `${label}: family admission`);
      if (native === undefined) {
        assert.equal(source.kind === "refused" && source.reason.length > 0, true, `${label}: one precise refusal`);
      } else {
        assert.equal(native.result.kind === "source-primitive" && source.result === native.result.name, true, `${label}: result kind`);
        assert.equal(native.left.kind === "source-primitive" && source.left === native.left.name, true, `${label}: left representation`);
        assert.equal(native.right.kind === "source-primitive" && source.right === native.right.name, true, `${label}: right representation`);
        admitted += 1;
      }
      classified += 1;
    }
    assert.equal(classified, 324, `${operator}: no unclassified pair`);
    assert.equal(admitted, expectedAdmissions.get(operator), `${operator}: actual accepted family size`);
  }
});

test("D-A every unary primitive agrees with the Native admission oracle including Q10 signed negation", () => {
  const operators = new Map([
    ["positive", "+"], ["negate", "-"], ["bit-not", "~"], ["logical-not", "!"],
    ["increment", "++"], ["decrement", "--"],
  ]);
  const expectedAdmissions = new Map([
    ["positive", 16], ["negate", 14], ["bit-not", 13], ["logical-not", 1],
    ["increment", 16], ["decrement", 16],
  ]);
  assert.equal(sourcePrimitiveUnaryOperators.length, operators.size);
  for (const operator of sourcePrimitiveUnaryOperators) {
    const token = operators.get(operator);
    assert.equal(token !== undefined, true, operator);
    let classified = 0;
    let admitted = 0;
    for (const kind of sourcePrimitiveOperatorKinds) {
      const source = decideSourcePrimitiveUnaryOperator(operator, kind);
      const refusal = validateUnaryTargetSemantics(token, primitive(kind), policy);
      const label = `${operator}: ${kind}`;
      assert.equal(source.kind === "resolved", refusal === undefined, `${label}: family admission`);
      if (refusal === undefined) {
        const expected = operator === "negate" && (kind === "uint8" || kind === "uint16") ? "int32"
          : operator === "negate" && kind === "uint32" ? "int64" : kind;
        assert.equal(source.result === expected && source.operand === expected, true, `${label}: exact native result and input`);
        admitted += 1;
      } else {
        assert.equal(source.kind === "refused" && source.reason.length > 0, true, `${label}: one precise refusal`);
      }
      classified += 1;
    }
    assert.equal(classified, 18, `${operator}: no unclassified operand`);
    assert.equal(admitted, expectedAdmissions.get(operator), `${operator}: actual accepted family size`);
  }
});

test("D-A a compound result's storage kind never retargets a fixed fractional operand", () => {
  for (const rightKind of ["float32", "float64", "decimal"]) {
    const current = checkedOperation("left += right", "+=", primitive("int32"), primitive(rightKind), primitive("int32"));
    assert.equal(current.selected.kind === "resolved", true, rightKind);
    assert.equal(current.selected.resultType === current.resultType, true, rightKind);
    assert.equal(targetTypeRefEquals(current.selected.leftInputType, primitive("int32")), true, rightKind);
    assert.equal(targetTypeRefEquals(current.selected.rightInputType, primitive(rightKind)), true, `${rightKind}: independent Source write-fit remains required`);
  }
});

test("Q10 Native unsigned negation represents the published signed result without replacing it", () => {
  for (const [kind, signed] of [["uint8", "int32"], ["uint16", "int32"], ["uint32", "int64"]]) {
    const current = checkedOperation("left + right", "+", primitive(kind), primitive(kind), primitive(signed));
    const selected = selectCsharpNativeUnaryOperation(current.input, "-", current.operands.left, primitive(kind), current.resultType);
    assert.equal(selected.kind === "resolved", true, kind);
    assert.equal(selected.resultType === current.resultType && selected.operandType === current.resultType &&
      selected.operandConversionMode === "explicit", true,
      kind + ": the Host result is also the exact signed input representation");
  }
});

for (const surface of ["native", "js"]) {
  test(`${surface} Q3 checked int64 shift counts retain their own Source width`, () => {
    for (const operator of ["<<", ">>", ">>>", "<<=", ">>=", ">>>="]) {
      const compiled = compileEffectiveSource(surface, `import type { int64 } from "@tsonic/core/types.js";
        export function run(value: int64, count: int64): int64 { return value ${operator} count; }`);
      const generated = acceptedEffectiveSource(compiled);
      assertPrimitiveOccurrences(compiled, "count", "int64");
      assertPrimitiveOccurrences(compiled, "value", "int64");
      assert.match(generated, /checked\(\(int\)count\)/u, operator + ": the existing checked-index conversion owns the count representation");
    }
  });

  test(`${surface} Q10 unsigned minus keeps the operand width and publishes the signed native result`, () => {
    for (const [kind, signed, spelling] of [["uint8", "int32", "int"], ["uint16", "int32", "int"], ["uint32", "int64", "long"]]) {
      const compiled = compileEffectiveSource(surface, `import type { ${kind} } from "@tsonic/core/types.js";
        export function run(value: ${kind}) { const result = -value; return result; }`);
      const generated = acceptedEffectiveSource(compiled);
      assertPrimitiveOccurrences(compiled, "value", kind);
      assertPrimitiveOccurrences(compiled, "result", signed);
      const expressions = projectNodes(compiled, (node, ast) => ast.is.IsPrefixUnaryExpression(node) &&
        ast.operatorKindName(node) === "KindMinusToken");
      assert.equal(expressions.length, 1, kind);
      const selected = compiled.result.program.records.unaryOperation.get(expressions[0])?.target;
      assert.equal(selected?.kind === "resolved" && targetTypeRefEquals(selected.resultType, primitive(signed)) &&
        selected.operandType === selected.resultType && selected.operandConversionMode === "explicit", true,
        kind + ": one published signed calculation");
      assert.equal(generated.includes(`(${spelling})`), true, kind + ": native input promotion, not unsigned wrapping");
    }
  });

  test(`${surface} Q10/Q13 unsigned-wide negation has one precise Host refusal at the original expression`, () => {
    for (const [name, kind] of [["uint64", "uint64"], ["nativeUint", "native-uint"]]) {
      const compiled = compileEffectiveSource(surface, `import type { ${name} } from "@tsonic/core/types.js";
        export function run(value: ${name}) { return -value; }`);
      assertPublishedRefusal(compiled, "TSONIC_LOCAL_TYPE_UNSUPPORTED", "-value");
      assert.equal(compiled.targetSource.effectiveTypes.refusals().length, 1);
      assert.equal(compiled.result.diagnostics[0]?.message, `Unary minus has no native signed result for '${kind}'.`);
    }
  });
}

function checkedOperation(expression, operator, leftType, rightType, resultType, declarations = "left: number, right: number") {
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/operator-result", files: {
    "/operator-result/index.ts": `function run(${declarations}) { const selected = ${expression}; return selected; }`,
  }, compilerOptions: { strict: true, target: "es2022", module: "esnext" } }).checkSource();
  assert.equal(checked.diagnostics.length, 0, expression);
  const file = checked.getSourceFile("/operator-result/index.ts");
  assert.equal(file !== undefined, true);
  const { ast } = checked;
  let node;
  const visit = current => {
    if (ast.is.IsVariableDeclaration(current) && ast.text(ast.name(current)) === "selected") {
      node = ast.as.AsVariableDeclaration(current)?.Initializer;
    }
    ast.forEachChild(current, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  const binary = node === undefined ? undefined : ast.as.AsBinaryExpression(node);
  assert.equal(binary?.Left !== undefined && binary.Right !== undefined, true, expression);
  const input = { ...policy, ast, literalValues: analyzeSourceLiteralValues(ast, [file]) };
  const operands = {
    left: binary.Left, right: binary.Right, sourceOperator: operator, leftType, rightType, resultType,
    leftStorage: undefined, rightStorage: undefined, genericNumeric: undefined, resultUse: undefined,
    assignmentLocation: "binding",
  };
  const selected = selectCsharpNativeBinaryOperation(input, operands);
  return { selected, resultType, input, operands };
}

test("D-A Native numeric, comparison, shift and compound records retain the exact published Host result", () => {
  for (const [expression, operator, left, right, result, inputLeft, inputRight] of [
    ["left + right", "+", "int8", "int8", "int32", "int32", "int32"],
    ["left + right", "+", "int32", "int64", "int64", "int64", "int64"],
    ["left * right", "*", "float32", "int64", "float32", "float32", "float32"],
    ["left | right", "|", "uint32", "int32", "int64", "int64", "int64"],
    ["left << right", "<<", "int8", "uint8", "int32", "int32", "uint8"],
    ["left += right", "+=", "int8", "int8", "int8", "int8", "int32"],
    ["left <<= right", "<<=", "int64", "int32", "int64", "int64", "int32"],
    ["left === right", "===", "int8", "int8", "bool", "int32", "int32"],
    ["left < right", "<", "int32", "int64", "bool", "int64", "int64"],
  ]) {
    const current = checkedOperation(expression, operator, primitive(left), primitive(right), primitive(result));
    assert.equal(current.selected.kind === "resolved", true, `${operator}: ${left}, ${right}`);
    assert.equal(current.selected.resultType === current.resultType, true, `${operator}: no Native source-result allocation or replacement`);
    assert.equal(targetTypeRefEquals(current.selected.leftInputType, primitive(inputLeft)), true);
    assert.equal(targetTypeRefEquals(current.selected.rightInputType, primitive(inputRight)), true);
  }
});

test("D-A Native literal comparison adaptation chooses only input representation, never the bool Source result", () => {
  const current = checkedOperation("left < 1.5", "<", primitive("float32"), primitive("float64"), primitive("bool"));
  assert.equal(current.selected.kind === "resolved", true);
  assert.equal(current.selected.resultType === current.resultType, true);
  assert.equal(targetTypeRefEquals(current.selected.leftInputType, primitive("float32")), true);
  assert.equal(targetTypeRefEquals(current.selected.rightInputType, primitive("float32")), true);
});

test("D-A Native nonnumeric and nullable operation records never replace the published result", () => {
  for (const [expression, operator, left, right, result, declarations] of [
    ["left + right", "+", csharpStringTargetType(), primitive("int32"), csharpStringTargetType(), "left: string, right: number"],
    ["left ?? right", "??", csharpNullableTargetType(primitive("int32")), primitive("int32"), primitive("int32"), "left: number | undefined, right: number"],
    ["left ??= right", "??=", csharpNullableTargetType(primitive("int32")), primitive("int32"), primitive("int32"), "left: number | undefined, right: number"],
    ["left / right", "/", csharpBigIntegerTargetType(), csharpBigIntegerTargetType(), csharpBigIntegerTargetType(), "left: bigint, right: bigint"],
    ["left in right", "in", primitive("int32"), csharpJsArrayTargetType(primitive("int32")), primitive("bool"), "left: number, right: number[]"],
  ]) {
    const current = checkedOperation(expression, operator, left, right, result, declarations);
    assert.equal(current.selected.kind === "resolved", true, expression);
    assert.equal(current.selected.resultType === result, true, expression);
  }
});

test("D-A Native shift representation admits narrow or checked int64 counts and closes mixed-bool equality", () => {
  for (const operator of ["<<", ">>", ">>>", "<<=", ">>=", ">>>="]) {
    for (const count of narrowCounts) assert.equal(validateBinaryTargetSemantics(operator, primitive("int64"), primitive(count), policy), undefined, `${operator}: ${count}`);
    for (const count of wideCounts) assert.equal(typeof validateBinaryTargetSemantics(operator, primitive("int64"), primitive(count), policy), "string", `${operator}: ${count}`);
    assert.equal(typeof validateBinaryTargetSemantics(operator, primitive("int64"), csharpBigIntegerTargetType(), policy), "string", `${operator}: bigint`);
  }
  for (const operator of ["==", "===", "!=", "!=="]) {
    assert.equal(typeof validateBinaryTargetSemantics(operator, primitive("bool"), primitive("int32"), policy), "string", operator);
    assert.equal(typeof validateBinaryTargetSemantics(operator, primitive("int32"), primitive("bool"), policy), "string", operator);
    assert.equal(validateBinaryTargetSemantics(operator, primitive("bool"), primitive("bool"), policy), undefined, operator);
  }
});

for (const operator of ["<<=", ">>=", ">>>="]) {
  test(`D-A Native ${operator} retains independent count carriers across every primitive pair`, () => {
    const checked = checkedOperation(`left ${operator} right`, operator, primitive("int32"), primitive("int32"), primitive("int32"));
    const integralLefts = new Set([
      "char", "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64",
      "native-int", "native-uint", "int128", "uint128",
    ]);
    let classified = 0;
    let admitted = 0;
    for (const leftKind of sourcePrimitiveOperatorKinds) for (const rightKind of [...sourcePrimitiveOperatorKinds, "bigint"]) {
      const leftType = primitive(leftKind);
      const rightType = rightKind === "bigint" ? csharpBigIntegerTargetType() : primitive(rightKind);
      const resultType = primitive(leftKind);
      const selected = selectCsharpNativeBinaryOperation(checked.input, {
        ...checked.operands, leftType, rightType, resultType,
      });
      const expected = integralLefts.has(leftKind) && narrowCounts.includes(rightKind);
      const label = `${operator}: ${leftKind}, ${rightKind}`;
      assert.equal(selected.kind === "resolved", expected, `${label}: exact shift admission`);
      if (expected) {
        assert.equal(selected.resultType === resultType, true, `${label}: exact published storage result`);
        assert.equal(selected.leftInputType === leftType, true, `${label}: unchanged left storage`);
        assert.equal(selected.rightInputType === rightType, true, `${label}: no left-width promotion of the count`);
        admitted += 1;
      } else {
        assert.equal(selected.reason,
          `C# shift operator '${operator}' requires an integral left operand and a count implicitly convertible to int32.`,
          `${label}: the original precise count refusal remains`);
      }
      classified += 1;
    }
    assert.equal(classified, 342, "every primitive pair and bigint count is classified");
    assert.equal(admitted, 91, "only thirteen integral left kinds with six narrow counts and checked int64 are admitted");
  });
}

test("C2349 dependent Set reads keep the original mixed-element owner in all four literal positions", () => {
  const forms = ["signed, unsigned", "signed, unsigned, 1", "signed, 1, unsigned", "1, signed, unsigned"];
  for (const elements of forms) {
    const compiled = compileEffectiveSource("js", `import type { int32, uint32 } from "@tsonic/core/types.js";
export function check(signed: int32, unsigned: uint32): boolean { const values = [${elements}]; const keys = new Set(values); return keys.has(values[1]) && keys.size === 1; }`);
    assertPublishedRefusal(compiled, "TSONIC_LOCAL_TYPE_MIXED_ELEMENTS", `[${elements}]`);
    assert.equal(compiled.targetSource.effectiveTypes.refusals().length, 1, elements + ": the array owns the sole Source refusal");
    const arrays = projectNodes(compiled, (node, ast) => ast.is.IsArrayLiteralExpression(node));
    const comparisons = projectNodes(compiled, (node, ast) => ast.operatorKindName(node) === "KindEqualsEqualsEqualsToken");
    assert.equal(arrays.length === 1 && comparisons.length === 1, true, elements + ": the original construction and comparison remain");
    const comparison = compiled.targetSource.effectiveTypes.get(comparisons[0]);
    assert.equal(comparison?.kind === "resolved" && comparison.type.kind === "primitive" && comparison.type.primitive === "bool", true,
      elements + ": the independently known comparison publishes bool, not the array refusal");
    const reads = projectNodes(compiled, (node, ast) => ast.is.IsPropertyAccessExpression(node) && ast.text(ast.name(node)) === "size");
    assert.equal(reads.length, 1, elements);
    const size = compiled.targetSource.effectiveTypes.get(reads[0]);
    assert.equal(size !== undefined && size.kind !== "refused" && size.type.kind === "primitive" && size.type.primitive === "int32", true,
      elements + ": the genuine JS provider publishes the same exact member");
    const construction = projectNodes(compiled, (node, ast) => ast.is.IsNewExpression(node))[0];
    const invocation = construction === undefined ? undefined : compiled.targetSource.effectiveTypes.callInstantiation(construction);
    const argument = invocation?.method[0]?.type;
    assert.equal(invocation?.method.length === 1 && argument?.kind === "primitive" && argument.primitive === "float64", true,
      elements + ": the existing constructor binder is retained without reconstruction");
  }
});

for (const surface of ["native", "js"]) {
  test(`${surface} C2350 the optional-pattern coalesce retains the tag refusal at its original Source operation`, () => {
    const compiled = compileEffectiveSource(surface, `function run(): number {
      const { value }: { value?: number } = { value: 4 };
      const { other = 1 }: { other?: number } = {};
      const selected = value ?? 0; return selected + other; }`);
    assertPublishedRefusal(compiled, "TSONIC_LOCAL_TYPE_UNSUPPORTED", "value ?? 0");
    assert.equal(compiled.result.diagnostics[0]?.message,
      "A coalescing operator requires a nullable or runtime-union left operand.");
  });

  test(`${surface} C2348 discarded selector wrappers forward completed effects without a value carrier`, () => {
    const compiled = compileEffectiveSource(surface, `export function run(flag: boolean, optional?: () => number): number {
      ((flag ? (() => 1) : (() => 2))! satisfies (() => number)); return 5; }`);
    const ast = compiled.targetSource.ast;
    const errors = compiled.result.diagnostics.map(issue => {
      const node = issue.sourceNode;
      const range = node === undefined ? undefined : ast.authoredRange(node);
      const file = node === undefined ? undefined : ast.getSourceFile(node);
      const text = range?.kind === "authored" && file !== undefined
        ? ast.getSourceText(file).slice(range.start, Math.min(range.end, range.start + 120)) : "<absent>";
      return `${issue.code}: ${issue.message} at ${node === undefined ? "<absent>" : ast.kindName(node)} ${text}`;
    }).join("; ");
    assert.equal(compiled.targetDiagnostics.length, 0, errors);
    const output = acceptedEffectiveSource(compiled);
    const wrappers = projectNodes(compiled, node => {
      let operand = sourceTransparentExpressionOperand(ast, node);
      if (operand === undefined) return false;
      for (let nested = sourceTransparentExpressionOperand(ast, operand); nested !== undefined;
        nested = sourceTransparentExpressionOperand(ast, operand)) operand = nested;
      return ast.is.IsConditionalExpression(operand);
    });
    assert.equal(wrappers.length, 4);
    for (const wrapper of wrappers) {
      assert.equal(compiled.targetSource.effectiveTypes.get(wrapper) === undefined, true,
        "a discarded selector transport has no invented Source value");
      const physical = compiled.result.program.records.nativeExpression.get(wrapper)?.physical;
      assert.equal(physical?.completion.kind === "void" && physical.discardedPresence !== undefined, true,
        "the wrapper keeps completed native effects and presence without requesting a result");
    }
    assert.equal(output.includes("=>"), false, "no discarded closure allocation reaches emission");
    const consumed = compileEffectiveSource(surface, `export function choose(flag: boolean): () => number {
      return ((flag ? (() => 1) : (() => 2))! satisfies (() => number)); }`);
    acceptedEffectiveSource(consumed);
    const returned = projectNodes(consumed, (node, sourceAst) => sourceAst.is.IsReturnStatement(node))[0];
    const expression = returned === undefined ? undefined : consumed.targetSource.ast.as.AsReturnStatement(returned)?.Expression;
    const outcome = expression === undefined ? undefined : consumed.targetSource.effectiveTypes.get(expression);
    const physical = expression === undefined ? undefined : consumed.result.program.records.nativeExpression.get(expression)?.physical;
    assert.equal(outcome !== undefined && outcome.kind !== "refused" && physical?.completion.kind === "value", true,
      "a consumed selector transport still requires its exact value representation");
  });

  test(`${surface} C2348 a folded binary constructs the published primitive before union storage`, () => {
    const compiled = compileEffectiveSource(surface, `import type { int32 } from "@tsonic/core/types.js";
      type Inner = int32 | boolean;
      export function direct(): (int32 | boolean)[] { return [1 + 2]; }
      export function nested(): (Inner | string)[] { return [1 + 2]; }
      export function nullable(): ((int32 | boolean) | undefined)[] { return [1 + 2]; }`);
    acceptedEffectiveSource(compiled);
    const additions = projectNodes(compiled, (node, ast) => ast.is.IsBinaryExpression(node) &&
      ast.operatorKindName(node) === "KindPlusToken");
    assert.equal(additions.length, 3);
    for (const node of additions) {
      const outcome = compiled.targetSource.effectiveTypes.get(node);
      assert.equal(outcome !== undefined && outcome.kind !== "refused" &&
        (outcome.type.kind === "union" || outcome.type.kind === "optional") &&
        outcome.construction?.kind === "primitive" && outcome.construction.primitive === "int32", true,
        "logical storage and the exact Source-produced calculation remain separate");
      const records = compiled.result.program.records;
      const operation = records.binaryOperation.get(node)?.target;
      const emission = records.nativeExpression.get(node);
      assert.equal(operation?.kind === "resolved" && targetTypeRefEquals(operation.resultType, primitive("int32")), true,
        "the Native operation represents the existing Source construction without choosing another result");
      assert.equal(targetTypeRefEquals(records.valueRead.get(node)?.value, primitive("int32")) &&
        targetTypeRefEquals(emission?.physical?.carrier, primitive("int32")), true,
        "the operation and physical endpoint retain the same primitive carrier");
      assert.equal(records.exactLiteral.get(node, emission.physical.carrier)?.kind, "source-representation");
    }
  });

  test(`${surface} C2351 discarded assertion transports do not create typed result demands`, () => {
    const compiled = compileEffectiveSource(surface, `export function run(flag: boolean): number {
      (flag ? (() => 1) : (() => 2)) as (() => number);
      <() => number>(flag ? (() => 1) : (() => 2));
      (flag ? (() => 1) : (() => 2))!;
      return 5; }`);
    const output = acceptedEffectiveSource(compiled);
    const transports = projectNodes(compiled, (node, ast) => ast.is.IsAsExpression(node) ||
      ast.is.IsTypeAssertion(node) || ast.is.IsNonNullExpression(node));
    assert.equal(transports.length, 3);
    for (const node of transports) {
      const source = compiled.targetSource.effectiveTypes.get(node);
      const native = compiled.result.program.records.nativeExpression.get(node)?.physical;
      assert.equal(source === undefined && native?.completion.kind === "void" && native.discardedPresence !== undefined, true,
        "a result-less assertion retains its admitted effects, not a pending explicit-value conversion");
    }
    assert.equal(output.includes("=>"), false, "discarded transports do not allocate delegates");
    const consumed = compileEffectiveSource(surface, `export function choose(flag: boolean): () => number {
      return (flag ? (() => 1) : (() => 2)) as (() => number); }`);
    acceptedEffectiveSource(consumed);
    const assertion = projectNodes(consumed, (node, ast) => ast.is.IsAsExpression(node))[0];
    const source = assertion === undefined ? undefined : consumed.targetSource.effectiveTypes.get(assertion);
    const native = assertion === undefined ? undefined : consumed.result.program.records.nativeExpression.get(assertion)?.physical;
    assert.equal(source !== undefined && source.kind !== "refused" && native?.completion.kind === "value", true,
      "a consumed assertion still proves and represents its exact result");
  });

  test(`${surface} C2338 reference selection and coalescing emit direct shared references`, () => {
    const compiled = compileEffectiveSource(surface, `export function run(flag: boolean) {
      const first = [1]; const second = [2];
      const selected = flag ? first : second; const copy = selected ?? second; return copy;
    }`);
    const generated = acceptedEffectiveSource(compiled);
    const source = compiled.targetSource;
    const declarations = projectNodes(compiled, (node, ast) => ast.is.IsVariableDeclaration(node));
    const publications = ["first", "second", "selected", "copy"].map(name => {
      const declaration = declarations.find(node => source.ast.text(source.ast.name(node)) === name);
      const outcome = declaration === undefined ? undefined : source.effectiveTypes.get(declaration);
      assert.equal(outcome !== undefined && outcome.kind !== "refused" && outcome.type.kind === "array" &&
        outcome.type.element.kind === "primitive" && outcome.type.element.primitive === "int64", true,
        `${name}: the actual shared native array publication keeps its exact element width`);
      return outcome;
    });
    assert.equal(publications[2].type === publications[3].type, true,
      "reference coalescing keeps the selected producer's identical Source descriptor");
    assert.equal(source.effectiveTypes.refusals().length, 0, "a nonnullable reference is not a primitive-only coalesce refusal");
    const coalescing = projectNodes(compiled, (node, ast) => ast.is.IsBinaryExpression(node) &&
      ast.operatorKindName(node) === "KindQuestionQuestionToken");
    assert.equal(coalescing.length, 1);
    const operation = compiled.result.program.records.binaryOperation.get(coalescing[0])?.target;
    const carrier = surface === "js" ? csharpJsArrayTargetType(primitive("int64")) : { kind: "array", element: primitive("int64") };
    assert.equal(operation?.kind === "resolved" && targetTypeRefEquals(operation.resultType, carrier), true,
      "the Native coalescing result represents the same reference carrier");
    assert.equal(generated.includes("selected = flag ? first : second;") && generated.includes("copy = selected ?? second;"), true,
      "the original reference-copy program emits direct conditional and native coalescing expressions");
    assert.doesNotMatch(generated, /\.ToArray\(|\.Select\(|\.Clone\(/u,
      "selection and coalescing introduce no copy or adapter allocation");
  });

  test(`${surface} D-A an all-literal int8 result retains Host and Native int8 without a generated cast`, () => {
    const compiled = compileEffectiveSource(surface, `import type { int8 } from "@tsonic/core/types.js";
      export function run(): int8 { const b: int8 = 1 + 2; return b; }`);
    const generated = acceptedEffectiveSource(compiled);
    assert.equal(compiled.targetSource.effectiveTypes.refusals().length, 0);
    assertPrimitiveOccurrences(compiled, "b", "int8");
    const additions = projectNodes(compiled, (node, ast) => ast.is.IsBinaryExpression(node) &&
      ast.operatorKindName(node) === "KindPlusToken");
    assert.equal(additions.length, 1, "the original constant sum is retained");
    const publication = compiled.targetSource.effectiveTypes.get(additions[0]);
    const value = compiled.result.program.records.valueRead.get(additions[0])?.value;
    const operation = compiled.result.program.records.binaryOperation.get(additions[0])?.target;
    assert.equal(publication !== undefined && publication.kind !== "refused" && publication.type.kind === "primitive" &&
      publication.type.primitive === "int8", true, "the folded Source result keeps its declared int8 slot");
    assert.equal(value?.kind === "source-primitive" && value.name === "int8", true, "Native represents the same int8 result");
    assert.equal(operation?.kind === "resolved" && operation.resultType.kind === "source-primitive" &&
      operation.resultType.name === "int8", true, "table admission does not replace the constant result with int32");
    const declaration = generated.match(/\bsbyte b = ([^;]+);/u);
    assert.equal(declaration !== null, true, "the local has native sbyte storage");
    assert.doesNotMatch(declaration[1], /\(\s*(?:global::)?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\??\s*\)/u,
      "the constant initializer needs no generated native cast");
  });

  test(`${surface} D-A the retained integer receipt and N-DEFAULT long emission survive table admission`, () => {
    const compiled = compileEffectiveSource(surface,
      "export function run() { const folded = 8 / 2 + 1; const wide = 2n; return folded; }");
    const generated = acceptedEffectiveSource(compiled);
    assert.equal(compiled.targetSource.effectiveTypes.refusals().length, 0);
    assertPrimitiveOccurrences(compiled, "folded", "int64");
    const operations = projectNodes(compiled, (node, ast) => ast.is.IsBinaryExpression(node) &&
      ["KindSlashToken", "KindPlusToken"].includes(ast.operatorKindName(node)));
    assert.equal(operations.length, 2, "division and addition both remain actual admitted operations");
    for (const node of operations) {
      const publication = compiled.targetSource.effectiveTypes.get(node);
      const value = compiled.result.program.records.valueRead.get(node)?.value;
      const operation = compiled.result.program.records.binaryOperation.get(node)?.target;
      assert.equal(publication !== undefined && publication.kind !== "refused" && publication.type.kind === "primitive" &&
        publication.type.primitive === "int64", true, "each constant operation publishes Host int64 under N-DEFAULT");
      assert.equal(value?.kind === "source-primitive" && value.name === "int64", true, "each Native value represents Host int64 under N-DEFAULT");
      assert.equal(operation?.kind === "resolved" && operation.resultType.kind === "source-primitive" &&
        operation.resultType.name === "int64", true, "folding never bypasses operation admission");
    }
    const ast = compiled.targetSource.ast;
    const addition = operations.find(node => ast.operatorKindName(node) === "KindPlusToken");
    assert.equal(addition !== undefined, true, "the original addition owns the complete integer receipt");
    const file = ast.getSourceFile(addition);
    assert.equal(file !== undefined, true, "the receipt belongs to the actual checked source file");
    const receipt = analyzeSourceLiteralValues(ast, [file]).literalValue.get(addition);
    assert.equal(receipt?.form === "binary" && receipt.integerConstant === 5n, true, "the canonical Source integer receipt is exactly 5n");
    assert.equal(generated.includes("long folded = 8L / 2L + 1L;"), true,
      "N-DEFAULT keeps the original constant expression with native long operands, never an int calculation widened afterwards");
  });

  test(`${surface} D-A all six shifts fill open counts without using a declared count to fill the left value`, () => {
    const operators = ["<<", ">>", ">>>", "<<=", ">>=", ">>>="];
    const bodies = operators.map((operator, index) => `export function run${index}(): boolean {
      let left${index} = 8; const amount${index}: int16 = 1; const open${index} = 1;
      const first${index} = left${index} ${operator} amount${index};
      const second${index} = left${index} ${operator} open${index};
      return first${index} === second${index}; }`).join("\n");
    const compiled = compileEffectiveSource(surface, `import type { int16 } from "@tsonic/core/types.js"; ${bodies}`);
    acceptedEffectiveSource(compiled);
    for (let index = 0; index < operators.length; index += 1) {
      assertPrimitiveOccurrences(compiled, `left${index}`, "int64");
      assertPrimitiveOccurrences(compiled, `amount${index}`, "int16");
      assertPrimitiveOccurrences(compiled, `open${index}`, "int64");
      assertPrimitiveOccurrences(compiled, `first${index}`, "int64");
      assertPrimitiveOccurrences(compiled, `second${index}`, "int64");
    }
  });

  test(`${surface} D-A declared narrow counts keep their width and the binary Native result agrees with Host publication`, () => {
    const kinds = ["int8", "uint8", "int16", "uint16", "int32"];
    const program = kinds.map((kind, index) => `export function run${index}(left${index}: int32, amount${index}: ${kind}): boolean {
      const first${index} = left${index} << amount${index};
      const second${index} = left${index} >> amount${index};
      const third${index} = left${index} >>> amount${index};
      return first${index} === second${index} && second${index} === third${index}; }`).join("\n");
    const compiled = compileEffectiveSource(surface, `import type { int8, uint8, int16, uint16, int32 } from "@tsonic/core/types.js"; ${program}`);
    acceptedEffectiveSource(compiled);
    kinds.forEach((kind, index) => assertPrimitiveOccurrences(compiled, `amount${index}`, kind));
    const nodes = projectNodes(compiled, (node, ast) => ast.is.IsBinaryExpression(node) && [
      "KindLessThanLessThanToken", "KindGreaterThanGreaterThanToken", "KindGreaterThanGreaterThanGreaterThanToken",
    ].includes(ast.operatorKindName(node)));
    assert.equal(nodes.length, kinds.length * 3);
    for (const node of nodes) {
      const source = compiled.targetSource.effectiveTypes.get(node);
      const selected = compiled.result.program.records.binaryOperation.get(node)?.target;
      assert.equal(source !== undefined && source.kind !== "refused" && source.type.kind === "primitive", true);
      assert.equal(selected?.kind === "resolved" && selected.resultType.kind === "source-primitive" && selected.resultType.name === source.type.primitive, true);
    }
  });
}

test("C2373 Array.from copies exact union arm elements into only the published result storage", () => {
  for (const [name, sourceElement, destination] of [
    ["Uint8Array", "uint8", "float64"],
    ["Int16Array", "int16", "float64"],
    ["Uint8Array", "uint8", "uint64"],
  ]) {
    const first = csharpJsTypedArrayTargetType(name);
    const second = csharpJsArrayTargetType(primitive(destination));
    const union = csharpRuntimeUnionTargetType([first, second]);
    const result = csharpJsArrayTargetType(primitive(destination));
    const context = arrayCopyContext(union, result);
    const copy = selectCsharpArrayCopy(context);
    assert.equal(copy?.kind, "union", name);
    assert.equal(copy.sourceType === union && copy.resultType === result, true, name + ": original input and published result identities");
    assert.equal(copy.targetElementType.name, destination, name);
    assert.equal(csharpArrayLikeElement(union) === undefined, true, name + ": no widened common view exists");
    assert.equal(copy.arms.length, 2, name);
    assert.equal(copy.arms[0].sourceType === first && copy.arms[0].sourceElementType.name === sourceElement, true,
      name + ": the exact input width survives selection");
    assert.equal(copy.arms[1].sourceType === second && copy.arms[1].sourceElementType.name === destination, true,
      name + ": the other arm keeps its independent element");
    assert.equal(copy.arms[0].conversion.kind === "implicit" && copy.arms[0].conversion.proof === "numeric" &&
      copy.arms[1].conversion.kind === "identity", true, name + ": one native conversion, no intermediate carrier");
    const member = arrayFromMember(context);
    assert.equal(member?.parameters[0]?.type === union && member.returnType === result, true, name);
    assert.equal(member.csharpInvocation?.kind, "array-copy", name);
    assert.equal(member.csharpInvocation.arms.length, 2, name);
    assert.deepEqual(arrayFromTypeArguments(context), [], name + ": no result inference is replayed");
  }
});

test("C2373 Array.from has no absent-result inference, narrowing shim or fabricated array arm", () => {
  const bytes = csharpJsTypedArrayTargetType("Uint8Array");
  const doubles = csharpJsArrayTargetType(primitive("float64"));
  const union = csharpRuntimeUnionTargetType([bytes, doubles]);
  for (const result of [undefined, primitive("float64"), csharpJsArrayTargetType(primitive("uint64"))]) {
    const context = arrayCopyContext(union, result);
    assert.equal(selectCsharpArrayCopy(context) === undefined, true, "only a published result with native implicit arm conversions is admitted");
    assert.equal(arrayFromMember(context) === undefined, true, "no second copy path manufactures the missing relation");
  }
  const foreign = csharpRuntimeUnionTargetType([bytes, primitive("int32")]);
  assert.equal(selectCsharpArrayCopy(arrayCopyContext(foreign, doubles)) === undefined, true,
    "every exact union arm must carry its own native array inventory");
  assert.equal(selectCsharpArrayCopy(arrayCopyContext(union, doubles, 2)) === undefined, true,
    "the formerly unsupported mapped union copy does not silently acquire a new contract");
});

test("C2373 genuine JS Array.from retains exact physical copy inputs and published result on both union widths", () => {
  for (const [name, kind] of [["Uint8Array", "uint8"], ["Int16Array", "int16"]]) {
    const compiled = compileEffectiveSource("js",
      `export function copy(values: ${name} | readonly number[]): number[] { return Array.from(values); }`);
    const output = acceptedEffectiveSource(compiled);
    const calls = projectNodes(compiled, (node, ast) => ast.is.IsCallExpression(node));
    assert.equal(calls.length, 1, name);
    const node = calls[0];
    const selection = compiled.result.program.records.selectedCall.get(node)?.target;
    assert.equal(selection?.kind, "resolved", name);
    const invocation = selection.call.targetMember.csharpInvocation;
    assert.equal(invocation?.kind, "array-copy", name);
    assert.equal(invocation.arms.length === 2 && invocation.arms.some(arm =>
      arm.sourceElementType.kind === "source-primitive" && arm.sourceElementType.name === kind) &&
      invocation.arms.some(arm => arm.sourceElementType.kind === "source-primitive" &&
        arm.sourceElementType.name === "float64"), true, name + ": exact real array arm widths");
    assert.equal(invocation.targetElementType.kind === "source-primitive" && invocation.targetElementType.name === "float64", true, name);
    assert.equal(selection.call.targetMember.parameters[0].type === invocation.sourceType, true, name);
    assert.equal(selection.call.targetMember.returnType === invocation.resultType, true, name);
    assert.doesNotMatch(output, /\.Match|CreateChecked|Convert\.To|\(object\)/u);
  }
});

for (const surface of ["native", "js"]) {
  test(`${surface} RC-D later-use declared arms precede creation defaults across all destination forms`, () => {
    const destinations = [
      { name: "union", type: "(string | number)", elements: literal => `["text", ${literal}]`, index: 1 },
      { name: "optional", type: "(number | undefined)", elements: literal => `[undefined, ${literal}]`, index: 1 },
      { name: "primitive", type: "number", elements: literal => `[${literal}]`, index: 0 },
    ];
    const literals = ["17", "9007199254740993", "-9007199254740993", "1.25"];
    const uses = Object.entries(destinationBodies).filter(([name]) => name !== "alias" && name !== "concise");
    assert.equal(uses.length, 8, "every later-use destination topology is retained");
    const cases = uses.flatMap(([use, body], useIndex) => destinations.flatMap((destination, destinationIndex) =>
      literals.map((literal, literalIndex) => ({
        label: `${use}/${destination.name}/${literal}`,
        destination,
        body: body(destination.type, `matrix${useIndex}_${destinationIndex}_${literalIndex}`)
          .replaceAll("[narrow, signed]", destination.elements(literal)),
      }))));
    assert.equal(cases.length, 96, "eight uses by three destinations by integer, signed-wide and written floating forms");
    const objects = `
      function acceptObject(value: { n: string | number }): { n: string | number } { return value; }
      const positiveObject = { n: 9007199254740993 };
      const negativeObject = { n: -9007199254740993 };
      export function globalPositiveObject() { return acceptObject(positiveObject); }
      export function globalNegativeObject() { return acceptObject(negativeObject); }
      export function localPositiveObject() { const value = { n: 9007199254740993 }; const alias = value; return acceptObject(alias); }
      export function localNegativeObject() { const value = { n: -9007199254740993 }; const alias = value; return acceptObject(alias); }
    `;
    const original = `import type { float32, int32 } from "@tsonic/core/types.js";\n${cases.map(row => row.body).join("\n")}\n${objects}`;
    const rejected = compileEffectiveSource(surface, original);
    const errors = rejected.result.diagnostics.filter(issue => issue.category === "error");
    assert.equal(errors.length, 2, "only the two fixed module allocations reject backward storage retargeting");
    for (const [index, name] of ["positiveObject", "negativeObject"].entries()) {
      const issue = errors[index];
      assert.equal(issue.code, "CSHARP_UNSUPPORTED_AST");
      assert.equal(issue.message, "No exact C# implicit conversion relates 'target:tsonic.shape:b13dc4521baaff73f5a23dabc9e8e7a9132b135c60d22ff42e17c9748a75956e<>' to 'target:tsonic.shape:189f39ca1970862712bea92adb0bd22482423ba78ad4a645aa9608d3b7eae517<>'. " +
        `Annotate \`const ${name}: { n: string | number } = { n: ${index === 0 ? "" : "-"}9007199254740993 }\`.`);
      const range = rejected.targetSource.ast.authoredRange(issue.sourceNode);
      assert.equal(range.kind, "authored");
      assert.equal(original.slice(range.start, range.end), name, "the original module argument owns its precise refusal");
    }
    assert.equal(rejected.artifacts.size, 0);
    const compiled = compileEffectiveSource(surface, original
      .replace("const positiveObject =", "const positiveObject: { n: string | number } =")
      .replace("const negativeObject =", "const negativeObject: { n: string | number } ="));
    acceptedEffectiveSource(compiled);
    const arrays = projectNodes(compiled, (node, ast) => ast.is.IsArrayLiteralExpression(node));
    assert.equal(arrays.length, cases.length, "each original array has one observed construction");
    const program = compiled.result.program;
    const ast = compiled.targetSource.ast;
    for (const [index, expression] of arrays.entries()) {
      const row = cases[index];
      const use = program.records.nativeExpression.get(expression)?.use;
      assert.equal(use?.kind === "constructed", true, row.label + ": one native allocation, not an array conversion");
      const element = getCsharpArrayLiteralElementTargetType(use.carrier);
      if (row.destination.name === "union") {
        const arms = getCsharpRuntimeUnionArms(element, program.typeDefinitions);
        assert.equal(arms?.length === 2 && arms.some(arm => targetTypeRefEquals(arm, primitive("float64"))) &&
          arms.some(arm => isCsharpStringTargetType(arm) || isCsharpJsStringTargetType(arm)), true,
        row.label + ": only the declared string and float64 arms are allocated");
      } else {
        const numeric = row.destination.name === "optional" ? getCsharpNullableElementTargetType(element) : element;
        assert.equal(numeric !== undefined && targetTypeRefEquals(numeric, primitive("float64")), true,
          row.label + ": the native element retains the declared width and absence");
      }
      const literal = ast.elements(expression)[row.destination.index];
      const outcome = compiled.targetSource.effectiveTypes.get(literal);
      assert.equal(outcome !== undefined && outcome.kind !== "refused", true, row.label + ": the original literal is published");
      const construction = outcome.construction ?? outcome.type;
      assert.equal(construction.kind === "primitive" && construction.primitive === "float64", true,
        row.label + ": declared destination admission precedes the integer creation default");
    }
    const objectLiterals = projectNodes(compiled, (node, ast) => ast.is.IsObjectLiteralExpression(node));
    assert.equal(objectLiterals.length, 4, "local and global objects cover both whole signed forms");
    for (const literal of objectLiterals) {
      const physical = program.records.nativeExpression.get(literal)?.physical;
      const shape = physical?.objectShape;
      assert.equal(shape !== undefined && shape.members.length === 1, true, "one actual object member inventory");
      const arms = getCsharpRuntimeUnionArms(shape.members[0].type, program.typeDefinitions);
      assert.equal(arms?.length === 2 && arms.some(arm => targetTypeRefEquals(arm, primitive("float64"))) &&
        arms.some(arm => isCsharpStringTargetType(arm) || isCsharpJsStringTargetType(arm)), true,
      "the existing object producer preserves the declared destination without an int64 arm");
      assert.equal(program.records.nativeExpression.get(literal)?.physical?.objectShape === shape, true,
        "one canonical object allocation and inventory, not a conversion copy");
    }
  });
}

function arrayCopyContext(sourceType, resultType, parameterCount = 1) {
  const expression = Object.freeze({});
  const call = Object.freeze({});
  return {
    host: { ...policy,
      get types() { return assert.fail("a copy binding cannot retry Source typing"); },
      semantics: () => assert.fail("a copy binding cannot query the checker"),
    },
    source: { call, sourceArguments: [{ expression }],
      sourceSelectedSignatureParameters: Array.from({ length: parameterCount }, () => ({})) },
    inputs: { values: new Map([[expression, sourceType]]),
      results: { get: node => node === call ? resultType : undefined } },
  };
}
