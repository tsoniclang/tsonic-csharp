import type { CsharpPlanningContext } from "../context.js";
import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpGenericConstraint, CsharpTypeParameter } from "../../target-ast/syntax/index.js";
import { planIdentifierName } from "../names/source-identifiers.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import type { CsharpTypeParameterConstraint } from "../../../target-model/types/generic-constraints.js";
import type { CsharpProjectedType } from "../../../target-model/types/projections.js";
import { sanitizeIdentifier } from "../../../target-model/names/identifiers.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

export function planTypeParameters(
  nodes: readonly (Node | undefined)[], input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  owner: Node | undefined = nodes[0] === undefined ? undefined : input.program.source.ast.parent(nodes[0]),
): readonly CsharpTypeParameter[] {
  const projections = owner === undefined ? [] : input.program.records.genericProjection.get(owner);
  return [...nodes.map(node => {
    if (node === undefined) failCsharpPlannerInvariant("An admitted generic declaration requires its dense checked parameter inventory.", owner);
    return planTypeParameter(node, input, diagnostics);
  }), ...planProjectedTypeParameters(projections, owner, input, diagnostics)];
}

export function planOuterTypeParameters(owner: Node, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[]): readonly CsharpTypeParameter[] {
  const definition = input.program.records.projectDeclaration.get(owner);
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
    constraints: parameter.csharpProjectionConstraints.map(constraint =>
      csharpGenericConstraintFromTargetTypeParameterConstraint(input.scope.typeParameterNames, constraint, owner!, diagnostics)),
  }));
}

export function planTypeParameter(node: Node, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[]): CsharpTypeParameter {
  const selected = input.program.records.typeParameterEmission.get(node);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted native generic parameter requires its sealed identity and constraints.", node);
  const scopedName = input.scope.typeParameterNames?.get(selected.identity);
  const name = scopedName === undefined ? planIdentifierName(selected.name, input, "Type parameter name")
    : sanitizeIdentifier(scopedName);
  const constraints = selected.constraints.map(constraint =>
    csharpGenericConstraintFromTargetTypeParameterConstraint(input.scope.typeParameterNames, constraint, node, diagnostics));
  return { name, ...(constraints.length === 0 ? {} : { constraints }) };
}

export function csharpGenericConstraintFromTargetTypeParameterConstraint(
  typeParameterNames: ReadonlyMap<string, string> | undefined, constraint: CsharpTypeParameterConstraint,
  sourceNode: Node, _diagnostics: TargetDiagnostic[],
): CsharpGenericConstraint {
  switch (constraint.kind) {
    case "type": {
      const type = csharpTypeFromTargetTypeRef(constraint.type, typeParameterNames);
      if (type === undefined) failCsharpPlannerInvariant("An admitted native generic constraint requires its exact finalized type syntax.", sourceNode);
      return { kind: "TypeConstraint", type };
    }
    case "keyword": return { kind: "KeywordConstraint", keyword: constraint.keyword };
    case "constructor": return { kind: "ConstructorConstraint" };
  }
}
