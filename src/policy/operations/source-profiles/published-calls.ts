import type { CsharpSourceProfileCallPolicy, CsharpSourceProfileCallPolicyContext, CsharpSourceProfileCallPolicyResult, CsharpSourceProfileIdentitySelector } from "../../model/source-profiles.js";
import type { CsharpTargetMember, CsharpTargetParameter } from "../../types/index.js";
import { getCsharpJsArrayElementTargetType } from "../../../target-model/types/carriers/collections.js";
import { csharpJsTypedArrayElementTargetType } from "../../../target-model/types/carriers/js.js";
import { csharpSourceProfileCall, csharpSourceProfileDiagnostic, resolveCsharpSelectedSourceValue } from "./source-profile-policy.js";

export interface CsharpPublishedNativeCallBinding {
  readonly source: CsharpSourceProfileIdentitySelector;
  readonly targetId: string;
  readonly targetName: string;
  readonly receiver: "js-array" | "typed-array";
}

export function csharpPublishedNativeCallPolicy(binding: CsharpPublishedNativeCallBinding): CsharpSourceProfileCallPolicy {
  return Object.freeze({
    source: binding.source,
    finalizeArguments: true,
    select(context: CsharpSourceProfileCallPolicyContext): CsharpSourceProfileCallPolicyResult {
      const receiver = resolveCsharpSelectedSourceValue(context, context.source.receiver);
      const receiverMatches = binding.receiver === "js-array"
        ? getCsharpJsArrayElementTargetType(receiver) !== undefined
        : csharpJsTypedArrayElementTargetType(receiver) !== undefined;
      const result = context.inputs.results.get(context.source.call);
      const arguments_ = context.inputs.callTypeArguments;
      const parameters: CsharpTargetParameter[] = [];
      for (const [index, selected] of context.source.parameters.entries()) {
        const type = context.inputs.parameters[index];
        if (type === undefined) break;
        parameters.push(Object.freeze({ name: selected.name, type, passingMode: "by-value",
          optional: selected.kind !== "required", paramsArray: selected.kind === "rest" }));
      }
      if (receiver !== undefined && receiverMatches && result !== undefined && arguments_ !== undefined &&
        parameters.length === context.source.parameters.length) {
        const member: CsharpTargetMember = Object.freeze({
          id: binding.targetId, sourceName: context.identity.name ?? binding.targetName,
          targetName: binding.targetName, kind: "method", declaringType: receiver,
          parameters: Object.freeze(parameters), returnType: result,
          typeParameters: Object.freeze(arguments_.map((_type, index) => Object.freeze({
            identity: JSON.stringify([binding.targetId, index]), name: `T${index}`, csharpAllowsRefLike: false,
          }))),
        });
        const call = csharpSourceProfileCall(context.source, member, { kind: "instance" }, arguments_);
        if (call !== undefined) return { kind: "resolved", call };
      }
      return { kind: "rejected", diagnostic: csharpSourceProfileDiagnostic(
        "CSHARP_JS_SOURCE_PROFILE_CALL_NOT_CLOSED", 9101001,
        "The selected native call requires its exact published receiver, parameters, generic bindings and result.",
      ) };
    },
  });
}
