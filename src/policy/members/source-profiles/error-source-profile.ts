import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfileCallPolicyContext,
  CsharpSourceProfileCallPolicyResult,
  CsharpSourceProfileIdentitySelector,
  CsharpSourceProfilePropertyPolicy,
} from "./source-profile-policy.js";
import {
  csharpSourceProfileCall,
  csharpSourceProfileDiagnostic,
} from "./source-profile-policy.js";
import type {
  CsharpSourceProfileOwner,
} from "./source-profile-identity.js";
import {
  csharpNullableTargetType,
  csharpRuntimeErrorTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
} from "../../types/index.js";
import type { CsharpTargetMember, TargetTypeRef } from "../../types/index.js";
import { csharpTargetId } from "../../../target-model/identities/source.js";
import { csharpSourceErrorNames, type CsharpSourceErrorName } from "../../../target-model/identities/source-errors.js";

const errorType = csharpRuntimeErrorTargetType();
const stringType = csharpStringTargetType();
const instanceReceiver = { kind: "instance" } as const;
const noReceiver = { kind: "none" } as const;
const owners: readonly CsharpSourceProfileOwner[] = Object.freeze([
  csharpTargetId,
  "js",
]);

const errorConstructor: CsharpTargetMember = Object.freeze({
  id: "Tsonic.CSharp.Runtime.Error..ctor",
  sourceName: "constructor",
  targetName: "Error",
  kind: "constructor",
  declaringType: errorType,
  parameters: Object.freeze([{
    name: "message",
    type: stringType,
    passingMode: "by-value" as const,
    optional: true,
  }]),
  returnType: errorType,
});

const errorProperties: readonly {
  readonly sourceName: "name" | "message" | "stack";
  readonly targetId: string;
  readonly targetName: "name" | "message" | "stack";
  readonly targetType: TargetTypeRef;
}[] = Object.freeze([
  {
    sourceName: "name",
    targetId: "Tsonic.CSharp.Runtime.Error.name",
    targetName: "name",
    targetType: stringType,
  },
  {
    sourceName: "message",
    targetId: "Tsonic.CSharp.Runtime.Error.message",
    targetName: "message",
    targetType: stringType,
  },
  {
    sourceName: "stack",
    targetId: "Tsonic.CSharp.Runtime.Error.stack",
    targetName: "stack",
    targetType: csharpNullableTargetType(stringType),
  },
]);

export const csharpErrorSourceProfileCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze(
    owners.flatMap(owner => [
      ...(owner === "js" ? csharpSourceErrorNames : ["Error"] as const)
        .flatMap(name => [errorCallPolicy(owner, "construct", name), errorCallPolicy(owner, "call", name)]),
      errorCapturePolicy(owner),
    ]),
  );

function errorCapturePolicy(owner: CsharpSourceProfileOwner): CsharpSourceProfileCallPolicy {
  return Object.freeze({
    source: { owner, kind: "member" as const, declaringName: "ErrorConstructor", name: "captureStackTrace" },
    select(context: CsharpSourceProfileCallPolicyContext): CsharpSourceProfileCallPolicyResult {
      const call = csharpSourceProfileCall(context.source, {
        id: "Tsonic.CSharp.Runtime.Error.captureStackTrace",
        sourceName: "captureStackTrace",
        targetName: "captureStackTrace",
        kind: "method",
        static: true,
        declaringType: errorType,
        parameters: [{ name: "error", type: errorType, passingMode: "by-value" }],
        returnType: csharpVoidTargetType(),
      }, noReceiver);
      return call === undefined ? {
        kind: "rejected",
        diagnostic: csharpSourceProfileDiagnostic("CSHARP_ERROR_CAPTURE_CONTRACT", 9100952,
          "Error.captureStackTrace requires the exact selected Error parameter contract.", []),
      } : { kind: "resolved", call };
    },
  });
}

export const csharpErrorSourceProfilePropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze(
    owners.flatMap((owner) =>
      errorProperties.map(({
        sourceName,
        targetId,
        targetName,
        targetType,
      }) => Object.freeze({
        source: errorIdentity(owner, "member", sourceName),
        select: () => ({
          kind: "resolved" as const,
          targetMember: Object.freeze({
            id: targetId,
            sourceName,
            targetName,
            kind: "property" as const,
            declaringType: errorType,
            parameters: Object.freeze([]),
            returnType: targetType,
          }),
          receiver: instanceReceiver,
          invocation: { kind: "member" as const },
        }),
      })),
    ),
  );

function errorCallPolicy(
  owner: CsharpSourceProfileOwner,
  kind: "call" | "construct",
  name: CsharpSourceErrorName,
): CsharpSourceProfileCallPolicy {
  const source = { ...errorIdentity(owner, kind), declaringName: `${name}Constructor` };
  const type = csharpRuntimeErrorTargetType(name);
  const constructor = { ...errorConstructor, id: `Tsonic.CSharp.Runtime.${name}..ctor`, targetName: name,
    declaringType: type, returnType: type };
  return Object.freeze({
    source,
    select(
      context: CsharpSourceProfileCallPolicyContext,
    ): CsharpSourceProfileCallPolicyResult {
      const call = csharpSourceProfileCall(
        context.source,
        constructor,
        noReceiver,
      );
      return call === undefined
        ? {
            kind: "rejected",
            diagnostic: csharpSourceProfileDiagnostic(
              "CSHARP_ERROR_SOURCE_PROFILE_CALL_NOT_CLOSED",
              9100951,
              "The exact selected Error constructor does not match its closed C# runtime constructor relation.",
              [
                "Error is owned by the selected source profile.",
                "No source-name recovery or target fallback is permitted.",
              ],
            ),
          }
        : { kind: "resolved", call };
    },
  });
}

function errorIdentity(
  owner: CsharpSourceProfileOwner,
  kind: CsharpSourceProfileIdentitySelector["kind"],
  name?: string,
): CsharpSourceProfileIdentitySelector {
  return Object.freeze({
    owner,
    kind,
    declaringName: kind === "call" || kind === "construct"
      ? "ErrorConstructor"
      : "Error",
    ...(name === undefined ? {} : { name }),
  });
}
