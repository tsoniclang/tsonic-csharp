import type { CsharpPlanningContext } from "../../context.js";
import type { Node } from "@tsonic/tsts";
import type { CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import type {
  TargetTypeRef,
} from "../../../../target-model/types/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../types/target-types.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";

export interface CsharpClassHeritage {
  readonly baseType?: CsharpTypeNode;
  readonly interfaces: readonly CsharpTypeNode[];
}

export function planClassHeritage(
  classDeclaration: Node,
  input: CsharpPlanningContext,
): CsharpClassHeritage {
  const heritage = input.types.projectTypes.heritageForDeclaration(classDeclaration);
  if (heritage === undefined) {
    return failCsharpPlannerInvariant(
      "Project class is absent from the admitted canonical C# project-type model.",
      classDeclaration,
    );
  }
  const baseType = heritage.baseType === undefined
    ? undefined
    : planHeritageType(
        input.scope.typeParameterNames,
        heritage.baseType,
        classDeclaration,
      );
  const interfaces = planHeritageTypes(
    input.scope.typeParameterNames,
    heritage.interfaces,
    classDeclaration,
  );
  return baseType === undefined ? { interfaces } : { baseType, interfaces };
}

export function planInterfaceHeritage(
  interfaceDeclaration: Node,
  input: CsharpPlanningContext,
): readonly CsharpTypeNode[] {
  const heritage = input.types.projectTypes.heritageForDeclaration(
    interfaceDeclaration,
  );
  if (heritage === undefined) {
    return failCsharpPlannerInvariant(
      "Project interface is absent from the admitted canonical C# project-type model.",
      interfaceDeclaration,
    );
  }
  return planHeritageTypes(
    input.scope.typeParameterNames,
    heritage.interfaces,
    interfaceDeclaration,
  );
}

function planHeritageTypes(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  types: readonly TargetTypeRef[],
  declaration: Node,
): readonly CsharpTypeNode[] {
  return types.map((type) => planHeritageType(
      typeParameterNames,
      type,
      declaration,
    ));
}

function planHeritageType(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  type: TargetTypeRef,
  declaration: Node,
): CsharpTypeNode {
  const planned = csharpTypeFromTargetTypeRef(type, typeParameterNames);
  if (planned === undefined) {
    return failCsharpPlannerInvariant("An admitted canonical C# heritage carrier requires its exact renderable type.", declaration);
  }
  return planned;
}
