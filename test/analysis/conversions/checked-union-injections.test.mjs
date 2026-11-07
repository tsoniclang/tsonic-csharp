import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { hostProgram } from "../../representation/host-fixture.mjs";
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

// The Host decides which arm a value selects (C-2479 relation, authored-first sums, C-2459); C# proves only that the
// .NET carriers realize it. Without a Host arm, injection proves exact carrier identity and never searches arms (R6).
test("the Host selects the numeric union arm in authored order; reversing the alias reverses the arm", () => {
  const program = hostProgram(`
type Choice = number | bigint;
type Reversed = bigint | number;
export const forward: Choice = 7;
export const backward: Reversed = 7;
`);
  for (const [name, arm] of [["forward", 0], ["backward", 1]]) {
    const declaration = program.named(name);
    const value = program.ast.as.AsVariableDeclaration(declaration).Initializer;
    const relation = program.facts.relations.at(value);
    assert.equal(relation?.kind, "select-arm", `${name}: a non-union value written into a sum selects one Host arm`);
    assert.equal(relation.arm, arm, `${name}: the selected arm is the authored position of number`);
    const sum = program.facts.sums.sum(relation.sum);
    assert.equal(sum.arms[relation.arm].type.kind, "primitive", "the selected arm is the number arm, not the bigint arm");
  }
});

test("native conversion applicability alone does not choose a numeric union branch; the Host arm does", () => {
  const source = csharpSourcePrimitiveTargetType("int32");
  const float64 = csharpSourcePrimitiveTargetType("float64");
  const target = csharpRuntimeUnionTargetType([float64, csharpBigIntegerTargetType()]);
  const numeric = () => ({ kind: "implicit", proof: "numeric" });
  assert.equal(selectCsharpUnionInjection(source, target, undefined, "implicit", numeric), undefined,
    "without a Host arm only exact carrier identity is proven; two applicable payload arms are not searched (C1 D6)");
  const exact = selectCsharpUnionInjection(float64, target, undefined, "implicit", () => assert.fail("exact identity needs no conversion"));
  assert.equal(exact?.kind === "implicit" && exact.proof === "runtime-union-arm" && exact.armIndex === 0 &&
    exact.sourceToArm.kind === "identity", true, "an exact payload carrier is injected into its one arm");
  for (const index of [0, 1]) {
    const selected = selectCsharpUnionInjection(source, target, undefined, "implicit", numeric, { kind: "present", index });
    assert.equal(selected?.kind === "implicit" && selected.proof === "runtime-union-arm" && selected.armIndex === index &&
      selected.sourceToArm.proof === "numeric", true, `the Host-selected arm ${index} receives the payload`);
  }
  assert.equal(selectCsharpUnionInjection(source, target, undefined, "implicit", numeric, { kind: "absence" }), undefined,
    "an absence arm is the Nullable lift, not a payload slot");
  assert.equal(selectCsharpUnionInjection(source, target, undefined, "implicit", numeric, { kind: "present", index: 2 })?.reason,
    "The Host-selected union arm has no runtime-union payload slot.", "an arm outside the runtime union is refused");
  assert.equal(selectCsharpUnionInjection(source, target, undefined, "implicit", () => undefined, { kind: "present", index: 0 })?.reason,
    "The value has no CLR conversion to the payload of the Host-selected union arm.",
    "the Host arm is never replaced by another arm when its payload conversion is missing");
});
