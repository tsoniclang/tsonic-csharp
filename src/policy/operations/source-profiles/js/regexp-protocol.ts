import type { CsharpTargetMember, CsharpTargetParameter, TargetTypeRef } from "../../../types/index.js";
import { csharpJsArrayTargetType, csharpJsRegExpMatchArrayTargetType, csharpJsRegExpStringIteratorTargetType } from "../../../../target-model/types/carriers/js.js";
import { csharpNullableTargetType, csharpSourcePrimitiveTargetType, csharpStringTargetType, getCsharpDelegateSignature, csharpDelegateSignaturesMatchNativeBinding, targetTypeRefEquals } from "../../../../target-model/types/index.js";

import type { CsharpSourceProfileCallPolicy } from "../../../model/source-profiles.js";
import { jsRuntimeTargetType, receiverHelperMethod, targetParameter } from "./common.js";

import type { Node } from "@tsonic/tsts";
import type { CsharpObjectShapeMemberFact, CsharpDelegateSignatureShape } from "../../../../target-model/types/model.js";
import type { CsharpCustomRegExpProtocol, CustomRegExpProtocolKind } from "../../../../target-model/records/program/source-profile-inputs.js";
const stringType = csharpStringTargetType();
const doubleType = csharpSourcePrimitiveTargetType("float64");
const regexpProtocolDispatchType = jsRuntimeTargetType("RegExpProtocolDispatch");

export function resolveCustomRegExpProtocol(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  argumentIndex: number, kind: CustomRegExpProtocolKind,
): CsharpCustomRegExpProtocol | undefined {
  return context.inputs.regexpProtocol.get(argumentIndex, kind);
}
export function selectCsharpCustomRegExpProtocol(
  kind: CustomRegExpProtocolKind, receiverType: TargetTypeRef | undefined,
  selectedMember: CsharpObjectShapeMemberFact | undefined, actualMember: CsharpObjectShapeMemberFact | undefined,
  authoredMember: Node, selectedSignature: CsharpDelegateSignatureShape | undefined,
  actualSignature: CsharpDelegateSignatureShape | undefined,
): CsharpCustomRegExpProtocol | undefined {
  const expectedReturn = kind === "match"
    ? csharpNullableTargetType(csharpJsRegExpMatchArrayTargetType())
    : kind === "match-all"
      ? csharpJsRegExpStringIteratorTargetType()
      : kind === "search"
        ? doubleType
        : kind === "split"
          ? actualSignature?.returnType
          : stringType;
  if (
    receiverType === undefined ||
    selectedMember?.memberKind !== "method" ||
    selectedMember.optional === true ||
    selectedMember.sourceDeclarations?.includes(authoredMember) !== true ||
    actualMember?.memberKind !== "method" ||
    actualMember.optional === true ||
    selectedSignature === undefined ||
    actualSignature === undefined ||
    expectedReturn === undefined ||
    kind === "split" && !targetTypeRefEquals(expectedReturn, csharpJsArrayTargetType(stringType)) &&
      !targetTypeRefEquals(expectedReturn, csharpJsArrayTargetType(csharpNullableTargetType(stringType))) ||
    !csharpDelegateSignaturesEqual(selectedSignature, actualSignature) ||
    selectedSignature.parameters[0] === undefined ||
    !targetTypeRefEquals(selectedSignature.parameters[0], stringType) ||
    !targetTypeRefEquals(selectedSignature.returnType, expectedReturn) ||
    (kind === "replace" && selectedSignature.parameters.length !== 2) ||
    (kind === "split" && selectedSignature.parameters.length !== 2) ||
    (kind !== "replace" && kind !== "split" && selectedSignature.parameters.length !== 1)
  ) {
    return undefined;
  }
  return {
    receiverType,
    memberTargetName: actualMember.targetName,
    signature: actualSignature,
  };
}

export function customProtocolTargetMember(
  operation: "match" | "matchAll" | "replace" | "replaceAll" | "search" | "split",
  protocol: NonNullable<ReturnType<typeof resolveCustomRegExpProtocol>>,
  resultType: TargetTypeRef,
  forwardedParameters: readonly CsharpTargetParameter[],
): CsharpTargetMember {
  return receiverHelperMethod(
    `Tsonic.CSharp.Js.RegExpProtocolDispatch.${operation}:${targetTypeKey(protocol.receiverType)}`,
    operation,
    "Invoke",
    regexpProtocolDispatchType,
    stringType,
    [
      targetParameter("protocol", protocol.receiverType),
      ...forwardedParameters,
    ],
    resultType,
    {
      csharpInvocation: {
        kind: "ecmascript-protocol-dispatch",
        protocolTargetParameterIndex: 1,
        protocolMemberName: protocol.memberTargetName,
      },
    },
  );
}

export function resolveStringOperationArgument(
  context: Parameters<CsharpSourceProfileCallPolicy["select"]>[0],
  index: number,
): TargetTypeRef | undefined {
  const argument = context.source.sourceArguments[index];
  return argument === undefined
    ? undefined
    : context.inputs.values.get(argument.expression)?.get(argument.type);
}

export function targetTypeKey(type: TargetTypeRef): string {
  return type.kind === "target-named" ? type.id : type.kind;
}

function csharpDelegateSignaturesEqual(
  left: NonNullable<ReturnType<typeof getCsharpDelegateSignature>>,
  right: NonNullable<ReturnType<typeof getCsharpDelegateSignature>>,
): boolean {
  const leftOptional = left.optionalParameterIndexes ?? [];
  const rightOptional = right.optionalParameterIndexes ?? [];
  return csharpDelegateSignaturesMatchNativeBinding(left, right) &&
    left.restParameterIndex === right.restParameterIndex &&
    leftOptional.length === rightOptional.length &&
    leftOptional.every((index, position) => index === rightOptional[position]);
}
