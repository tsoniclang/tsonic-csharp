import type {
  TargetBindingFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpObjectShapeFact,
} from "../../csharp-facts.js";
import {
  type CsharpRuntimeUnionTargetTypeRef,
  type CsharpTaskTargetTypeRef,
  type CsharpTargetNamedTypeRef,
  csharpRenderShapeForTargetNamedType,
  csharpTargetNamedType,
  csharpTargetTypeFromBinding,
} from "../target-types.js";
import type {
  CsharpTargetEnrichmentHost,
} from "./types.js";

export function getCsharpTargetTypeFromBinding(
  binding: TargetBindingFact,
  typeArguments: readonly TargetTypeRef[],
  host: CsharpTargetEnrichmentHost,
): TargetTypeRef | undefined {
  const enrichedBinding = binding.target === "csharp"
    ? host.getCsharpTargetBindingByTargetId(binding.id) ?? binding
    : binding;
  return csharpTargetTypeFromBinding(enrichedBinding, typeArguments);
}

export function enrichCsharpTargetTypeRef(
  type: TargetTypeRef | undefined,
  host: CsharpTargetEnrichmentHost,
): TargetTypeRef | undefined {
  if (type === undefined) {
    return undefined;
  }
  switch (type.kind) {
    case "source-primitive":
    case "type-parameter":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return type;
    case "source-global": {
      const typeArguments = enrichCsharpTargetTypeRefs(type.typeArguments ?? [], host);
      return typeArguments === undefined
        ? undefined
        : {
            ...type,
            ...(type.typeArguments === undefined ? {} : { typeArguments }),
          };
    }
    case "target-named": {
      const typeArguments = enrichCsharpTargetTypeRefs(type.typeArguments ?? [], host);
      if (typeArguments === undefined) {
        return undefined;
      }
      const binding = host.getCsharpTargetBindingByTargetId(type.id);
      if (binding !== undefined) {
        return preserveCsharpTargetNamedMetadata(
          csharpTargetTypeFromBinding(binding, typeArguments),
          type,
          host,
        );
      }
      const known = csharpTargetNamedType(type.id, typeArguments);
      const candidate = {
        ...known,
        ...type,
        ...(typeArguments.length > 0 ? { typeArguments } : {}),
      };
      return csharpRenderShapeForTargetNamedType(candidate) === undefined ? undefined : candidate;
    }
    case "array": {
      const element = enrichCsharpTargetTypeRef(type.element, host);
      return element === undefined
        ? undefined
        : {
            ...type,
            element,
          };
    }
    case "tuple": {
      const elements = enrichCsharpTargetTypeRefs(type.elements, host);
      return elements === undefined
        ? undefined
        : {
            ...type,
            elements,
          };
    }
    case "pointer": {
      const pointee = enrichCsharpTargetTypeRef(type.pointee, host);
      return pointee === undefined
        ? undefined
        : {
            ...type,
            pointee,
          };
    }
    case "function-pointer": {
      const args = enrichCsharpTargetTypeRefs(type.args, host);
      const result = enrichCsharpTargetTypeRef(type.result, host);
      return args === undefined || result === undefined
        ? undefined
        : {
            ...type,
            args,
            result,
          };
    }
    case "associated-type": {
      const owner = enrichCsharpTargetTypeRef(type.owner, host);
      return owner === undefined
        ? undefined
        : {
            ...type,
            owner,
          };
    }
  }
}

