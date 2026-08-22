import type { CsharpPlanningContext } from "../context.js";
import { AsTypeParameterDeclaration } from "@tsonic/target-api/source";
import type { Node } from "@tsonic/tsts";

import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpGenericConstraint, CsharpTypeParameter } from "../../target-ast/roslyn/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { planIdentifierName } from "../names/source-identifiers.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import type {
  CsharpTypeParameterConstraint,
} from "../../../target-model/declarations/generic-constraints.js";

export function planTypeParameters(
  nodes: readonly (Node | undefined)[],
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeParameter[] {
  return nodes
    .filter((node): node is Node => node !== undefined)
    .map((node) => planTypeParameter(node, input, diagnostics));
}

function planTypeParameter(
  node: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpTypeParameter {
  const declaration = AsTypeParameterDeclaration(input.program.source.ast, node)!;
  const name = planIdentifierName(declaration.name, "T", input, diagnostics, "Type parameter name");
  const constraints = planTypeParameterConstraints(node, input, diagnostics);
  if (declaration.Expression !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Expression-based generic type parameters are outside the current C# planning surface."));
  }
  return {
    name,
    ...(constraints.length === 0 ? {} : { constraints }),
  };
}

function planTypeParameterConstraints(
  node: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpGenericConstraint[] {
  const declaration = AsTypeParameterDeclaration(input.program.source.ast, node)!;
  const typeParameterName = input.program.source.ast.text(declaration.name);
  const resolution = input.program.sourceEvidence.typeParameterConstraints(
    node,
  );
  if (resolution === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      declaration.Constraint ?? node,
      `C# planning received type parameter '${typeParameterName}' without a sealed target constraint classification.`,
    ));
    return [];
  }
  if (resolution.kind === "unsupported") {
    diagnostics.push(unsupportedNodeDiagnostic(
      declaration.Constraint ?? node,
      resolution.reason,
    ));
    return [];
  }
  return resolution.constraints
    .map((constraint) =>
      csharpGenericConstraintFromTargetTypeParameterConstraint(
        constraint,
        node,
        diagnostics,
      ))
    .filter(
      (constraint): constraint is CsharpGenericConstraint =>
        constraint !== undefined,
    );
}

function csharpGenericConstraintFromTargetTypeParameterConstraint(
  constraint: CsharpTypeParameterConstraint,
  sourceNode: Node,
  diagnostics: TargetDiagnostic[],
): CsharpGenericConstraint | undefined {
  if (constraint.kind === "type") {
    const csharpType = csharpTypeFromTargetTypeRef(constraint.type);
    if (csharpType !== undefined) {
      return { kind: "TypeConstraint", type: csharpType };
    }
    diagnostics.push(unsupportedNodeDiagnostic(
      sourceNode,
      "C# emission could not render finalized provider type-parameter constraint facts.",
    ));
    return undefined;
  }
  if (constraint.kind === "keyword") {
    return { kind: "KeywordConstraint", keyword: constraint.keyword };
  }
  if (constraint.kind === "constructor") {
    return { kind: "ConstructorConstraint" };
  }
  diagnostics.push(unsupportedNodeDiagnostic(
    sourceNode,
    "C# emission does not support the selected target type-parameter constraint.",
  ));
  return undefined;
}
