import type { CsharpPlanningContext } from "../../context.js";
import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import type {
  TargetTypeRef,
} from "../../../../target-model/types/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../types/target-types.js";
import { failCsharpPlannerInvariant, unsupportedNodeDiagnostic } from "../../diagnostics.js";

export interface CsharpClassHeritage {
  readonly baseType?: CsharpTypeNode;
  readonly interfaces: readonly CsharpTypeNode[];
}

export function planClassHeritage(
  classDeclaration: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
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
        diagnostics,
      );
  const interfaces = planHeritageTypes(
    input.scope.typeParameterNames,
    heritage.interfaces,
    classDeclaration,
    diagnostics,
  );
  return baseType === undefined ? { interfaces } : { baseType, interfaces };
}

export function planInterfaceHeritage(
  interfaceDeclaration: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
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
    diagnostics,
  );
}

function planHeritageTypes(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  types: readonly TargetTypeRef[],
  declaration: Node,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeNode[] {
  return types.flatMap((type) => {
    const planned = planHeritageType(
      typeParameterNames,
      type,
      declaration,
      diagnostics,
    );
    return planned === undefined ? [] : [planned];
  });
}

function planHeritageType(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  type: TargetTypeRef,
  declaration: Node,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const planned = csharpTypeFromTargetTypeRef(type, typeParameterNames);
  if (planned === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      declaration,
      "Canonical project heritage contains a target type that cannot be rendered in C#.",
    ));
  }
  return planned;
}
