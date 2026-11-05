import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { analyzeSourceLiteralValues } from "@tsonic/target-api/source";
import { selectCsharpNativeBinaryOperation } from "../../../dist/policy/operations/operators/rules.js";
import { validateBinaryTargetSemantics } from "../../../dist/policy/operations/operators/operator-validation.js";
import {
  csharpBigIntegerTargetType, csharpJsArrayTargetType, csharpNullableTargetType,
  csharpSourcePrimitiveTargetType, csharpStringTargetType, targetTypeRefEquals,
} from "../../../dist/target-model/types/index.js";
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
