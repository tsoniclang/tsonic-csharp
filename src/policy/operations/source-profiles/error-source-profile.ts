import type { CsharpSourceProfileCallPolicy, CsharpSourceProfileCallPolicyContext, CsharpSourceProfileCallPolicyResult, CsharpSourceProfileIdentitySelector, CsharpSourceProfilePropertyPolicy, CsharpSourceProfilePropertyPolicyContext } from "../../model/source-profiles.js";
import type { CsharpSourceProfilePropertyPolicyResult } from "../../../target-model/records/program/source-profile-invocations.js";
import { csharpSourceProfileCall, csharpSourceProfileDiagnostic } from "./source-profile-policy.js";
import type { CsharpSourceProfileDeclarationIdentity, CsharpSourceProfileOwner } from "../../identities/selected-source.js";
import { csharpSourceErrorTargetType, csharpExceptionTargetType, csharpStringTargetType, csharpObjectTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpTargetNamedType } from "../../../target-model/types/factories.js";
import { csharpQualifiedTypeRenderShape } from "../../../target-model/types/render-shapes.js";
import type { CsharpTargetMember, TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpTargetId } from "../../../target-model/identities/target.js";
import { csharpSourceErrorNames, type CsharpSourceErrorName } from "../../../target-model/identities/source-errors.js";
import { snapshotCsharpMetadata } from "../../../target-model/metadata/immutable.js";
import { namedTargetTypeImplicitlyAccepts } from "../../conversions/carriers.js";

const errorType = csharpExceptionTargetType();
const exceptionType = csharpExceptionTargetType();
const nativeType = csharpTargetNamedType("System.Type", undefined, csharpQualifiedTypeRenderShape("System", "Type"), { allowsRefLikeTypeArguments: [] });
const stackCaptureType = csharpTargetNamedType("System.Runtime.ExceptionServices.ExceptionDispatchInfo", undefined,
  csharpQualifiedTypeRenderShape("System.Runtime.ExceptionServices", "ExceptionDispatchInfo"), { allowsRefLikeTypeArguments: [] });
const stringType = csharpStringTargetType();
const instanceReceiver = { kind: "instance" } as const;
const noReceiver = { kind: "none" } as const;
const owners: readonly CsharpSourceProfileOwner[] = Object.freeze([
  csharpTargetId,
  "js",
]);

const errorConstructor: CsharpTargetMember = Object.freeze({
  id: "System.Exception..ctor",
  sourceName: "constructor",
  targetName: "Exception",
  kind: "constructor",
  declaringType: errorType,
  parameters: Object.freeze([{
    name: "message",
    type: csharpNullableTargetType(stringType),
    passingMode: "by-value" as const,
    optional: true,
    csharpOmittableOptionalArgument: true as const,
  }, {
    name: "innerException", type: csharpNullableTargetType(exceptionType), passingMode: "by-value" as const,
    optional: true, csharpOmittableOptionalArgument: true as const,
  }]),
  returnType: errorType,
});

const errorProperties: readonly {
  readonly sourceName: "name" | "message" | "stack" | "cause";
  readonly native: Extract<CsharpSourceProfilePropertyPolicyResult, { readonly kind: "resolved" }>;
}[] = snapshotCsharpMetadata([
  {
    sourceName: "name",
    native: {
      kind: "resolved",
      targetMember: { id: "System.Type.Name", sourceName: "name", targetName: "Name",
        kind: "property", readonly: true, declaringType: nativeType, parameters: [], returnType: stringType },
      receiver: instanceReceiver, invocation: { kind: "receiver-call", call: {
        id: "System.Object.GetType", sourceName: "GetType", targetName: "GetType", kind: "method",
        declaringType: csharpObjectTargetType(), parameters: [], returnType: nativeType,
      } },
    },
  },
  {
    sourceName: "message",
    native: {
      kind: "resolved",
      targetMember: { id: "System.Exception.Message", sourceName: "message", targetName: "Message", kind: "property",
        readonly: true, declaringType: exceptionType, parameters: [], returnType: stringType },
      receiver: instanceReceiver, invocation: { kind: "member" },
    },
  },
  {
    sourceName: "stack",
    native: {
      kind: "resolved",
      targetMember: { id: "System.Exception.StackTrace", sourceName: "stack", targetName: "StackTrace",
        kind: "property", readonly: true, declaringType: exceptionType, parameters: [],
        returnType: csharpNullableTargetType(stringType) },
      receiver: instanceReceiver, invocation: { kind: "member" },
    },
  },
  {
    sourceName: "cause",
    native: {
      kind: "resolved",
      targetMember: { id: "System.Exception.InnerException", sourceName: "cause", targetName: "InnerException",
        kind: "property", readonly: true, declaringType: exceptionType, parameters: [],
        returnType: csharpNullableTargetType(exceptionType) },
      receiver: instanceReceiver, invocation: { kind: "member" },
    },
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
      const member = context.host.providers.publishNativeIdentities<CsharpTargetMember>({
        id: "System.Runtime.ExceptionServices.ExceptionDispatchInfo.SetCurrentStackTrace",
        sourceName: "captureStackTrace",
        targetName: "SetCurrentStackTrace",
        kind: "method",
        static: true,
        declaringType: stackCaptureType,
        parameters: [{ name: "error", type: errorType, passingMode: "by-value" }],
        returnType: exceptionType,
      });
      if (member.kind === "rejected") return member;
      const call = member.kind === "resolved" ? csharpSourceProfileCall(context.source, member.value, noReceiver) : undefined;
      return call === undefined ? {
        kind: "rejected",
        diagnostic: csharpSourceProfileDiagnostic("CSHARP_ERROR_CAPTURE_CONTRACT", 9100952,
          "Error.captureStackTrace requires the exact selected Error parameter contract.", []),
      } : { kind: "resolved", call: Object.freeze({ ...call, discardResult: true as const }) };
    },
  });
}

export const csharpErrorSourceProfilePropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze(
    owners.flatMap((owner) =>
      errorProperties.map(property => Object.freeze({
        source: errorIdentity(owner, "member", property.sourceName),
        select: (context: CsharpSourceProfilePropertyPolicyContext): CsharpSourceProfilePropertyPolicyResult | undefined =>
          selectNativeErrorProperty(context.host, property, context.receiverType, context.source.accessMode),
      })),
    ),
  );

export function selectCsharpErrorNativeProperty(
  host: Pick<CsharpSourceProfilePropertyPolicyContext["host"], "providers" | "projectTypes" | "typeDefinitions">,
  identity: CsharpSourceProfileDeclarationIdentity,
  receiverType: TargetTypeRef,
): CsharpSourceProfilePropertyPolicyResult | undefined {
  if (!owners.includes(identity.owner) || identity.kind !== "member" || identity.declaringName !== "Error") return undefined;
  const property = errorProperties.find(property => property.sourceName === identity.name);
  return property === undefined ? undefined : selectNativeErrorProperty(host, property, receiverType, "read");
}

function selectNativeErrorProperty(
  host: Pick<CsharpSourceProfilePropertyPolicyContext["host"], "providers" | "projectTypes" | "typeDefinitions">,
  property: typeof errorProperties[number],
  receiverType: TargetTypeRef | undefined,
  accessMode: CsharpSourceProfilePropertyPolicyContext["source"]["accessMode"],
): CsharpSourceProfilePropertyPolicyResult | undefined {
  const { native } = property;
  const exception = host.providers.publishNativeIdentities(exceptionType);
  if (exception.kind === "rejected") return exception;
  if (exception.kind !== "resolved") return undefined;
  const receiver = getCsharpNullableElementTargetType(receiverType) ?? receiverType;
  if (receiver === undefined) return undefined;
  if (!namedTargetTypeImplicitlyAccepts(host, receiver, exception.value, new Set())) return {
    kind: "rejected",
    diagnostic: csharpSourceProfileDiagnostic("CSHARP_ERROR_NATIVE_STORAGE_NOT_PROVEN", 9100954,
      "The selected Error field requires its exact native Exception hierarchy.", []),
  };
  if (accessMode !== "read") return {
    kind: "rejected",
    diagnostic: csharpSourceProfileDiagnostic("CSHARP_ERROR_READONLY_STORAGE", 9100953,
      "C# exceptions are immutable after construction; create a new Error or pass the message to super instead.", []),
  };
  const published = host.providers.publishNativeIdentities(native);
  return published.kind === "resolved" ? published.value : published.kind === "rejected" ? published : undefined;
}

function errorCallPolicy(
  owner: CsharpSourceProfileOwner,
  kind: "call" | "construct",
  name: CsharpSourceErrorName,
): CsharpSourceProfileCallPolicy {
  const source = { ...errorIdentity(owner, kind), declaringName: `${name}Constructor` };
  const type = csharpSourceErrorTargetType(name);
  const constructor = { ...errorConstructor, id: `${type.id}..ctor`, targetName: name === "Error" ? "Exception" : name,
    declaringType: type, returnType: type };
  return Object.freeze({
    source,
    inputRequirements: { errorCause: true as const, objectShapes: true as const },
    ...(kind === "construct" ? { inheritableConstructor: constructor } : {}),
    select(
      context: CsharpSourceProfileCallPolicyContext,
    ): CsharpSourceProfileCallPolicyResult {
      const member = context.host.providers.publishNativeIdentities(constructor);
      if (member.kind === "rejected") return member;
      const call = member.kind !== "resolved" ? undefined : csharpSourceProfileCall(
        context.source,
        member.value,
        noReceiver,
      );
      const withOptions = context.source.sourceArguments[1] !== undefined;
      const cause = context.inputs.errorCause;
      const projected = call === undefined || withOptions && cause?.kind !== "resolved" ? undefined : withOptions && cause?.kind === "resolved"
        ? Object.freeze({ ...call, arguments: Object.freeze(call.arguments.map(argument => argument.sourceArgumentIndex === 1
          ? Object.freeze({ ...argument, projection: cause.projection }) : argument)) }) : call;
      return projected === undefined
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
        : { kind: "resolved", call: projected };
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
