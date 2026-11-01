import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { planCsharpTypedLocationIdentityDeclaration } from "../../../../dist/backend/planner/bindings/typed-location-identities.js";
import { createDestructuringPlannerState } from "../../../../dist/backend/planner/bindings/binding-state.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { recursiveCallbackProtocolCases } from "../../../../../tsonic/test/fixtures/recursive-callback-protocols.mjs";

test("captured field addresses retain their physical frame identity without an extra local identity allocation", () => {
  const declaration = {};
  const input = { program: { records: { capturedBinding: { get: selected => selected === declaration ? { fieldName: "seed" } : undefined },
    typedLocationIdentity: { get: () => { assert.fail("a captured field already has its native frame identity"); } } } } };
  assert.equal(planCsharpTypedLocationIdentityDeclaration(declaration, input, createDestructuringPlannerState()), undefined);
});

test("ordinary addressed locals still allocate their one required canonical identity", () => {
  const declaration = {};
  const state = createDestructuringPlannerState();
  let selections = 0;
  const input = { program: { records: { capturedBinding: { get: () => undefined },
    typedLocationIdentity: { get: selected => { selections += 1; return selected === declaration; } } } } };
  const statement = planCsharpTypedLocationIdentityDeclaration(declaration, input, state);
  assert.equal(selections, 1);
  assert.equal(statement.kind, "LocalDeclarationStatement");
  assert.equal(statement.initializer.kind, "ObjectCreationExpression");
  assert.equal(statement.initializer.type.name, "object");
});

for (const surface of ["native", "js"]) {
  test(`${surface} addressed lexical callbacks use checked frame members, never a reconstructed local identity`, () => {
    const sourceText = recursiveCallbackProtocolCases.find(current => current.name === "addressed-lexical-frame").source;
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const text = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, source]) => source).join("\n");
    assert.equal(text.includes(".CreateMember("), true, "pointer identity belongs to the actual retained frame");
    assert.equal(text.includes("locationIdentity"), false, "no extra local identity accompanies the native frame owner");
    assert.equal(text.includes(".CreateLocal("), false, "no second local-storage address path");
    executeCsharpConstruction(compiled, `addressed-original-place-${surface}`, false, false, [], `
using Location = Tsonic.CSharp.Runtime.Location<double>;
for (var warmup = 0; warmup < 1000; warmup++) {
    Tsonic.Generated.Index.main();
    Handwritten();
}
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 4096; iteration++) Tsonic.Generated.Index.main();
var generatedCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 4096; iteration++) Handwritten();
var nativeCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (generatedCost != nativeCost)
    throw new System.Exception($"native addressed activation allocation {generatedCost} != {nativeCost}");
static void Handwritten() {
    var frame = new NativeAddressFrame { Seed = 3 };
    frame.Selected = frame.Read;
    var original = frame.Selected;
    frame.Selected = frame.Write;
    var alias = original;
    if (original(0) != 4 || original(1) != 6 || alias(0) != 7 || alias(8) != 9)
        throw new System.Exception("native addressed callback values and aliases");
}
sealed class NativeAddressFrame {
    public double Seed;
    public System.Func<double, double> Selected = null!;
    public double Read(double count) {
        if (count != 0) return Selected(count - 1);
        var first = Location.CreateMember(this, nameof(Seed), static frame => frame.Seed, static (frame, value) => frame.Seed = value);
        var second = Location.CreateMember(this, nameof(Seed), static frame => frame.Seed, static (frame, value) => frame.Seed = value);
        if (!Location.Same(first, second)) throw new System.Exception("native original place identity");
        second.Store(first.Load() + 1);
        return Seed;
    }
    public double Write(double count) {
        if (count != 0) return Selected(count - 1);
        var pointer = Location.CreateMember(this, nameof(Seed), static frame => frame.Seed, static (frame, value) => frame.Seed = value);
        pointer.Store(pointer.Load() + 2);
        return Seed;
    }
}
`);
  });
}
