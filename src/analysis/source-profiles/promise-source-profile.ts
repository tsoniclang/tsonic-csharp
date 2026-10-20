import { csharpTaskTargetType, csharpVoidTargetType } from "../../target-model/types/index.js";
import { csharpTargetId } from "../../target-model/identities/source.js";

import type { CsharpSourceProfileCallPolicy, CsharpSourceProfileCallPolicyContext, CsharpSourceProfileCallPolicyResult } from "../../policy/model/source-profiles.js";
import { csharpSourceProfileCall, csharpSourceProfileDiagnostic } from "../../policy/operations/source-profiles/source-profile-policy.js";
import type { CsharpSourceProfileOwner } from "../../policy/identities/selected-source.js";
import { resolveCsharpSourceProfileGenericResult } from "../../policy/operations/source-profiles/source-profile-result.js";

const owners: readonly CsharpSourceProfileOwner[] = Object.freeze([
  csharpTargetId,
  "js",
]);
const voidType = csharpVoidTargetType();
const noReceiver = { kind: "none" } as const;

import { promiseConstructorMember } from "../../policy/operations/source-profiles/promise-source-profile.js";
export const csharpPromiseSourceProfileCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze(
    owners.map(owner => Object.freeze({
      source: Object.freeze({
        owner,
        kind: "construct" as const,
        declaringName: "PromiseConstructor",
      }),
      select(
        context: CsharpSourceProfileCallPolicyContext,
      ): CsharpSourceProfileCallPolicyResult {
        const taskType = context.source.sourceSelectedSignatureKind !== "resolved" ||
          context.source.sourceSelectedSignatureParameters.length !== 1 ||
          context.source.sourceArgumentBindings.length !== 1 ? undefined :
          resolveCsharpSourceProfileGenericResult(context, 1, arguments_ => csharpTaskTargetType(arguments_[0]!));
        const member = promiseConstructorMember(taskType);
        const call = member === undefined
          ? undefined
          : csharpSourceProfileCall(context.source, member, noReceiver);
        return call === undefined
          ? {
              kind: "rejected",
              diagnostic: csharpSourceProfileDiagnostic(
                "CSHARP_PROMISE_CONSTRUCTION_NOT_CLOSED",
                9100971,
                "The selected Promise constructor does not provide one exact native Task result and executor parameter relation.",
                [
                  "Native and JS Promise construction share the core Task completion owner.",
                  "The selected result, executor and source parameter bindings must be closed before C# construction.",
                ],
              ),
            }
          : { kind: "resolved", call };
      },
    })),
  );
