// Union arm selection for a written value (nextgen C-2542). The retired C# source-union index chose an arm from checked
// numeric categories and carrier matches. The Host now selects the arm (facts.relations.write(use), kind "select-arm",
// C-2479, Q1). C# proves only the CLR payload path into that arm's storage slot (csharpSumArmSelection +
// selectCsharpUnionInjection). Without a Host arm it proves exact carrier identity only, and only into a native-ordered
// .NET union (AGENT-C1-NOTES D6); a Source sum without its Host arm is an invariant (R3 #1). Two Host arms with one
// .NET carrier share one storage arm and keep both roles (Q73).
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../../representation/host-fixture.mjs";
import { csharpSumArmSelection, selectCsharpUnionInjection } from "../../../../dist/policy/conversions/union-relations.js";
import { csharpBigIntegerTargetType, csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType,
  getCsharpRuntimeUnionArms } from "../../../../dist/target-model/types/index.js";
import { targetTypeRefEquals } from "../../../../dist/target-model/types/equality.js";

const sourceText = `
  import type { int32, uint64 } from "@tsonic/core/types.js";
  export function write(n: number, b: bigint, s: string, u: uint64, i: int32): void {
    const fromNumber: number | bigint = n;
    const fromBigint: number | bigint = b;
    const fromText: uint64 | string = s;
    const fromWide: uint64 | string = u;
    const fromNarrow: number | bigint = i;
  }
  export function coincident(xs: string[], ys: readonly string[], n: number): void {
    const fromMutable: string[] | readonly string[] | number = xs;
    const fromReadonly: string[] | readonly string[] | number = ys;
    const fromCount: string[] | readonly string[] | number = n;
  }
`;

function fixture() {
  const program = hostProgram(sourceText);
  const represent = representations(representationServices(program));
  const write = name => {
    const declaration = program.named(name, node => program.ast.is.IsVariableDeclaration(node));
    const value = program.nodes.find(node => program.ast.is.IsIdentifier(node) && program.ast.parent(node) === declaration &&
      node !== program.ast.name(declaration));
    const relation = program.facts.relations.write(value);
    assert.equal(relation?.kind, "select-arm", `${name}: the Host selects one arm for the written value`);
    const sum = program.facts.sums.sum(relation.sum);
    const target = represented(represent.slot(declaration));
    const source = represented(represent.value(value));
    return { declaration, value, relation, sum, target, source, arm: csharpSumArmSelection(sum, relation.arm, target) };
  };
  return { program, represent, write };
}

test("the Host-selected arm, not a checked numeric category, places each written value", () => {
  const input = fixture();
  for (const [name, armType] of [["fromNumber", "primitive"], ["fromBigint", "intrinsic"], ["fromText", "string"], ["fromWide", "primitive"],
    ["fromNarrow", "primitive"]]) {
    const selected = input.write(name);
    assert.equal(selected.sum.arms[selected.relation.arm].type.kind, armType, `${name}: the selected Host arm`);
    const leaves = getCsharpRuntimeUnionArms(selected.target);
    const conversion = selectCsharpUnionInjection(selected.source, selected.target, undefined, "implicit",
      target => targetTypeRefEquals(target, selected.source) ? { kind: "identity" } : { kind: "implicit", proof: "numeric" }, selected.arm);
    assert.equal(conversion?.kind === "implicit" && conversion.proof === "runtime-union-arm" &&
      conversion.armIndex === selected.arm.index && targetTypeRefEquals(conversion.armType, leaves[selected.arm.index]), true,
    `${name}: the payload goes to exactly the Host arm's .NET slot`);
  }
  const wide = input.write("fromWide");
  assert.equal(targetTypeRefEquals(getCsharpRuntimeUnionArms(wide.target)[wide.arm.index], csharpSourcePrimitiveTargetType("uint64")), true,
    "the uint64 arm keeps its native width");
});

test("without a Host arm only exact carrier identity is proven; no applicable-arm search", () => {
  const source = csharpSourcePrimitiveTargetType("int32");
  const target = csharpRuntimeUnionTargetType([csharpSourcePrimitiveTargetType("float64"), csharpBigIntegerTargetType()]);
  assert.equal(selectCsharpUnionInjection(source, target, undefined, "implicit", () => ({ kind: "implicit", proof: "numeric" })), undefined,
    "a numeric conversion that applies to an arm does not choose that arm");
  const exact = selectCsharpUnionInjection(csharpBigIntegerTargetType(), target, undefined, "implicit",
    () => assert.fail("exact identity needs no conversion query"));
  assert.equal(exact?.kind === "implicit" && exact.armIndex === 1, true, "an exact carrier still has its one identity path");
  assert.equal(selectCsharpUnionInjection(source, target, undefined, "implicit", () => ({ kind: "implicit", proof: "numeric" }),
    { kind: "absence" }), undefined, "an absence arm takes no payload");
});

test("Q73: two Host arms with one .NET carrier are one storage arm; each Host arm reaches it through the slot map", () => {
  const input = fixture();
  const mutable = input.write("fromMutable");
  const readonlyWrite = input.write("fromReadonly");
  const count = input.write("fromCount");
  assert.equal(mutable.sum.arms.length, 3, "the Host keeps string[] and readonly string[] as two arms (two roles)");
  assert.notEqual(mutable.relation.arm, readonlyWrite.relation.arm, "the Host selects a different arm for each write");
  const storage = getCsharpRuntimeUnionArms(mutable.target);
  assert.equal(storage.length, 2, "the two coincident arms are one .NET storage arm (never CSHARP_UNION_ARMS_INDISTINGUISHABLE)");
  assert.equal(mutable.arm.index === 0 && readonlyWrite.arm.index === 0, true, "both Host arms are placed in the one shared slot");
  assert.equal(count.arm.index, 1, "the number arm keeps its own slot");
  for (const selected of [mutable, readonlyWrite, count]) {
    const conversion = selectCsharpUnionInjection(selected.source, selected.target, undefined, "implicit",
      target => targetTypeRefEquals(target, selected.source) ? { kind: "identity" } : undefined, selected.arm);
    assert.equal(conversion?.kind === "implicit" && conversion.armIndex === selected.arm.index, true,
      "the payload goes to the Host arm's storage slot");
  }
  assert.throws(() => selectCsharpUnionInjection(mutable.source, mutable.target, undefined, "implicit", () => undefined), TypeError,
    "a Source sum is never entered without its Host arm (R3 #1)");
});
