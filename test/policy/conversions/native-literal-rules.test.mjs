import assert from "node:assert/strict";
import test from "node:test";
import { checkedSourceScalarLiterals } from "../../helpers/source-literal-values.mjs";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { csharpScalarLiteralIsRepresentableAs } from "../../../dist/policy/conversions/literals.js";
import { csharpNumericLiteralFitsSourcePrimitive } from "../../../dist/policy/conversions/literal-range.js";
import { csharpArrayElementIsRepresentableAs } from "../../../dist/policy/types/collections/array-elements.js";
import { csharpArrayLiteralElisionIssue } from "../../../dist/policy/types/collections/literal-construction.js";
import * as numericRules from "../../../dist/target-model/syntax/numeric-literals.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType, csharpStringTargetType } from "../../../dist/target-model/types/index.js";

const primitive = name => csharpSourcePrimitiveTargetType(name);
const integer = value => Object.freeze({ kind: "number", value: Object.freeze({ kind: "integer", value }) });
const checked = value => Object.freeze({ kind: "number", value: Object.freeze({ kind: "checked-float64", value }) });
const bigint = value => Object.freeze({ kind: "bigint", value });
const string = value => Object.freeze({ kind: "string", value });

test("native literal rules do not retain the replaced AST numeric readers", () => {
  assert.equal(Object.hasOwn(numericRules, "csharpNumericLiteralValue"), false);
  assert.equal(Object.hasOwn(numericRules, "csharpBigIntLiteralValue"), false);
});

test("native integer literal rules decide from exact bigint data at every bound", () => {
  for (const [name, minimum, maximum] of [
    ["int8", -128n, 127n], ["uint8", 0n, 255n], ["int16", -32768n, 32767n], ["uint16", 0n, 65535n],
    ["int32", -2147483648n, 2147483647n], ["uint32", 0n, 4294967295n],
    ["int64", -(1n << 63n), (1n << 63n) - 1n], ["uint64", 0n, (1n << 64n) - 1n],
    ["int128", -(1n << 127n), (1n << 127n) - 1n], ["uint128", 0n, (1n << 128n) - 1n],
    ["native-int", -(1n << 63n), (1n << 63n) - 1n], ["native-uint", 0n, (1n << 64n) - 1n],
  ]) {
    assert.equal(csharpScalarLiteralIsRepresentableAs(bigint(minimum), primitive(name)), true, `${name} minimum`);
    assert.equal(csharpScalarLiteralIsRepresentableAs(bigint(maximum), primitive(name)), true, `${name} maximum`);
    assert.equal(csharpScalarLiteralIsRepresentableAs(bigint(minimum - 1n), primitive(name)), false, `${name} below minimum`);
    assert.equal(csharpScalarLiteralIsRepresentableAs(bigint(maximum + 1n), primitive(name)), false, `${name} above maximum`);
  }
  const beyondDouble = integer(9007199254740993n);
  assert.equal(csharpScalarLiteralIsRepresentableAs(beyondDouble, primitive("int64")), true, "the exact value beyond 2^53 fits int64");
  assert.equal(csharpScalarLiteralIsRepresentableAs(beyondDouble, primitive("int32")), false, "the exact value is not int32");
  assert.equal(csharpNumericLiteralFitsSourcePrimitive(beyondDouble, "uint64") &&
    !csharpNumericLiteralFitsSourcePrimitive(checked(1.5), "int32"), true, "fit reads canonical exact scalar data");
});

