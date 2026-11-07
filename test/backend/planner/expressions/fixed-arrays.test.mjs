import assert from "node:assert/strict";
import test from "node:test";
import { tsonicFixedArrayFactKey } from "@tsonic/source-core/facts";
import { createCsharpSourceEvidenceTypeQueries } from "../../../../dist/analysis/source-evidence/type-queries.js";
import { hostProgram, representationServices } from "../../../representation/host-fixture.mjs";
import {
  assertCsharpCheckingSucceeded,
  assertCsharpCompilationSucceeded,
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
  // An int32 constant stored to a uint8 element is adapted with a native constant cast (source-literal-extraction).
  assert.match(output, /values\[index\] = \(byte\)9;/u);
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

// Nextgen C-2542: the selection reads the published Host descriptor of the inferred call value (facts.values.type) and
// the extension marker of the FixedArray declaration it names; it never reads a checker Type and publishes no fact.
test("C# fixed-array selection reads inferred evidence from the published descriptor without publishing facts", () => {
  const program = hostProgram(`import { produce } from "./external.js";
    export function forward() { return produce(); }`, { files: {
    "external.d.ts": `import type { FixedArray } from "@tsonic/core/types.js";
      export declare function produce(): FixedArray<string, 4>;`,
  } });
  const call = program.nodes.find(node => program.ast.is.IsCallExpression(node));
  assert.ok(call);
  const descriptor = program.type(call);
  assert.equal(descriptor.kind, "declared", "the inferred call value is the published FixedArray reference");
  const sourceFacts = program.host.sourceFacts;
  assert.equal(sourceFacts.getFact(call, tsonicFixedArrayFactKey), undefined);
  const unreached = () => assert.fail("fixed-array selection reads only the descriptor and extension markers");
  const queries = createCsharpSourceEvidenceTypeQueries(representationServices(program),
    { pointerStorage: {}, sourceStorage: {}, conversions: unreached });
  const selected = queries.selectFixedArray(descriptor, call);
  assert.equal(selected?.kind, "selected");
  assert.equal(selected.fact.length, 4n);
  assert.equal(selected.fact.lengthRuntimeBase, "number");
  assert.equal("sourceType" in selected.fact && typeof selected.fact.sourceType === "object" &&
    selected.fact.sourceType !== null && "flags" in selected.fact.sourceType, false, "the selection carries no checker Type");
  assert.ok(Object.isFrozen(selected) && Object.isFrozen(selected.fact));
  assert.deepEqual(queries.selectFixedArray(descriptor, call), selected, "the selection is a function of the descriptor");
  assert.equal(queries.selectFixedArray({ kind: "array", readonly: false, element: { kind: "string" } }, call), undefined,
    "an ordinary array descriptor is not a fixed array");
  assert.equal(sourceFacts.getFact(call, tsonicFixedArrayFactKey), undefined, "selection publishes no extension fact");
});

for (const [name, extent, body, reason] of [
  ["first unsupported numeric extent", "2147483648", "return values.length;", /signed 32-bit/u],
  ["largest safe numeric extent", "9007199254740991", "return values.length;", /signed 32-bit/u],
  ["first huge bigint length", "9007199254740992n", "return values.length;", /signed 32-bit/u],
  ["adjacent huge bigint length", "9007199254740993n", "return values.length;", /signed 32-bit/u],
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
  assertFixedArrayRejection(compiled, "9007199254740993", /signed 32-bit/u);
});

for (const [name, sourceType, result, extent, reason] of [
  ["numeric overflow", "FixedArray<uint8, 2147483648>", "values", "2147483648", /signed 32-bit/u],
  ["huge bigint length", "FixedArray<uint8, 9007199254740993n>", "values.length", "9007199254740993", /signed 32-bit/u],
  ["nested huge bigint array", "FixedArray<FixedArray<uint8, 9007199254740993n>, 2>", "values", "9007199254740993", /signed 32-bit/u],
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

test("representable bigint fixed-array extents retain native arrays and length", () => {
  const compiled = compileCsharpSource({ files: {
    "arrays.ts": `import type { FixedArray, uint8 } from "@tsonic/core/types.js";
      export function identity(values: FixedArray<uint8, 4n>) { return values; }`,
  }, sourceText: `
import type { FixedArray, uint8 } from "@tsonic/core/types.js";
import { identity } from "./arrays.js";
export function zero(values: FixedArray<uint8, 0n>) { return values.length; }
export function length(values: FixedArray<uint8, 4n>) { return identity(values).length; }
export function first(values: FixedArray<uint8, 4n>) { return values[0]; }
export function nested(values: FixedArray<FixedArray<uint8, 4n>, 2n>) { return values; }
export function each(values: FixedArray<uint8, 4n>) { for (const value of values) { if (value === 0) return; } }
` });
  assertCsharpCompilationSucceeded(compiled);
  const output = compiled.artifacts.get("src/Index.cs");
  assert.match(output, /public static int zero\(byte\[\] values\)/u);
  assert.match(output, /public static int length\(byte\[\] values\)/u);
  assert.match(output, /public static byte first\(byte\[\] values\)/u);
  assert.match(output, /public static byte\[\]\[\] nested\(byte\[\]\[\] values\)/u);
  assert.match(output, /foreach \(byte value in values\)/u);
  assert.doesNotMatch(output, /BigInteger|Convert\.ToDouble/u);
});

function assertFixedArrayRejection(compiled, length, reason) {
  assertCsharpCheckingSucceeded(compiled);
  const diagnostic = compiled.targetDiagnostics.find(item => item.code === "CSHARP_FIXED_ARRAY_REPRESENTATION_UNSUPPORTED");
  assert.ok(diagnostic, JSON.stringify(compiled.targetDiagnostics, null, 2));
  assert.match(diagnostic.message, /FixedArray/u);
  assert.ok(diagnostic.message.includes(length), diagnostic.message);
  assert.match(diagnostic.message, reason);
  assert.equal(compiled.artifacts.size, 0);
}
