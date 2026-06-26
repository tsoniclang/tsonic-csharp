import type {
  ExtensionObservationContext,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  type CsharpTargetNamedTypeRef,
  csharpDelegateTargetType,
  csharpEnumerableTargetType,
  csharpNullableTargetType,
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
  targetMethod,
  targetParameter,
  targetProperty,
} from "./source-library.js";
import type {
  SourceLibraryDeclaringName,
  SourceLibraryMember,
} from "./source-library.js";
import {
  getSourceStandardLibraryDeclaringNameForType,
} from "../../source-type-classification.js";

const csharpJsMapTypeId = "Tsonic.CSharp.Js.Map`2";
const csharpJsSetTypeId = "Tsonic.CSharp.Js.Set`1";

type CsharpJsMapTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpJsSurfaceKind: "map";
};

type CsharpJsSetTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpJsSurfaceKind: "set";
};

interface CsharpJsCollectionTypePolicy {
  readonly sourceNames: readonly SourceLibraryDeclaringName[];
  readonly targetName: "Map" | "Set";
  readonly typeParameterNames: readonly string[];
  readonly createOpenType: () => TargetTypeRef;
  readonly createClosedType: (typeArguments: readonly TargetTypeRef[]) => TargetTypeRef | undefined;
  readonly isTargetType: (type: TargetTypeRef | undefined) => boolean;
  readonly getIterableElementType: (typeArguments: readonly TargetTypeRef[]) => TargetTypeRef | undefined;
  readonly members: readonly CsharpJsCollectionMemberPolicy[];
}

interface CsharpJsCollectionMemberPolicy {
  readonly sourceName: string;
  readonly createMembers: (
    policy: CsharpJsCollectionTypePolicy,
    declaringType: TargetTypeRef,
    typeArguments: readonly TargetTypeRef[],
  ) => readonly TargetMember[];
}

export function csharpJsMapTargetType(keyType: TargetTypeRef, valueType: TargetTypeRef): CsharpJsMapTargetTypeRef {
  return {
    ...csharpTargetNamedType(
      csharpJsMapTypeId,
      [keyType, valueType],
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Map"),
    ),
    csharpJsSurfaceKind: "map",
  } satisfies CsharpJsMapTargetTypeRef;
}

export function csharpJsSetTargetType(elementType: TargetTypeRef): CsharpJsSetTargetTypeRef {
  return {
    ...csharpTargetNamedType(
      csharpJsSetTypeId,
      [elementType],
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Set"),
    ),
    csharpJsSurfaceKind: "set",
  } satisfies CsharpJsSetTargetTypeRef;
}

export function isCsharpJsMapTargetType(type: TargetTypeRef | undefined): type is CsharpJsMapTargetTypeRef {
  return type?.kind === "target-named" && type.id === csharpJsMapTypeId;
}

export function isCsharpJsSetTargetType(type: TargetTypeRef | undefined): type is CsharpJsSetTargetTypeRef {
  return type?.kind === "target-named" && type.id === csharpJsSetTypeId;
}

export function getCsharpJsIterableElementType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  if (type?.kind !== "target-named") {
    return undefined;
  }
  return collectionPolicyForTargetType(type)?.getIterableElementType(type.typeArguments ?? []);
}

export function createCsharpJsCollectionTargetTypeForSourceType(
  type: Type,
  context: ExtensionObservationContext,
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  return collectionPolicyForSourceType(type, context)?.createClosedType(typeArguments);
}

export function getCollectionTargetMembers(
  sourceMember: SourceLibraryMember,
  receiverType: TargetTypeRef | undefined,
  resultType: TargetTypeRef | undefined,
): readonly TargetMember[] {
  const policy = collectionPolicyForSourceName(sourceMember.declaringName);
  const collectionType = policy === undefined
    ? undefined
    : closedCollectionTypeForPolicy(policy, receiverType, resultType);
  const typeArguments = collectionType?.kind === "target-named" ? collectionType.typeArguments ?? [] : [];
  const memberPolicy = policy?.members.find((member) => member.sourceName === sourceMember.memberName);
  return policy === undefined || collectionType === undefined || memberPolicy === undefined
    ? []
    : memberPolicy.createMembers(policy, collectionType, typeArguments);
}

