import assert from "node:assert/strict";
import test from "node:test";
import { csharpJsPromiseCallPolicies } from "../../../dist/policy/operations/source-profiles/js/promises.js";
import { csharpTaskTargetType, getCsharpTaskResultTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

for (const declaringName of ["Promise", "PromiseLike"]) {
  for (const input of [csharpSourcePrimitiveTargetType("int64"), csharpSourcePrimitiveTargetType("float64"), csharpVoidTargetType()]) {
    test(`${declaringName} absent handlers retain exact ${input.kind === "source-primitive" ? input.name : input.id} completion without a speculative source result`, () => {
      const expression = Object.freeze({});
      const checkedType = Object.freeze({});
      const resultType = Object.freeze({});
      const receiver = csharpTaskTargetType(input);
      const policy = csharpJsPromiseCallPolicies.find(candidate => candidate.source.declaringName === declaringName &&
        candidate.source.name === "then");
      assert.equal(policy !== undefined, true, "the existing checked Promise continuation owns the relation");
      const selected = policy.select({
        source: {
          sourceReceiver: { expression, type: checkedType }, sourceResultType: resultType,
          sourceSelectedSignatureKind: "resolved", sourceSelectedSignatureParameters: [{}, {}],
          sourceArguments: [], sourceArgumentBindings: [],
        },
        inputs: { values: new Map([[expression, new Map([[checkedType, receiver]])]]), types: new Map() },
      });
      assert.equal(selected.kind, "resolved", "absent handlers need only their actual native receiver completion");
      const result = getCsharpTaskResultTargetType(selected.call.targetMember.returnType);
      assert.equal(result !== undefined && targetTypeRefEquals(result, input), true, "the exact native result is not inferred from missing source output");
      assert.equal(selected.call.targetMember.parameters.length, 3, "receiver and both actual optional handlers remain represented");
      assert.equal(selected.call.targetMember.parameters.slice(1).every(parameter => parameter.optional === true), true,
        "omitted handlers retain their native optional argument contract");
      assert.equal(selected.call.arguments.length, 0, "identity does not synthesize a callback or argument");
      assert.equal(selected.call.targetMethodTypeArguments.length, 0, "identity requires no invented generic result witness");
    });
  }
}
