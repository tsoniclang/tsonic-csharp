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
import type { CsharpProjectedType } from "../../../target-model/types/projections.js";
import { csharpAuthoredTypeParameterNames, csharpGeneratedTypeParameterNames, csharpSourceTypeParameter } from "../../../target-model/names/type-parameters.js";
import { sanitizeIdentifier } from "../../../target-model/names/identifiers.js";

export function createCsharpTypeParameterPlanningContext(
  owner: Node,
  input: CsharpPlanningContext,
): CsharpPlanningContext {
  const definition = input.types.projectTypes.definitionContainingDeclaration(owner);
  if (definition === undefined || definition.outerTypeParameters.length === 0 && definition.outerTypeProjections.length === 0) return input;
  const parameters = definition.outerTypeParameters.map(parameter => csharpSourceTypeParameter(parameter, input.program.source.ast));
  if (parameters.some(parameter => parameter === undefined)) throw new Error("A lifted C# generic binder requires its sealed source identity.");
  const typeParameterNames = csharpGeneratedTypeParameterNames([
    ...parameters.filter(parameter => parameter !== undefined), ...definition.outerTypeProjections,
  ], [...csharpAuthoredTypeParameterNames(owner, input.program.source.ast),
    ...input.program.typeProjections.get(owner).map(parameter => parameter.name)]);
  return { ...input, scope: { ...input.scope, typeParameterNames } };
}

export function planTypeParameters(
  nodes: readonly (Node | undefined)[],
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  owner: Node | undefined = nodes[0] === undefined ? undefined : input.program.source.ast.parent(nodes[0]),
): readonly CsharpTypeParameter[] {
  const projections = owner === undefined ? [] : input.program.typeProjections.get(owner);
  return [...nodes
    .filter((node): node is Node => node !== undefined)
    .map((node) => planTypeParameter(node, input, diagnostics)), ...planProjectedTypeParameters(projections, owner, input, diagnostics)];
}

export function planOuterTypeParameters(
  owner: Node, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): readonly CsharpTypeParameter[] {
  const definition = input.types.projectTypes.definitionContainingDeclaration(owner);
  return definition === undefined ? [] : [
    ...definition.outerTypeParameters.map(parameter => planTypeParameter(parameter, input, diagnostics)),
    ...planProjectedTypeParameters(definition.outerTypeProjections, owner, input, diagnostics),
  ];
}

function planProjectedTypeParameters(
  projections: readonly CsharpProjectedType[], owner: Node | undefined, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): readonly CsharpTypeParameter[] {
  return projections.map(parameter => ({
      name: sanitizeIdentifier(input.scope.typeParameterNames?.get(parameter.identity) ?? parameter.name),
      constraints: parameter.csharpProjectionConstraints.flatMap(constraint => {
        const selected = csharpGenericConstraintFromTargetTypeParameterConstraint(input.scope.typeParameterNames, constraint, owner!, diagnostics);
        return selected === undefined ? [] : [selected];
      }),
    }));
}

export function planTypeParameter(
  node: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpTypeParameter {
  const declaration = AsTypeParameterDeclaration(input.program.source.ast, node)!;
  const parameter = csharpSourceTypeParameter(node, input.program.source.ast);
  const selectedName = parameter === undefined ? undefined : input.scope.typeParameterNames?.get(parameter.identity);
  const name = selectedName === undefined ? planIdentifierName(declaration.name, "T", input, diagnostics, "Type parameter name")
    : sanitizeIdentifier(selectedName);
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
        input.scope.typeParameterNames,
        constraint,
        node,
        diagnostics,
      ))
    .filter(
      (constraint): constraint is CsharpGenericConstraint =>
        constraint !== undefined,
    );
}

export function csharpGenericConstraintFromTargetTypeParameterConstraint(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  constraint: CsharpTypeParameterConstraint,
  sourceNode: Node,
  diagnostics: TargetDiagnostic[],
): CsharpGenericConstraint | undefined {
  if (constraint.kind === "type") {
    const csharpType = csharpTypeFromTargetTypeRef(constraint.type, typeParameterNames);
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
