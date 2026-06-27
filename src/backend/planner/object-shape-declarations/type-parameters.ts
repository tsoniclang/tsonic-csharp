import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpTypeParameter,
} from "../../roslyn/syntax.js";
import type {
  CsharpObjectShapeFact,
} from "../../../source/csharp-facts.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  tryCsharpIdentifier,
} from "../identifiers.js";
import {
  pushObjectShapeDeclarationDiagnostic,
} from "./diagnostics.js";

export function renderObjectShapeTypeParameters(
  fact: CsharpObjectShapeFact,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
): readonly CsharpTypeParameter[] | undefined {
  if (fact.targetType.kind !== "target-named") {
    return [];
  }
  const declaredTypeParameters: CsharpTypeParameter[] = [];
  const declaredNames = new Set<string>();
  for (const typeArgument of fact.targetType.typeArguments ?? []) {
    if (typeArgument.kind !== "type-parameter") {
      pushObjectShapeDeclarationDiagnostic(
        diagnostics,
        diagnosticSubject,
        `Generated object-shape carrier '${fact.targetType.id}' may only declare type-parameter target arguments.`,
      );
      return undefined;
    }
    const name = tryCsharpIdentifier(typeArgument.name);
    if (name === undefined) {
      pushObjectShapeDeclarationDiagnostic(
        diagnostics,
        diagnosticSubject,
        `Generated object-shape carrier '${fact.targetType.id}' type parameter '${typeArgument.name}' must be a valid C# identifier.`,
      );
      return undefined;
    }
    if (!declaredNames.has(typeArgument.name)) {
      declaredNames.add(typeArgument.name);
      declaredTypeParameters.push({ name });
    }
  }
  const usedTypeParameters = collectObjectShapeTypeParameterNames(fact);
  for (const usedName of usedTypeParameters) {
    if (!declaredNames.has(usedName)) {
      pushObjectShapeDeclarationDiagnostic(
        diagnostics,
        diagnosticSubject,
        `Generated object-shape carrier '${fact.targetType.id}' uses type parameter '${usedName}' without declaring it in the finalized target carrier type.`,
      );
      return undefined;
    }
  }
  return declaredTypeParameters;
}

function collectObjectShapeTypeParameterNames(
  fact: CsharpObjectShapeFact,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const member of fact.members) {
    collectTargetTypeParameterNames(member.type, names);
  }
  for (const implementedType of fact.implements ?? []) {
    collectTargetTypeParameterNames(implementedType, names);
  }
  return names;
}

function collectTargetTypeParameterNames(
  type: TargetTypeRef,
  names: Set<string>,
): void {
  switch (type.kind) {
    case "type-parameter":
      names.add(type.name);
      return;
    case "target-named":
      for (const typeArgument of type.typeArguments ?? []) {
        collectTargetTypeParameterNames(typeArgument, names);
      }
      return;
    case "array":
      collectTargetTypeParameterNames(type.element, names);
      return;
    case "tuple":
      for (const element of type.elements) {
        collectTargetTypeParameterNames(element, names);
      }
      return;
    case "pointer":
      collectTargetTypeParameterNames(type.pointee, names);
      return;
    case "function-pointer":
      for (const argument of type.args) {
        collectTargetTypeParameterNames(argument, names);
      }
      collectTargetTypeParameterNames(type.result, names);
      return;
    case "associated-type":
      collectTargetTypeParameterNames(type.owner, names);
      return;
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return;
  }
}
