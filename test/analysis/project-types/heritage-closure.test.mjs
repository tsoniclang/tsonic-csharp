import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

const header = 'import type { int32, int64 } from "@tsonic/core/types.js";\n';
const cases = [
  ["int32 property", `interface Box<T> { value: T; }
interface Closed extends Box<int32> { tag: string; }
export function read(value: Closed): int32 { return value.value; }
export function make(): Closed { return { value: 5, tag: "t" }; }`, /required int value\b/u],
  ["int64 multilevel property", `interface Box<T> { value: T; }
interface Middle<U> extends Box<U> { tag: string; }
interface Closed extends Middle<int64> {}
export function read(value: Closed): int64 { return value.value; }
export function make(): Closed { return { value: 5n, tag: "t" }; }`, /required long value\b/u],
  ["readonly alias property", `type Counter = int32;
interface Box<T> { readonly value: T; }
interface Closed extends Box<Counter> { tag: string; }
export function read(value: Closed): int32 { return value.value; }
export function make(): Closed { return { value: 5, tag: "t" }; }`, /\bint value\b/u],
  ["exact diamond property", `interface Box<T> { value: T; }
interface Left extends Box<int32> {}
interface Right extends Box<int32> {}
interface Closed extends Left, Right { tag: string; }
export function read(value: Closed): int32 { return value.value; }
export function make(): Closed { return { value: 5, tag: "t" }; }`, /required int value\b/u],
  ["native generic method", `interface Box<T> { read(): T; }
interface Closed extends Box<int32> { tag: string; }
export function read(value: Closed): int32 { return value.read(); }
export function make(): Closed { return { read() { return 5; }, tag: "t" }; }`, /\bint read\(/u],
  ["native method parameter", `interface Box<T> { write(value: T): T; }
interface Closed extends Box<int32> { tag: string; }
export function read(value: Closed, input: int32): int32 { return value.write(input); }
export function make(): Closed { return { write(value: int32): int32 { return value; }, tag: "t" }; }`, /\bint write\(int\b/u],
  ["nested array property", `interface Box<T> { values: T[]; }
interface Closed extends Box<int32> { tag: string; }
export function read(value: Closed): int32 { return value.values[0]; }
export function make(): Closed { return { values: [5], tag: "t" }; }`, /\bint\[\] values\b/u],
  ["optional native property", `interface Box<T> { value?: T; }
interface Closed extends Box<int32> { tag: string; }
export function read(value: Closed): int32 { return value.value ?? 5; }
export function make(): Closed { return { value: 5, tag: "t" }; }`, /\bint\? value\b/u],
];

for (const surface of ["native", "js"]) {
  for (const [name, source, carrier] of cases) {
    test(`inherited ${name} retains its authored native carrier (${surface})`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: header + source });
      assert.equal(compiled.result.diagnostics.length, 0,
        `closed heritage: ${compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
      const generated = [...compiled.artifacts.values()].join("\n");
      assert.equal(carrier.test(generated), true, "inherited member uses its exact native declaration carrier");
      assert.equal(/return \((?:int|long)\)value\.value;/u.test(generated), false,
        "a downstream cast cannot repair an erased inherited member carrier");
    });
  }
  for (const base of ["Error", "Base"]) {
    test(`class implements ${base} is refused as native non-interface heritage (${surface})`, () => {
      const source = base === "Base" ? "export class Base { value: int32 = 1; }\n" : "";
      const fields = base === "Error" ? 'name: string = "error"; message: string = "message";' : "";
      const compiled = compileCsharpSource({ surface, sourceText: header + source +
        `export class Derived implements ${base} { value: int32 = 1; ${fields} }` });
      const issues = compiled.result.diagnostics;
      assert.equal(compiled.result.artifacts.length, 0, "invalid native heritage produces no artifact");
      assert.equal(issues.length, 1, "one source admission rejection");
      assert.equal(issues[0]?.code, "CSHARP_PROJECT_HERITAGE_KIND_UNSUPPORTED", "heritage owner diagnostic");
      assert.equal(issues[0]?.message.includes("cannot implement"), true, "implements is not silently rewritten to extends");
      assert.equal(compiled.source.ast.kindName(issues[0]?.sourceNode), "KindExpressionWithTypeArguments",
        "rejection is attached to the authored inheritance clause");
    });
  }
}

test("analysis seals one identity-deduplicated native heritage header", async () => {
  const { completeCsharpDeclarationHeritage } = await import("../../../dist/analysis/project-types/heritage.js");
  const first = Object.freeze({ kind: "type-parameter", name: "Value", identity: "first" });
  const second = Object.freeze({ kind: "type-parameter", name: "Value", identity: "second" });
  const native = argument => Object.freeze({ kind: "target-named", id: "Native.View", typeArguments: Object.freeze([argument]) });
  const authored = native(first);
  const inherited = Object.freeze({ definition: Object.freeze({}), interfaces: Object.freeze([authored]) });
  const complete = completeCsharpDeclarationHeritage(inherited, {
    implements: [native(first), native(second), native({ kind: "source-primitive", name: "int64" })],
  });
  assert.equal(complete.interfaces.length, 3, "same spelling does not merge distinct native binder identities");
  assert.equal(complete.interfaces[0].typeArguments[0] === first, true, "first exact binder retained");
  assert.equal(complete.interfaces[1].typeArguments[0] === second, true, "second exact binder retained");
  assert.equal(complete.interfaces[2].typeArguments[0].name, "int64", "native width retained");
  assert.equal(inherited.interfaces.length, 1, "authored policy input is not mutated");
  assert.equal(Object.isFrozen(complete) && Object.isFrozen(complete.interfaces), true, "immutable final declaration header");
});

test("native carrier constructors retain exact declaration kinds instead of name heuristics", async () => {
  const { csharpEnumerableTargetType, csharpReadOnlyListTargetType, csharpListTargetType } =
    await import("../../../dist/target-model/types/carriers/collections.js");
  const { csharpExceptionTargetType, csharpRuntimeErrorTargetType } =
    await import("../../../dist/target-model/types/carriers/scalar-types.js");
  const { csharpTaskTargetType } = await import("../../../dist/target-model/types/carriers/delegates.js");
  const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
  for (const constructor of [csharpEnumerableTargetType, csharpReadOnlyListTargetType]) {
    assert.equal(constructor(integer).csharpSourceDeclarationKind, "interface", "actual BCL interface declaration");
  }
  for (const constructor of [csharpListTargetType, csharpTaskTargetType]) {
    assert.equal(constructor(integer).csharpSourceDeclarationKind, "class", "actual BCL class declaration");
  }
  assert.equal(csharpExceptionTargetType().csharpSourceDeclarationKind, "class", "System.Exception declaration");
  assert.equal(csharpRuntimeErrorTargetType().csharpSourceDeclarationKind, "class", "selected runtime Error declaration");
});
