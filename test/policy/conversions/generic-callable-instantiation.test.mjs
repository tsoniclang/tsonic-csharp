import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpCallableInstantiation } from "../../../dist/policy/conversions/generic-callables.js";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { admitCsharpConversionSelection } from "../../../dist/analysis/conversions/validation.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { csharpMethodValueType } from "../../../dist/target-model/types/method-values.js";
import { csharpDelegateTargetType, getCsharpDelegateSignature } from "../../../dist/target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const policy = { projectTypes: { directSupertypes: () => [] }, providers: {
  findTargetBindingByTargetId: () => ({ kind: "missing" }),
  findTargetBindingByMetadataName: () => ({ kind: "missing" }),
} };
const integer = { kind: "source-primitive", name: "int64" };

function callable(parameter, parameters = [parameter]) {
  const signature = csharpDelegateTargetType("System.Func", parameters, parameter);
  const owner = createStructuralObjectShapeTarget([{ sourceKey: { kind: "property", name: "Invoke" },
    sourceName: "Invoke", targetName: "Invoke", memberKind: "method", type: signature,
    typeParameters: [{ declaration: {}, identity: parameter.identity, name: parameter.name,
      csharpAllowsRefLike: false, constraints: parameter.csharpConstraints.constraints }] }], undefined,
  () => ({ kind: "resolved", constraints: [] }), true);
  return csharpMethodValueType(owner, "Invoke", "generic.identity", signature, [parameter.identity]);
}

test("one native method instantiation owns exact callback signatures, constraints and admission", () => {
  const parameter = { kind: "type-parameter", identity: "identity:Value", name: "Value",
    csharpConstraints: { kind: "resolved", constraints: [] } };
  const source = callable(parameter);
  assert.equal(source !== undefined, true, "the actual generic method contract is constructed");
  const destination = csharpDelegateTargetType("System.Func", [integer], integer);
  const selected = selectCsharpConversion(policy, source, destination, "implicit");
  assert.equal(selected.kind === "delegate-adapter" && selected.strategy === "native-binding" &&
    selected.instantiation?.typeArguments.length === 1 &&
    targetTypeRefEquals(selected.instantiation.typeArguments[0], integer), true,
  "the selected exact native input instantiates the original method once");
  assert.equal(admitCsharpConversionSelection(policy, source, destination, selected).kind, "delegate-adapter",
    "the same selected contract is admitted without erased generic arguments");
  const forged = { ...selected, instantiation: { ...selected.instantiation,
    typeArguments: [{ kind: "source-primitive", name: "float64" }] } };
  assert.equal(admitCsharpConversionSelection(policy, source, destination, forged).kind, "rejected",
    "different native generic arguments cannot reuse the selected callback contract");
  const conflicting = callable(parameter, [parameter, parameter]);
  assert.equal(selectCsharpCallableInstantiation(policy, conflicting,
    getCsharpDelegateSignature(csharpDelegateTargetType("System.Func", [integer,
      { kind: "source-primitive", name: "float64" }], integer))), undefined,
  "one quantified input cannot be independently rebound by two incompatible native arguments");
  const requiredClass = { ...parameter, csharpConstraints: { kind: "resolved",
    constraints: [{ kind: "keyword", keyword: "class" }] } };
  assert.equal(selectCsharpCallableInstantiation(policy, callable(requiredClass), getCsharpDelegateSignature(destination)), undefined,
    "a native value argument does not satisfy a reference-only generic constraint");
  const noInput = csharpDelegateTargetType("System.Action", [], csharpVoidTargetType());
  assert.equal(selectCsharpCallableInstantiation(policy, source, getCsharpDelegateSignature(noInput)), undefined,
    "an unavailable input cannot manufacture a generic instantiation");
});

for (const surface of ["native", "js"]) {
  test(`generic method callback instantiation preserves exact native width and one body on ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32, int64 } from "@tsonic/core/types.js";
let calls = 0;
function apply<Value>(callback: (value: Value, index: int32) => Value, value: Value): Value {
  return callback(value, 3);
}
function generic<Value>(value: Value): Value {
  function same<Actual extends Value>(actual: Actual): Actual { calls++; return actual; }
  return apply<Value>(same, value);
}
export function run(): boolean {
  calls = 0;
  const wide: int64 = 9007199254740993n;
  return generic<int64>(wide) === wide && calls === 1;
}` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(/DynamicInvoke|TsValue|Convert\.ToDouble/u.test(output), false,
      "native generic callbacks retain their exact physical carrier without erased transport");
    executeCsharpConstruction(compiled, `generic-callable-instantiation-${surface}`);
  });
}
