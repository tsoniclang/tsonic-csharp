import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpGenericProjectionIndex } from "../../../target-model/records/types/type-projections.js";
import type { CsharpProjectTypeDeclaration, CsharpProjectTypeDefinition } from "../../../target-model/records/types/project-types.js";

export function completeCsharpProjectTypeABI(
  declared: CsharpProjectTypeDeclaration,
  projections: CsharpGenericProjectionIndex,
): CsharpProjectTypeDefinition {
  const typeProjections = projections.genericProjection.get(declared.declaration);
  const outerTypeProjections = projections.outerGenericProjection.get(declared.declaration);
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
