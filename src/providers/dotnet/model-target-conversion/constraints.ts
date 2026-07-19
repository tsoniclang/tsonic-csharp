import type {
  TargetConstraint,
  TargetTypeParameter,
} from "@tsonic/tsts";
import type {
  DotnetConstraint,
  DotnetTypeParameterDeclaration,
  DotnetUnsupportedConstraintDeclaration,
} from "../model-types.js";
import {
  dotnetTypeRefToTargetTypeRef,
} from "./type-ref.js";

export type DotnetTargetTypeParameter = TargetTypeParameter & {
  readonly unsupportedConstraints?: readonly DotnetUnsupportedConstraintDeclaration[];
};

export function dotnetConstraintToTargetConstraint(constraint: DotnetConstraint): TargetConstraint {
  switch (constraint.kind) {
    case "implements": {
      const contract = dotnetTypeRefToTargetTypeRef(constraint.contract);
      if (contract.kind !== "target-named") {
        return {
          kind: "target-specific",
          target: "csharp",
          name: "unsupported-constraint",
          payloadId: unsupportedConstraintPayloadId(
            "implements",
            `non-named-contract:${contract.kind}`,
          ),
        };
      }
      return {
        kind: "implements",
        contract: contract.id,
        ...(contract.typeArguments !== undefined ? { typeArguments: contract.typeArguments } : {}),
      };
    }
    case "value-type":
    case "reference-type":
    case "constructible":
    case "unmanaged":
      return { kind: constraint.kind };
    case "not-null":
      return { kind: "target-specific", target: "csharp", name: "notnull" };
    case "target-specific":
      throw new Error(`Unsupported .NET target-specific constraint '${constraint.name}'. Add a typed TSTS target constraint before exposing this declaration.`);
  }
}

export function dotnetTypeParameterToTargetTypeParameter(parameter: DotnetTypeParameterDeclaration): DotnetTargetTypeParameter {
  const unsupportedConstraints = parameter.unsupportedConstraints?.map(dotnetUnsupportedConstraintToTargetConstraint) ?? [];
  const supportedConstraints = parameter.constraints?.map(dotnetConstraintToTargetConstraint) ?? [];
  return {
    name: parameter.name,
    ...(supportedConstraints.length > 0 || unsupportedConstraints.length > 0
      ? { constraints: [...supportedConstraints, ...unsupportedConstraints] }
      : {}),
    ...(parameter.unsupportedConstraints !== undefined && parameter.unsupportedConstraints.length > 0
      ? { unsupportedConstraints: parameter.unsupportedConstraints }
      : {}),
    ...(parameter.variance !== undefined ? { variance: parameter.variance } : {}),
  };
}

function dotnetUnsupportedConstraintToTargetConstraint(constraint: DotnetUnsupportedConstraintDeclaration): TargetConstraint {
  return {
    kind: "target-specific",
    target: "csharp",
    name: "unsupported-constraint",
    payloadId: unsupportedConstraintPayloadId(
      constraint.targetId,
      constraint.metadataName,
      constraint.reason,
    ),
  };
}

function unsupportedConstraintPayloadId(...parts: readonly string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join("|");
}