test("floating, signed-zero, char, boolean, string and array literal rules keep their exact results", () => {
  const [floating, negativeZero] = checkedSourceScalarLiterals(["1.5", "-0"]);
  for (const name of ["float16", "float32", "float64", "decimal"]) {
    assert.equal(csharpScalarLiteralIsRepresentableAs(floating, primitive(name)), true, `${name} finite`);
    assert.equal(csharpScalarLiteralIsRepresentableAs(negativeZero, primitive(name)), true, `${name} signed zero`);
  }
  assert.equal(negativeZero.kind === "number" && negativeZero.value.kind === "authored" &&
    negativeZero.value.token.negative && negativeZero.value.token.coefficient === 0n, true, "Source retains signed zero");
  assert.equal(csharpScalarLiteralIsRepresentableAs(negativeZero, primitive("int32")), true, "-0 fits an integer as 0");
  assert.equal(csharpScalarLiteralIsRepresentableAs(checked(1.5), primitive("int32")), false, "fraction is not an integer");
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(csharpScalarLiteralIsRepresentableAs(checked(value), primitive("float64")), true,
      "the Native IEEE float64 value domain includes nonfinite values; this is not a Source admission claim");
    assert.equal(csharpScalarLiteralIsRepresentableAs(checked(value), primitive("int64")), false,
      "a nonfinite IEEE value never becomes an integer through a scalar receipt");
    assert.equal(csharpScalarLiteralIsRepresentableAs(checked(value), primitive("decimal")), false,
      "a nonfinite IEEE value never becomes a finite Native decimal literal");
  }
  assert.equal(csharpScalarLiteralIsRepresentableAs(string("a"), primitive("char")), true, "one code unit is a char");
  for (const text of ["", "ab", "\u{1F600}"]) {
    assert.equal(csharpScalarLiteralIsRepresentableAs(string(text), primitive("char")), false, `${JSON.stringify(text)} is not a char`);
  }
  assert.equal(csharpScalarLiteralIsRepresentableAs(Object.freeze({ kind: "boolean", value: true }), primitive("bool")) &&
    !csharpScalarLiteralIsRepresentableAs(integer(1n), primitive("bool")), true, "only boolean literals are bool");
  assert.equal(csharpScalarLiteralIsRepresentableAs(string("x"), csharpStringTargetType()) &&
    !csharpScalarLiteralIsRepresentableAs(integer(1n), csharpStringTargetType()), true, "only string data is string");

  const fits = literal => csharpArrayElementIsRepresentableAs(primitive("uint8"), { carrier: primitive("int64"), literal });
  assert.equal([integer(1n), integer(255n)].every(fits), true, "every published contribution fits");
  assert.equal([integer(1n), integer(256n)].every(fits), false, "one contribution out of range rejects");
  assert.equal([integer(1n), undefined].every(fits), false, "an unknown wide contribution cannot silently narrow");
  assert.equal(csharpScalarLiteralIsRepresentableAs(integer(7n), csharpNullableTargetType(primitive("int32"))), true,
    "nullable target reads its actual payload");
  assert.equal(csharpScalarLiteralIsRepresentableAs(integer(300n), primitive("int16")) &&
    !csharpScalarLiteralIsRepresentableAs(integer(300n), primitive("uint8")), true, "computed integer singleton retains its exact range");

  const compiled = analyzeCsharpSource({ sourceText: `
    export function dynamic(value: number): number { return value; }
    export const empty: number[] = [];
    export const hole: number[] = [,];
    export const sparse: number[] = [, 1];
  ` });
  assertCsharpCheckingSucceeded(compiled);
  const source = compiled.source;
  const declarations = source.sourceFiles.filter(file => !source.ast.isDeclarationFile(file))
    .flatMap(file => source.ast.statements(file));
  const dynamic = declarations.find(node => source.ast.is.IsFunctionDeclaration(node));
  assert.equal(dynamic !== undefined, true, "original dynamic declaration");
  const slot = resolvedSourceValue(source.facts.values.declaredSlot(source.ast.parameters(dynamic)[0]), "original scalar slot");
  assert.equal(source.facts.descriptors.scalarLiteral(slot.type).kind, "none", "no constant is not a fabricated scalar datum");
  const arrays = [];
  for (const declaration of declarations) source.ast.forEachChild(declaration, function visit(node) {
    if (source.ast.is.IsArrayLiteralExpression(node)) arrays.push(node);
    else source.ast.forEachChild(node, visit);
  });
  assert.equal(arrays.length, 3, "the original empty, hole and sparse constructions");
  const empty = resolvedSourceValue(source.facts.values.construction(arrays[0]), "the original empty construction");
  assert.equal(empty.kind === "present" && empty.value.evaluation.length === 0, true, "an actually empty authored evaluation vector");
  assert.equal(csharpArrayLiteralElisionIssue(source.ast, arrays[0]), undefined, "dense empty construction is admitted");
  for (const array of arrays.slice(1)) {
    const issue = csharpArrayLiteralElisionIssue(source.ast, array);
    assert.equal(issue?.code, "CSHARP_UNSUPPORTED_AST", "a hole cannot be silently compacted");
    assert.equal(issue.subject === array, true, "the precise original sparse construction is rejected");
  }
});
