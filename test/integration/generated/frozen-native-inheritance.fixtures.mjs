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
  value.value = 3;
  value.extra = 4;
  return value.value === 3 && value.extra === 4;
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
  change(7);
  escaped()(8);
  return base.value === 7 && first.value === 7 && second.value === 3 && first !== second;
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
  change(7);
  return value.value === 7 && base.value === 7 && other.value === "second";
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
  change(7);
  return value.value === 7 && base.value === 7;
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
  change(3);
  return value.value === 3 && other.value === "second";
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
  const readonly = Object.freeze(value);
  return value.change() && readonly === value && readonly.child === value.child;
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
  value.change(next);
  return calls === 1 && value.value === 2;
}
` },
  { name: "suspended-base-write", asynchronous: true, source: `
async function pause(): Promise<void> {}
class Base {
  value = 1;
  change = async (): Promise<number> => { await pause(); this.value = 2; return this.value; };
}
class Derived extends Base { extra = 2; }
function escaped(): () => Promise<number> {
  const value = new Derived();
  Object.freeze(value);
  return value.change;
}
export async function run(): Promise<boolean> {
  const change = escaped();
  return await change() === 2;
}
` },
];

export { inheritedFixture, examples };
