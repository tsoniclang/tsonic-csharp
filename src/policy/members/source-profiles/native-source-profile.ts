import type {
  CsharpTargetMember,
  CsharpTargetParameter,
  TargetTypeRef,
} from "../../types/index.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  isCsharpArrayIndexTargetType,
  targetTypeRefEquals,
} from "../../types/index.js";
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
} from "./source-profile-policy.js";
import {
  csharpSourceProfileCall,
  csharpSourceProfileDiagnostic,
} from "./source-profile-policy.js";
import {
  csharpTargetId,
} from "../../../target-model/identities/source.js";

interface NativeStringMethodPolicy {
  readonly source: CsharpSourceProfileIdentitySelector;
  readonly memberName: string;
  readonly returnType: TargetTypeRef;
  readonly parameters: readonly CsharpTargetParameter[];
}

const stringType = csharpStringTargetType();
const intType = csharpSourcePrimitiveTargetType("int32");
const numberType = csharpSourcePrimitiveTargetType("float64");
const boolType = csharpSourcePrimitiveTargetType("bool");
const instanceReceiver = { kind: "instance" } as const;

const nativeStringMethods: readonly NativeStringMethodPolicy[] = Object.freeze([
  nativeStringMethod(
    "Split",
    { kind: "array", element: stringType },
    [nativeParameter("separator", stringType)],
  ),
  ...["StartsWith", "EndsWith", "Contains"].map((memberName) =>
    nativeStringMethod(
      memberName,
      boolType,
      [nativeParameter("value", stringType)],
    )),
  ...["Trim", "ToString"].map((memberName) =>
    nativeStringMethod(memberName, stringType, [])),
]);

export const csharpNativeSourceProfileCallPolicies:
  readonly CsharpSourceProfileCallPolicy[] = Object.freeze(
    nativeStringMethods.map((policy) => ({
      source: policy.source,
      select(
        context: CsharpSourceProfileCallPolicyContext,
      ): CsharpSourceProfileCallPolicyResult {
        const receiverType = context.host.types.resolveType(
          context.source.sourceReceiver?.type,
          context.sourceFile,
        );
        const resultType = context.host.types.resolveType(
          context.source.sourceResultType,
          context.sourceFile,
        );
        if (
          receiverType === undefined ||
          !targetTypeRefEquals(receiverType, stringType) ||
          resultType === undefined ||
          !targetTypeRefEquals(resultType, policy.returnType)
        ) {
          return rejectedNativeProfileOperation(
            `The checked source signature for String.${policy.memberName} does not resolve to its declared C# receiver and result carriers.`,
          );
        }
        const targetMember: CsharpTargetMember = Object.freeze({
          id: `tsonic.csharp.source-profile.String.${policy.memberName}`,
          sourceName: policy.memberName,
          targetName: policy.memberName,
          kind: "method",
          declaringType: stringType,
          parameters: policy.parameters,
          returnType: policy.returnType,
        });
        const call = csharpSourceProfileCall(
          context.source,
          targetMember,
          instanceReceiver,
        );
        return call === undefined
          ? rejectedNativeProfileOperation(
              `The exact source parameters for String.${policy.memberName} do not form a closed C# argument relation.`,
            )
          : { kind: "resolved", call };
      },
    })),
  );

export const csharpNativeSourceProfilePropertyPolicies:
  readonly CsharpSourceProfilePropertyPolicy[] = Object.freeze(
    ["String", "Array", "ReadonlyArray"].map((declaringName) => ({
      source: nativeMemberIdentity(declaringName, "Length"),
      select(
        context: CsharpSourceProfilePropertyPolicyContext,
      ): CsharpSourceProfilePropertyPolicyResult {
        const declaringType = context.host.types.resolveNode(
          context.source.receiver.expression,
          context.sourceFile,
        ) ?? context.host.types.resolveType(
          context.source.receiver.type,
          context.sourceFile,
        );
        const resultType = context.host.types.resolveType(
          context.source.sourceReadType ?? context.source.sourceWriteType,
          context.sourceFile,
        );
        const receiverMatches = declaringType !== undefined &&
          (declaringName === "String"
            ? targetTypeRefEquals(declaringType, stringType)
            : declaringType.kind === "array");
        if (
          declaringType === undefined ||
          !receiverMatches ||
          resultType === undefined ||
          !targetTypeRefEquals(resultType, numberType)
        ) {
          return rejectedNativeProfileProperty(
            `The checked ${declaringName}.Length access does not resolve to its declared C# receiver and source-profile numeric read evidence.`,
          );
        }
        return {
          kind: "resolved",
          targetMember: Object.freeze({
            id: `tsonic.csharp.source-profile.${declaringName}.Length`,
            sourceName: "Length",
            targetName: "Length",
            kind: "property",
            declaringType,
            parameters: [],
            returnType: intType,
            readonly: true,
          }),
          receiver: instanceReceiver,
          invocation: { kind: "member" },
        };
      },
    })),
  );

