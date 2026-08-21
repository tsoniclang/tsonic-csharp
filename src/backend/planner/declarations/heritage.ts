import type { CsharpPlanningContext } from "../context.js";
import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import type {
  TargetTypeRef,
} from "../../../policy/types/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";

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
    diagnostics.push(unsupportedNodeDiagnostic(
      classDeclaration,
      "Project class is absent from the canonical C# project-type model.",
    ));
    return { interfaces: [] };
  }
  const baseType = heritage.baseType === undefined
    ? undefined
    : planHeritageType(
        heritage.baseType,
        classDeclaration,
        diagnostics,
      );
  const interfaces = planHeritageTypes(
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
    diagnostics.push(unsupportedNodeDiagnostic(
      interfaceDeclaration,
      "Project interface is absent from the canonical C# project-type model.",
    ));
    return [];
  }
  return planHeritageTypes(
    heritage.interfaces,
    interfaceDeclaration,
    diagnostics,
  );
}

function planHeritageTypes(
  types: readonly TargetTypeRef[],
  declaration: Node,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeNode[] {
  return types.flatMap((type) => {
    const planned = planHeritageType(
      type,
      declaration,
      diagnostics,
    );
    return planned === undefined ? [] : [planned];
  });
}

function planHeritageType(
  type: TargetTypeRef,
  declaration: Node,
  diagnostics: TargetDiagnostic[],
): CsharpTypeNode | undefined {
  const planned = csharpTypeFromTargetTypeRef(type);
  if (planned === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      declaration,
      "Canonical project heritage contains a target type that cannot be rendered in C#.",
    ));
  }
  return planned;
}
