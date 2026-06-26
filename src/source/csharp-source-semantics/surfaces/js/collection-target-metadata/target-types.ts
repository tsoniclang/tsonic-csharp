import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
} from "../source-library.js";
import {
  resolveCollectionTypeExpression,
} from "./member-builders.js";
import {
  csharpJsMapCollectionPolicy,
} from "./map-policy.js";
import {
  csharpJsSetCollectionPolicy,
} from "./set-policy.js";
import type {
  CsharpJsCollectionTargetTypeRef,
  CsharpJsCollectionTypePolicy,
  CsharpJsMapTargetTypeRef,
  CsharpJsSetTargetTypeRef,
} from "./types.js";

export function createOpenCsharpJsCollectionTargetType(policy: CsharpJsCollectionTypePolicy): CsharpJsCollectionTargetTypeRef | undefined {
  return createCsharpJsCollectionTargetType(
    policy,
    policy.typeParameterNames.map((name): TargetTypeRef => ({ kind: "type-parameter", name })),
  );
}

export function createCsharpJsCollectionTargetType(
  policy: CsharpJsCollectionTypePolicy,
  typeArguments: readonly TargetTypeRef[],
): CsharpJsCollectionTargetTypeRef | undefined {
  if (typeArguments.length !== policy.typeParameterNames.length) {
    return undefined;
  }
  const declaringType = csharpTargetNamedType(
    policy.target.id,
    typeArguments,
    csharpQualifiedTypeRenderShape(policy.target.namespaceName, policy.target.name),
  );
  const enumerableElementType = resolveCollectionTypeExpression({
    policy,
    declaringType,
    typeArguments,
  }, policy.target.enumerableElementType);
  return enumerableElementType === undefined
    ? undefined
    : {
        ...csharpTargetNamedType(
          policy.target.id,
          typeArguments,
          csharpQualifiedTypeRenderShape(policy.target.namespaceName, policy.target.name),
          { enumerableElementType },
        ),
        csharpJsSurfaceKind: policy.target.surfaceKind,
      } satisfies CsharpJsCollectionTargetTypeRef;
}

export function csharpJsCollectionTargetTypeMatches(
  policy: CsharpJsCollectionTypePolicy,
  type: TargetTypeRef | undefined,
): type is CsharpJsCollectionTargetTypeRef {
  return type?.kind === "target-named" && type.id === policy.target.id;
}

export function getCsharpJsCollectionIterableElementType(
  policy: CsharpJsCollectionTypePolicy,
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  const declaringType = createCsharpJsCollectionTargetType(policy, typeArguments);
  return declaringType === undefined
    ? undefined
    : resolveCollectionTypeExpression({
      policy,
      declaringType,
      typeArguments,
    }, policy.target.enumerableElementType);
}

export function csharpJsMapTargetType(keyType: TargetTypeRef, valueType: TargetTypeRef): CsharpJsMapTargetTypeRef {
  return createCsharpJsCollectionTargetType(csharpJsMapCollectionPolicy, [keyType, valueType]) as CsharpJsMapTargetTypeRef;
}

export function csharpJsSetTargetType(elementType: TargetTypeRef): CsharpJsSetTargetTypeRef {
  return createCsharpJsCollectionTargetType(csharpJsSetCollectionPolicy, [elementType]) as CsharpJsSetTargetTypeRef;
}

export function isCsharpJsMapTargetType(type: TargetTypeRef | undefined): type is CsharpJsMapTargetTypeRef {
  return csharpJsCollectionTargetTypeMatches(csharpJsMapCollectionPolicy, type);
}

export function isCsharpJsSetTargetType(type: TargetTypeRef | undefined): type is CsharpJsSetTargetTypeRef {
  return csharpJsCollectionTargetTypeMatches(csharpJsSetCollectionPolicy, type);
}
