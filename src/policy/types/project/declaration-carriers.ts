import type { CsharpProjectTypeDefinition } from "../../../target-model/records/types/project-types.js";

import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";

import { csharpTargetNamedType } from "../../../target-model/types/factories.js";

export function projectDefinitionTargetType(
  definition: CsharpProjectTypeDefinition,
  typeArguments: readonly TargetTypeRef[],
): CsharpTargetNamedTypeRef {
  return csharpTargetNamedType(definition.id, typeArguments, { kind: "named", name: definition.sourceName,
      ...(definition.scopeName === undefined ? {} : { namespace: [definition.scopeName] }) }, { allowsRefLikeTypeArguments: (typeArguments ?? []).map(() => false), sourceDeclarationKind: definition.kind,
      ...(definition.kind === "class" ? { constraintRequiresReferenceType: true as const } : {}),
      ...(definition.kind === "class" || definition.kind === "interface" || definition.kind === "struct"
        ? { typeofRuntimeKind: "object" as const } : {}) });
}
