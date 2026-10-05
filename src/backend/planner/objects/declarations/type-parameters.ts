import { csharpObjectShapeTypeParameters, csharpFreeTypeParameterIdentities } from "../../../../target-model/types/generic-references.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpTypeParameter,
} from "../../../target-ast/roslyn/index.js";
import type {
  CsharpObjectShapeFact,
} from "../../../../target-model/types/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";
import {
  tryCsharpIdentifier,
} from "../../../../target-model/names/identifiers.js";
import {
  pushObjectShapeDeclarationDiagnostic,
} from "./diagnostics.js";
import { csharpGenericConstraintFromTargetTypeParameterConstraint } from "../../types/type-parameters.js";

export function renderObjectShapeTypeParameters(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  fact: CsharpObjectShapeFact,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
): readonly CsharpTypeParameter[] | undefined {
  if (fact.targetType.kind !== "target-named") {
    return [];
  }
  const declaredTypeParameters: CsharpTypeParameter[] = [];
  const declaredNames = new Set<string>();
  const declaredIdentities = new Set<string>();
  const availableIdentities = new Set((fact.targetType.typeArguments ?? []).filter(argument => argument.kind === "type-parameter")
    .map(argument => argument.identity));
  for (const typeArgument of fact.targetType.typeArguments ?? []) {
    if (typeArgument.kind !== "type-parameter") {
      pushObjectShapeDeclarationDiagnostic(
        diagnostics,
        diagnosticSubject,
        `Generated object-shape carrier '${fact.targetType.id}' may only declare type-parameter target arguments.`,
      );
      return undefined;
    }
    const name = tryCsharpIdentifier(typeParameterNames?.get(typeArgument.identity) ?? typeArgument.name);
    if (name === undefined) {
      pushObjectShapeDeclarationDiagnostic(
        diagnostics,
        diagnosticSubject,
        `Generated object-shape carrier '${fact.targetType.id}' type parameter '${typeArgument.name}' must be a valid C# identifier.`,
      );
      return undefined;
    }
    if (!declaredIdentities.has(typeArgument.identity)) {
      if (declaredNames.has(name)) {
        pushObjectShapeDeclarationDiagnostic(diagnostics, diagnosticSubject,
          `Generated object-shape carrier '${fact.targetType.id}' has conflicting generic binders '${name}'.`);
        return undefined;
      }
      declaredIdentities.add(typeArgument.identity);
      declaredNames.add(name);
      const resolution = typeArgument.csharpConstraints;
      if (resolution === undefined || resolution.kind === "unsupported") {
        pushObjectShapeDeclarationDiagnostic(diagnostics, diagnosticSubject,
          resolution?.kind === "unsupported" ? resolution.reason :
            `Generated object-shape carrier '${fact.targetType.id}' has no sealed constraints for '${typeArgument.name}'.`);
        return undefined;
      }
      const selectedConstraints = resolution.constraints;
      if ([...csharpFreeTypeParameterIdentities(selectedConstraints.flatMap(constraint => constraint.kind === "type" ? [constraint.type] : []))]
          .some(identity => !availableIdentities.has(identity))) {
        pushObjectShapeDeclarationDiagnostic(diagnostics, diagnosticSubject,
          `Generated object-shape carrier '${fact.targetType.id}' has a constraint with an undeclared native generic dependency.`);
        return undefined;
      }
      const constraints = selectedConstraints
        .map(constraint => csharpGenericConstraintFromTargetTypeParameterConstraint(typeParameterNames, constraint,
          typeArgument.csharpDeclaration ?? diagnosticSubject!, diagnostics ?? []));
      if (constraints.some(constraint => constraint === undefined)) return undefined;
      declaredTypeParameters.push({ name,
        ...(constraints.length === 0 ? {} : { constraints: constraints as NonNullable<typeof constraints[number]>[] }),
        ...(fact.covariantTypeParameterIdentities?.includes(typeArgument.identity) === true ? { variance: "out" as const } : {}),
      });
    }
  }
  const usedTypeParameters = csharpObjectShapeTypeParameters(fact.members, fact.implements, fact.methodImplementation);
  for (const parameter of usedTypeParameters) {
    if (!declaredIdentities.has(parameter.identity)) {
      pushObjectShapeDeclarationDiagnostic(
        diagnostics,
        diagnosticSubject,
        `Generated object-shape carrier '${fact.targetType.id}' uses type parameter '${parameter.name}' without declaring it in the finalized target carrier type.`,
      );
      return undefined;
    }
  }
  return declaredTypeParameters;
}
