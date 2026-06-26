import type {
  ExtensionObservationContext,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  csharpEnumerableTargetType,
  csharpNullableTargetType,
  csharpSourcePrimitiveTargetType,
  csharpVoidTargetType,
  targetParameter,
} from "../source-library.js";
import type {
  SourceLibraryMember,
  SourceLibraryMemberIdentityPolicy,
} from "../source-library.js";
import {
  sourceLibraryMemberIdSet,
  sourceLibraryMemberMatches,
} from "../source-library.js";
import {
  getSourceStandardLibraryDeclaringNameForType,
} from "../../../source-type-classification.js";
import {
  collectionConstructor,
  collectionMethod,
  mapForEachMembers,
  noParameterMapPolicies,
  sameParameterMapPolicies,
  setForEachMembers,
} from "./member-builders.js";
import {
  csharpJsMapTargetType,
  csharpJsSetTargetType,
  isCsharpJsMapTargetType,
  isCsharpJsSetTargetType,
} from "./target-types.js";
import type {
  CsharpJsCollectionMemberPolicy,
  CsharpJsCollectionTypePolicy,
} from "./types.js";

export const csharpJsCollectionPolicies: readonly CsharpJsCollectionTypePolicy[] = [
  {
    sourceNames: ["Map", "ReadonlyMap"],
    targetName: "Map",
    typeParameterNames: ["K", "V"],
    createOpenType: () => csharpJsMapTargetType({ kind: "type-parameter", name: "K" }, { kind: "type-parameter", name: "V" }),
    createClosedType: (typeArguments) => {
      const [keyType, valueType] = typeArguments;
      return keyType === undefined || valueType === undefined || typeArguments.length !== 2
        ? undefined
        : csharpJsMapTargetType(keyType, valueType);
    },
    isTargetType: isCsharpJsMapTargetType,
    getIterableElementType: (typeArguments) => {
      const [keyType, valueType] = typeArguments;
      return keyType === undefined || valueType === undefined
        ? undefined
        : { kind: "tuple", elements: [keyType, valueType] };
    },
    members: [
      {
        sourceName: "constructor",
        createMembers: (policy, mapType, [keyType, valueType]) =>
          keyType === undefined || valueType === undefined
            ? []
            : [
                collectionConstructor(policy, "Tsonic.CSharp.Js.Map..ctor()", mapType, []),
                collectionConstructor(policy, "Tsonic.CSharp.Js.Map..ctor(System.Collections.Generic.IEnumerable`1)", mapType, [
                  targetParameter("entries", csharpEnumerableTargetType({ kind: "tuple", elements: [keyType, valueType] })),
                ]),
              ],
      },
      {
        sourceName: "get",
        createMembers: (policy, mapType, [keyType, valueType]) =>
          keyType === undefined || valueType === undefined
            ? []
            : [collectionMethod(policy, "get", mapType, [targetParameter("key", keyType)], csharpNullableTargetType(valueType))],
      },
      {
        sourceName: "set",
        createMembers: (policy, mapType, [keyType, valueType]) =>
          keyType === undefined || valueType === undefined
            ? []
            : [collectionMethod(policy, "set", mapType, [targetParameter("key", keyType), targetParameter("value", valueType)], mapType)],
      },
      ...sameParameterMapPolicies(["has", "delete"], ([keyType]) =>
        keyType === undefined ? [] : [targetParameter("key", keyType)], () => csharpSourcePrimitiveTargetType("bool")),
      ...noParameterMapPolicies(["clear"], () => csharpVoidTargetType()),
      ...noParameterMapPolicies(["keys"], ([keyType]) => keyType === undefined ? undefined : csharpEnumerableTargetType(keyType)),
      ...noParameterMapPolicies(["values"], ([_keyType, valueType]) => valueType === undefined ? undefined : csharpEnumerableTargetType(valueType)),
      ...noParameterMapPolicies(["entries"], ([keyType, valueType]) =>
        keyType === undefined || valueType === undefined
          ? undefined
          : csharpEnumerableTargetType({ kind: "tuple", elements: [keyType, valueType] })),
      {
        sourceName: "forEach",
        createMembers: (policy, mapType, [keyType, valueType]) =>
          keyType === undefined || valueType === undefined
            ? []
            : mapForEachMembers(policy, mapType, keyType, valueType),
      },
    ],
  },
  {
    sourceNames: ["Set", "ReadonlySet"],
    targetName: "Set",
    typeParameterNames: ["T"],
    createOpenType: () => csharpJsSetTargetType({ kind: "type-parameter", name: "T" }),
    createClosedType: (typeArguments) => {
      const [elementType] = typeArguments;
      return elementType === undefined || typeArguments.length !== 1
        ? undefined
        : csharpJsSetTargetType(elementType);
    },
    isTargetType: isCsharpJsSetTargetType,
    getIterableElementType: (typeArguments) => typeArguments[0],
    members: [
      {
        sourceName: "constructor",
        createMembers: (policy, setType, [elementType]) =>
          elementType === undefined
            ? []
            : [
                collectionConstructor(policy, "Tsonic.CSharp.Js.Set..ctor()", setType, []),
                collectionConstructor(policy, "Tsonic.CSharp.Js.Set..ctor(System.Collections.Generic.IEnumerable`1)", setType, [
                  targetParameter("values", csharpEnumerableTargetType(elementType)),
                ]),
              ],
      },
      {
        sourceName: "add",
        createMembers: (policy, setType, [elementType]) =>
          elementType === undefined
            ? []
            : [collectionMethod(policy, "add", setType, [targetParameter("value", elementType)], setType)],
      },
      ...sameParameterMapPolicies(["has", "delete"], ([elementType]) =>
        elementType === undefined ? [] : [targetParameter("value", elementType)], () => csharpSourcePrimitiveTargetType("bool")),
      ...noParameterMapPolicies(["clear"], () => csharpVoidTargetType()),
      ...noParameterMapPolicies(["keys", "values"], ([elementType]) => elementType === undefined ? undefined : csharpEnumerableTargetType(elementType)),
      ...noParameterMapPolicies(["entries"], ([elementType]) =>
        elementType === undefined
          ? undefined
          : csharpEnumerableTargetType({ kind: "tuple", elements: [elementType, elementType] })),
      {
        sourceName: "forEach",
        createMembers: (policy, setType, [elementType]) =>
          elementType === undefined
            ? []
            : setForEachMembers(policy, setType, elementType),
      },
    ],
  },
];

