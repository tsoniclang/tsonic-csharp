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
        const publishedReceiver = { kind: "declared", declaration: {}, typeArguments: [] };
        const publishedAbsence = { kind: "intrinsic", intrinsic: "absence" };
        const publishedRejected = { kind: "callable", calls: [], constructs: [] };
        const selected = csharpJsPromiseCallPolicies.find(policy => policy.source.declaringName === declaringName &&
          policy.source.name === "then").select({
          source: {
            call: {}, selection: {}, typeArguments: [],
            receiver: { expression: receiverExpression, type: publishedReceiver },
            parameters: [publishedAbsence, publishedRejected].map((type, index) => ({ name: `on${index}`, kind: "optional", type })),
            arguments: [{ expression: absentExpression, type: publishedAbsence },
              { expression: rejectedExpression, type: publishedRejected }],
            bindings: [absentExpression, rejectedExpression].map((argument, index) => ({ argument, parameterIndex: index,
              argumentIndex: index, effectiveIndex: index, mode: "positional", form: "value" })),
          },
          inputs: { values: new Map([
            [receiverExpression, csharpTaskTargetType(input)],
            [absentExpression, csharpAbsenceTargetType()],
            [rejectedExpression, callback],
          ]), results: new Map() },
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
      const publishedType = Object.freeze({ kind: "declared", declaration: {}, typeArguments: [] });
      const resultType = Object.freeze({ kind: "declared", declaration: {}, typeArguments: [] });
      const optional = Object.freeze({ kind: "optional", value: Object.freeze({ kind: "callable", calls: [], constructs: [] }) });
      const receiver = csharpTaskTargetType(input);
      const policy = csharpJsPromiseCallPolicies.find(candidate => candidate.source.declaringName === declaringName &&
        candidate.source.name === "then");
      assert.equal(policy !== undefined, true, "the existing Promise continuation policy owns the relation");
      const selected = policy.select({
        source: {
          call: {}, selection: { result: resultType }, typeArguments: [],
          receiver: { expression, type: publishedType },
          parameters: [0, 1].map(index => ({ name: `on${index}`, kind: "optional", type: optional })),
          arguments: [], bindings: [],
        },
        inputs: { values: new Map([[expression, receiver]]), results: new Map() },
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
