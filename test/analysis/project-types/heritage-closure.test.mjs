import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { analyzeCsharpProjectTypePolicy } from "../../../dist/analysis/project-types/catalog/resolution.js";
import { createCsharpProjectTypePolicy } from "../../../dist/policy/types/project/project-types.js";
import { csharpEnumerableTargetType } from "../../../dist/target-model/types/carriers/collections.js";

const header = 'import type { int32, int64 } from "@tsonic/core/types.js";\n';

test("native project policy consumes completed catalog evidence and rejects the removed two-argument form", () => {
  const declaration = Object.freeze({});
  const definition = Object.freeze({ id: "project:Completed", declaration });
  const selected = Object.freeze({ definition, interfaces: Object.freeze([]) });
  const catalog = Object.freeze({
    get definitions() { throw new Error("native policy cannot traverse the completed catalog"); },
    definitionForDeclaration: node => node === declaration ? definition : undefined,
  });
  const heritage = new Map([[definition.id, selected]]);
  const forwarded = Object.freeze([]);
  const constructors = Object.freeze({ issues: Object.freeze([]),
    implicitConstructorsForDeclaration: node => node === declaration ? forwarded : undefined,
    implicitConstructorForSignature: () => undefined });
  const issues = Object.freeze([]);
  const policy = createCsharpProjectTypePolicy({}, catalog, heritage, constructors, issues);
  assert.equal(policy.heritageForDeclaration(declaration) === selected, true,
    "the native reader retains the one completed heritage record without world traversal");
  assert.equal(policy.implicitConstructorsForDeclaration(declaration) === forwarded, true,
    "the native reader retains the canonical completed constructor publication");
  assert.equal(policy.issues === issues && Object.isFrozen(policy), true,
    "the completed issue publication is not recomputed");
  for (const [label, completed] of [
    ["removed two-argument form", []],
    ["missing heritage", [undefined, constructors, issues]],
    ["missing constructors", [heritage, undefined, issues]],
    ["missing issues", [heritage, constructors, undefined]],
  ]) {
    assert.throws(() => createCsharpProjectTypePolicy({}, catalog, ...completed),
      /requires completed heritage, constructors and issues/u, label);
  }
});

function selectedHeritageFixture(relation, target, binding) {
  const declaration = Object.freeze({});
  const heritage = Object.freeze({});
  const selectedType = Object.freeze({});
  const definition = Object.freeze({ id: "project:Derived", sourceName: "Derived", kind: "class", declaration,
    sourceFile: {}, typeParameterBindings: [] });
  const catalog = { issues: [], definitions: [definition],
    definitionForDeclaration: node => node === declaration ? definition : undefined,
    definitionForTarget: () => undefined };
  let providerReads = 0;
  const host = {
    ast: {},
    semanticsFor: () => ({ declarations: { typeAliasSymbol: () => undefined, typeSymbol: () => undefined },
      types: { isTypeReference: () => false } }),
    navigation: { declaredHeritage: () => ({ kind: "resolved", edges: [{ kind: relation, heritage,
      selectedType, typeArguments: [], selectedTypeArguments: [] }] }) },
    providers: { findTargetBindingByTargetId(id) {
      providerReads += 1;
      assert.equal(id, target.id, "provider evidence is read by the exact selected target identity");
      return binding;
    } },
    types: { resolveSelectedType: (node, type) => {
      assert.equal(node === heritage && type === selectedType, true, "the checked heritage selection is authoritative");
      return target;
    } },
  };
  const policy = analyzeCsharpProjectTypePolicy(host, catalog);
  return { policy, declaration, heritage, providerReads: () => providerReads };
}

for (const [name, relation, target, binding, message] of [
  ["extends a non-named native carrier", "extends", { kind: "source-primitive", name: "int32" }, undefined, "cannot extend the non-class"],
  ["implements an unknown non-structural carrier", "implements", { kind: "target-named", id: "provider:Unknown" }, undefined,
    "without an exact native interface declaration"],
  ["extends a selected provider struct", "extends", { kind: "target-named", id: "provider:Value" },
    { kind: "struct", targetType: "provider:Value" }, "cannot extend the selected non-class"],
]) {
  test(`native heritage admission refuses a class that ${name}`, () => {
    const value = selectedHeritageFixture(relation, target, binding);
    assert.equal(value.policy.issues.length, 1, "one native heritage rejection");
    const issue = value.policy.issues[0];
    assert.equal(issue.node === value.heritage, true, "the exact authored heritage edge owns the diagnostic");
    assert.equal(issue.code, "CSHARP_PROJECT_HERITAGE_KIND_UNSUPPORTED", "the native heritage owner rejects before publication");
    assert.equal(issue.message.includes(message), true, "the actual native declaration constraint is reported");
    assert.equal(value.policy.heritageForDeclaration(value.declaration) === undefined, true, "no partial heritage record is published");
    assert.equal(value.providerReads(), target.kind === "target-named" ? 1 : 0, "native kinds use exact provider identity, not spelling");
  });
}

test("native heritage admission retains class implements Iterable through the selected BCL interface", () => {
  const target = csharpEnumerableTargetType({ kind: "source-primitive", name: "int32" });
  const value = selectedHeritageFixture("implements", target);
  assert.equal(value.policy.issues.length, 0, "the selected IEnumerable declaration is an interface");
  const selected = value.policy.heritageForDeclaration(value.declaration);
  assert.equal(selected?.interfaces.length, 1, "one selected interface");
  assert.equal(selected?.interfaces[0] === target, true, "exact selected native interface and argument retained");
});
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
  test(`class implements an object alias retains its structural interface (${surface})`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: header + `
      type Named = { readonly value: int32 };
      export class Derived implements Named { readonly value: int32 = 7; }
      export function read(value: Named): int32 { return value.value; }
    ` });
    assert.equal(compiled.result.diagnostics.length, 0, "the valid structural object alias stays admitted");
    assert.equal(compiled.result.artifacts.length > 0, true, "the retained program emits native artifacts");
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal(/class Derived\s*:/u.test(generated), true, "the class retains its selected native interface header");
    assert.equal(/\bint value\b/u.test(generated), true, "the interface and implementation retain native integer storage");
  });
  for (const [name, source, carrier] of cases) {
    test(`inherited ${name} retains its authored native carrier (${surface})`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: header + source });
      assert.equal(compiled.result.diagnostics.length, 0,
        `closed heritage: ${compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
      const generated = [...compiled.artifacts.values()].join("\n");
      const expected = name === "nested array property" && surface === "js" ? /\bJSArray<int> values\b/u : carrier;
      assert.equal(expected.test(generated), true, "inherited member uses its exact native declaration carrier");
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
