import type {
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpDelegateTargetType,
  csharpVoidTargetType,
  targetParameter,
} from "../source-library.js";
import type {
  JsSurfaceTargetMemberMetadata,
} from "../target-member-metadata.js";
import type {
  CsharpJsCollectionMemberPolicy,
  CsharpJsCollectionTypePolicy,
} from "./types.js";

export function collectionConstructor(
  policy: CsharpJsCollectionTypePolicy,
  id: string,
  declaringType: TargetTypeRef,
  parameters: readonly TargetParameter[],
): JsSurfaceTargetMemberMetadata {
  return {
    id,
    sourceName: "constructor",
    targetName: policy.targetName,
    kind: "constructor",
    parameters,
    returnType: declaringType,
    declaringType,
  };
}

export function collectionMethod(
  policy: CsharpJsCollectionTypePolicy,
  sourceName: string,
  declaringType: TargetTypeRef,
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef,
): JsSurfaceTargetMemberMetadata {
  return {
    id: `Tsonic.CSharp.Js.${policy.targetName}.${sourceName}`,
    sourceName,
    targetName: sourceName,
    kind: "method",
    parameters,
    returnType,
    declaringType,
  };
}

export function mapForEachMembers(policy: CsharpJsCollectionTypePolicy, mapType: TargetTypeRef, keyType: TargetTypeRef, valueType: TargetTypeRef): readonly JsSurfaceTargetMemberMetadata[] {
  return [
    collectionMethod(policy, "forEach", mapType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [valueType]))], csharpVoidTargetType()),
    collectionMethod(policy, "forEach", mapType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [valueType, keyType]))], csharpVoidTargetType()),
    collectionMethod(policy, "forEach", mapType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [valueType, keyType, mapType]))], csharpVoidTargetType()),
  ];
}

export function setForEachMembers(policy: CsharpJsCollectionTypePolicy, setType: TargetTypeRef, elementType: TargetTypeRef): readonly JsSurfaceTargetMemberMetadata[] {
  return [
    collectionMethod(policy, "forEach", setType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [elementType]))], csharpVoidTargetType()),
    collectionMethod(policy, "forEach", setType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [elementType, elementType]))], csharpVoidTargetType()),
    collectionMethod(policy, "forEach", setType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [elementType, elementType, setType]))], csharpVoidTargetType()),
  ];
}

export function sameParameterMapPolicies(
  sourceNames: readonly string[],
  createParameters: (typeArguments: readonly TargetTypeRef[]) => readonly TargetParameter[],
  createReturnType: (typeArguments: readonly TargetTypeRef[]) => TargetTypeRef | undefined,
): readonly CsharpJsCollectionMemberPolicy[] {
  return sourceNames.map((sourceName) => ({
    sourceName,
    createMembers: (policy, declaringType, typeArguments) => {
      const returnType = typeArguments.length === policy.typeParameterNames.length
        ? createReturnType(typeArguments)
        : undefined;
      return returnType === undefined
        ? []
        : [collectionMethod(policy, sourceName, declaringType, createParameters(typeArguments), returnType)];
    },
  }));
}

export function noParameterMapPolicies(
  sourceNames: readonly string[],
  createReturnType: (typeArguments: readonly TargetTypeRef[]) => TargetTypeRef | undefined,
): readonly CsharpJsCollectionMemberPolicy[] {
  return sourceNames.map((sourceName) => ({
    sourceName,
    createMembers: (policy, declaringType, typeArguments) => {
      const returnType = typeArguments.length === policy.typeParameterNames.length
        ? createReturnType(typeArguments)
        : undefined;
      return returnType === undefined
        ? []
        : [collectionMethod(policy, sourceName, declaringType, [], returnType)];
    },
  }));
}
