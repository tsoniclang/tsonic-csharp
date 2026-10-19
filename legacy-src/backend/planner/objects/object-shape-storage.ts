import type {
  CsharpObjectShapeFact,
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import { csharpRuntimeRecordFieldTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import {
  csharpDelegateTargetType,
  getCsharpDelegateSignature,
  isCsharpVoidTargetType,
} from "../../../target-model/types/index.js";

export function objectShapeMethodStorageTargetType(
  objectShape: CsharpObjectShapeFact,
  member: CsharpObjectShapeFact["members"][number],
  receiverBound: boolean,
): TargetTypeRef | undefined {
  if (member.memberKind !== "method") {
    return undefined;
  }
  if (member.methodStorageType !== undefined) return receiverBound ? undefined : member.methodStorageType;
  const signature = getCsharpDelegateSignature(member.type);
  if (signature === undefined) {
    return undefined;
  }
  if (!receiverBound) {
    return member.type;
  }
  const parameters = [objectShape.targetType, ...signature.parameters];
  return isCsharpVoidTargetType(signature.returnType)
    ? csharpDelegateTargetType("System.Action", parameters)
    : csharpDelegateTargetType("System.Func", parameters, signature.returnType);
}

export function objectShapeBoundStorageTargetType(member: CsharpObjectShapeFact["members"][number]): TargetTypeRef {
  return csharpRuntimeRecordFieldTargetType(member.type);
}
