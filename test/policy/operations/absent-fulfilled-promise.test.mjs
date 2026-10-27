import assert from "node:assert/strict";
import test from "node:test";
import { csharpJsPromiseCallPolicies } from "../../../dist/policy/operations/source-profiles/js/promises.js";
import { csharpDelegateTargetType, csharpTaskTargetType, getCsharpTaskResultTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType, csharpVoidTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpAbsenceTargetType } from "../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpNullableTargetType } from "../../../dist/target-model/types/carriers/nullable.js";
import { csharpObjectTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { resolveCsharpOptionalStorage } from "../../../dist/policy/types/storage/optional-storage.js";

for (const declaringName of ["Promise", "PromiseLike"]) {
  for (const asynchronous of [false, true]) {
    for (const voidSource of [false, true]) {
      test(`${declaringName} absent fulfillment derives ${asynchronous ? "async" : "sync"} ${voidSource ? "void-source" : "void-rejection"} witnesses from the selected nullable callback`, () => {
        const integer = csharpSourcePrimitiveTargetType("int64");
        const input = voidSource ? csharpVoidTargetType() : integer;
        const completed = voidSource ? integer : csharpVoidTargetType();
        const callbackResult = asynchronous ? csharpTaskTargetType(completed) : completed;
        const callback = csharpDelegateTargetType(asynchronous || voidSource ? "System.Func" : "System.Action",
          [csharpNullableTargetType(csharpObjectTargetType())], asynchronous || voidSource ? callbackResult : undefined);
        const receiverExpression = {};
        const absentExpression = {};
        const rejectedExpression = {};
        const checkedReceiver = {};
        const checkedAbsence = {};
        const checkedRejected = {};
        const selected = csharpJsPromiseCallPolicies.find(policy => policy.source.declaringName === declaringName &&
          policy.source.name === "then").select({
          source: {
            sourceReceiver: { expression: receiverExpression, type: checkedReceiver },
            sourceSelectedSignatureKind: "resolved", sourceSelectedSignatureParameters: [{}, {}],
            sourceArguments: [{ expression: absentExpression, type: checkedAbsence },
              { expression: rejectedExpression, type: checkedRejected }],
            sourceArgumentBindings: [0, 1].map(index => ({ sourceParameterIndex: index,
              sourceArgumentIndex: index, effectiveArgumentIndex: index, sourceForm: "value" })),
          },
          inputs: { values: new Map([
            [receiverExpression, new Map([[checkedReceiver, csharpTaskTargetType(input)]])],
            [absentExpression, new Map([[checkedAbsence, csharpAbsenceTargetType()]])],
            [rejectedExpression, new Map([[checkedRejected, callback]])],
          ]), types: new Map() },
        });
        assert.equal(selected.kind, "resolved", "the exact nullable callback retains its native result witness");
        const storage = resolveCsharpOptionalStorage({ kind: "optional", part: "storage", arguments: [integer] }, integer);
        const operations = resolveCsharpOptionalStorage({ kind: "optional", part: "operations", arguments: [integer] }, integer);
        const expected = voidSource ? [integer, storage, operations] : [storage, operations];
        const actual = selected.call.targetMethodTypeArguments;
        assert.equal(actual.length, expected.length, "the existing native helper receives its complete exact generic vector");
        assert.equal(actual.every((argument, index) => argument.kind === "target-derived" &&
          targetTypeRefEquals(argument.targetType, expected[index])), true,
          "element, storage and operation evidence retain the selected native int64 carrier");
        assert.equal(targetTypeRefEquals(getCsharpTaskResultTargetType(selected.call.targetMember.returnType), storage), true,
          "the result is the existing genuine optional storage, not a fabricated default value");
        assert.equal(selected.call.arguments.length, 2, "both original source argument positions survive selection");
      });
    }
  }
}

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
