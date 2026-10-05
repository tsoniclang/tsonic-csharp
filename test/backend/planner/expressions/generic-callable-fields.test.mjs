import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";

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
    export const create = <Outer>(seed: Outer) =>
      <T>(left: T, right: T): T => seed === seed ? left : right;
    export function run(): string {
      const choose = create(3);
      return choose("left", "right");
    }
  `);
  assert.match(source, /create\.Invoke<double>\(/u);
  assert.match(source, /choose\.Invoke<string>\(/u);
  assert.match(owners, /\bInvoke<Outer>\(/u);
  assert.match(owners, /\bInvoke<T>\(T left, T right\)/u);
  assert.match(owners, /value0 == /u);
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
