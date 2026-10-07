import type { CsharpPlanningContext } from "../../context.js";
import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTypeNode } from "../../../target-ast/roslyn/index.js";
import type {
  CsharpObjectShapeFact,
  TargetTypeRef,
} from "../../../../target-model/types/index.js";
import { targetTypeRefKey } from "../../../../target-model/types/equality.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";

export interface CsharpClassHeritage {
  readonly baseType?: CsharpTypeNode;
  readonly interfaces: readonly CsharpTypeNode[];
}

export function planClassHeritage(
  classDeclaration: Node,
  objectShape: CsharpObjectShapeFact | undefined,
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
        input.scope.typeParameterNames,
        heritage.baseType,
        classDeclaration,
        diagnostics,
      );
  const interfaces = planHeritageTypes(
    input.scope.typeParameterNames,
    heritage.interfaces,
    objectShape,
    classDeclaration,
    diagnostics,
  );
  return baseType === undefined ? { interfaces } : { baseType, interfaces };
}

export function planInterfaceHeritage(
  interfaceDeclaration: Node,
  objectShape: CsharpObjectShapeFact | undefined,
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
    input.scope.typeParameterNames,
    heritage.interfaces,
    objectShape,
    interfaceDeclaration,
    diagnostics,
  );
}

function planHeritageTypes(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  types: readonly TargetTypeRef[],
  objectShape: CsharpObjectShapeFact | undefined,
  declaration: Node,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeNode[] {
  const contracts = [...types, ...objectShape?.implements ?? []];
  return [...new Map(contracts.map(type => [targetTypeRefKey(type), type])).values()].flatMap((type) => {
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
