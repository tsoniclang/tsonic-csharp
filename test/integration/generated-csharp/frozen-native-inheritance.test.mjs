import assert from "node:assert/strict";
import test from "node:test";
import { receiverFieldFreezeEdges } from "../../../../tsonic/test/fixtures/receiver-field-capture-edges.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const inheritedFixture = receiverFieldFreezeEdges.find(example => example.name === "inherited-identity");
assert.equal(inheritedFixture === undefined, false, "canonical inherited receiver freeze fixture");

const examples = [
  { name: "overridden-base-view", source: inheritedFixture.source },
  { name: "base-typed-freeze-parameter", source: `
class Base { value = 1; }
class Derived extends Base { extra = 2; }
function freeze(value: Base): void { Object.freeze(value); }
export function run(): boolean {
  const value = new Derived();
  freeze(value);
  let inherited = false;
  let own = false;
  try { value.value = 3; } catch (error) { inherited = error instanceof TypeError; }
  try { value.extra = 4; } catch (error) { own = error instanceof TypeError; }
  return inherited && own && value.value === 1 && value.extra === 2;
}
` },
  { name: "escaped-base-storage", source: `
class Base {
  value = 1;
  change = (next: number): void => { this.value = next; };
}
class Derived extends Base { extra = 2; }
function escaped(): (next: number) => void {
  const value = new Derived();
  Object.freeze(value);
  return value.change;
}
export function run(): boolean {
  const first = new Derived();
  const second = new Derived();
  const base: Base = first;
  const change = first.change;
  Object.freeze(first);
  second.change(3);
  let retained = false;
  let escapedOwner = false;
  try { change(7); } catch (error) { retained = error instanceof TypeError; }
  try { escaped()(8); } catch (error) { escapedOwner = error instanceof TypeError; }
  return retained && escapedOwner && base.value === 1 && first.value === 1 &&
    second.value === 3 && Object.isFrozen(base) && !Object.isFrozen(second);
}
` },
  { name: "generic-native-base", source: `
class Base<T> {
  value: T;
  constructor(value: T) { this.value = value; }
  change = (next: T): void => { this.value = next; };
}
class Derived extends Base<number> {
  extra = 2;
  constructor() { super(1); }
}
function freeze(value: { value: number }): void { Object.freeze(value); }
export function run(): boolean {
  const value = new Derived();
  const base: Base<number> = value;
  const change = base.change;
  const other = new Base<string>("first");
  freeze(value);
  other.change("second");
  try { change(7); } catch (error) {
    return error instanceof TypeError && value.value === 1 && base.value === 1 &&
      other.value === "second" && !Object.isFrozen(other);
  }
  return false;
}
` },
  { name: "abstract-storage-contract", source: `
abstract class Base {
  abstract value: number;
  change = (next: number): void => { this.value = next; };
}
class Derived extends Base { override value = 2; }
export function run(): boolean {
  const value = new Derived();
  const base: Base = value;
  const change = base.change;
  Object.freeze(value);
  try { change(7); } catch (error) {
    return error instanceof TypeError && value.value === 2 && base.value === 2;
  }
  return false;
}
` },
  { name: "generic-freeze-parameter", source: `
class Base<T> {
  value: T;
  constructor(value: T) { this.value = value; }
  change = (next: T): void => { this.value = next; };
}
function freeze<T>(value: Base<T>): void { Object.freeze(value); }
export function run(): boolean {
  const value = new Base<number>(1);
  const other = new Base<string>("first");
  const change = value.change;
  freeze(value);
  other.change("second");
  try { change(3); } catch (error) {
    return error instanceof TypeError && value.value === 1 && other.value === "second";
  }
  return false;
}
` },
  { name: "shallow-accessor-private-storage", source: `
class Base {
  #private = 1;
  readonly tag = 2;
  child = { value: 1 };
  get current(): number { return this.#private; }
  set current(value: number) { this.#private = value; }
  change = (): boolean => {
    this.current = 3;
    this.child.value = 4;
    return this.current === 3 && this.child.value === 4 && this.tag === 2;
  };
}
class Derived extends Base { extra = 2; }
export function run(): boolean {
  const value = new Derived();
  Object.freeze(value);
  return value.change() && Object.isFrozen(value) && !Object.isFrozen(value.child);
}
` },
  { name: "reentrant-base-write", source: `
class Base {
  value = 1;
  change = (next: () => number): void => { this.value = next(); };
}
class Derived extends Base { extra = 2; }
export function run(): boolean {
  const value = new Derived();
  let calls = 0;
  const next = (): number => { calls += 1; Object.freeze(value); return 2; };
  try { value.change(next); } catch (error) {
    return error instanceof TypeError && calls === 1 && value.value === 1;
  }
  return false;
}
` },
  { name: "suspended-base-write", asynchronous: true, source: `
async function pause(): Promise<void> {}
class Base {
  value = 1;
  change = async (): Promise<void> => { await pause(); this.value = 2; };
}
class Derived extends Base { extra = 2; }
function escaped(): () => Promise<void> {
  const value = new Derived();
  Object.freeze(value);
  return value.change;
}
export async function run(): Promise<boolean> {
  const change = escaped();
  try { await change(); } catch (error) { return error instanceof TypeError; }
  return false;
}
` },
];

for (const example of examples) {
  test(`native frozen inheritance preserves ${example.name}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: example.source });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.equal(/dynamic|Unsafe\.|GetProperty|Activator|WeakReference/u.test(emitted), false,
      "statically closed native owner guards");
    executeCsharpConstruction(compiled, `frozen-native-inheritance-${example.name}`, example.asynchronous);
  });
}

for (const surface of ["native", "js"]) {
  test(`native inheritance without a freeze demand has no freeze guards in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
class Base {
  value = 1;
  change = (next: number): void => { this.value = next; };
}
class Derived extends Base { override value = 2; }
export function run(): boolean {
  const value = new Derived();
  const base: Base = value;
  base.change(3);
  return value.value === 3;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(/FrozenObject|CheckWrite|ConditionalWeakTable|WeakReference/u
      .test([...compiled.artifacts.values()].join("\n")), false, "no unused freeze identity or guard");
  });
}
