import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";
import { genericCallableOwnershipCases } from "../../../../../tsonic/test/fixtures/generic-callable-ownership.mjs";
import { unsupportedGenericCallableOwnershipCases } from "../../../fixtures/generic-callable-ownership.mjs";
import { receiverFieldUnconstrainedEqualitySource } from "../../../../../tsonic/test/fixtures/receiver-field-capture-edges.mjs";

function compile(sourceText) {
  const compiled = compileCsharpSource({ sourceText });
  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.artifacts.get("src/Index.cs");
  const owners = compiled.artifacts.get("generated/TsonicObjectShapes.cs");
  assert.equal(typeof source, "string", "authored native source");
  assert.equal(typeof owners, "string", "callable native owner source");
  assert.equal(/Func<[TU],\s*[TU],\s*[TU]>/u.test(source + owners), false, "no free generic delegate carrier");
  return { source, owners };
}

test("generic callable fields retain their receiver and escaped storage without becoming native methods", () => {
  const { source, owners } = compile(`
    export class Value {
      first = true;
      choose = <T>(left: T, right: T): T => this.first ? left : right;
    }
    export function run(): boolean {
      const value = new Value();
      const choose = value.choose;
      value.first = false;
      return choose("left", "right") === "right" && choose(3, 4) === 4;
    }
  `);
  assert.match(source, /choose\s*(?:\{|=)/u);
  assert.doesNotMatch(source, /\bchoose<T>\(/u);
  assert.match(source, /choose\.Invoke<string>\("left", "right"\)/u);
  assert.match(source, /choose\.Invoke<double>\(3(?:\.0)?, 4(?:\.0)?\)/u);
  assert.match(owners, /\bInvoke<T>\(T left, T right\)/u);
  assert.match(owners, /receiver0\.first/u);
  assert.match(source, /receiver0 = this/u);
});

test("reassigned generic callable fields preserve old aliases and exact alpha-equivalent signatures", () => {
  const { source, owners } = compile(`
    export class Value {
      first = true;
      choose = <T>(left: T, right: T): T => this.first ? left : right;
    }
    export function run(): boolean {
      const value = new Value();
      const before = value.choose;
      const identical = before === value.choose;
      value.choose = <U>(left: U, right: U): U => right;
      value.first = false;
      return identical && before(1, 2) === 2 && value.choose("left", "right") === "right";
    }
  `);
  assert.match(source, /before\.Invoke<double>\(/u);
  assert.match(source, /value\.choose\.Invoke<string>\(/u);
  assert.match(source, /value\.choose = new /u);
  assert.match(owners, /\bInvoke<U>\(U left, U right\)/u);
  assert.match(owners, /return right;/u);
});

test("generic field declarations rebind invocation quantifiers rather than leaking them into owner storage", () => {
  const { source, owners } = compile(`
    export class Value {
      choose: <U>(left: U, right: U) => U =
        <T>(left: T, right: T): T => left;
    }
    export function run(): string { return new Value().choose("left", "right"); }
  `);
  assert.match(source, /\.choose\.Invoke<string>\(/u);
  assert.match(owners, /\bInvoke<T>\(T left, T right\)/u);
  assert.match(owners, /\bInvoke<U>\(U arg0, U arg1\)/u);
});

test("generic escaping callables share mutable lexical storage with ordinary callbacks", () => {
  const { source, owners } = compile(`
    export function create() {
      let first = true;
      const choose = <T>(left: T, right: T): T => first ? left : right;
      const change = (): void => { first = false; };
      return { choose, change };
    }
    export function run(): string {
      const value = create();
      value.change();
      return value.choose("left", "right");
    }
  `);
  assert.match(owners, /\bInvoke<T>\(T left, T right\)/u);
  assert.match(owners, /value\d+ \? left : right/u);
  assert.match(owners, /value\d+ = false/u);
  assert.match(source, /\.choose\.Invoke<string>\(/u);
  assert.equal(/class __TsonicCallable_/u.test(owners), false,
    "the once-per-activation callable reuses its shared native frame");
});

test("nested generic callable owners are discovered before the synthetic source contract is finalized", () => {
  const { source, owners } = compile(`
    export const create = <Outer>(seed: Outer) => {
      const held: Outer[] = [seed];
      return <T>(left: T, right: T): T => held.length !== 0 ? left : right;
    };
    export function run(): string {
      const choose = create(3);
      return choose("left", "right");
    }
  `);
  assert.match(source, /create\.Invoke<double>\(/u);
  assert.match(source, /choose\.Invoke<string>\(/u);
  assert.match(owners, /\bInvoke<Outer>\(/u);
  assert.match(owners, /\bInvoke<T>\(T left, T right\)/u);
  assert.match(owners, /\.Length/u);
});

test("native generic methods remain native calls alongside generic callable fields", () => {
  const { source } = compile(`
    export function identity<T>(value: T): T { return value; }
    export class Value {
      identity<T>(value: T): T { return value; }
      choose = <T>(left: T, right: T): T => left;
    }
    export function run(): string {
      const value = new Value();
      return value.identity(identity(value.choose("left", "right")));
    }
  `);
  assert.match(source, /value\.identity<string>\(/u);
  assert.match(source, /identity<string>\(/u);
  assert.match(source, /\.choose\.Invoke<string>\(/u);
  assert.doesNotMatch(source, /\.identity\.Invoke/u);
});

test("nested generic callable owners retain outer payloads and distinct invocation binders", () => {
  const { source, owners } = compile(`
    export const create = <Outer>(seed: Outer) =>
      <T>(value: T): { seed: Outer; value: T } => ({ seed, value });
    export function run(): boolean {
      const first = create(3);
      const second = create("seed");
      const left = first("left");
      const right = second(7);
      return left.seed === 3 && left.value === "left" && right.seed === "seed" && right.value === 7;
    }
  `);
  assert.match(source, /create\.Invoke<double>\(/u);
  assert.match(source, /create\.Invoke<string>\(/u);
  assert.match(source, /first\.Invoke<string>\(/u);
  assert.match(source, /second\.Invoke<double>\(/u);
  assert.match(owners, /value0/u);
  assert.doesNotMatch(owners, /System\.Object|\bdynamic\b/u);
});

for (const surface of ["native", "js"]) test(`quantified ownership retains the original unconstrained equality rejection in ${surface}`, () => {
  const compiled = compileCsharpSource({ surface, sourceText: receiverFieldUnconstrainedEqualitySource });
  assert.equal(compiled.result.diagnostics.some(diagnostic =>
    diagnostic.code === "CSHARP_UNSUPPORTED_AST" && diagnostic.message.includes("over a type parameter")), true,
  "unconstrained generic operator rejection remains exact");
  assert.equal(compiled.result.diagnostics.some(diagnostic =>
    diagnostic.code === "CSHARP_GENERIC_CALLABLE_CONTRACT_NOT_CLOSED"), false,
  "nested invocation ownership is independently closed");
});

test("captured native constraints survive generated owner declarations", () => {
  const example = genericCallableOwnershipCases.find(example => example.name === "captured-native-constraint");
  const { owners } = compile(example.source);
  assert.match(owners, /class __TsonicCallable_\w+<Outer>[^]*where Outer : Seed/u);
  assert.match(owners, /Invoke<Item>\(/u);
});

test("transitive native constraint dependencies are finalized on the physical owner", () => {
  const example = genericCallableOwnershipCases.find(example => example.name === "transitive-native-constraint");
  const { owners } = compile(example.source);
  assert.match(owners, /where Outer : Container<Payload>/u);
  assert.match(owners, /class __TsonicCallable_\w+<(?:Outer, Payload|Payload, Outer)>/u);
  assert.doesNotMatch(owners, /System\.Object|EqualityComparer|\bdynamic\b/u);
});

for (const example of unsupportedGenericCallableOwnershipCases) for (const surface of ["native", "js"]) {
  test(`unimplemented quantified ownership rejects ${example.name} in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: example.source, files: example.files });
    assert.equal(compiled.result.diagnostics.some(diagnostic =>
      diagnostic.code === example.code && diagnostic.message.includes(example.message)), true, example.name);
    assert.equal(compiled.artifacts.size, 0, "no partial native artifact for an unsupported quantified owner");
  });
}

test("supported named local monomorphic values retain their existing native delegate ownership", () => {
  const compiled = compileCsharpSource({ sourceText: `
    export function create(seed: number) {
      function choose(left: number, right: number): number { return seed > 0 ? left : right; }
      const first = choose;
      const second = choose;
      return { first, second };
    }
    export function main(): void {
      const selected = create(1);
      if (selected.first !== selected.second || selected.first(3, 4) !== 3) throw new Error("native delegate");
    }
  ` });
  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.equal(typeof source, "string", "existing named local source");
  assert.match(source, /chooseCallable/u);
  assert.doesNotMatch(source, /\.Invoke<|EqualityComparer|\bdynamic\b/u);
});
