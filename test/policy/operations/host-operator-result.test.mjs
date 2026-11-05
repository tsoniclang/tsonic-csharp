import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { analyzeSourceLiteralValues } from "@tsonic/target-api/source";
import { selectCsharpNativeBinaryOperation, targetBinaryOperator } from "../../../dist/policy/operations/operators/rules.js";
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
import { csharpJsArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import {
  acceptedEffectiveSource, assertPrimitiveOccurrences, compileEffectiveSource, projectNodes,
} from "../../helpers/source-effective-types.mjs";

const primitive = csharpSourcePrimitiveTargetType;
const narrowCounts = ["char", "int8", "uint8", "int16", "uint16", "int32"];
const wideCounts = ["uint32", "int64", "uint64", "native-int", "native-uint", "int128", "uint128", "float16", "float32", "float64", "decimal", "bool"];
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
    ["shift-left", 78], ["shift-right", 78], ["shift-right-unsigned", 78],
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

test("D-A every unary primitive agrees with the Native admission oracle without unary promotion", () => {
  const operators = new Map([
    ["positive", "+"], ["negate", "-"], ["bit-not", "~"], ["logical-not", "!"],
    ["increment", "++"], ["decrement", "--"],
  ]);
  const expectedAdmissions = new Map([
    ["positive", 16], ["negate", 16], ["bit-not", 13], ["logical-not", 1],
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
        assert.equal(source.result === kind && source.operand === kind, true, `${label}: exact non-promoted kind`);
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
  const selected = selectCsharpNativeBinaryOperation(input, {
    left: binary.Left, right: binary.Right, sourceOperator: operator, leftType, rightType, resultType,
    leftStorage: undefined, rightStorage: undefined, genericNumeric: undefined, resultUse: undefined,
    assignmentLocation: "binding",
  });
  return { selected, resultType };
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

test("D-A Native shift representation admits only implicit int32 counts and closes mixed-bool equality", () => {
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

for (const surface of ["native", "js"]) {
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

  test(`${surface} D-A the retained integer receipt and unchanged tag emission survive table admission`, () => {
    const compiled = compileEffectiveSource(surface,
      "export function run() { const folded = 8 / 2 + 1; const wide = 2n; return folded; }");
    const generated = acceptedEffectiveSource(compiled);
    assert.equal(compiled.targetSource.effectiveTypes.refusals().length, 0);
    assertPrimitiveOccurrences(compiled, "folded", "int32");
    const operations = projectNodes(compiled, (node, ast) => ast.is.IsBinaryExpression(node) &&
      ["KindSlashToken", "KindPlusToken"].includes(ast.operatorKindName(node)));
    assert.equal(operations.length, 2, "division and addition both remain actual admitted operations");
    for (const node of operations) {
      const publication = compiled.targetSource.effectiveTypes.get(node);
      const value = compiled.result.program.records.valueRead.get(node)?.value;
      const operation = compiled.result.program.records.binaryOperation.get(node)?.target;
      assert.equal(publication !== undefined && publication.kind !== "refused" && publication.type.kind === "primitive" &&
        publication.type.primitive === "int32", true, "each constant operation publishes Host int32");
      assert.equal(value?.kind === "source-primitive" && value.name === "int32", true, "each Native value represents Host int32");
      assert.equal(operation?.kind === "resolved" && operation.resultType.kind === "source-primitive" &&
        operation.resultType.name === "int32", true, "folding never bypasses operation admission");
    }
    const ast = compiled.targetSource.ast;
    const addition = operations.find(node => ast.operatorKindName(node) === "KindPlusToken");
    assert.equal(addition !== undefined, true, "the original addition owns the complete integer receipt");
    const file = ast.getSourceFile(addition);
    assert.equal(file !== undefined, true, "the receipt belongs to the actual checked source file");
    const receipt = analyzeSourceLiteralValues(ast, [file]).literalValue.get(addition);
    assert.equal(receipt?.form === "binary" && receipt.integerConstant === 5n, true, "the canonical Source integer receipt is exactly 5n");
    assert.equal(generated.includes("int folded = 8 / 2 + 1;"), true,
      "the exact unchanged tag form remains one native constant expression");
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
      assertPrimitiveOccurrences(compiled, `left${index}`, "int32");
      assertPrimitiveOccurrences(compiled, `amount${index}`, "int16");
      assertPrimitiveOccurrences(compiled, `open${index}`, "int32");
      assertPrimitiveOccurrences(compiled, `first${index}`, "int32");
      assertPrimitiveOccurrences(compiled, `second${index}`, "int32");
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