export const csharpNativeSourceProfileElementPolicies:
  readonly CsharpSourceProfileElementPolicy[] = Object.freeze(
    ["Array", "ReadonlyArray"].map((declaringName) => ({
      source: nativeIndexerIdentity(declaringName),
      select(
        context: CsharpSourceProfileElementPolicyContext,
      ): CsharpSourceProfileElementPolicyResult {
        const declaringType = context.host.types.resolveNode(
          context.source.receiver.expression,
          context.sourceFile,
        ) ?? context.host.types.resolveType(
          context.source.receiver.type,
          context.sourceFile,
        );
        const selectedSourceResult =
          context.source.sourceReadType ?? context.source.sourceWriteType;
        const indexType = context.host.types.resolveNode(
          context.source.argument.expression,
          context.sourceFile,
        ) ?? context.host.types.resolveType(
          context.source.argument.type,
          context.sourceFile,
        );
        if (
          declaringType?.kind !== "array" ||
          selectedSourceResult === undefined
        ) {
          return rejectedNativeProfileElement(
            `The checked ${declaringName} index access does not resolve to one exact native C# array element carrier.`,
          );
        }
        const targetIndexType = indexType !== undefined &&
            isCsharpArrayIndexTargetType(indexType)
          ? indexType
          : intType;
        return {
          kind: "resolved",
          targetMember: Object.freeze({
            id: `tsonic.csharp.source-profile.${declaringName}.indexer`,
            sourceName: "Item",
            targetName: "Item",
            kind: "indexer",
            declaringType,
            parameters: [nativeParameter("index", targetIndexType)],
            returnType: declaringType.element,
            ...(declaringName === "ReadonlyArray"
              ? { readonly: true as const }
              : {}),
          }),
          targetParameterIndex: 0,
          receiver: instanceReceiver,
          invocation: { kind: "indexer" },
        };
      },
    })),
  );

function nativeStringMethod(
  memberName: string,
  returnType: TargetTypeRef,
  parameters: readonly CsharpTargetParameter[],
): NativeStringMethodPolicy {
  return Object.freeze({
    source: nativeMemberIdentity("String", memberName),
    memberName,
    returnType,
    parameters: Object.freeze(parameters),
  });
}

function nativeMemberIdentity(
  declaringName: string,
  name: string,
): CsharpSourceProfileIdentitySelector {
  return Object.freeze({
    owner: csharpTargetId,
    kind: "member",
    declaringName,
    name,
  });
}

function nativeIndexerIdentity(
  declaringName: string,
): CsharpSourceProfileIdentitySelector {
  return Object.freeze({
    owner: csharpTargetId,
    kind: "indexer",
    declaringName,
  });
}

function nativeParameter(
  name: string,
  type: TargetTypeRef,
): CsharpTargetParameter {
  return Object.freeze({
    name,
    type,
    passingMode: "by-value",
  });
}

function rejectedNativeProfileOperation(
  message: string,
): CsharpSourceProfileCallPolicyResult {
  return {
    kind: "rejected",
    diagnostic: nativeProfileDiagnostic(
      "CSHARP_NATIVE_SOURCE_PROFILE_CALL_NOT_CLOSED",
      9100901,
      message,
    ),
  };
}

function rejectedNativeProfileProperty(
  message: string,
): CsharpSourceProfilePropertyPolicyResult {
  return {
    kind: "rejected",
    diagnostic: nativeProfileDiagnostic(
      "CSHARP_NATIVE_SOURCE_PROFILE_PROPERTY_NOT_CLOSED",
      9100902,
      message,
    ),
  };
}

function rejectedNativeProfileElement(
  message: string,
): CsharpSourceProfileElementPolicyResult {
  return {
    kind: "rejected",
    diagnostic: nativeProfileDiagnostic(
      "CSHARP_NATIVE_SOURCE_PROFILE_ELEMENT_NOT_CLOSED",
      9100903,
      message,
    ),
  };
}

function nativeProfileDiagnostic(
  code: string,
  numericCode: number,
  message: string,
) {
  return csharpSourceProfileDiagnostic(code, numericCode, message, [
    "The selected declaration belongs to the explicit C# source profile.",
    "No source-name recovery or target fallback is permitted.",
  ]);
}