function preserveCsharpTargetNamedMetadata(
  enriched: TargetTypeRef | undefined,
  original: Extract<TargetTypeRef, { readonly kind: "target-named" }>,
  host: CsharpTargetEnrichmentHost,
): TargetTypeRef | undefined {
  if (enriched?.kind !== "target-named") {
    return enriched;
  }
  type EnrichableCsharpTargetNamedTypeRef = CsharpTargetNamedTypeRef &
    Partial<CsharpTaskTargetTypeRef> &
    Partial<CsharpRuntimeUnionTargetTypeRef>;
  const originalCsharp = original as EnrichableCsharpTargetNamedTypeRef;
  const enrichedCsharp = enriched as EnrichableCsharpTargetNamedTypeRef;
  const combined: EnrichableCsharpTargetNamedTypeRef = {
    ...enriched,
    ...originalCsharp,
    ...(enrichedCsharp.typeArguments === undefined ? {} : { typeArguments: enrichedCsharp.typeArguments }),
  };
  const arrayLiteralElementType = combined.csharpArrayLiteralElementType;
  const arrayLiteralConstructionType = combined.csharpArrayLiteralConstructionType;
  const enumerableElementType = combined.csharpEnumerableElementType;
  const readOnlyIndexableElementType = combined.csharpReadOnlyIndexableElementType;
  const denseMutableElementType = combined.csharpDenseMutableElementType;
  const baseType = combined.csharpBaseType;
  const taskResultType = combined.csharpTaskResultType;
  const runtimeUnionArms = combined.csharpRuntimeUnionArms;
  const runtimeUnionObjectShapes = combined.csharpRuntimeUnionObjectShapes;
  const delegateSignature = combined.csharpDelegateSignature;
  const enrichedArrayLiteralElementType = enrichOptionalCsharpTargetTypeRef(arrayLiteralElementType, host);
  const enrichedArrayLiteralConstructionType = enrichOptionalCsharpTargetTypeRef(arrayLiteralConstructionType, host);
  const enrichedEnumerableElementType = enrichOptionalCsharpTargetTypeRef(enumerableElementType, host);
  const enrichedReadOnlyIndexableElementType = enrichOptionalCsharpTargetTypeRef(readOnlyIndexableElementType, host);
  const enrichedDenseMutableElementType = enrichOptionalCsharpTargetTypeRef(denseMutableElementType, host);
  const enrichedBaseType = enrichOptionalCsharpTargetTypeRef(baseType, host);
  const enrichedTaskResultType = enrichOptionalCsharpTargetTypeRef(taskResultType, host);
  const enrichedRuntimeUnionArms = runtimeUnionArms === undefined
    ? undefined
    : enrichCsharpTargetTypeRefs(runtimeUnionArms, host);
  const enrichedRuntimeUnionObjectShapes = runtimeUnionObjectShapes === undefined
    ? undefined
    : enrichCsharpObjectShapeFacts(runtimeUnionObjectShapes, host);
  const enrichedDelegateParameters = delegateSignature === undefined
    ? undefined
    : enrichCsharpTargetTypeRefs(delegateSignature.parameters, host);
  const enrichedDelegateReturnType = delegateSignature === undefined
    ? undefined
    : enrichCsharpTargetTypeRef(delegateSignature.returnType, host);
  if (
    (arrayLiteralElementType !== undefined && enrichedArrayLiteralElementType === undefined) ||
    (arrayLiteralConstructionType !== undefined && enrichedArrayLiteralConstructionType === undefined) ||
    (enumerableElementType !== undefined && enrichedEnumerableElementType === undefined) ||
    (readOnlyIndexableElementType !== undefined && enrichedReadOnlyIndexableElementType === undefined) ||
    (denseMutableElementType !== undefined && enrichedDenseMutableElementType === undefined) ||
    (baseType !== undefined && enrichedBaseType === undefined) ||
    (taskResultType !== undefined && enrichedTaskResultType === undefined) ||
    (runtimeUnionArms !== undefined && enrichedRuntimeUnionArms === undefined) ||
    (runtimeUnionObjectShapes !== undefined && enrichedRuntimeUnionObjectShapes === undefined) ||
    (delegateSignature !== undefined && (enrichedDelegateParameters === undefined || enrichedDelegateReturnType === undefined))
  ) {
    return undefined;
  }
  return {
    ...combined,
    ...(enrichedArrayLiteralElementType !== undefined ? { csharpArrayLiteralElementType: enrichedArrayLiteralElementType } : {}),
    ...(enrichedArrayLiteralConstructionType !== undefined ? { csharpArrayLiteralConstructionType: enrichedArrayLiteralConstructionType } : {}),
    ...(enrichedEnumerableElementType !== undefined ? { csharpEnumerableElementType: enrichedEnumerableElementType } : {}),
    ...(enrichedReadOnlyIndexableElementType !== undefined ? { csharpReadOnlyIndexableElementType: enrichedReadOnlyIndexableElementType } : {}),
    ...(enrichedDenseMutableElementType !== undefined ? { csharpDenseMutableElementType: enrichedDenseMutableElementType } : {}),
    ...(enrichedBaseType !== undefined ? { csharpBaseType: enrichedBaseType } : {}),
    ...(enrichedTaskResultType !== undefined ? { csharpTaskResultType: enrichedTaskResultType } : {}),
    ...(enrichedRuntimeUnionArms !== undefined ? { csharpRuntimeUnionArms: enrichedRuntimeUnionArms } : {}),
    ...(enrichedRuntimeUnionObjectShapes !== undefined ? { csharpRuntimeUnionObjectShapes: enrichedRuntimeUnionObjectShapes } : {}),
    ...(delegateSignature === undefined
      ? {}
      : {
          csharpDelegateSignature: {
            parameters: enrichedDelegateParameters!,
            returnType: enrichedDelegateReturnType!,
          },
        }),
  };
}

function enrichCsharpObjectShapeFacts(
  objectShapes: readonly (CsharpObjectShapeFact | undefined)[],
  host: CsharpTargetEnrichmentHost,
): readonly (CsharpObjectShapeFact | undefined)[] | undefined {
  const enriched = objectShapes.map((objectShape) =>
    objectShape === undefined ? undefined : enrichCsharpObjectShapeFact(objectShape, host)
  );
  return enriched.some((objectShape, index) => objectShapes[index] !== undefined && objectShape === undefined)
    ? undefined
    : enriched;
}

function enrichCsharpObjectShapeFact(
  objectShape: CsharpObjectShapeFact,
  host: CsharpTargetEnrichmentHost,
): CsharpObjectShapeFact | undefined {
  const targetType = enrichCsharpTargetTypeRef(objectShape.targetType, host);
  const members = objectShape.members.map((member) => {
    const type = enrichCsharpTargetTypeRef(member.type, host);
    return type === undefined ? undefined : { ...member, type };
  });
  const implementedTypes = objectShape.implements === undefined
    ? undefined
    : enrichCsharpTargetTypeRefs(objectShape.implements, host);
  if (
    targetType === undefined ||
    members.some((member) => member === undefined) ||
    (objectShape.implements !== undefined && implementedTypes === undefined)
  ) {
    return undefined;
  }
  return {
    ...objectShape,
    targetType,
    members: members as CsharpObjectShapeFact["members"],
    ...(implementedTypes === undefined ? {} : { implements: implementedTypes }),
  };
}

function enrichOptionalCsharpTargetTypeRef(
  type: TargetTypeRef | undefined,
  host: CsharpTargetEnrichmentHost,
): TargetTypeRef | undefined {
  return type === undefined ? undefined : enrichCsharpTargetTypeRef(type, host);
}

function enrichCsharpTargetTypeRefs(
  types: readonly TargetTypeRef[],
  host: CsharpTargetEnrichmentHost,
): readonly TargetTypeRef[] | undefined {
  const enriched = types.map((type) => enrichCsharpTargetTypeRef(type, host));
  return enriched.some((type) => type === undefined)
    ? undefined
    : enriched as readonly TargetTypeRef[];
}
