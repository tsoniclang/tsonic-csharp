import type {
  CsharpTargetReceiverRelation,
} from "../../../../providers/relations/index.js";
import type {
  CsharpTargetMember,
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../../types/index.js";
import {
  csharpObjectTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
} from "../../../types/index.js";
import type {
  CsharpSourceProfileCallPolicy,
  CsharpSourceProfileCallPolicyContext,
  CsharpSourceProfileCallPolicyResult,
  CsharpSourceProfileElementPolicy,
  CsharpSourceProfileElementPolicyContext,
  CsharpSourceProfileElementPolicyResult,
  CsharpSourceProfileIdentitySelector,
  CsharpSourceProfilePropertyPolicy,
  CsharpSourceProfilePropertyPolicyContext,
  CsharpSourceProfilePropertyPolicyResult,
  CsharpTargetPropertyInvocation,
} from "../source-profile-policy.js";
import type {
  CsharpTargetElementInvocation,
} from "../../selection/selection-types.js";
import {
  csharpSourceProfileCall,
  csharpSourceProfileDiagnostic,
} from "../source-profile-policy.js";

export type JsSourceProfileTargetMemberFactory = (
  context: CsharpSourceProfileCallPolicyContext,
) => CsharpTargetMember | undefined;

export function jsMemberIdentity(
  declaringName: string,
  name: string,
): CsharpSourceProfileIdentitySelector {
  return Object.freeze({
    owner: "js",
    kind: "member",
    declaringName,
    name,
  });
}

export function jsCallIdentity(
  declaringName: string,
): CsharpSourceProfileIdentitySelector {
  return Object.freeze({
    owner: "js",
    kind: "call",
    declaringName,
  });
}

export function jsConstructIdentity(
  declaringName: string,
): CsharpSourceProfileIdentitySelector {
  return Object.freeze({
    owner: "js",
    kind: "construct",
    declaringName,
  });
}

export function jsGlobalCallIdentity(
  name: string,
): CsharpSourceProfileIdentitySelector {
  return Object.freeze({
    owner: "js",
    kind: "call",
    declaringName: "Global",
    name,
  });
}

export function jsIndexerIdentity(
  declaringName: string,
): CsharpSourceProfileIdentitySelector {
  return Object.freeze({
    owner: "js",
    kind: "indexer",
    declaringName,
  });
}

export function jsCallPolicy(
  source: CsharpSourceProfileIdentitySelector,
  createTargetMember: JsSourceProfileTargetMemberFactory,
  receiver: CsharpTargetReceiverRelation,
  options: {
    readonly targetParameterBySourceParameter?:
      | readonly (number | undefined)[]
      | ((
        context: CsharpSourceProfileCallPolicyContext,
      ) => readonly (number | undefined)[]);
    readonly targetMethodTypeArguments?: (
      context: CsharpSourceProfileCallPolicyContext,
    ) => readonly TargetTypeRef[] | undefined;
  } = {},
): CsharpSourceProfileCallPolicy {
  return Object.freeze({
    source,
    select(
      context: CsharpSourceProfileCallPolicyContext,
    ): CsharpSourceProfileCallPolicyResult {
      const targetMember = createTargetMember(context);
      const targetMethodTypeArguments =
        options.targetMethodTypeArguments === undefined
          ? []
          : options.targetMethodTypeArguments(context);
      const targetParameterBySourceParameter =
        typeof options.targetParameterBySourceParameter === "function"
          ? options.targetParameterBySourceParameter(context)
          : options.targetParameterBySourceParameter;
      const call = targetMember === undefined ||
          targetMethodTypeArguments === undefined
        ? undefined
        : csharpSourceProfileCall(
            context.source,
            targetMember,
            receiver,
            targetMethodTypeArguments,
            {
              targetParameterBySourceParameter,
            },
          );
      return call === undefined
        ? {
            kind: "rejected",
            diagnostic: csharpSourceProfileDiagnostic(
              "CSHARP_JS_SOURCE_PROFILE_CALL_NOT_CLOSED",
              9101001,
              `The exact selected JS source-profile call '${formatSourceIdentity(source)}' has no closed C# target relation.`,
              [
                "The selected declaration is JS source-profile-owned.",
                "The selected source parameter slots must agree with the explicit C# target relation.",
              ],
            ),
          }
        : { kind: "resolved", call };
    },
  });
}

export function jsUnsupportedCallPolicy(
  source: CsharpSourceProfileIdentitySelector,
  reason: string,
): CsharpSourceProfileCallPolicy {
  return Object.freeze({
    source,
    select(): CsharpSourceProfileCallPolicyResult {
      return {
        kind: "rejected",
        diagnostic: csharpSourceProfileDiagnostic(
          "CSHARP_JS_SOURCE_PROFILE_OPERATION_UNSUPPORTED",
          9101002,
          reason,
          [
            `Selected source identity: ${formatSourceIdentity(source)}.`,
            "No target fallback, name recovery, or dynamic invocation is permitted.",
          ],
        ),
      };
    },
  });
}

export function jsPropertyPolicy(
  source: CsharpSourceProfileIdentitySelector,
  createTargetMember: (
    context: CsharpSourceProfilePropertyPolicyContext,
  ) => CsharpTargetMember | undefined,
  receiver: CsharpTargetReceiverRelation,
  invocation: CsharpTargetPropertyInvocation = { kind: "member" },
): CsharpSourceProfilePropertyPolicy {
  return Object.freeze({
    source,
    select(
      context: CsharpSourceProfilePropertyPolicyContext,
    ): CsharpSourceProfilePropertyPolicyResult {
      const targetMember = createTargetMember(context);
      return targetMember === undefined
        ? {
            kind: "rejected",
            diagnostic: csharpSourceProfileDiagnostic(
              "CSHARP_JS_SOURCE_PROFILE_PROPERTY_NOT_CLOSED",
              9101003,
              `The exact selected JS source-profile property '${formatSourceIdentity(source)}' has no closed C# target relation.`,
            ),
          }
        : { kind: "resolved", targetMember, receiver, invocation };
    },
  });
}

export function jsElementPolicy(
  source: CsharpSourceProfileIdentitySelector,
  createTargetMember: (
    context: CsharpSourceProfileElementPolicyContext,
  ) => CsharpTargetMember | undefined,
  invocation: CsharpTargetElementInvocation = { kind: "indexer" },
): CsharpSourceProfileElementPolicy {
  return Object.freeze({
    source,
    select(
      context: CsharpSourceProfileElementPolicyContext,
    ): CsharpSourceProfileElementPolicyResult {
      const targetMember = createTargetMember(context);
      return targetMember === undefined
        ? {
            kind: "rejected",
            diagnostic: csharpSourceProfileDiagnostic(
              "CSHARP_JS_SOURCE_PROFILE_ELEMENT_NOT_CLOSED",
              9101004,
              `The exact selected JS source-profile element access '${formatSourceIdentity(source)}' has no closed C# target relation.`,
            ),
          }
        : {
            kind: "resolved",
            targetMember,
            targetParameterIndex: 0,
            receiver: { kind: "instance" },
            invocation,
          };
    },
  });
}

export function jsRuntimeTargetType(name: string): TargetTypeRef {
  return csharpTargetNamedType(
    `Tsonic.CSharp.Js.${name}`,
    undefined,
    csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", name),
  );
}

export function targetParameter(
  name: string,
  type: TargetTypeRef,
  options: Omit<CsharpTargetParameter, "name" | "type" | "passingMode"> = {},
): CsharpTargetParameter {
  return Object.freeze({
    name,
    type,
    passingMode: "by-value",
    ...options,
  });
}

export function closedObjectParameter(
  name: string,
  options: Omit<CsharpTargetParameter, "name" | "type" | "passingMode"> = {},
): CsharpTargetParameter {
  return targetParameter(name, csharpObjectTargetType(), {
    csharpAcceptsClosedSourceArgument: true,
    ...options,
  });
}

export function staticMethod(
  id: string,
  sourceName: string,
  targetName: string,
  declaringType: TargetTypeRef,
  parameters: readonly CsharpTargetParameter[],
  returnType: TargetTypeRef,
  options: Pick<
    CsharpTargetMember,
    "typeParameters" | "csharpArtifactRequirements" | "csharpBinaryEpilogues" |
      "csharpInvocation"
  > = {},
): CsharpTargetMember {
  return Object.freeze({
    id,
    sourceName,
    targetName,
    kind: "method",
    static: true,
    declaringType,
    parameters: Object.freeze(parameters),
    returnType,
    ...options,
  });
}

export function instanceMethod(
  id: string,
  sourceName: string,
  targetName: string,
  declaringType: TargetTypeRef,
  parameters: readonly CsharpTargetParameter[],
  returnType: TargetTypeRef,
): CsharpTargetMember {
  return Object.freeze({
    id,
    sourceName,
    targetName,
    kind: "method",
    declaringType,
    parameters: Object.freeze(parameters),
    returnType,
  });
}

export function receiverHelperMethod(
  id: string,
  sourceName: string,
  targetName: string,
  declaringType: TargetTypeRef,
  receiverType: TargetTypeRef,
  parameters: readonly CsharpTargetParameter[],
  returnType: TargetTypeRef,
  options: Pick<
    CsharpTargetMember,
    "typeParameters" | "csharpArtifactRequirements" | "csharpBinaryEpilogues" |
      "csharpInvocation"
  > = {},
): CsharpTargetMember {
  return Object.freeze({
    ...staticMethod(
      id,
      sourceName,
      targetName,
      declaringType,
      [targetParameter("receiver", receiverType), ...parameters],
      returnType,
      options,
    ),
    receiverPassing: "target-parameter",
  });
}

export function targetProperty(
  id: string,
  sourceName: string,
  targetName: string,
  declaringType: TargetTypeRef,
  returnType: TargetTypeRef,
  options: {
    readonly static?: boolean;
    readonly readonly?: boolean;
  } = {},
): CsharpTargetMember {
  return Object.freeze({
    id,
    sourceName,
    targetName,
    kind: "property",
    ...(options.static === true ? { static: true } : {}),
    declaringType,
    parameters: [],
    returnType,
    ...(options.readonly === true ? { readonly: true } : {}),
  });
}

export function targetIndexer(
  id: string,
  declaringType: TargetTypeRef,
  indexType: TargetTypeRef,
  resultType: TargetTypeRef,
  readonly: boolean,
): CsharpTargetMember {
  return Object.freeze({
    id,
    sourceName: "Item",
    targetName: "Item",
    kind: "indexer",
    declaringType,
    parameters: [targetParameter("index", indexType)],
    returnType: resultType,
    ...(readonly ? { readonly: true } : {}),
  });
}

function formatSourceIdentity(
  identity: CsharpSourceProfileIdentitySelector,
): string {
  return [
    identity.owner,
    identity.declaringName,
    identity.name,
    identity.kind,
  ].filter((part) => part !== undefined).join(".");
}
