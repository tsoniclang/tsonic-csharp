import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpGenericProjectionIndex } from "../../../target-model/records/types/type-projections.js";
import type { CsharpProjectTypeDeclaration, CsharpProjectTypeDefinition } from "../../../target-model/records/types/project-types.js";
import type { CsharpTypeProjectionNodeSource } from "../../declarations/type-projection-source.js";
import type { CsharpProjectedType } from "../../../target-model/types/projections.js";

export type CsharpProjectTypeABIProjectionSource =
  | { readonly kind: "declared"; readonly source: CsharpTypeProjectionNodeSource }
  | { readonly kind: "published"; readonly index: CsharpGenericProjectionIndex };

export function completeCsharpProjectTypeABI(
  declared: CsharpProjectTypeDeclaration,
  projections: CsharpProjectTypeABIProjectionSource,
): CsharpProjectTypeDefinition {
  if (projections === undefined || projections.kind !== "declared" && projections.kind !== "published") {
    return failTargetAnalysisInvariant("tsonic-csharp", "A project ABI requires its explicit declared-scope or published-A input.", declared.declaration);
  }
  if (projections.kind === "declared") {
    const scope = projections.source.scopes;
    if (projections.source.node !== declared.declaration || scope?.declaration === declared.declaration &&
      (scope.parameterIdentities.length !== 0 || scope.capturedParameterIdentities.length !== 0)) {
      return failTargetAnalysisInvariant("tsonic-csharp", "A declaration-only project ABI requires its exact absence of a harvesting scope.", declared.declaration);
    }
  }
  const absent: readonly CsharpProjectedType[] = Object.freeze([]);
  const typeProjections = projections.kind === "published" ? projections.index.genericProjection.get(declared.declaration) : absent;
  const outerTypeProjections = projections.kind === "published" ? projections.index.outerGenericProjection.get(declared.declaration) : absent;
  const outerCount = declared.outerTypeParameters.length;
  const selected = Object.freeze({ ...declared, declared, typeProjections, outerTypeProjections,
    typeParameterBindings: Object.freeze([
      ...declared.authoredTypeParameterBindings.slice(0, outerCount), ...outerTypeProjections,
      ...declared.authoredTypeParameterBindings.slice(outerCount), ...typeProjections,
    ]) });
  requireCsharpProjectTypeABI(declared, selected);
  return selected;
}

export function requireCsharpProjectTypeABI(
  declared: CsharpProjectTypeDeclaration,
  definition: CsharpProjectTypeDefinition,
): void {
  if (definition.declared !== declared || definition.id !== declared.id ||
    definition.declaration !== declared.declaration || definition.kind !== declared.kind ||
    definition.sourceFile !== declared.sourceFile || definition.sourceName !== declared.sourceName ||
    definition.authoredTypeParameterBindings !== declared.authoredTypeParameterBindings ||
    definition.outerTypeParameters !== declared.outerTypeParameters || definition.typeParameters !== declared.typeParameters ||
    definition.sourceTypeParameterCount !== declared.sourceTypeParameterCount ||
    definition.staticCompanion !== declared.staticCompanion || definition.abstract !== declared.abstract ||
    definition.publicParameterlessConstructor !== declared.publicParameterlessConstructor || definition.local !== declared.local ||
    definition.scopeName !== declared.scopeName || definition.factoryName !== declared.factoryName ||
    definition.factoryIdentityName !== declared.factoryIdentityName ||
    declared.kind === "enum" && (definition.kind !== "enum" || definition.integerWidth !== declared.integerWidth)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "The physical project ABI must extend its exact declared identity and owners.", declared.declaration);
  }
  const expected = [
    ...declared.authoredTypeParameterBindings.slice(0, declared.outerTypeParameters.length),
    ...definition.outerTypeProjections,
    ...declared.authoredTypeParameterBindings.slice(declared.outerTypeParameters.length),
    ...definition.typeProjections,
  ];
  if (definition.typeParameterBindings.length !== expected.length ||
    expected.some((parameter, index) => definition.typeParameterBindings[index] !== parameter)) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "The physical project ABI requires the same authored binders, constraints and ordered published projections.", declared.declaration);
  }
}
