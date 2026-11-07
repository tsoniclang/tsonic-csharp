// Union arm selection for a written value (nextgen C-2542). The retired C# source-union index chose an arm from checked
// numeric categories and carrier matches. The Host now selects the arm (facts.relations.at(use), kind "select-arm",
// C-2479). C# proves only the CLR payload path into that arm (csharpHostArmSelection + selectCsharpUnionInjection).
// Without a Host arm it proves exact carrier identity only (AGENT-C1-NOTES D6). Two arms with one .NET carrier
// are refused rather than chosen between (CSHARP_UNION_ARMS_INDISTINGUISHABLE, R6).
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../../representation/host-fixture.mjs";
import { csharpHostArmSelection, selectCsharpUnionInjection } from "../../../../dist/policy/conversions/union-relations.js";
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
`;

function fixture() {
  const program = hostProgram(sourceText);
  const represent = representations(representationServices(program));
  const write = name => {
    const declaration = program.named(name, node => program.ast.is.IsVariableDeclaration(node));
    const value = program.nodes.find(node => program.ast.is.IsIdentifier(node) && program.ast.parent(node) === declaration &&
      node !== program.ast.name(declaration));
    const relation = program.facts.relations.at(value);
    assert.equal(relation?.kind, "select-arm", `${name}: the Host selects one arm for the written value`);
    const sum = program.facts.sums.sum(relation.sum);
    const target = represented(represent.slot(declaration));
    const source = represented(represent.value(value));
    return { declaration, value, relation, sum, target, source, arm: csharpHostArmSelection(relation, sum) };
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

test("two Host arms with one .NET carrier are refused, never chosen between", () => {
  const input = fixture();
  const selected = input.write("fromWide");
  const wide = selected.sum.arms[selected.relation.arm].type;
  const text = selected.sum.arms.find(arm => arm.type.kind === "string").type;
  const sum = Object.freeze({ identity: selected.sum.identity,
    arms: Object.freeze([wide, wide, text].map((type, role) => Object.freeze({ role, type }))),
    roles: Object.freeze([0, 1, 2].map(role => Object.freeze({ role, arms: Object.freeze([role]) }))) });
  assert.equal(input.represent.sum(sum, selected.value, "storage").code, "CSHARP_UNION_ARMS_INDISTINGUISHABLE",
    "distinct Host arms with one .NET carrier have no CLR union that keeps them apart (R6: no dedupe in C#)");
  assert.equal(targetTypeRefEquals(getCsharpRuntimeUnionArms(selected.target)[1 - selected.arm.index], csharpStringTargetType()), true,
    "the published two-arm sum keeps both arms positionally");
});
