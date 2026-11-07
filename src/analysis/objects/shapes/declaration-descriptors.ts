// The open Source type of a project class / interface / struct declaration, as a Host descriptor.
import type { SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { CsharpProjectTypeDefinition } from "../../../target-model/records/types/project-types.js";

/**
 * The declaration's own reference over its own binders (outer binders first, then the declaration's), each binder a
 * type-parameter reference. The project shape of the declaration is the Host members of this descriptor; member keys,
 * member declarations and index signatures do not depend on the instantiation.
 */
export function csharpProjectDeclarationDescriptor(
  definition: Pick<CsharpProjectTypeDefinition, "declaration" | "outerTypeParameters" | "typeParameters">,
): SourceTypeDescriptor {
  const binders = [...definition.outerTypeParameters, ...definition.typeParameters];
  return Object.freeze({ kind: "declared", declaration: definition.declaration, typeArguments: Object.freeze(binders.map(binder =>
    Object.freeze({ kind: "declared" as const, declaration: binder, typeArguments: Object.freeze([]) }))) });
}
