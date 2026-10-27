import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { selectCsharpUnionInjection } from "../../../dist/policy/conversions/union-relations.js";
import { csharpBigIntegerTargetType, csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/index.js";

for (const surface of ["native", "js"]) {
  test(`checked numeric union branches retain their source identity on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32, int64 } from "@tsonic/core/types.js";
type Choice = number | bigint;
type Reversed = bigint | number;
function classify(value: Choice | undefined): number {
  if (value === undefined) return 0;
  return typeof value === "number" ? 1 : 2;
}
function reversed(value: Reversed): number { return typeof value === "number" ? 1 : 2; }
function preserve(value: Choice): Choice { return value; }
function exact(value: Choice): bigint { return typeof value === "bigint" ? value : 0n; }
export function run(): boolean {
  const narrow: int32 = 7;
  const wide: int64 = 9007199254740993n;
  const values: Choice[] = [7, 9007199254740993n];
  return classify(7) === 1 && classify(7n) === 2 && classify(undefined) === 0 &&
    classify(narrow) === 1 && classify(wide) === 2 && reversed(7) === 1 && reversed(7n) === 2 &&
    classify(preserve(7)) === 1 && classify(preserve(9007199254740993n)) === 2 &&
    classify(values[0]) === 1 && classify(values[1]) === 2 &&
    exact(preserve(wide)) === 9007199254740993n && exact(values[1]) === 9007199254740993n;
}` });
    assertCsharpCompilationSucceeded(compiled);
    const generated = [...compiled.artifacts.values()].join("\n");
    assert.equal(/TsValue|Convert\.ToDouble|DynamicInvoke/u.test(generated), false,
      "checked native union admission adds no dynamic or lossy numeric transport");
    executeCsharpConstruction(compiled, `checked-union-injections-${surface}`);
  });
}

test("native conversion applicability alone does not choose a checked numeric union branch", () => {
  const source = csharpSourcePrimitiveTargetType("int32");
  const target = csharpRuntimeUnionTargetType([csharpSourcePrimitiveTargetType("float64"), csharpBigIntegerTargetType()]);
  const selected = selectCsharpUnionInjection(source, target, undefined, "implicit", () => ({ kind: "implicit", proof: "numeric" }));
  assert.equal(selected?.kind === "rejected", true, "missing checked source correspondence remains ambiguous");
  assert.equal(selected?.reason, "C# runtime-union conversion has more than one applicable native payload arm.",
    "the original precise ambiguity refusal is preserved");
});
