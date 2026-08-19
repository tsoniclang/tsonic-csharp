import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

test("the complete pinned TypeScript utility family lowers from resolved source types", () => {
  const compiled = compileCsharpSource({
    sourceText: utilitySource,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs") ?? "";
  const shapes = compiled.artifacts.get("generated/TsonicObjectShapes.cs") ?? "";
  assert.match(source, /patchId/u);
  assert.match(source, /requiredId/u);
  assert.match(source, /readOnlyId/u);
  assert.match(source, /pickedId/u);
  assert.match(source, /omittedLabel/u);
  assert.match(source, /recordTotal/u);
  assert.match(source, /awaitedValue/u);
  assert.match(source, /callDetached/u);
  assert.match(source, /constructPair/u);
  assert.match(source, /contextualValue/u);
  assert.match(source, /return "READY"/u);
  assert.match(source, /return "quiet"/u);
  assert.match(source, /return "Hello"/u);
  assert.match(source, /return "world"/u);
  assert.match(shapes, /class __TsonicShape_/u);
});

const utilitySource = `
import type { int32 } from "@tsonic/core/types.js";

interface Model {
  id: int32;
  label: string;
  active?: boolean;
}

type ModelPatch = Partial<Model>;
type CompleteModel = Required<Model>;
type ReadOnlyModel = Readonly<CompleteModel>;
type ModelId = Pick<Model, "id">;
type ModelWithoutId = Omit<Model, "id">;
type Totals = Record<"left" | "right", int32>;

export function patchId(value: ModelPatch): int32 {
  return value.id ?? (0 as int32);
}

export function requiredId(value: CompleteModel): int32 {
  return value.id;
}

export function readOnlyId(value: ReadOnlyModel): int32 {
  return value.id;
}

export function pickedId(value: ModelId): int32 {
  return value.id;
}

export function omittedLabel(value: ModelWithoutId): string {
  return value.label;
}

export function recordTotal(value: Totals): int32 {
  return value.left + value.right;
}

type Selection = "left" | "right" | undefined;
type PresentSelection = NonNullable<Selection>;
type LeftSelection = Extract<PresentSelection, "left">;
type RightSelection = Exclude<PresentSelection, "left">;

export function leftSelection(): LeftSelection {
  return "left";
}

export function rightSelection(): RightSelection {
  return "right";
}

interface Thenable<T> {
  then(onfulfilled: (value: T) => void): void;
}

type AwaitedInt = Awaited<Thenable<int32>>;

export function awaitedValue(value: AwaitedInt): int32 {
  return value;
}

function format(value: int32, suffix: string): string {
  return suffix;
}

type FormatParameters = Parameters<typeof format>;
type FormatResult = ReturnType<typeof format>;

export function callFormat(values: FormatParameters): FormatResult {
  return format(values[0], values[1]);
}

class Pair {
  left: int32;
  label: string;

  constructor(left: int32, label: string) {
    this.left = left;
    this.label = label;
  }
}

type PairParameters = ConstructorParameters<typeof Pair>;
type PairInstance = InstanceType<typeof Pair>;

export function constructPair(values: PairParameters): PairInstance {
  return new Pair(values[0], values[1]);
}

interface Receiver {
  value: int32;
}

type BoundIncrement = (this: Receiver, delta: int32) => int32;
type IncrementReceiver = ThisParameterType<BoundIncrement>;
type DetachedIncrement = OmitThisParameter<BoundIncrement>;

export function receiverValue(receiver: IncrementReceiver): int32 {
  return receiver.value;
}

export function callDetached(increment: DetachedIncrement): int32 {
  return increment(2 as int32);
}

function choose<T>(value: T, fallback: NoInfer<T>): T {
  return value;
}

export function chooseInt(value: int32): int32 {
  return choose(value, 0 as int32);
}

interface ContextualMethods {
  read(): int32;
}

type ContextualObject = Receiver & ContextualMethods &
  ThisType<Receiver & ContextualMethods>;

export function contextualValue(): int32 {
  const object: ContextualObject = {
    value: 11 as int32,
    read(): int32 { return this.value; },
  };
  return object.read();
}

type Loud = Uppercase<"ready">;
type Quiet = Lowercase<"QUIET">;
type Greeting = Capitalize<"hello">;
type Subject = Uncapitalize<"World">;

export function loud(): Loud { return "READY"; }
export function quiet(): Quiet { return "quiet"; }
export function greeting(): Greeting { return "Hello"; }
export function subject(): Subject { return "world"; }
`;
