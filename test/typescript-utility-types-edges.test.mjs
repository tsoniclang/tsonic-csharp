import assert from "node:assert/strict";
import test from "node:test";

import {
  checkCsharpSource,
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("utility transformations preserve modifiers, overload selection, variadic parameters, recursion, and canonical identity", () => {
  const compiled = compileCsharpSource({
    sourceText: edgeUtilitySource,
    files: {
      "overloads.d.ts": overloadDeclarations,
      "shadows.d.ts": shadowUtilityDeclarations,
    },
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = [...compiled.artifacts.entries()]
    .filter(([path]) => path.endsWith(".cs"))
    .map(([, text]) => text)
    .join("\n");
  for (const functionName of expectedFunctions) {
    assert.match(source, new RegExp(`\\b${functionName}\\b`, "u"));
  }
  assert.match(source, /optionalSummary\(\(int, string\?\) values\)/u);
  assert.match(source, /restSummary\(bool\[\] values\)/u);
  assert.match(source, /overloadSummary\(\(string, string\?\) values\)/u);
  assert.match(source, /public static string localPartial\(string value\)/u);
  assert.match(source, /public static bool localReturn\(bool value\)/u);
  assert.match(source, /public static int localDetached\(int value\)/u);
  assert.doesNotMatch(source, /\b(?:Partial|Required|Readonly|Pick|Record|Exclude|Extract|Omit|NonNullable|Parameters|ConstructorParameters|ReturnType|InstanceType|Awaited|ThisParameterType|OmitThisParameter|Uppercase|Lowercase|Capitalize|Uncapitalize|NoInfer|ThisType)\b/u);
});

test("the source checker resolves utility shapes that intentionally have no native runtime carrier", () => {
  const checked = checkCsharpSource({ sourceText: sourceOnlyUtilityEdges });

  assert.equal(checked.sourceDiagnosticsText, "");
  assert.deepEqual(checked.extensionDiagnostics, []);
});

test("utility tuple literals materialize only checker-proven trailing optional defaults", () => {
  const compiled = compileCsharpSource({ sourceText: optionalTupleLiteralSource });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = [...compiled.artifacts.entries()]
    .filter(([path]) => path.endsWith(".cs"))
    .map(([, text]) => text)
    .join("\n");
  assert.match(
    source,
    /optionalTuple\(\(1, default\(string\?\), default\(bool\?\)\)\)/u,
  );
  assert.match(
    source,
    /singleOptional\(new System\.ValueTuple<int\?>\(default\(int\?\)\)\)/u,
  );
});

const expectedFunctions = [
  "modifierSummary",
  "optionalSummary",
  "restSummary",
  "overloadSummary",
  "constructOptional",
  "nestedAwaited",
  "callBound",
  "chooseLiteral",
  "contextualRead",
  "loudUnion",
  "localIdentitySummary",
];

const edgeUtilitySource = `
import type { int32 } from "@tsonic/core/types.js";
import type { Overloaded } from "./overloads.js";
import type {
  OmitThisParameter as LocalOmitThisParameter,
  Parameters as LocalParameters,
  Partial as LocalPartial,
  ReturnType as LocalReturnType,
} from "./shadows.js";

interface Nested { value: int32; }
interface ModifierModel {
  readonly id: int32;
  label?: string;
  nested: Nested;
}
type ModifierPatch = Partial<ModifierModel>;
type ModifierRequired = Required<ModifierModel>;
type ModifierReadonly = Readonly<ModifierRequired>;
type ModifierPick = Pick<ModifierModel, "id" | "label">;
type ModifierOmit = Omit<ModifierModel, "nested">;
type ModifierRecord = Record<"left" | "right", int32>;

export function modifierSummary(
  patch: ModifierPatch,
  required: ModifierRequired,
  readonlyValue: ModifierReadonly,
  picked: ModifierPick,
  omitted: ModifierOmit,
  record: ModifierRecord,
): string {
  const patchValue = patch.nested?.value ?? (0 as int32);
  const pickedLabel = picked.label ?? "none";
  const omittedLabel = omitted.label ?? "none";
  return \`${"${patchValue}:${required.label}:${readonlyValue.id}:${pickedLabel}:${omittedLabel}:${record.left + record.right}"}\`;
}

type Optional = (first: int32, label?: string) => string;
type OptionalParameters = Parameters<Optional>;
type OptionalResult = ReturnType<Optional>;
export function optionalSummary(values: OptionalParameters): OptionalResult {
  return \`${"${values[0]}:${values[1] ?? \"none\"}"}\`;
}

type Rest = (...flags: boolean[]) => boolean;
type RestParameters = Parameters<Rest>;
type RestResult = ReturnType<Rest>;
export function restSummary(values: RestParameters): RestResult {
  return values[0];
}

type OverloadedParameters = Parameters<Overloaded>;
type OverloadedResult = ReturnType<Overloaded>;
export function overloadSummary(values: OverloadedParameters): OverloadedResult {
  return \`${"${values[0]}${values[1] ?? \"\"}"}\`;
}

class OptionalBox {
  value: int32;
  label: string;
  constructor(value: int32, label?: string) {
    this.value = value;
    this.label = label ?? "none";
  }
}
type OptionalBoxParameters = ConstructorParameters<typeof OptionalBox>;
type OptionalBoxInstance = InstanceType<typeof OptionalBox>;
export function constructOptional(values: OptionalBoxParameters): OptionalBoxInstance {
  return new OptionalBox(values[0], values[1]);
}

interface Thenable<T> {
  then(onfulfilled: (value: T) => void): void;
}
type NestedAwaited = Awaited<Thenable<Thenable<int32>>>;
export function nestedAwaited(value: NestedAwaited): int32 { return value; }

interface Receiver { value: int32; }
type Bound = (this: Receiver, value: int32, label?: string) => string;
type BoundReceiver = ThisParameterType<Bound>;
type DetachedBound = OmitThisParameter<Bound>;
export function callBound(receiver: BoundReceiver, callable: DetachedBound): string {
  return \`${"${receiver.value}:${callable(3 as int32, \"bound\")}"}\`;
}

function choose<C>(value: C, fallback: NoInfer<C>): C {
  void fallback;
  return value;
}
export function chooseLiteral(): string { return choose("red", "red"); }

interface ContextReceiver { value: int32; }
interface ContextMethods { read(): int32; }
type Context = ContextReceiver & ContextMethods & ThisType<ContextReceiver & ContextMethods>;
export function contextualRead(): int32 {
  const value: Context = {
    value: 9 as int32,
    read(): int32 { return this.value; },
  };
  return value.read();
}

type LoudUnion = Uppercase<"ready" | "set">;
type QuietUnion = Lowercase<"LOUD" | "QUIET">;
type GreetingUnion = Capitalize<"hello" | "world">;
type SubjectUnion = Uncapitalize<"Alpha" | "Beta">;
export function loudUnion(selected: boolean): string {
  const loud: LoudUnion = selected ? "READY" : "SET";
  const quiet: QuietUnion = selected ? "loud" : "quiet";
  const greeting: GreetingUnion = selected ? "Hello" : "World";
  const subject: SubjectUnion = selected ? "alpha" : "beta";
  return \`${"${loud}:${quiet}:${greeting}:${subject}"}\`;
}

export function localPartial(value: LocalPartial<{ value: int32 }>): string { return value; }
export function localParameters(value: LocalParameters<(value: int32) => int32>): [string] { return value; }
export function localReturn(value: LocalReturnType<() => string>): boolean { return value; }
export function localDetached(value: LocalOmitThisParameter<(this: { value: int32 }) => string>): int32 { return value; }

export function localIdentitySummary(): string {
  return \`${"${localPartial(\"shadow\")}:${localParameters([\"tuple\"])[0]}:${localReturn(true)}:${localDetached(7 as int32)}"}\`;
}
`;

const overloadDeclarations = `
import type { int32 } from "@tsonic/core/types.js";

export interface Overloaded {
  (value: int32): int32;
  (value: string, suffix?: string): string;
}
`;

const sourceOnlyUtilityEdges = `
import type { int32 } from "@tsonic/core/types.js";

interface CallableOverload {
  (value: int32): int32;
  (value: string, suffix?: string): string;
}
const callableArguments: Parameters<CallableOverload> = ["value"];
const callableResult: ReturnType<CallableOverload> = "value";

interface ConstructedNumber { numeric: int32; }
interface ConstructedText { text: string; }
interface ConstructorOverload {
  new(value: int32): ConstructedNumber;
  new(value: string, suffix?: string): ConstructedText;
}
const constructorArguments: ConstructorParameters<ConstructorOverload> = ["value"];
const constructed: InstanceType<ConstructorOverload> = { text: "value" };

interface FirstReceiver { first: int32; }
interface LastReceiver { last: string; }
interface ThisOverload {
  (this: FirstReceiver, value: int32): int32;
  (this: LastReceiver, value: string): string;
}
const selectedReceiver: ThisParameterType<ThisOverload> = { last: "value" };
const detached: OmitThisParameter<ThisOverload> = (value: string): string => value;

type Plain = (value: int32) => int32;
let implicitReceiver: ThisParameterType<Plain> = "unknown is intentionally broad";
implicitReceiver = 1 as int32;

type HeterogeneousRest = (first: int32, label?: string, ...flags: boolean[]) => string;
const heterogeneousArguments: Parameters<HeterogeneousRest> = [
  1 as int32,
  "label",
  true,
  false,
];

function choose<C extends string>(value: C, fallback: NoInfer<C>): C {
  void fallback;
  return value;
}
const chosen: "red" = choose("red", "red");

interface Thenable<T> { then(onfulfilled: (value: T) => void): void; }
const nullableAwaited: Awaited<Thenable<null>> = null;

export function retainSourceChecks(): void {
  void callableArguments;
  void callableResult;
  void constructorArguments;
  void constructed;
  void selectedReceiver;
  void detached;
  void implicitReceiver;
  void heterogeneousArguments;
  void chosen;
  void nullableAwaited;
}
`;

const optionalTupleLiteralSource = `
import type { int32 } from "@tsonic/core/types.js";

type OptionalTuple = (
  value: int32,
  label?: string,
  enabled?: boolean,
) => string;
type OptionalTupleParameters = Parameters<OptionalTuple>;
function optionalTuple(values: OptionalTupleParameters): string {
  return \`${"${values[0]}:${values[1] ?? \"none\"}:${values[2] ?? false}"}\`;
}

type SingleOptional = (value?: int32) => int32;
type SingleOptionalParameters = Parameters<SingleOptional>;
function singleOptional(values: SingleOptionalParameters): int32 {
  return values[0] ?? (0 as int32);
}

export function optionalTupleSummary(): string {
  return optionalTuple([1 as int32]) + ":" + singleOptional([]);
}
`;

const shadowUtilityDeclarations = `
import type { int32 } from "@tsonic/core/types.js";

export type Partial<T> = string;
export type Parameters<T> = [string];
export type ReturnType<T> = boolean;
export type OmitThisParameter<T> = int32;
`;
