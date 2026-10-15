import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpSourceLiteralValues } from "../../../dist/analysis/source-evidence/literal-values.js";

function syntheticAst(touched) {
  const kinds = ["StringLiteral", "NoSubstitutionTemplateLiteral", "NumericLiteral", "BigIntLiteral", "PrefixUnaryExpression",
    "ParenthesizedExpression", "BinaryExpression", "ArrayLiteralExpression"];
  return {
    is: Object.fromEntries(kinds.map((kind) => [`Is${kind}`, (node) => {
      if (kind === "StringLiteral") touched?.push(node);
      return node.kind === kind;
    }])),
    as: {
      AsParenthesizedExpression: (node) => ({ Expression: node.expression }),
      AsPrefixUnaryExpression: (node) => ({ Operand: node.operand }),
      AsBinaryExpression: (node) => ({ Left: node.left, Right: node.right }),
    },
    kindName: (node) => `Kind${node.kind}`,
    operatorKindName: (node) => node.operator,
    authoredRange: () => ({ kind: "synthetic" }),
    text: (node) => node.text,
    elements: (node) => node.elements ?? [],
    forEachChild: (node, visit) => {
      for (const child of [...(node.children ?? []), node.operand, node.expression, node.left, node.right, ...(node.elements ?? [])]) {
        if (child !== undefined) visit(child);
      }
    },
  };
}

const numericNode = (text) => ({ kind: "NumericLiteral", text });

function literals(sourceText, surface = "native") {
  const compiled = compileCsharpSource({ surface, sourceText });
  const program = compiled.result.program;
  assert.equal(program !== undefined, true, `${surface}: the program publishes`);
  const ast = program.source.ast;
  const found = [];
  const visit = (node) => {
    const datum = program.records.literalValue.get(node);
    if (datum !== undefined) found.push({ node, kind: ast.kindName(node), datum });
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
  };
  for (const file of program.sourceFiles) visit(file);
  return { compiled, program, found };
}

test("one checked extraction publishes exact frozen literal data with bigint precision and signed zero", () => {
  for (const surface of ["native", "js"]) {
    const { program, found } = literals(`
      export const wide = 9007199254740993n;
      export const exact = 9007199254740993;
      export const zero = -0;
      export const grouped = (2 + 3) * 4;
      export const letters = ["a", "bc"];
      export const yes = true;
    `, surface);
    const byKind = (kind) => found.filter((entry) => entry.kind === kind);
    const wide = byKind("KindBigIntLiteral")[0]?.datum;
    assert.equal(wide?.form === "bigint" && wide.integer === 9007199254740993n, true, `${surface}: bigint keeps its exact value`);
    const exact = byKind("KindNumericLiteral").find((entry) => entry.datum.integer === 9007199254740993n)?.datum;
    assert.equal(exact !== undefined && exact.number === Number("9007199254740993"), true,
      `${surface}: a numeric literal keeps both its double and its exact integer`);
    const zero = byKind("KindPrefixUnaryExpression")[0]?.datum;
    assert.equal(zero !== undefined && Object.is(zero.number, -0) && zero.integer === 0n, true, `${surface}: -0 keeps signed zero`);
    const grouped = byKind("KindBinaryExpression").find((entry) => entry.datum.integerConstant === 20n);
    assert.equal(grouped !== undefined, true, `${surface}: an integer constant expression keeps its exact value`);
    const array = byKind("KindArrayLiteralExpression")[0]?.datum;
    assert.equal(array?.elements?.length === 2 && array.elements[0].text === "a" && array.elements[1].text === "bc", true,
      `${surface}: array data references each element datum`);
    assert.equal(byKind("KindTrueKeyword")[0]?.datum.form === "true", true, `${surface}: boolean literal form`);
    assert.equal(found.every((entry) => Object.isFrozen(entry.datum) && (entry.datum.elements === undefined || Object.isFrozen(entry.datum.elements))),
      true, `${surface}: every datum and element list is frozen`);
    assert.equal(found.every((entry) => (entry.datum.form === "array") === Array.isArray(entry.datum.elements) &&
      ((entry.datum.form === "string" || entry.datum.form === "template") === (typeof entry.datum.text === "string"))), true,
    `${surface}: array data always has elements and text data always has text, by form`);
    assert.equal(found.every((entry) => program.records.literalValue.get(entry.node) === entry.datum), true,
      `${surface}: every read returns the one extracted datum`);
  }
});

test("extraction covers literals that type resolution reaches before their declaration is visited", () => {
  const { compiled, found } = literals(`
    export function first(flag: boolean) { return later(flag); }
    function later(flag: boolean) { return flag ? 1 : 2; }
  `);
  assert.equal(compiled.result.diagnostics.length === 0, true, "the program compiles without diagnostics");
  const integers = found.filter((entry) => entry.kind === "KindNumericLiteral").map((entry) => entry.datum.integer);
  assert.equal(integers.includes(1n) && integers.includes(2n), true, "both conditional arms have data");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal(/public static int first\(bool flag\)/u.test(output) && /public static int later\(bool flag\)/u.test(output), true,
    "both functions keep the exact int carrier their literal arms select");
});

