import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { csharpJsBinaryCallPolicies, csharpJsBinaryPropertyPolicies } from "../../../dist/policy/operations/source-profiles/js/binary.js";
import { selectCsharpArrayUnionElementPlan } from "../../../dist/policy/operations/source-profiles/js/array-unions.js";
import { csharpArrayLikeTargetType } from "../../../dist/target-model/types/carriers/array-like.js";
import { csharpJsArrayTargetType, csharpJsTypedArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType, getCsharpNullableElementTargetType } from "../../../dist/target-model/types/index.js";
import {
  acceptedEffectiveSource, assertPrimitiveOccurrences, compileEffectiveSource, projectNodes,
} from "../../helpers/source-effective-types.mjs";

test("both profiles use the one source-core primitive vocabulary without a target alias copy", () => {
  for (const surface of ["native", "js"]) for (const [name, kind] of [
    ["bool", "bool"], ["char", "char"], ["int8", "int8"], ["uint8", "uint8"],
    ["int16", "int16"], ["uint16", "uint16"], ["int32", "int32"], ["uint32", "uint32"],
    ["int64", "int64"], ["uint64", "uint64"], ["nativeInt", "native-int"], ["nativeUint", "native-uint"],
    ["int128", "int128"], ["uint128", "uint128"], ["float16", "float16"], ["float32", "float32"],
    ["float64", "float64"], ["decimal", "decimal"],
  ]) {
    const compiled = compileEffectiveSource(surface, `export function identity(value: ${name}): ${name} { return value; }`);
    acceptedEffectiveSource(compiled);
    assertPrimitiveOccurrences(compiled, "value", kind);
  }
});

test("native Length publications match the integer string and array ABI", () => {
  const compiled = compileEffectiveSource("native", `import type { int16, int32 } from "@tsonic/core/types.js";
    export function count(text: string, mutable: int16[], immutable: readonly int16[]): int32 {
      const stringLength = text.Length;
      const arrayLength = mutable.Length;
      const readonlyLength = immutable.Length;
      return stringLength + arrayLength + readonlyLength;
    }`);
  acceptedEffectiveSource(compiled);
  for (const name of ["stringLength", "arrayLength", "readonlyLength"]) assertPrimitiveOccurrences(compiled, name, "int32");
});

test("global Error fields are readonly at Source while direct runtime mutability is a distinct API", () => {
  for (const surface of ["native", "js"]) for (const [name, value] of [
    ["name", '"changed"'], ["message", '"changed"'], ["stack", '"changed"'], ["cause", 'new Error("changed")'],
  ]) {
    const compiled = compileCsharpSource({ surface, sourceText:
      `export function change(error: Error): void { error.${name} = ${value}; }` });
    assert.equal(compiled.sourceDiagnosticsText.includes("read-only property"), true, `${surface}: ${name}`);
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      `${surface}: ${name} is refused before Native publication`);
  }
});

test("JS counts, offsets and code units publish the native int32 member type", () => {
  const compiled = compileEffectiveSource("js", `import type { int16 } from "@tsonic/core/types.js";
    export function inspect(text: string, values: int16[], immutable: readonly int16[],
      map: Map<string, int16>, readonlyMap: ReadonlyMap<string, int16>,
      set: Set<int16>, readonlySet: ReadonlySet<int16>, buffer: ArrayBuffer, view: DataView, regexp: RegExp) {
      const stringLength = text.length;
      const arrayLength = values.length;
      const readonlyLength = immutable.length;
      const mapSize = map.size;
      const readonlyMapSize = readonlyMap.size;
      const setSize = set.size;
      const readonlySetSize = readonlySet.size;
      const bufferLength = buffer.byteLength;
      const viewLength = view.byteLength;
      const viewOffset = view.byteOffset;
      const codeUnit = text.charCodeAt(0);
      const searchIndex = text.indexOf("x");
      const regexpIndex = regexp.lastIndex;
      return setSize;
    }`);
  acceptedEffectiveSource(compiled);
  for (const name of ["stringLength", "arrayLength", "readonlyLength", "mapSize", "readonlyMapSize", "setSize",
    "readonlySetSize", "bufferLength", "viewLength", "viewOffset", "codeUnit", "searchIndex", "regexpIndex"]) {
    assertPrimitiveOccurrences(compiled, name, "int32");
  }
});

test("every DataView getter publishes its exact native primitive rather than float64", () => {
  for (const [method, kind] of [
    ["getInt8", "int8"], ["getUint8", "uint8"], ["getInt16", "int16"], ["getUint16", "uint16"],
    ["getInt32", "int32"], ["getUint32", "uint32"], ["getFloat32", "float32"], ["getFloat64", "float64"],
  ]) {
    const compiled = compileEffectiveSource("js", `export function read(view: DataView) {
      const value = view.${method}(0); return value; }`);
    acceptedEffectiveSource(compiled);
    assertPrimitiveOccurrences(compiled, "value", kind);
  }
});

