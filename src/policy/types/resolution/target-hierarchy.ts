import type {
  CsharpProviderRelationResolver,
} from "../../../providers/model/relation-resolver.js";
import type {
  CsharpProjectTypePolicy,
} from "../project/project-types.js";
import type {
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "../../../target-model/types/model.js";
import {
  csharpTargetBindingFact,
} from "../../../target-model/types/model.js";
import {
  csharpBaseTargetTypeFromBinding,
} from "../storage/bindings.js";
import {
  targetTypeRefKey,
} from "../../../target-model/types/equality.js";
import {
  isCsharpThrowableTargetType,
} from "../../../target-model/types/identity.js";

export interface CsharpTargetTypeHierarchyHost {
  readonly projectTypes: Pick<CsharpProjectTypePolicy, "directSupertypes">;
  readonly providers: Pick<CsharpProviderRelationResolver, "findTargetBindingByTargetId">;
}

export function isCsharpThrowableType(
  host: CsharpTargetTypeHierarchyHost,
  type: TargetTypeRef | undefined,
): boolean {
  if (type === undefined) {
    return false;
  }
  const pending: TargetTypeRef[] = [type];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const candidate = pending.shift()!;
    const key = targetTypeRefKey(candidate);
    if (visited.has(key)) {
      continue;
    }
    visited.add(key);
    if (isCsharpThrowableTargetType(candidate)) {
      return true;
    }
    pending.push(...(host.projectTypes.directSupertypes(candidate) ?? []));
    if (candidate.kind !== "target-named") {
      continue;
    }
    const declaredBaseType =
      (candidate as CsharpTargetNamedTypeRef).csharpBaseType;
    if (declaredBaseType !== undefined) {
      pending.push(declaredBaseType);
    }
    const binding = csharpTargetBindingFact(
      host.providers.findTargetBindingByTargetId(candidate.id),
    );
    if (isCsharpThrowableTargetType(binding?.csharpType)) {
      return true;
    }
    const baseType = binding === undefined
      ? undefined
      : csharpBaseTargetTypeFromBinding(
          binding,
          candidate.typeArguments ?? [],
        );
    if (baseType !== undefined) {
      pending.push(baseType);
    }
  }
  return false;
}
