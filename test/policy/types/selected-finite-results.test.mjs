// The deleted resolution/call-results.ts (selectCsharpSourceCallResult) chose between a native overload-union ABI and
// a checker-selected overload result. The Host now publishes the selected overload and its result
// (facts.selections.call), and C# only represents that descriptor (nextgen C-2542 §2, I6, R2). The CLR union-arm
// mapping proofs below are unchanged: they are .NET conversion proofs (policy/conversions/union-relations.ts).
import assert from "node:assert/strict";
import test from "node:test";
import { selectedFiniteResultSource } from "../../helpers/selected-finite-results.mjs";
import { hostProgram, representationServices, representations, represented } from "../../representation/host-fixture.mjs";
import { selectCsharpUnionArmMapping } from "../../../dist/policy/conversions/union-relations.js";
import {
  csharpNullableTargetType, csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType, csharpStringTargetType, targetTypeRefEquals,
} from "../../../dist/target-model/types/index.js";

const integer = csharpSourcePrimitiveTargetType("uint64");
const string = csharpStringTargetType();
const floating = csharpSourcePrimitiveTargetType("float64");

function selectedCalls() {
  const program = hostProgram(selectedFiniteResultSource);
  const at = representations(representationServices(program));
  const run = program.named("run");
  const calls = new Map();
  for (const node of program.nodes) {
    if (!program.ast.is.IsCallExpression(node) || program.ast.text(node).startsWith("receiver(reader).") === false) continue;
    let owner = node;
    while (owner !== undefined && owner !== run) owner = program.ast.parent(owner);
    if (owner === run) calls.set(program.ast.text(node), node);
  }
  const result = text => {
    const call = calls.get(text);
    assert.notEqual(call, undefined, text);
    const selection = program.facts.selections.call(call);
    assert.equal(selection !== undefined && selection.kind !== "refused", true, `${text}: the Host selects the call`);
    return { selection, carrier: represented(at.type(selection.result, call, "value")) };
  };
  return { program, result };
}

test("each overload call carries the Host-selected result, represented with its exact native width", () => {
  const { result } = selectedCalls();
  const text = result(`receiver(reader).read("text")`);
  const wide = result(`receiver(reader).read("wide")`);
  assert.equal(text.selection.overloadIndex === 0 && wide.selection.overloadIndex === 1, true,
    "the literal argument selects the overload; C# does not re-select it");
  assert.equal(targetTypeRefEquals(text.carrier, string), true);
  assert.equal(targetTypeRefEquals(wide.carrier, integer), true, "uint64 is not widened to the implementation union");
  assert.equal(targetTypeRefEquals(wide.carrier, floating), false);
});

test("optional overload results keep one absence; a present overload is not optional", () => {
  const { result } = selectedCalls();
  assert.equal(targetTypeRefEquals(result("receiver(reader).optional(true)").carrier, string), true);
  assert.equal(targetTypeRefEquals(result("receiver(reader).optional(false)").carrier, csharpNullableTargetType(string)), true,
    "string | undefined is one nullable string, with no second absence layer");
});

test("a fluent this result is the receiver's own class", () => {
  const { program, result } = selectedCalls();
  const fluent = result("receiver(reader).fluent()");
  assert.equal(fluent.selection.result.kind === "declared" &&
    fluent.selection.result.declaration === program.named("Derived"), true, "this is instantiated by the Host at the receiver");
  assert.equal(fluent.carrier.kind === "target-named" && fluent.carrier.id === "global::Fixture.Derived", true);
});

test("complete equal native payload coverage preserves the physical union ABI (CLR mapping proof)", () => {
  const duplicate = csharpRuntimeUnionTargetType([integer, integer]);
  const mapping = selectCsharpUnionArmMapping(duplicate, integer, "source");
  assert.equal(mapping?.length, 2, "both physical source slots are covered");
  assert.equal(mapping.every(arm => arm.carrier === integer && arm.target.length === 0 &&
    arm.source.length === 1 && arm.source[0].union === duplicate), true,
  "each exact source payload maps to the scalar without a destination tag");
  assert.equal(mapping.map(arm => arm.source[0].index).join(","), "0,1", "source paths remain distinct and ordered");
  assert.equal(selectCsharpUnionArmMapping(duplicate, floating, "source") === undefined, true,
    "complete source coverage cannot reinterpret the native integer width");
  assert.equal(selectCsharpUnionArmMapping(csharpRuntimeUnionTargetType([integer, string]), integer, "source") === undefined, true,
    "a heterogeneous source cannot be collapsed to one selected payload");
});
