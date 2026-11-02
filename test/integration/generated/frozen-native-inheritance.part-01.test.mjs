import assert from "node:assert/strict";
import test from "node:test";
import { receiverFieldFreezeEdges } from "../../../../tsonic/test/fixtures/receiver-field-capture-edges.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { inheritedFixture, examples, numericFieldCase } from "./frozen-native-inheritance.fixtures.mjs";
import { assertNumericLiteralRefusal } from "../../helpers/numeric-literal-rulings.mjs";

for (const example of Array.from(examples).slice(0, 8)) {
const numeric = numericFieldCase(example);
for (const ownNumber of numeric === undefined ? [false] : [false, true]) {
test(ownNumber ? `native readonly inheritance preserves own-number ${example.name}`
  : `native readonly inheritance preserves ${example.name}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: ownNumber
      ? example.source.replace(numeric.before, numeric.after) : example.source });
    if (numeric !== undefined && !ownNumber) {
      assertNumericLiteralRefusal(compiled, numeric.refusals);
      return;
    }
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.equal(/dynamic|Unsafe\.|GetProperty|Activator|WeakReference|FrozenObject|CheckWrite|__tsonic_frozen_/u.test(emitted), false,
      "readonly views preserve native owners without runtime state or guarded storage");
    executeCsharpConstruction(compiled, `frozen-native-inheritance-${example.name}`, example.asynchronous);
  });
}
}