export function getCollectionPropertyTargetMember(sourceMember: SourceLibraryMember, receiverType: TargetTypeRef | undefined): TargetMember | undefined {
  if (sourceMember.memberName !== "size") {
    return undefined;
  }
  const policy = collectionPolicyForSourceName(sourceMember.declaringName);
  if (policy === undefined || !policy.isTargetType(receiverType)) {
    return undefined;
  }
  return targetProperty(
    `Tsonic.CSharp.Js.${sourceMember.declaringName}.size`,
    "size",
    "size",
    csharpSourcePrimitiveTargetType("int32"),
    { declaringType: receiverType },
  );
}

function closedCollectionTypeForPolicy(
  policy: CsharpJsCollectionTypePolicy,
  receiverType: TargetTypeRef | undefined,
  resultType: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (policy.isTargetType(resultType)) {
    return resultType;
  }
  if (policy.isTargetType(receiverType)) {
    return receiverType;
  }
  return policy.createOpenType();
}

function collectionConstructor(policy: CsharpJsCollectionTypePolicy, id: string, declaringType: TargetTypeRef, parameters: readonly TargetParameter[]): TargetMember {
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

function collectionMethod(
  policy: CsharpJsCollectionTypePolicy,
  sourceName: string,
  declaringType: TargetTypeRef,
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef,
): TargetMember {
  return targetMethod(`Tsonic.CSharp.Js.${policy.targetName}.${sourceName}`, sourceName, sourceName, parameters, returnType, {
    declaringType,
  });
}

function mapForEachMembers(policy: CsharpJsCollectionTypePolicy, mapType: TargetTypeRef, keyType: TargetTypeRef, valueType: TargetTypeRef): readonly TargetMember[] {
  return [
    collectionMethod(policy, "forEach", mapType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [valueType]))], csharpVoidTargetType()),
    collectionMethod(policy, "forEach", mapType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [valueType, keyType]))], csharpVoidTargetType()),
    collectionMethod(policy, "forEach", mapType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [valueType, keyType, mapType]))], csharpVoidTargetType()),
  ];
}

function setForEachMembers(policy: CsharpJsCollectionTypePolicy, setType: TargetTypeRef, elementType: TargetTypeRef): readonly TargetMember[] {
  return [
    collectionMethod(policy, "forEach", setType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [elementType]))], csharpVoidTargetType()),
    collectionMethod(policy, "forEach", setType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [elementType, elementType]))], csharpVoidTargetType()),
    collectionMethod(policy, "forEach", setType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [elementType, elementType, setType]))], csharpVoidTargetType()),
  ];
}

const csharpJsCollectionPolicies: readonly CsharpJsCollectionTypePolicy[] = [
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

const collectionPoliciesBySourceName = new Map<SourceLibraryDeclaringName, CsharpJsCollectionTypePolicy>(
  csharpJsCollectionPolicies.flatMap((policy) =>
    policy.sourceNames.map((sourceName) => [sourceName, policy] as const)
  ),
);

function collectionPolicyForSourceName(sourceName: SourceLibraryDeclaringName): CsharpJsCollectionTypePolicy | undefined {
  return collectionPoliciesBySourceName.get(sourceName);
}

function collectionPolicyForSourceType(type: Type, context: ExtensionObservationContext): CsharpJsCollectionTypePolicy | undefined {
  const declaringName = getSourceStandardLibraryDeclaringNameForType(type, context);
  return declaringName === undefined ? undefined : collectionPolicyForSourceName(declaringName);
}

function collectionPolicyForTargetType(type: TargetTypeRef): CsharpJsCollectionTypePolicy | undefined {
  return csharpJsCollectionPolicies.find((policy) => policy.isTargetType(type));
}

function sameParameterMapPolicies(
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

function noParameterMapPolicies(
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
