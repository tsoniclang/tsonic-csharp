import type {
  TargetBindingFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
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
  const originalCsharp = original as CsharpTargetNamedTypeRef;
  let preserved: CsharpTargetNamedTypeRef = {
    ...enriched,
    ...(originalCsharp.csharpRender !== undefined ? { csharpRender: originalCsharp.csharpRender } : {}),
    ...(originalCsharp.csharpSpecialType !== undefined ? { csharpSpecialType: originalCsharp.csharpSpecialType } : {}),
    ...(originalCsharp.csharpTypeofRuntimeKind !== undefined ? { csharpTypeofRuntimeKind: originalCsharp.csharpTypeofRuntimeKind } : {}),
    ...(originalCsharp.csharpThrowable === true ? { csharpThrowable: true as const } : {}),
    ...(originalCsharp.csharpValueType === true ? { csharpValueType: true as const } : {}),
    ...(originalCsharp.csharpSourceDeclarationKind !== undefined ? { csharpSourceDeclarationKind: originalCsharp.csharpSourceDeclarationKind } : {}),
  };
  const arrayLiteralElementType = (original as CsharpTargetNamedTypeRef).csharpArrayLiteralElementType;
  const arrayLiteralConstructionType = (original as CsharpTargetNamedTypeRef).csharpArrayLiteralConstructionType;
  const enumerableElementType = (original as CsharpTargetNamedTypeRef).csharpEnumerableElementType;
  const readOnlyIndexableElementType = (original as CsharpTargetNamedTypeRef).csharpReadOnlyIndexableElementType;
  const denseMutableElementType = (original as CsharpTargetNamedTypeRef).csharpDenseMutableElementType;
  const enrichedArrayLiteralElementType = enrichOptionalCsharpTargetTypeRef(arrayLiteralElementType, host);
  const enrichedArrayLiteralConstructionType = enrichOptionalCsharpTargetTypeRef(arrayLiteralConstructionType, host);
  const enrichedEnumerableElementType = enrichOptionalCsharpTargetTypeRef(enumerableElementType, host);
  const enrichedReadOnlyIndexableElementType = enrichOptionalCsharpTargetTypeRef(readOnlyIndexableElementType, host);
  const enrichedDenseMutableElementType = enrichOptionalCsharpTargetTypeRef(denseMutableElementType, host);
  preserved = {
    ...preserved,
    ...(enrichedArrayLiteralElementType !== undefined ? { csharpArrayLiteralElementType: enrichedArrayLiteralElementType } : {}),
    ...(enrichedArrayLiteralConstructionType !== undefined ? { csharpArrayLiteralConstructionType: enrichedArrayLiteralConstructionType } : {}),
    ...(enrichedEnumerableElementType !== undefined ? { csharpEnumerableElementType: enrichedEnumerableElementType } : {}),
    ...(enrichedReadOnlyIndexableElementType !== undefined ? { csharpReadOnlyIndexableElementType: enrichedReadOnlyIndexableElementType } : {}),
    ...(enrichedDenseMutableElementType !== undefined ? { csharpDenseMutableElementType: enrichedDenseMutableElementType } : {}),
  };
  return preserved;
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