test("Intl native digit counts and comparison results retain int32 including optional reads", () => {
  const compiled = compileEffectiveSource("js", `export function inspect(formatter: IntlNumberFormat, collator: IntlCollator) {
    const minimum = formatter.resolvedOptions().minimumIntegerDigits;
    const increment = formatter.resolvedOptions().roundingIncrement;
    const order = collator.compare("a", "b");
    const fractionMinimum = formatter.resolvedOptions().minimumFractionDigits;
    const fractionMaximum = formatter.resolvedOptions().maximumFractionDigits;
    const significantMinimum = formatter.resolvedOptions().minimumSignificantDigits;
    const significantMaximum = formatter.resolvedOptions().maximumSignificantDigits;
    return minimum + increment + order;
  }`);
  acceptedEffectiveSource(compiled);
  for (const name of ["minimum", "increment", "order"]) assertPrimitiveOccurrences(compiled, name, "int32");
  for (const name of ["fractionMinimum", "fractionMaximum", "significantMinimum", "significantMaximum"]) {
    const declarations = projectNodes(compiled, (node, ast) =>
      ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === name);
    assert.equal(declarations.length, 1, name);
    const outcome = compiled.targetSource.effectiveTypes.get(declarations[0]);
    assert.equal(outcome !== undefined && outcome.kind !== "refused" && outcome.type.kind === "optional" &&
      outcome.type.value.kind === "primitive" && outcome.type.value.primitive === "int32", true, name);
  }
});

test("all concrete typed arrays publish their actual native element and integer count", () => {
  for (const [name, kind] of [
    ["Int8Array", "int8"], ["Uint8Array", "uint8"], ["Uint8ClampedArray", "uint8"],
    ["Int16Array", "int16"], ["Uint16Array", "uint16"], ["Int32Array", "int32"],
    ["Uint32Array", "uint32"], ["Float32Array", "float32"], ["Float64Array", "float64"],
  ]) {
    const compiled = compileEffectiveSource("js", `export function read(values: ${name}) {
      const element = values[0]; const count = values.length; const width = values.BYTES_PER_ELEMENT;
      return element; }`);
    acceptedEffectiveSource(compiled);
    assertPrimitiveOccurrences(compiled, "element", kind);
    assertPrimitiveOccurrences(compiled, "count", "int32");
    assertPrimitiveOccurrences(compiled, "width", "int32");
  }
});

