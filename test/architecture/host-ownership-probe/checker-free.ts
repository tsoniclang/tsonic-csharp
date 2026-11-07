// Type-level detector for checker types (nextgen C-2542, invariants I1 and I2; Codex review K-2662).
//
// host-ownership-invariants.test.mjs generates a probe that imports this file and asserts NoChecker<T> for
// (a) every type and value exported by every @tsonic/target-api entry a target may import (".", "./source",
//     "./analysis", "./artifacts", "./provider"; not "./host"), including the parameter and result types of every
//     exported function and method and the members of inherited interfaces (I1; Codex review K-2668), and
// (b) the declared payload type of every extension fact key tsonic-csharp/src reads (I2: a checker Type must not reach
//     C# through a fact payload or a type alias, not only through a direct import).
// The probe compiles with tsgo against the BUILT .d.ts files. A checker type anywhere inside T (property, element,
// map/set entry, parameter or result, through aliases and unions) makes NoChecker<T> false, which fails the probe.
import type { CheckedSourceProgram, Node, Signature, SourceFile, Symbol as CheckerSymbol, Type } from "@tsonic/tsts";

/**
 * The checker vocabulary no target-facing type may contain: Type, Signature, Symbol and the checked program
 * (CheckedSourceProgram, K-2668). Resolved*Info and TypeCheckerQueries records are found
 * through the Type / Signature / Symbol they carry; they are not listed by shape, because a checker-free record with the
 * same fields (e.g. { declaration: Node; canFallThrough: boolean }) is not a breach.
 */
export type CheckerType = Type | Signature | CheckerSymbol | CheckedSourceProgram;

/** Site keys (I1 allowlist): a Node or SourceFile identifies a site; its own structure is not inspected. */
type SiteKey = Node | SourceFile;
type Scalar = string | number | boolean | bigint | symbol | null | undefined | void;
type Deeper<Depth extends readonly unknown[]> = [...Depth, unknown];
type AnyTrue<Value> = true extends Value ? true : false;

/** true when a checker type occurs anywhere inside T (bounded depth: descriptors are recursive). */
export type ContainsChecker<T, Depth extends readonly unknown[] = []> =
  Depth["length"] extends 7 ? false
  : 0 extends (1 & T) ? false
  : [T] extends [never] ? false
  : T extends Scalar ? false
  : T extends SiteKey ? false
  : T extends CheckerType ? true
  : T extends (...parameters: infer Parameters) => infer Result
    ? AnyTrue<ContainsChecker<Parameters[number], Deeper<Depth>> | ContainsChecker<Result, Deeper<Depth>>>
  : T extends ReadonlyMap<infer Key, infer Value>
    ? AnyTrue<ContainsChecker<Key, Deeper<Depth>> | ContainsChecker<Value, Deeper<Depth>>>
  : T extends ReadonlySet<infer Element> ? ContainsChecker<Element, Deeper<Depth>>
  : T extends readonly (infer Element)[] ? ContainsChecker<Element, Deeper<Depth>>
  : T extends object ? AnyTrue<{ [Key in keyof T]-?: ContainsChecker<T[Key], Deeper<Depth>> }[keyof T]>
  : false;

export type NoChecker<T> = true extends ContainsChecker<T> ? false : true;

/** The payload type a fact key declares. */
export type FactPayload<Key> = Key extends { readonly snapshot: (value: infer Payload) => unknown } ? Payload : never;

/** A resolved payload: never means the key's declared payload could not be read, which fails the probe. */
export type Resolved<T> = [T] extends [never] ? false : true;

/** The assertion every probe row uses: a false argument is a compile error on that row. */
export type Check<Value extends true> = Value;
