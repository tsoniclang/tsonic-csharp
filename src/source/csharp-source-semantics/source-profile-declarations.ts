import {
  targetSourceProfileDeclaration,
} from "@tsonic/target-api";
import type {
  TargetProviderSourceProfileContext,
  TargetSourceProfileContributions,
} from "@tsonic/target-api";

export const csharpSourceProfileOwnerId = "csharp-provider";
export const csharpJsSourceProfileOwnerId = "js";

const sharedNoLibDeclarations = `
type PropertyKey = string | number | symbol;

interface Object {}
interface Function {}
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface IArguments {
  readonly Length: number;
  [index: number]: unknown;
}
interface Boolean {}
interface Number {}
interface RegExp {}

interface PromiseLike<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1) | null,
    onrejected?: ((reason: unknown) => TResult2) | null
  ): PromiseLike<TResult1 | TResult2>;
}

interface Promise<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1) | null,
    onrejected?: ((reason: unknown) => TResult2) | null
  ): Promise<TResult1 | TResult2>;
  catch<TResult = never>(onrejected?: ((reason: unknown) => TResult) | null): Promise<T | TResult>;
}

type __TsonicPromiseResolve<T> = [T] extends [void]
  ? (value?: T | PromiseLike<T>) => void
  : (value: T | PromiseLike<T>) => void;

interface PromiseConstructor {
  new <T>(executor: (resolve: __TsonicPromiseResolve<T>, reject: (reason?: unknown) => void) => void): Promise<T>;
  resolve<T>(value: T | PromiseLike<T>): Promise<T>;
  reject<T = never>(reason?: unknown): Promise<T>;
  all<T>(values: readonly Promise<T>[]): Promise<T[]>;
  all<T extends readonly unknown[]>(values: T): Promise<{ [K in keyof T]: Awaited<T[K]> }>;
}
declare var Promise: PromiseConstructor;

interface SymbolConstructor {
  readonly iterator: unique symbol;
  readonly asyncIterator: unique symbol;
}
declare var Symbol: SymbolConstructor;

interface IteratorResult<T, TReturn = unknown> {
  done?: boolean;
  value: T | TReturn;
}
interface Iterator<T, TReturn = unknown, TNext = unknown> {
  next(...args: [] | [TNext]): IteratorResult<T, TReturn>;
}
interface Iterable<T> {
  [Symbol.iterator](): Iterator<T>;
}
interface IterableIterator<T> extends Iterator<T>, Iterable<T> {}
interface AsyncIterator<T, TReturn = unknown, TNext = unknown> {
  next(...args: [] | [TNext]): Promise<IteratorResult<T, TReturn>>;
}
interface AsyncIterable<T> {
  [Symbol.asyncIterator](): AsyncIterator<T>;
}
interface AsyncIterableIterator<T> extends AsyncIterator<T>, AsyncIterable<T> {}

type Partial<T> = { [P in keyof T]?: T[P] };
type Required<T> = { [P in keyof T]-?: T[P] };
type Readonly<T> = { readonly [P in keyof T]: T[P] };
type Pick<T, K extends keyof T> = { [P in K]: T[P] };
type Exclude<T, U> = T extends U ? never : T;
type Extract<T, U> = T extends U ? T : never;
type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;
type Record<K extends keyof any, T> = { [P in K]: T };
type NonNullable<T> = T & {};
type Uppercase<S extends string> = intrinsic;
type Lowercase<S extends string> = intrinsic;
type Capitalize<S extends string> = intrinsic;
type Uncapitalize<S extends string> = intrinsic;
type Parameters<T extends (...args: any) => any> = T extends (...args: infer P) => any ? P : never;
type ConstructorParameters<T extends abstract new (...args: any) => any> = T extends abstract new (...args: infer P) => any ? P : never;
type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : any;
type InstanceType<T extends abstract new (...args: any) => any> = T extends abstract new (...args: any) => infer R ? R : any;
type Awaited<T> = T extends null | undefined ? T : T extends Promise<infer V> ? Awaited<V> : T;
`.trim();

