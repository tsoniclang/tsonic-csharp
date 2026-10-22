import assert from "node:assert/strict";
import test from "node:test";
import { checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";

const invalidSources = [
  `function returned() {
    const value = { identity<Value>(item: Value): Value { return item; } };
    return value.identity;
  }
  export const result: number = returned()<number>("wrong");`,
  `function returned() {
    const value = { identity<Value extends { score: number }>(item: Value): Value { return item; } };
    return value.identity;
  }
  export const result = returned()({ score: "wrong" });`,
];

for (const surface of [undefined, "js"]) {
  for (const [index, sourceText] of invalidSources.entries()) {
    test(`escaped generic method rejects invalid ${index === 0 ? "instantiation" : "constraint"} (${surface ?? "native"})`, () => {
      const checked = checkCsharpSource({ surface, sourceText });
      assert.equal(checked.sourceDiagnosticsText.length > 0, true, "the exact checked generic call remains rejected");
      assert.equal(/not assignable|does not satisfy/u.test(checked.sourceDiagnosticsText), true, "the source carrier or constraint mismatch is diagnosed");
    });
  }
}
