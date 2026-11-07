import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpArrayUnionElementPlan } from "../../../dist/policy/operations/source-profiles/js/array-unions.js";
import { csharpJsArrayTargetType, csharpJsTypedArrayTargetType } from "../../../dist/target-model/types/carriers/js.js";
import { csharpNullableTargetType, csharpRuntimeUnionTargetType, csharpSourcePrimitiveTargetType,
  csharpStringTargetType, getCsharpNullableElementTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { acceptedEffectiveSource, assertPrimitiveOccurrences, compileEffectiveSource, projectNodes } from "../../helpers/source-effective-types.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const policy = { projectTypes: { directSupertypes: () => [] },
  providers: { findTargetBindingByTargetId: () => ({ kind: "missing" }) }, target: {} };
const floating = csharpSourcePrimitiveTargetType("float64");
const byte = csharpSourcePrimitiveTargetType("uint8");
const roles = [csharpJsArrayTargetType(floating), csharpJsTypedArrayTargetType("Uint8Array")];
const source = csharpRuntimeUnionTargetType(roles);

for (const [kind, method, parameter] of [
  ["int32", "ReadValue", "int32"], ["int64", "ReadValue", "int32"],
  ["float32", "ReadNumericProperty", "float64"], ["float64", "ReadNumericProperty", "float64"],
]) test(`BF34 each native array role keeps its own width for a ${kind} key`, () => {
  const index = csharpSourcePrimitiveTargetType(kind);
  const selected = selectCsharpArrayUnionElementPlan(policy, source, roles, index, floating);
  assert.equal(selected.kind, "array-union-read");
  assert.equal(selected.plan.source === source, true, "the actual aggregate is never retyped to a common array");
  assert.equal(selected.plan.indexType.name, parameter);
  assert.equal(getCsharpNullableElementTargetType(selected.plan.result) === floating, true);
  assert.equal(selected.plan.variants.length, 2);
  for (const [position, element] of [floating, byte].entries()) {
    const variant = selected.plan.variants[position];
    assert.equal(variant.carrier === roles[position], true, "role order and exact current carrier are retained");
    assert.equal(variant.targetMember.targetName, method);
    assert.equal(variant.targetMember.parameters[0].type.typeArguments[0] === element, true,
      "the actual receiver ABI uses the native element, not the logical result width");
    assert.equal(variant.targetMember.parameters[1].type.name, parameter);
    assert.equal(getCsharpNullableElementTargetType(variant.targetMember.returnType) === element, true);
    assert.equal(variant.receiverConversion.kind, "implicit");
    assert.equal(variant.receiverConversion.proof, "collection-interface");
    assert.equal(variant.resultConversion.kind === "identity" || variant.resultConversion.kind === "implicit", true);
  }
  assert.equal(index.name, kind, "the use slot never retargets the published key");
  assert.equal(Object.isFrozen(selected.plan) && Object.isFrozen(selected.plan.variants), true);
});

test("BF34 same-element roles use the same canonical per-role read and retain one absence", () => {
  const same = [csharpJsArrayTargetType(byte), roles[1]];
  const optional = csharpNullableTargetType(byte);
  const selected = selectCsharpArrayUnionElementPlan(policy, csharpRuntimeUnionTargetType(same), same,
    csharpSourcePrimitiveTargetType("int64"), optional);
  assert.equal(selected.kind, "array-union-read");
  assert.equal(selected.plan.result === optional, true, "already optional storage is not nested");
  assert.equal(selected.plan.variants.every(variant => targetTypeRefEquals(variant.targetMember.returnType, optional)), true);
});

test("BF34 missing, foreign, nonprimitive and inconvertible native roles cannot borrow another role's read", () => {
  const index = csharpSourcePrimitiveTargetType("int32");
  for (const invalid of [[], [roles[0]], [roles[0], csharpStringTargetType()],
    [roles[0], csharpJsArrayTargetType(csharpStringTargetType())]]) {
    assert.equal(selectCsharpArrayUnionElementPlan(policy, source, invalid, index, floating).kind, "rejected");
  }
  assert.equal(selectCsharpArrayUnionElementPlan(policy, source, roles, index, byte).kind, "rejected",
    "the float64 role cannot implicitly narrow into another role's element width");
  assert.equal(selectCsharpArrayUnionElementPlan(policy, source, roles,
    csharpSourcePrimitiveTargetType("bool"), floating).kind, "rejected");
  assert.equal(selectCsharpArrayUnionElementPlan(policy, source, roles, index, csharpStringTargetType()).kind, "rejected");
});

test("BF34 genuine Source preserves numeric-key absence, role widths and single evaluation", { timeout: 300_000 }, () => {
  const compiled = compileEffectiveSource("js", `
    let receivers: number = 0;
    let keys: number = 0;
    function receiver(values: Uint8Array | readonly number[]): Uint8Array | readonly number[] {
      receivers += 1; return values;
    }
    function key(index: number): number { keys += 1; return index; }
    export function read(values: Uint8Array | readonly number[], index: number): number | undefined {
      return receiver(values)[key(index)];
    }
    export function run(): boolean {
      const bytes = new Uint8Array([0, 255]);
      const values: number[] = [0, 1.5];
      if (read(bytes, 0) !== 0 || read(bytes, 1) !== 255 || read(values, 1) !== 1.5) return false;
      if (read(bytes, 0.5) !== undefined || read(values, 0.5) !== undefined) return false;
      if (read(bytes, -1) !== undefined || read(values, 8) !== undefined || read(bytes, NaN) !== undefined) return false;
      return receivers === 8 && keys === 8;
    }`);
  const generated = acceptedEffectiveSource(compiled);
  assertPrimitiveOccurrences(compiled, "index", "float64");
  const program = compiled.result.program;
  const reads = projectNodes(compiled).filter(node => program.source.ast.is.IsElementAccessExpression(node));
  const sealed = reads.map(node => program.records.selectedElement.get(node)).filter(value => value?.target?.kind === "array-union-read");
  assert.equal(sealed.length, 1, "the real selected union read reaches one sealed native plan");
  assert.equal(sealed[0].emission.read.kind, "array-union");
  assert.equal(sealed[0].emission.indexType.name, "float64");
  assert.equal(sealed[0].emission.read.plan.variants.length, 2);
  assert.match(generated, /ArrayLike\.ReadNumericProperty\(/u);
  assert.match(generated, /switch/u);
  assert.doesNotMatch(generated, /\.Match\(|\.Select\(|\.ToArray\(|IArrayLike<double>\)\s*values/u);
  executeCsharpConstruction(compiled, "bf34-native-role-read");
});