const csharpProfileDeclarations = `
${sharedNoLibDeclarations}

interface String {
  readonly Length: number;
  Split(separator: string): string[];
  StartsWith(value: string): boolean;
  EndsWith(value: string): boolean;
  Contains(value: string): boolean;
  Trim(): string;
  ToString(): string;
}

interface Array<T> extends Iterable<T> {
  readonly Length: number;
  [index: number]: T;
}

interface ReadonlyArray<T> extends Iterable<T> {
  readonly Length: number;
  readonly [index: number]: T;
}
`.trim();

const jsSurfaceProfileDeclarations = `
${sharedNoLibDeclarations}

interface TemplateStringsArray extends ReadonlyArray<string> {
  readonly raw: readonly string[];
}

interface Object {
  hasOwnProperty(key: PropertyKey): boolean;
  toString(): string;
}

interface ObjectConstructor {
  keys(value: object): string[];
  values<T>(value: { [key: string]: T } | ArrayLike<T>): T[];
  entries<T>(value: { [key: string]: T } | ArrayLike<T>): [string, T][];
  assign<T extends object, U extends object>(target: T, source: U): T & U;
  hasOwn(value: object, key: PropertyKey): boolean;
  is(value: unknown, other: unknown): boolean;
  getPrototypeOf(value: object): object | null;
  setPrototypeOf(value: object, prototype: object | null): object;
  create(value: object | null): object;
  defineProperty<T extends object>(target: T, propertyKey: PropertyKey, descriptor: object): T;
  defineProperties<T extends object>(target: T, properties: object): T;
  freeze<T extends object>(value: T): Readonly<T>;
  fromEntries<T = unknown>(entries: Iterable<readonly [PropertyKey, T]>): { [key: string]: T };
  getOwnPropertyDescriptor(value: object, propertyKey: PropertyKey): object | undefined;
  getOwnPropertyDescriptors(value: object): object;
  getOwnPropertyNames(value: object): string[];
  getOwnPropertySymbols(value: object): symbol[];
  isExtensible(value: object): boolean;
  isFrozen(value: object): boolean;
  isSealed(value: object): boolean;
  preventExtensions<T extends object>(value: T): T;
  seal<T extends object>(value: T): T;
}
declare var Object: ObjectConstructor;

interface FunctionConstructor {
  new (...args: string[]): Function;
  (...args: string[]): Function;
}
declare var Function: FunctionConstructor;

interface Boolean {
  toString(): string;
  valueOf(): boolean;
}
interface BooleanConstructor {
  new (value?: unknown): Boolean;
  (value?: unknown): boolean;
}
declare var Boolean: BooleanConstructor;

interface Number {
  toString(radix?: number): string;
  toLocaleString(locales?: string | string[], options?: object): string;
  valueOf(): number;
  toFixed(fractionDigits?: number): string;
  toExponential(fractionDigits?: number): string;
  toPrecision(precision?: number): string;
}
interface NumberConstructor {
  readonly MAX_VALUE: number;
  readonly MIN_VALUE: number;
  readonly NaN: number;
  readonly NEGATIVE_INFINITY: number;
  readonly POSITIVE_INFINITY: number;
  readonly MAX_SAFE_INTEGER: number;
  readonly MIN_SAFE_INTEGER: number;
  readonly EPSILON: number;
  new (value?: unknown): Number;
  (value?: unknown): number;
  isFinite(value: unknown): boolean;
  isInteger(value: unknown): boolean;
  isNaN(value: unknown): boolean;
  isSafeInteger(value: unknown): boolean;
  parseFloat(value: string): number;
  parseInt(value: string, radix?: number): number;
}
declare var Number: NumberConstructor;

interface String {
  readonly length: number;
  readonly [index: number]: string;
  split(separator: string | RegExp, limit?: number): string[];
  startsWith(value: string, position?: number): boolean;
  endsWith(value: string, endPosition?: number): boolean;
  includes(value: string, position?: number): boolean;
  trim(): string;
  trimStart(): string;
  trimEnd(): string;
  trimLeft(): string;
  trimRight(): string;
  toString(): string;
  valueOf(): string;
  charAt(index: number): string;
  charCodeAt(index: number): number;
  codePointAt(index: number): number | undefined;
  slice(start?: number, end?: number): string;
  substring(start: number, end?: number): string;
  substr(start: number, length?: number): string;
  indexOf(searchString: string, position?: number): number;
  lastIndexOf(searchString: string, position?: number): number;
  at(index: number): string | undefined;
  match(regexp: RegExp): RegExpMatchArray | null;
  matchAll(regexp: RegExp): IterableIterator<RegExpMatchArray>;
  replace(searchValue: string | RegExp, replaceValue: string): string;
  replaceAll(searchValue: string | RegExp, replaceValue: string): string;
  search(regexp: string | RegExp): number;
  concat(...strings: string[]): string;
  repeat(count: number): string;
  padStart(maxLength: number, fillString?: string): string;
  padEnd(maxLength: number, fillString?: string): string;
  normalize(form?: string): string;
  localeCompare(that: string, locales?: string | string[], options?: object): number;
  toLowerCase(): string;
  toUpperCase(): string;
  toLocaleLowerCase(locales?: string | string[]): string;
  toLocaleUpperCase(locales?: string | string[]): string;
  isWellFormed(): boolean;
  toWellFormed(): string;
}
interface StringConstructor {
  new (value?: unknown): String;
  (value?: unknown): string;
  raw(callSite: TemplateStringsArray, ...substitutions: unknown[]): string;
  fromCharCode(...codes: number[]): string;
  fromCodePoint(...codes: number[]): string;
}
declare var String: StringConstructor;

interface Array<T> extends Iterable<T> {
  length: number;
  [index: number]: T;
  push(...items: T[]): number;
  pop(): T | undefined;
  shift(): T | undefined;
  unshift(...items: T[]): number;
  slice(start?: number, end?: number): T[];
  splice(start: number, deleteCount?: number, ...items: T[]): T[];
  concat(...items: (T | readonly T[])[]): T[];
  join(separator?: string): string;
  indexOf(searchElement: T, fromIndex?: number): number;
  lastIndexOf(searchElement: T, fromIndex?: number): number;
  includes(searchElement: T, fromIndex?: number): boolean;
  reverse(): T[];
  sort(compareFn?: (a: T, b: T) => number): T[];
  at(index: number): T | undefined;
  forEach(callbackfn: (value: T, index: number, array: T[]) => void): void;
  map<U>(callbackfn: (value: T, index: number, array: T[]) => U): U[];
  filter(callbackfn: (value: T, index: number, array: T[]) => unknown): T[];
  reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T): T;
  reduce<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;
  some(callbackfn: (value: T, index: number, array: T[]) => unknown): boolean;
  every(callbackfn: (value: T, index: number, array: T[]) => unknown): boolean;
  find(callbackfn: (value: T, index: number, array: T[]) => unknown): T | undefined;
  findIndex(callbackfn: (value: T, index: number, array: T[]) => unknown): number;
  findLast(callbackfn: (value: T, index: number, array: T[]) => unknown): T | undefined;
  findLastIndex(callbackfn: (value: T, index: number, array: T[]) => unknown): number;
  fill(value: T, start?: number, end?: number): T[];
  copyWithin(target: number, start: number, end?: number): T[];
}

interface ReadonlyArray<T> extends Iterable<T> {
  readonly length: number;
  readonly [index: number]: T;
  slice(start?: number, end?: number): T[];
  concat(...items: (T | readonly T[])[]): T[];
  join(separator?: string): string;
  indexOf(searchElement: T, fromIndex?: number): number;
  includes(searchElement: T, fromIndex?: number): boolean;
  at(index: number): T | undefined;
  forEach(callbackfn: (value: T, index: number, array: readonly T[]) => void): void;
  map<U>(callbackfn: (value: T, index: number, array: readonly T[]) => U): U[];
  filter(callbackfn: (value: T, index: number, array: readonly T[]) => unknown): T[];
  some(callbackfn: (value: T, index: number, array: readonly T[]) => unknown): boolean;
  every(callbackfn: (value: T, index: number, array: readonly T[]) => unknown): boolean;
  find(callbackfn: (value: T, index: number, array: readonly T[]) => unknown): T | undefined;
  findIndex(callbackfn: (value: T, index: number, array: readonly T[]) => unknown): number;
  findLast(callbackfn: (value: T, index: number, array: readonly T[]) => unknown): T | undefined;
  findLastIndex(callbackfn: (value: T, index: number, array: readonly T[]) => unknown): number;
}

interface ArrayConstructor {
  new <T>(...items: T[]): T[];
  <T>(...items: T[]): T[];
  isArray(value: unknown): value is unknown[];
  from<T>(arrayLike: ArrayLike<T> | Iterable<T>): T[];
  from<T, U>(arrayLike: ArrayLike<T> | Iterable<T>, mapfn: (value: T, index: number) => U): U[];
  of<T>(...items: T[]): T[];
}
declare var Array: ArrayConstructor;

interface ArrayLike<T> {
  readonly length: number;
  readonly [n: number]: T;
}

interface RegExp {
  readonly source: string;
  readonly flags: string;
  readonly global: boolean;
  readonly ignoreCase: boolean;
  readonly multiline: boolean;
  lastIndex: number;
  test(value: string): boolean;
  exec(value: string): RegExpExecArray | null;
}
interface RegExpExecArray extends Array<string> {
  index: number;
  input: string;
}
interface RegExpMatchArray extends Array<string> {
  index?: number;
  input?: string;
}
interface RegExpConstructor {
  new (pattern: string | RegExp, flags?: string): RegExp;
  (pattern: string | RegExp, flags?: string): RegExp;
}
declare var RegExp: RegExpConstructor;

interface Map<K, V> extends Iterable<[K, V]> {
  readonly size: number;
  get(key: K): V | undefined;
  set(key: K, value: V): this;
  has(key: K): boolean;
  delete(key: K): boolean;
  clear(): void;
  keys(): IterableIterator<K>;
  values(): IterableIterator<V>;
  entries(): IterableIterator<[K, V]>;
  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void): void;
}
interface ReadonlyMap<K, V> extends Iterable<[K, V]> {
  readonly size: number;
  get(key: K): V | undefined;
  has(key: K): boolean;
  keys(): IterableIterator<K>;
  values(): IterableIterator<V>;
  entries(): IterableIterator<[K, V]>;
}
interface MapConstructor {
  new <K, V>(entries?: readonly (readonly [K, V])[] | Iterable<readonly [K, V]>): Map<K, V>;
}
declare var Map: MapConstructor;

interface Set<T> extends Iterable<T> {
  readonly size: number;
  add(value: T): this;
  has(value: T): boolean;
  delete(value: T): boolean;
  clear(): void;
  keys(): IterableIterator<T>;
  values(): IterableIterator<T>;
  entries(): IterableIterator<[T, T]>;
  forEach(callbackfn: (value: T, key: T, set: Set<T>) => void): void;
}
interface ReadonlySet<T> extends Iterable<T> {
  readonly size: number;
  has(value: T): boolean;
  keys(): IterableIterator<T>;
  values(): IterableIterator<T>;
  entries(): IterableIterator<[T, T]>;
}
interface SetConstructor {
  new <T>(values?: readonly T[] | Iterable<T>): Set<T>;
}
declare var Set: SetConstructor;

interface Date {
  getTime(): number;
  toString(): string;
  toISOString(): string;
}
interface DateConstructor {
  new (): Date;
  new (value: number | string): Date;
  (): string;
  now(): number;
  parse(value: string): number;
  UTC(year: number, monthIndex: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number): number;
}
declare var Date: DateConstructor;

interface JSON {
  parse(text: string): unknown;
  stringify(value: unknown): string;
}
declare var JSON: JSON;

interface Math {
  readonly E: number;
  readonly LN2: number;
  readonly LN10: number;
  readonly LOG2E: number;
  readonly LOG10E: number;
  readonly PI: number;
  readonly SQRT1_2: number;
  readonly SQRT2: number;
  abs(x: number): number;
  acos(x: number): number;
  acosh(x: number): number;
  asin(x: number): number;
  asinh(x: number): number;
  atan(x: number): number;
  atanh(x: number): number;
  atan2(y: number, x: number): number;
  cbrt(x: number): number;
  floor(x: number): number;
  ceil(x: number): number;
  clz32(x: number): number;
  cos(x: number): number;
  cosh(x: number): number;
  exp(x: number): number;
  expm1(x: number): number;
  fround(x: number): number;
  hypot(...values: number[]): number;
  imul(x: number, y: number): number;
  log(x: number): number;
  log1p(x: number): number;
  log10(x: number): number;
  log2(x: number): number;
  round(x: number): number;
  max(...values: number[]): number;
  min(...values: number[]): number;
  pow(x: number, y: number): number;
  sign(x: number): number;
  sin(x: number): number;
  sinh(x: number): number;
  sqrt(x: number): number;
  tan(x: number): number;
  tanh(x: number): number;
  trunc(x: number): number;
  random(): number;
}
declare var Math: Math;

interface Console {
  log(...data: unknown[]): void;
  error(...data: unknown[]): void;
  warn(...data: unknown[]): void;
  info(...data: unknown[]): void;
  debug(...data: unknown[]): void;
  trace(...data: unknown[]): void;
  assert(condition?: boolean, ...data: unknown[]): void;
  time(label?: string): void;
  timeLog(label?: string, ...data: unknown[]): void;
  timeEnd(label?: string): void;
  timeStamp(label?: string): void;
  count(label?: string): void;
  countReset(label?: string): void;
  group(...data: unknown[]): void;
  groupCollapsed(...data: unknown[]): void;
  groupEnd(): void;
  clear(): void;
  dir(item?: unknown, options?: unknown): void;
  dirxml(...data: unknown[]): void;
  table(tabularData?: unknown, properties?: readonly string[]): void;
}
declare var console: Console;

declare function parseInt(value: string, radix?: number): number;
declare function parseFloat(value: string): number;
declare function isNaN(value: number): boolean;
declare function isFinite(value: number): boolean;
declare function setTimeout(callback: () => void, delay?: number): number;
declare function clearTimeout(id: number): void;
declare function setInterval(callback: () => void, delay: number): number;
declare function clearInterval(id: number): void;

interface ProxyConstructor {
  new <T extends object>(target: T, handler: object): T;
  revocable<T extends object>(target: T, handler: object): { proxy: T; revoke: () => void };
}
declare var Proxy: ProxyConstructor;

declare function eval(source: string): unknown;
`.trim();

export function csharpSourceProfileContributions(context: TargetProviderSourceProfileContext): TargetSourceProfileContributions {
  if (context.selectedSurfaces.some((surface) => surface.id === csharpJsSourceProfileOwnerId)) {
    return {
      declarations: [],
    };
  }
  return {
    declarations: [
      targetSourceProfileDeclaration("csharp-globals.d.ts", csharpProfileDeclarations),
    ],
  };
}

export function csharpJsSurfaceSourceProfileContributions(): TargetSourceProfileContributions {
  return {
    declarations: [
      targetSourceProfileDeclaration("js-globals.d.ts", jsSurfaceProfileDeclarations),
    ],
  };
}
