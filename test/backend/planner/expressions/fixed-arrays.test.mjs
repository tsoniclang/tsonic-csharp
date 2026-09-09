import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { tsonicFixedArrayFactKey } from "@tsonic/source-core/facts";
import { createCsharpFixedArrayTypeQuery } from "../../../../dist/policy/types/resolution/source-markers.js";
import {
  assertCsharpCheckingSucceeded,
  assertCsharpCompilationSucceeded,
  checkCsharpSource,
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

test("number-based fixed arrays retain C# arrays, indexing, iteration, and exact length carriers", () => {
  const compiled = compileCsharpSource({ sourceText: `
import type { FixedArray, int32, uint8 } from "@tsonic/core/types.js";
export function emptyLength(values: FixedArray<uint8, 0>): int32 { return values.length; }
export function oneLength(values: FixedArray<uint8, 1>): int32 { return values.length; }
export function fourLength(values: FixedArray<uint8, 4>): int32 { return values.length; }
export function maximumLength(values: FixedArray<uint8, 2147483647>): int32 { return values.length; }
export function update(values: FixedArray<uint8, 4>, index: int32): uint8 {
  values[index] = 9;
  return values[0];
}
export function total(values: FixedArray<int32, 2>): int32 {
  let result: int32 = 0;
  for (const value of values) result += value;
  return result;
}
` });
  assertCsharpCompilationSucceeded(compiled);
  const output = compiled.artifacts.get("src/Index.cs");
  for (const name of ["emptyLength", "oneLength", "fourLength", "maximumLength"]) {
    assert.match(output, new RegExp(`public static int ${name}\\(byte\\[\\] values\\)\\s*\\{\\s*return values\\.Length;\\s*\\}`, "u"));
  }
  assert.match(output, /public static byte update\(byte\[\] values, int index\)/u);
  assert.match(output, /values\[index\] = 9;/u);
  assert.match(output, /return values\[0\];/u);
  assert.match(output, /public static int total\(int\[\] values\)/u);
  assert.match(output, /foreach \(int value in values\)/u);
});

test("cross-file fixed-array aliases retain selected element types without authored use-site arguments", () => {
  const compiled = compileCsharpSource({ files: {
    "arrays.ts": `import type { FixedArray, uint8 } from "@tsonic/core/types.js";
      export type Bytes = FixedArray<uint8, 4>;
      export type Matrix = FixedArray<Bytes, 2>;
      export function identity(values: Bytes): Bytes { return values; }`,
  }, sourceText: `
  import type { Bytes, Matrix } from "./arrays.js";
  import { identity } from "./arrays.js";
import type { int32, uint8 } from "@tsonic/core/types.js";
export function first(values: Bytes): uint8 { const alias = values; return alias[0]; }
export function width(values: Bytes): int32 { const alias = values; return alias.length; }
export function nested(values: Matrix): uint8 { return values[0][0]; }
export function forward(values: Bytes): Bytes { return identity(values); }
` });
  assertCsharpCompilationSucceeded(compiled);
  const output = compiled.artifacts.get("src/Index.cs");
  assert.match(output, /public static byte first\(byte\[\] values\)/u);
  assert.match(output, /public static int width\(byte\[\] values\)/u);
  assert.match(output, /return alias\.Length;/u);
  assert.match(output, /public static byte nested\(byte\[\]\[\] values\)/u);
  assert.match(output, /return values\[0\]\[0\];/u);
  assert.match(output, /public static byte\[\] forward\(byte\[\] values\)/u);
});

test("C# fixed-array selection caches inferred evidence without publishing Type facts", () => {
  const checked = checkCsharpSource({ files: {
    "external.d.ts": `import type { FixedArray } from "@tsonic/core/types.js";
      export declare function produce(): FixedArray<string, 4>;`,
  }, sourceText: `import { produce } from "./external.js";
    export function forward() { return produce(); }` });
  assertCsharpCheckingSucceeded(checked);
  const source = createTargetSourceProgram(checked.source);
  const sourceFile = source.sourceFiles.find(file => source.ast.getPath(file) === "/project/index.ts");
  assert.ok(sourceFile);
  let call;
  const visit = node => {
    if (source.ast.is.IsCallExpression(node)) call = node;
    source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(sourceFile);
  assert.ok(call);
  const type = source.semantics.forFile(sourceFile).types.expressionType(call);
  assert.ok(type);
  assert.equal(source.sourceFacts.getFact(type, tsonicFixedArrayFactKey), undefined);
  let queryCount = 0;
  const select = createCsharpFixedArrayTypeQuery({ sourceFacts: source.sourceFacts,
    semantics(file) { queryCount += 1; return source.semantics.forFile(file); } });
  const selected = select(type, sourceFile);
  assert.equal(selected?.kind, "selected");
  assert.equal(selected.fact.sourceType, type);
  assert.equal(selected.fact.elementType, undefined);
  assert.equal(selected.fact.length, 4n);
  assert.equal(selected.fact.lengthRuntimeBase, "number");
  assert.ok(Object.isFrozen(selected.fact));
  assert.equal(select(type, sourceFile), selected);
  assert.equal(queryCount, 1);
  assert.equal(source.sourceFacts.getFact(type, tsonicFixedArrayFactKey), undefined);
});

for (const [name, extent, body, reason] of [
  ["first unsupported numeric extent", "2147483648", "return values.length;", /signed 32-bit/u],
  ["largest safe numeric extent", "9007199254740991", "return values.length;", /signed 32-bit/u],
  ["small bigint length", "4n", "return values.length;", /bigint/u],
  ["zero bigint value", "0n", "", /bigint/u],
  ["first huge bigint length", "9007199254740992n", "return values.length;", /bigint/u],
  ["adjacent huge bigint length", "9007199254740993n", "return values.length;", /bigint/u],
  ["bigint index access", "4n", "return values[0];", /bigint/u],
  ["bigint iteration", "4n", "for (const value of values) { if (value === 0) return; }", /bigint/u],
]) {
  test(`fixed-array values precisely reject ${name} without an array fallback`, () => {
    const compiled = compileCsharpSource({ sourceText: `
import type { FixedArray, uint8 } from "@tsonic/core/types.js";
export function expose(values: FixedArray<uint8, ${extent}>) { ${body} }
` });
    assertFixedArrayRejection(compiled, extent.replace(/n$/u, ""), reason);
  });
}

test("named huge fixed-array aliases reject in signatures and inferred length reads", () => {
  const compiled = compileCsharpSource({ files: {
    "arrays.ts": `import type { FixedArray, uint8 } from "@tsonic/core/types.js";
      export type Huge = FixedArray<uint8, 9007199254740993n>;`,
  }, sourceText: `
  import type { Huge } from "./arrays.js";
export function accept(values: Huge): void {}
export function extent(values: Huge) { const alias = values; return alias.length; }
` });
  assertFixedArrayRejection(compiled, "9007199254740993", /bigint/u);
});

for (const [name, sourceType, result, extent, reason] of [
  ["numeric overflow", "FixedArray<uint8, 2147483648>", "values", "2147483648", /signed 32-bit/u],
  ["small bigint length", "FixedArray<uint8, 4n>", "values.length", "4", /bigint/u],
  ["huge bigint length", "FixedArray<uint8, 9007199254740993n>", "values.length", "9007199254740993", /bigint/u],
  ["nested bigint array", "FixedArray<FixedArray<uint8, 4n>, 2>", "values", "4", /bigint/u],
]) {
  test(`inferred fixed-array ${name} rejects without a consuming type annotation`, () => {
    const compiled = compileCsharpSource({ files: {
      "external.d.ts": `import type { FixedArray, uint8 } from "@tsonic/core/types.js";
        export declare function produce(): ${sourceType};`,
    }, sourceText: `
  import { produce } from "./external.js";
export function expose() { const values = produce(); return ${result}; }
` });
    assertFixedArrayRejection(compiled, extent, reason);
  });
}

function assertFixedArrayRejection(compiled, length, reason) {
  assertCsharpCheckingSucceeded(compiled);
  const diagnostic = compiled.targetDiagnostics.find(item => item.code === "CSHARP_FIXED_ARRAY_REPRESENTATION_UNSUPPORTED");
  assert.ok(diagnostic, JSON.stringify(compiled.targetDiagnostics, null, 2));
  assert.match(diagnostic.message, /FixedArray/u);
  assert.ok(diagnostic.message.includes(length), diagnostic.message);
  assert.match(diagnostic.message, reason);
  assert.equal(compiled.artifacts.size, 0);
}