test("Array.at has one Source operation and directly constrained native absence", () => {
  const compiled = compileEffectiveSource("js", `import type { int32 } from "@tsonic/core/types.js";
    export function value(values: int32[]): int32 | undefined { return values.at(2); }
    export function reference(values: string[]): string | undefined { return values.at(2); }`);
  const generated = acceptedEffectiveSource(compiled);
  assert.match(generated, /Array\.atValue/u);
  assert.match(generated, /Array\.atReference/u);
  assert.doesNotMatch(generated, /\.at\(/u);
  assert.doesNotMatch(generated, /\(object\)/u);
});

test("source-core FixedArray length publishes int32 while retaining its authored fixed-length type", () => {
  const compiled = compileEffectiveSource("native", `import type { FixedArray, int16, int32 } from "@tsonic/core/types.js";
    export function count(values: FixedArray<int16, 4>): int32 { const length = values.length; return length; }`);
  acceptedEffectiveSource(compiled);
  assertPrimitiveOccurrences(compiled, "length", "int32");
  const lengths = projectNodes(compiled, (node, ast) => ast.is.IsNumericLiteral(node) && ast.text(node) === "4");
  assert.equal(lengths.length, 1, "the existing fixed-length type argument remains authored and unchanged");
});

test("unsupported C# overloads stay precise target refusals without disappearing from shared declarations", () => {
  for (const [body, reason] of [
    ["return view.getBigUint64(0);", "DataView.getBigUint64 requires a checked native uint64 runtime binding"],
    ["return value.toString(2);", "Number.toString(radix) requires an exact native integer receiver."],
  ]) {
    const compiled = compileEffectiveSource("js", `export function unsupported(view: DataView, value: number) { ${body} }`);
    const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
    assert.equal(issues.length, 1, body);
    assert.equal(issues[0].code, "CSHARP_JS_SOURCE_PROFILE_OPERATION_UNSUPPORTED", body);
    assert.equal(issues[0].message.startsWith(reason), true, body);
    assert.equal(compiled.artifacts.size, 0, body);
  }
});

test("shared storage and Atomics have precise selected binding refusals without fabricated runtime carriers", () => {
  for (const [kind, declaringName, name, reason] of [
    ["construct", "SharedArrayBufferConstructor", undefined, "SharedArrayBuffer requires shared native buffer storage"],
    ["member", "SharedArrayBuffer", "slice", "SharedArrayBuffer.slice requires shared native buffer storage"],
    ["member", "SharedArrayBuffer", "byteLength", "SharedArrayBuffer.byteLength requires shared native buffer storage"],
    ["member", "Atomics", "load", "Atomics.load requires a shared native buffer operation"],
    ["member", "Atomics", "store", "Atomics.store requires a shared native buffer operation"],
    ["member", "Atomics", "wait", "Atomics.wait requires a shared native buffer operation"],
    ["member", "Atomics", "notify", "Atomics.notify requires a shared native buffer operation"],
  ]) {
    const matches = [...csharpJsBinaryCallPolicies, ...csharpJsBinaryPropertyPolicies].filter(policy =>
      policy.source.owner === "js" && policy.source.kind === kind &&
      policy.source.declaringName === declaringName && policy.source.name === name);
    assert.equal(matches.length, 1, declaringName + "." + name);
    const selected = matches[0].select();
    assert.equal(selected.kind, "rejected", declaringName + "." + name);
    assert.equal(selected.diagnostic.code, "CSHARP_JS_SOURCE_PROFILE_OPERATION_UNSUPPORTED");
    assert.equal(selected.diagnostic.message.startsWith(reason), true, declaringName + "." + name);
  }
});

test("Array construction and typed-array indices consume native int32 parameter slots", () => {
  const compiled = compileEffectiveSource("js", `import type { int64 } from "@tsonic/core/types.js";
    export function values(count: int64, index: int64, bytes: Uint8Array) {
      const constructed = new Array<string>(count);
      const called = Array<string>(count);
      bytes[index] = bytes[index];
      return constructed.length + called.length;
    }`);
  const generated = acceptedEffectiveSource(compiled);
  assert.match(generated, /new Tsonic\.CSharp\.Js\.JSArray<string>\(checked\(\(int\)count\)\)/u);
  assert.match(generated, /withLength<string>\(checked\(\(int\)count\)\)/u);
  assert.match(generated, /checked\(\(int\)index\)/u);
});

test("A1 common views bind native integer indices separately from JS numeric-property keys", () => {
  const element = csharpSourcePrimitiveTargetType("uint8");
  const arms = [csharpJsArrayTargetType(element), csharpJsTypedArrayTargetType("Uint8Array")];
  const source = csharpRuntimeUnionTargetType(arms);
  assert.equal(source !== undefined, true);
  const projection = { source, target: csharpArrayLikeTargetType(element), conversion: { kind: "array-like-union", arms } };
  for (const [kind, method, parameter] of [
    ["int32", "ReadValue", "int32"], ["int64", "ReadValue", "int32"],
    ["float32", "ReadNumericProperty", "float64"], ["float64", "ReadNumericProperty", "float64"],
  ]) {
    const index = csharpSourcePrimitiveTargetType(kind);
    const selected = selectCsharpArrayUnionElementPlan(projection, index);
    assert.equal(selected.kind, "resolved", kind);
    assert.equal(selected.targetMember.targetName, method, kind);
    assert.equal(selected.targetMember.parameters[0].type.name, parameter, kind);
    assert.equal(getCsharpNullableElementTargetType(selected.targetMember.returnType) === element, true, kind);
    assert.equal(selected.invocation.projection === projection, true, kind);
    assert.equal(index.name, kind, "the binding never retargets the published operand");
  }
  assert.equal(selectCsharpArrayUnionElementPlan(projection, csharpSourcePrimitiveTargetType("bool")).kind, "rejected");
});

test("A1 Source int64 counters use checked native indices while number keys use the explicit property operation", () => {
  for (const [type, method] of [["int64", "ReadValue"], ["float32", "ReadNumericProperty"], ["float64", "ReadNumericProperty"]]) {
    const compiled = compileEffectiveSource("js", `import type { uint8, ${type} } from "@tsonic/core/types.js";
      export function read(flag: boolean, values: uint8[], bytes: Uint8Array, index: ${type}): uint8 | undefined {
        const selected = flag ? values : bytes;
        return selected[index];
      }`);
    const generated = acceptedEffectiveSource(compiled);
    assert.match(generated, new RegExp(`ArrayLike\\.${method}\\(`, "u"));
    if (type === "int64") assert.equal(generated.includes("checked((int)index)"), true);
    else assert.equal(generated.includes("checked((int)index)"), false);
    assertPrimitiveOccurrences(compiled, "index", type);
    assert.doesNotMatch(generated, /\.ToArray\(|\.Select\(/u);
  }
});
