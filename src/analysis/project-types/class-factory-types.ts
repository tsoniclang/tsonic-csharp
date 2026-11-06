import type { AstReader } from "@tsonic/tsts";
import type { CsharpProjectTypeCatalog } from "../../target-model/records/types/project-types.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import { csharpClassFactoryTargetType } from "../../target-model/types/carriers/class-factories.js";

export function selectCsharpClassFactoryType(
  ast: AstReader,
  catalog: CsharpProjectTypeCatalog,
  instance: TargetTypeRef | undefined,
): CsharpTargetNamedTypeRef | undefined {
  const owner = catalog.definitionForTarget(instance);
  if (instance?.kind !== "target-named" || owner?.kind !== "class" || owner.local !== true ||
    owner.abstract || owner.factoryName === undefined) return undefined;
  const names = new Set(ast.members(owner.declaration).flatMap(member => {
    const name = ast.name(member);
    return name !== undefined && (ast.is.IsIdentifier(name) || ast.is.IsStringLiteral(name)) ? [ast.text(name)] : [];
  }));
  let createMethodName = "Create";
  while (names.has(createMethodName)) createMethodName = `_${createMethodName}`;
  names.add(createMethodName);
  let instanceTestMethodName = "IsInstance";
  while (names.has(instanceTestMethodName)) instanceTestMethodName = `_${instanceTestMethodName}`;
  return csharpClassFactoryTargetType(owner.declaration, instance, owner.factoryName,
    owner.outerTypeParameters.length + owner.outerTypeProjections.length, createMethodName, instanceTestMethodName);
}
