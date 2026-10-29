import assert from "node:assert/strict";
import test from "node:test";
import { receiverFieldFreezeEdges } from "../../../../tsonic/test/fixtures/receiver-field-capture-edges.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { inheritedFixture, examples } from "./frozen-native-inheritance.fixtures.mjs";

for (const example of Array.from(examples).slice(8, 9)) {
test(`native readonly inheritance preserves ${example.name}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: example.source });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.equal(/dynamic|Unsafe\.|GetProperty|Activator|WeakReference|FrozenObject|CheckWrite|__tsonic_frozen_/u.test(emitted), false,
      "readonly views preserve native owners without runtime state or guarded storage");
    executeCsharpConstruction(compiled, `frozen-native-inheritance-${example.name}`, example.asynchronous);
  });
}

for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
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