test("literals in type-only declarations, overload sets and abstract signatures are extracted without changing admission", () => {
  const { compiled, found } = literals(`
    export function pick(value: number): number;
    export function pick(value: number): number { return value + 1; }
    export abstract class Shape { abstract area(scale: number): number; size(): number { return 2; } }
    type Limit = 10;
    export const limit: Limit = 10;
  `);
  assert.equal(compiled.result.diagnostics.length === 0, true, "the program compiles without diagnostics");
  const integers = found.filter((entry) => entry.kind === "KindNumericLiteral").map((entry) => entry.datum.integer);
  assert.equal(integers.includes(1n) && integers.includes(2n) && integers.filter((value) => value === 10n).length >= 1, true,
    "literals in emitted bodies, the overload's body and the alias position all have data");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal(/abstract double area\(double scale\);/u.test(output) && /return 2;/u.test(output), true,
    "the abstract signature and the concrete body keep their native output");
});

test("extraction walks iteratively in source post-order and extracts every node once", () => {
  const touched = [];
  const ast = syntheticAst(touched);
  const one = numericNode("1");
  const minus = { kind: "PrefixUnaryExpression", operator: "KindMinusToken", operand: numericNode("0") };
  const list = { kind: "ArrayLiteralExpression", elements: [one, undefined, minus] };
  const second = { kind: "StringLiteral", text: "x" };
  const files = [{ kind: "SourceFile", children: [list] }, { kind: "SourceFile", children: [second] }];
  const index = analyzeCsharpSourceLiteralValues(ast, files);
  const expected = [one, minus.operand, minus, list, files[0], second, files[1]];
  assert.equal(touched.length === expected.length && touched.every((node, position) => node === expected[position]), true,
    "children before parents, siblings and files in source order, each node once");
  const array = index.literalValue.get(list);
  assert.equal(array.form === "array" && array.elements.length === 3 && array.elements[1] === undefined &&
    array.elements[0] === index.literalValue.get(one) && array.elements[2] === index.literalValue.get(minus), true,
  "a sparse array keeps its hole and references each element datum");
  assert.equal(Object.is(index.literalValue.get(minus).number, -0) && index.literalValue.get(minus).integer === 0n, true,
    "signed zero survives the iterative walk");
  assert.equal(index.literalValue.get(files[0]) === undefined, true, "a source file has no datum");
});

test("extraction depth does not depend on the host call stack", () => {
  let node = numericNode("7");
  const leaf = node;
  for (let depth = 0; depth < 100_000; depth += 1) node = { kind: "ParenthesizedExpression", expression: node };
  const nested = { kind: "ArrayLiteralExpression", elements: [node] };
  const index = analyzeCsharpSourceLiteralValues(syntheticAst(), [{ kind: "SourceFile", children: [nested] }]);
  const outer = index.literalValue.get(node);
  assert.equal(outer?.form === "parenthesized" && outer.number === 7 && outer.integer === 7n, true,
    "the outermost of 100,000 nested parentheses carries the exact enclosed literal");
  assert.equal(index.literalValue.get(leaf)?.integer === 7n && index.literalValue.get(nested)?.elements[0] === outer, true,
    "the leaf and the enclosing array keep their data");
});

test("integer constants come from one shared reader that reads each extracted leaf datum once", () => {
  const ast = syntheticAst();
  const textReads = new Map();
  const operatorReads = new Map();
  const counted = {
    ...ast,
    text: (node) => { textReads.set(node, (textReads.get(node) ?? 0) + 1); return ast.text(node); },
    operatorKindName: (node) => { operatorReads.set(node, (operatorReads.get(node) ?? 0) + 1); return ast.operatorKindName(node); },
  };
  const binary = (operator, left, right) => ({ kind: "BinaryExpression", operator, left, right });
  const group = (expression) => ({ kind: "ParenthesizedExpression", expression });
  const leaves = [numericNode("1"), numericNode("2"), numericNode("3"), numericNode("4")];
  const sum = binary("KindPlusToken", leaves[0], leaves[1]);
  const product = binary("KindAsteriskToken", group(sum), leaves[2]);
  const difference = binary("KindMinusToken", group(product), leaves[3]);
  const outer = group(difference);
  const name = { kind: "Identifier" };
  const refused = binary("KindPlusToken", name, numericNode("1"));
  const containing = binary("KindAsteriskToken", group(refused), numericNode("2"));
  const index = analyzeCsharpSourceLiteralValues(counted, [{ kind: "SourceFile", children: [outer, containing] }]);
  const constant = (node) => index.literalValue.get(node)?.integerConstant;
  assert.equal(constant(sum) === 3n && constant(product) === 9n && constant(difference) === 5n && constant(outer) === 5n, true,
    "every nested root keeps its exact integer constant");
  assert.equal(index.literalValue.get(refused) === undefined && index.literalValue.get(containing) === undefined &&
    index.literalValue.get(containing.left) === undefined, true,
  "a refused root and every root that contains it have no integer constant");
  assert.equal(leaves.every((leaf) => textReads.get(leaf) === 2), true,
    "each numeric leaf is read only by its own extraction, never again by an enclosing integer root");
  const roots = [sum, product.left, product, difference.left, difference, outer];
  assert.equal(roots.every((node) => operatorReads.get(node) === 1), true,
    "each operator and grouping node is evaluated once across all enclosing integer roots");
});
