import type { CsharpArtifactGraphScope } from "../engine.js";
import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../../../target-model/types/index.js";
import { targetTypeRefEquals } from "../../../../../target-model/types/index.js";

export function resolveCsharpSourceClassStorage(
  { host }: CsharpArtifactGraphScope,
  type: TargetTypeRef,
): { readonly declaration: CsharpObjectShapeFact; readonly baseType?: TargetTypeRef } | undefined {
  if (type.kind !== "target-named" ||
    (type as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "class") return undefined;
  const heritage = host.projectTypes?.heritageForTarget(type);
  if (heritage?.definition.kind !== "class") return undefined;
  const declaration = host.objectShapes.resolveNode(heritage.definition.declaration, heritage.definition.sourceFile);
  if (declaration?.targetType.kind !== "target-named" ||
    declaration.targetType.id !== type.id ||
    (declaration.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "class" ||
    (declaration.targetType.typeArguments?.length ?? 0) !== heritage.definition.typeParameterBindings.length ||
    !(declaration.targetType.typeArguments ?? []).every((argument, argumentIndex) =>
      targetTypeRefEquals(argument, heritage.definition.typeParameterBindings[argumentIndex]!))) return undefined;
  return { declaration, ...(heritage.baseType === undefined ? {} : { baseType: heritage.baseType }) };
}
