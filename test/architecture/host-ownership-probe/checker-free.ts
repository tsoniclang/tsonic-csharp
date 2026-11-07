// Type-level detector for checker types (nextgen C-2542, invariants I1 and I2; Codex reviews K-2662, K-2681).
//
// host-ownership-invariants.test.mjs generates a probe that imports this file and asserts
// CheckClean<CheckerVerdictOf<T>> for
// (a) every type and value exported by every @tsonic/target-api entry a target may import (".", "./source",
//     "./analysis", "./artifacts", "./provider"; not "./host"), including the parameter and result types of every
//     exported function and method and the members of inherited interfaces (I1; Codex review K-2668), and
// (b) the declared payload type of every extension fact key tsonic-csharp/src reads (I2: a checker Type must not reach
//     C# through a fact payload or a type alias, not only through a direct import).
// The probe compiles with tsgo against the BUILT .d.ts files. The verdict of T is
// - "checker" when a checker type occurs anywhere inside T (property, element, map/set entry, call or construct
//   signature parameter or result, through aliases and unions);
// - "unresolved" when the walk reached its layer limit with types still unwalked (K-2681): the probe could not prove
//   T checker-free, so the row fails;
// - "clean" only when every type reachable from T was walked.
// The walk is breadth-first with one set of seen types, compared by type identity: each layer holds the children of
// the previous layer that were not seen before. Recursive types therefore end once their types are all seen, however
// the recursion is shaped. The layer limit is only a last resort for types that keep producing new types (a recursive
// generic instantiated one level deeper each time), and reaching it is never clean.
import type { CheckedSourceProgram, Node, Signature, SourceFile, Symbol as CheckerSymbol, Type } from "@tsonic/tsts";

/**
 * The checker vocabulary no target-facing type may contain: Type, Signature, Symbol and the checked program
 * (CheckedSourceProgram, K-2668). Resolved*Info and TypeCheckerQueries records are found
 * through the Type / Signature / Symbol they carry; they are not listed by shape, because a checker-free record with the
 * same fields (e.g. { declaration: Node; canFallThrough: boolean }) is not a breach.
 */
export type CheckerType = Type | Signature | CheckerSymbol | CheckedSourceProgram;

/** Breadth-first layers before the walk gives up with "unresolved". */
type LayerLimit = 64;

type Scalar = string | number | boolean | bigint | symbol | null | undefined | void;
type Same<Left, Right> = (<Probe>() => Probe extends Left ? 1 : 2) extends (<Probe>() => Probe extends Right ? 1 : 2) ? true : false;

/**
 * One part of a type, as a walk entry. `any` and `unknown` are dropped: either would absorb the union of the other
 * parts. Every part is taken on its own (per member, per parameter), so a sibling `any` never hides a checker type.
 * Scalars hold nothing.
 */
type Part<T> = unknown extends T ? never : T extends Scalar ? never : T;
type TupleParts<T extends readonly unknown[]> = { [Index in keyof T]: Part<T[Index]> }[number];
type MemberParts<T, Keys extends keyof T> = [Keys] extends [never] ? never : { [Key in Keys]-?: Part<T[Key]> }[Keys];

/**
 * Parameters and results of the call signatures. Inference from an overloaded type reads its last signatures, so the
 * patterns run from four signatures down to one; up to four overloads are walked.
 */
type CallParts<T> =
  T extends {
    (...parameters: infer P1): infer R1; (...parameters: infer P2): infer R2;
    (...parameters: infer P3): infer R3; (...parameters: infer P4): infer R4;
  } ? TupleParts<P1> | Part<R1> | TupleParts<P2> | Part<R2> | TupleParts<P3> | Part<R3> | TupleParts<P4> | Part<R4>
  : T extends { (...parameters: infer P1): infer R1; (...parameters: infer P2): infer R2; (...parameters: infer P3): infer R3 }
    ? TupleParts<P1> | Part<R1> | TupleParts<P2> | Part<R2> | TupleParts<P3> | Part<R3>
  : T extends { (...parameters: infer P1): infer R1; (...parameters: infer P2): infer R2 }
    ? TupleParts<P1> | Part<R1> | TupleParts<P2> | Part<R2>
  : T extends (...parameters: infer P1) => infer R1 ? TupleParts<P1> | Part<R1>
  : never;

/** Parameters and instance type of a construct signature (an exported class value). */
type ConstructParts<T> = T extends abstract new (...parameters: infer P) => infer Instance ? TupleParts<P> | Part<Instance> : never;

/**
 * The types directly inside each arm of T. Node and SourceFile are site keys (I1 allowlist): the type itself is not
 * inspected. A type that only extends one (an intersection, a derived interface) is not a site key: its members beyond
 * the site key are walked.
 */
type Children<T> = T extends unknown
  ? Same<T, Node> extends true ? never
  : Same<T, SourceFile> extends true ? never
  : T extends SourceFile ? MemberParts<T, Exclude<keyof T, keyof SourceFile>>
  : T extends Node ? MemberParts<T, Exclude<keyof T, keyof Node>>
  : T extends ReadonlyMap<infer Key, infer Value> ? Part<Key> | Part<Value>
  : T extends ReadonlySet<infer Element> ? Part<Element>
  : T extends readonly unknown[] ? Part<T[number]>
  : T extends object ? CallParts<T> | ConstructParts<T> | MemberParts<T, keyof T>
  : never
  : never;

/**
 * Whether T is identical to a walked type. Identity implies assignability, so only the walked types T is assignable
 * to are compared, and a type assignable to none of them is unseen at once.
 */
type Seen<T, Walked> = true extends (Walked extends unknown ? [T] extends [Walked] ? Same<T, Walked> : never : never) ? true : false;
type Unseen<T, Walked> = T extends unknown ? [T] extends [Walked] ? Seen<T, Walked> extends true ? never : T : T : never;
type HasChecker<T> = true extends (T extends CheckerType ? true : never) ? true : false;

type Walk<Layer, Walked, Layers extends readonly unknown[]> =
  [Layer] extends [never] ? "clean"
  : HasChecker<Layer> extends true ? "checker"
  : Layers["length"] extends LayerLimit ? "unresolved"
  : Walk<Unseen<Children<Layer>, Walked | Layer>, Walked | Layer, [...Layers, unknown]>;

/** The verdict of T. `any` (the probe instantiates generics with it), `unknown` and `never` are clean. */
export type CheckerVerdictOf<T> = Walk<Part<T>, never, []>;

/** The assertion every subject row uses: the reported verdict names what failed ("checker" or "unresolved"). */
export type CheckClean<Verdict extends "clean"> = Verdict;

/** The payload type a fact key declares. */
export type FactPayload<Key> = Key extends { readonly snapshot: (value: infer Payload) => unknown } ? Payload : never;

/** A resolved payload: never means the key's declared payload could not be read, which fails the probe. */
export type Resolved<T> = [T] extends [never] ? false : true;

/** The assertion for boolean rows: a false argument is a compile error on that row. */
export type Check<Value extends true> = Value;
