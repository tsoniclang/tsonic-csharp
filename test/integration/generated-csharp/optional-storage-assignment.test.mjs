import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { optionalStorageAssignmentSource } from "../../../../tsonic/test/fixtures/optional-storage-assignment.mjs";

for (const surface of [undefined, "js"]) {
  test(`optional field declarations retain native absence, widths and identity (${surface ?? "native"})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: optionalStorageAssignmentSource });
    executeCsharpConstruction(compiled, `optional-storage-assignment-${surface ?? "native"}`);
  });
}

const boundedSource = `import type { int32 } from "@tsonic/core/types.js";
class BaseValue { value: int32 = 13; }
class DerivedValue extends BaseValue { extra: int32 = 17; }
interface ReferenceOptionalView {
  read<Value extends object>(fallback: Value, present: boolean): int32;
  payload<Value extends object>(fallback: Value, present: boolean): Value | undefined;
}
class ReferenceOptionalBody implements ReferenceOptionalView {
  read<Native extends object>(fallback: Native, present: boolean): int32 {
    let pending: Native | undefined = undefined;
    if (present) pending = fallback;
    return pending === undefined ? 7 : 11;
  }
  payload<Native extends object>(fallback: Native, present: boolean): Native | undefined {
    let pending: Native | undefined = undefined;
    if (present) pending = fallback;
    return pending;
  }
}
interface NominalOptionalView { read<Value extends BaseValue>(fallback: Value, present: boolean): int32; }
class NominalOptionalBody implements NominalOptionalView {
  read<Native extends BaseValue>(fallback: Native, present: boolean): int32 {
    let pending: Native | undefined = undefined;
    if (present) pending = fallback;
    return pending === undefined ? 7 : 11;
  }
}
interface InheritedOptionalView extends ReferenceOptionalView {}
class InheritedOptionalBody extends ReferenceOptionalBody implements InheritedOptionalView {}
interface OuterOptionalView<Outer extends BaseValue> { read<Value extends Outer>(fallback: Value, present: boolean): int32; }
class OuterOptionalBody<Outer extends BaseValue> implements OuterOptionalView<Outer> {
  read<Native extends Outer>(fallback: Native, present: boolean): int32 {
    let pending: Native | undefined = undefined;
    if (present) pending = fallback;
    return pending === undefined ? 7 : 11;
  }
}
interface DependentOptionalView { read<Value extends object, Item extends Value>(fallback: Item, present: boolean): int32; }
class DependentOptionalBody implements DependentOptionalView {
  read<Native extends object, Payload extends Native>(fallback: Payload, present: boolean): int32 {
    let pending: Payload | undefined = undefined;
    if (present) pending = fallback;
    return pending === undefined ? 7 : 11;
  }
}
let evaluations: int32 = 0;
function next(value: DerivedValue): DerivedValue { evaluations += 1; return value; }
export function evaluationCount(): int32 { return evaluations; }
export function runBounded(): boolean {
  evaluations = 0;
  const value = new DerivedValue();
  const direct = new ReferenceOptionalBody();
  const reference: ReferenceOptionalView = direct;
  const nominal: NominalOptionalView = new NominalOptionalBody();
  const inherited: InheritedOptionalView = new InheritedOptionalBody();
  const outer: OuterOptionalView<BaseValue> = new OuterOptionalBody<BaseValue>();
  const dependent: DependentOptionalView = new DependentOptionalBody();
  return direct.read<DerivedValue>(value, false) === 7 && reference.read<DerivedValue>(next(value), true) === 11 &&
    direct.payload<DerivedValue>(value, false) === undefined && reference.payload<DerivedValue>(value, true) === value &&
    nominal.read<DerivedValue>(value, false) === 7 && nominal.read<DerivedValue>(value, true) === 11 &&
    inherited.read<DerivedValue>(value, true) === 11 && inherited.payload<DerivedValue>(value, true) === value &&
    outer.read<DerivedValue>(value, false) === 7 && outer.read<DerivedValue>(value, true) === 11 &&
    dependent.read<DerivedValue, DerivedValue>(value, false) === 7 && dependent.read<DerivedValue, DerivedValue>(value, true) === 11 &&
    evaluations === 1;
}`;

const boundedObserver = `
if (!Tsonic.Generated.Index.runBounded() || Tsonic.Generated.Index.evaluationCount() != 1)
    throw new System.Exception("bounded native optional source semantics and single evaluation");
var value = new Tsonic.Generated.DerivedValue();
var body = new Tsonic.Generated.ReferenceOptionalBody();
Tsonic.Generated.ReferenceOptionalView view = body;
if (body.read<Tsonic.Generated.DerivedValue>(value, false) != 7 || view.read<Tsonic.Generated.DerivedValue>(value, true) != 11 ||
    body.payload<Tsonic.Generated.DerivedValue>(value, false) != null ||
    !System.Object.ReferenceEquals(view.payload<Tsonic.Generated.DerivedValue>(value, true), value))
    throw new System.Exception("one native binder, absence and original payload identity");
for (int index = 0; index < 8192; index++) { _ = view.read(value, (index & 1) == 0); _ = NativeRead(value, (index & 1) == 0); }
long generatedBefore = System.GC.GetAllocatedBytesForCurrentThread(); long generatedSum = 0;
for (int index = 0; index < 8192; index++) generatedSum += view.read(value, (index & 1) == 0);
long generatedBytes = System.GC.GetAllocatedBytesForCurrentThread() - generatedBefore;
long nativeBefore = System.GC.GetAllocatedBytesForCurrentThread(); long nativeSum = 0;
for (int index = 0; index < 8192; index++) nativeSum += NativeRead(value, (index & 1) == 0);
long nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - nativeBefore;
if (generatedSum != 8192 * 9 || nativeSum != generatedSum || generatedBytes != 0 || nativeBytes != 0)
    throw new System.Exception($"bounded native optional cost: {generatedBytes}/{nativeBytes}, {generatedSum}/{nativeSum}");
System.Console.Write("bounded native optional; generated=0; native=0");
static int NativeRead<Value>(Value fallback, bool present) where Value : class {
    Value? pending = null;
    if (present) pending = fallback;
    return pending is null ? 7 : 11;
}`;

for (const surface of ["native", "js"]) {
  test(`bounded native optional bodies preserve generic interface ABI and zero-allocation storage (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: boundedSource });
    assert.equal(compiled.sourceDiagnosticsText, "", "all bounded native interface programs remain source accepted");
    assert.equal(compiled.result.diagnostics.length, 0,
      `bounded native admission: ${compiled.result.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}`);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal(/Optional(?:Operations|Storage)_/u.test(generated), false,
      "proven class and nominal/dependent reference bounds never add a body-only generic witness");
    assert.equal(/ReferenceOptionalView\.(?:read|payload)</u.test(generated), false,
      "identical native signatures gain no gratuitous explicit bridge");
    const captureRoot = new URL("../../../.temp/C19-bounded-optional-storage/", import.meta.url);
    mkdirSync(captureRoot, { recursive: true });
    writeFileSync(new URL(`${surface}.json`, captureRoot), JSON.stringify({ sourceText: boundedSource,
      nativeProgram: boundedObserver, artifacts: [...compiled.artifacts] }) + "\n");
    assert.equal(executeCsharpConstruction(compiled, `C19-bounded-optional-${surface}`, false, false, [], boundedObserver),
      "bounded native optional; generated=0; native=0", "real native observers prove identity, ABI, evaluation and zero added allocation");
    let removed = 0;
    const missingConstraint = new Map([...compiled.artifacts].map(([path, source]) => [path,
      source.replace(/(class ReferenceOptionalBody\b[\s\S]*?public int read<Native>\([^)]*\)\s*)where Native : class/u,
        (_match, prefix) => { removed += 1; return prefix; })]));
    assert.equal(removed, 1, "the native inverse removes exactly the selected body class constraint, not an assertion or source program");
    assert.throws(() => executeCsharpConstruction({ ...compiled, artifacts: missingConstraint }, `C19-bounded-constraint-inverse-${surface}`,
      false, false, [], boundedObserver), error => String(error.message).includes("CS0425"),
    "native C# requires the genuine implicit-method class constraint; a checker/import error is not this inverse");
  });
}