const collectionPoliciesBySourceName = new Map<string, CsharpJsCollectionTypePolicy>(
  csharpJsCollectionPolicies.flatMap((policy) =>
    policy.sourceNames.map((sourceName) => [sourceName, policy] as const)
  ),
);

export function collectionPolicyForSourceName(sourceName: string): CsharpJsCollectionTypePolicy | undefined {
  return collectionPoliciesBySourceName.get(sourceName);
}

export function collectionPolicyForSourceMember(sourceMember: SourceLibraryMember): CsharpJsCollectionTypePolicy | undefined {
  return csharpJsCollectionPolicies.find((policy) =>
    sourceLibraryMemberMatches(sourceMember, sourceMemberIdentityPolicyForCollection(policy))
  );
}

export function collectionMemberPolicyApplies(
  policy: CsharpJsCollectionTypePolicy,
  memberPolicy: CsharpJsCollectionMemberPolicy,
  sourceMember: SourceLibraryMember,
): boolean {
  return sourceLibraryMemberMatches(sourceMember, sourceMemberIdentityPolicyForCollectionMember(policy, memberPolicy));
}

export function collectionPolicyForSourceType(type: Type, context: ExtensionObservationContext): CsharpJsCollectionTypePolicy | undefined {
  const declaringName = getSourceStandardLibraryDeclaringNameForType(type, context);
  return declaringName === undefined ? undefined : collectionPolicyForSourceName(declaringName);
}

export const collectionSizeIdentityPolicy = sourceMemberIdentityPolicyForSourceNames(
  ["Map", "ReadonlyMap", "Set", "ReadonlySet"],
  "size",
);

export function collectionPolicyForTargetType(type: TargetTypeRef): CsharpJsCollectionTypePolicy | undefined {
  return csharpJsCollectionPolicies.find((policy) => policy.isTargetType(type));
}

function sourceMemberIdentityPolicyForCollection(
  policy: CsharpJsCollectionTypePolicy,
): SourceLibraryMemberIdentityPolicy {
  return sourceMemberIdentityPolicyForSourceNames(policy.sourceNames);
}

function sourceMemberIdentityPolicyForCollectionMember(
  policy: CsharpJsCollectionTypePolicy,
  memberPolicy: CsharpJsCollectionMemberPolicy,
): SourceLibraryMemberIdentityPolicy {
  return sourceMemberIdentityPolicyForSourceNames(policy.sourceNames, memberPolicy.sourceName);
}

function sourceMemberIdentityPolicyForSourceNames(
  sourceNames: readonly string[],
  memberName?: string,
): SourceLibraryMemberIdentityPolicy {
  return memberName === undefined
    ? { prefixes: sourceNames.map((sourceName) => `${sourceName}.`) as NonNullable<SourceLibraryMemberIdentityPolicy["prefixes"]> }
    : { ids: sourceLibraryMemberIdSet(sourceNames.map((sourceName) => `${sourceName}.${memberName}`) as Parameters<typeof sourceLibraryMemberIdSet>[0]) };
}
