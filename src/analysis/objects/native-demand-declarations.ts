import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeDemandHost } from "./native-demand-batches.js";
import type { CsharpPreparedObjectShapeProjection } from "../../target-model/records/objects/object-shape-demand.js";
import type { CsharpObjectShapeProjectionDeclaration } from "../../target-model/records/objects/object-shape-demand.js";

import type { CsharpObjectShapeFact, CsharpObjectShapeProjection, TargetTypeRef } from "../../target-model/types/model.js";

import { visitCsharpTargetTypeParameters } from "../../target-model/types/generic-references.js";
import { closeCsharpOwnerTypeParameterEnvironment } from "../source-evidence/types/resolution/owner-type-parameter-environment.js";
import { isCsharpReferenceCarrier } from "../../target-model/types/identity.js";
import { csharpObjectShapeAssignmentMembers, csharpObjectShapeProjectionMembers, csharpObjectShapeProjectionMethodName } from "../../target-model/types/object-shape-projection.js";
import { getCsharpJsArrayElementTargetType } from "../../target-model/types/carriers/collections.js";
import { selectCsharpObjectProjection } from "../../policy/types/objects/closed-object-shapes.js";

export function objectShapeProjectionConversions(
  host: CsharpObjectShapeDemandHost,
  receiver: CsharpObjectShapeFact,
  projection: CsharpObjectShapeProjection,
): { readonly kind: "resolved"; readonly conversions: CsharpObjectShapeProjectionDeclaration["conversions"]; readonly emission: CsharpObjectShapeProjectionDeclaration["emission"] }
  | { readonly kind: "rejected"; readonly reason: string } {
  const pairs: { readonly source: TargetTypeRef; readonly target: TargetTypeRef }[] = [];
  if (projection.kind === "assign") {
    const assignments = csharpObjectShapeAssignmentMembers(receiver, projection);
    if (assignments === undefined) return { kind: "rejected", reason: "Object.assign requires exact admitted source-to-target fields." };
    for (const assignment of assignments) pairs.push({ source: assignment.source.type, target: assignment.target.type });
  } else if (projection.kind === "values" || projection.kind === "entries") {
    const element = getCsharpJsArrayElementTargetType(projection.resultType);
    const target = projection.kind === "entries" && element?.kind === "tuple" && element.elements.length === 2
      ? element.elements[1] : projection.kind === "values" ? element : undefined;
    const members = csharpObjectShapeProjectionMembers(receiver, projection);
    if (target === undefined || members === undefined) return { kind: "rejected", reason: "Object projection requires exact admitted collection element carriers." };
    for (const member of members) pairs.push({ source: member.type, target });
  }
  const conversions: CsharpObjectShapeProjectionDeclaration["conversions"][number][] = [];
  for (const pair of pairs) {
    const selection = host.conversions.conversion.get(pair.source, pair.target, "implicit");
    if (selection === undefined) return { kind: "rejected", reason:
      "Closed object-shape planning requires a sealed target conversion classification that analysis did not produce." };
    conversions.push(Object.freeze({ ...pair, selection }));
  }
  const selected = selectCsharpObjectProjection({ receiver, projection, conversions });
  return selected.kind === "rejected" ? selected : { kind: "resolved", conversions: Object.freeze(conversions), emission: selected.value };
}

export function prepareCsharpObjectShapeProjectionDeclaration(
  receiver: CsharpObjectShapeFact,
  selection: CsharpObjectShapeProjection,
  declarationParameters: readonly { readonly identity: string }[],
  conversions: CsharpObjectShapeProjectionDeclaration["conversions"],
  emission: CsharpObjectShapeProjectionDeclaration["emission"],
): CsharpPreparedObjectShapeProjection {
  const types = [receiver.targetType, selection.resultType, ...(selection.kind === "assign" ? [selection.sourceShape.targetType] : [])];
  const parameters: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>[] = [];
  for (const type of types) visitCsharpTargetTypeParameters(type, parameter => {
    parameters.push(parameter);
  });
  const closed = closeCsharpOwnerTypeParameterEnvironment(parameters, parameter => parameter.csharpConstraints ??
    failTargetAnalysisInvariant("tsonic-csharp", "An admitted object projection requires exact sealed native generic constraints."));
  const classIdentities = new Set(declarationParameters.map(parameter => parameter.identity));
  const typeParameters = Object.freeze(closed.filter(parameter => !classIdentities.has(parameter.identity)));
  for (const parameter of typeParameters) {
    if (parameter.csharpConstraints?.kind !== "resolved") failTargetAnalysisInvariant("tsonic-csharp",
      "An admitted object projection requires representable native generic constraints.", parameter.csharpDeclaration);
  }
  return Object.freeze({ receiver, selection, methodName: csharpObjectShapeProjectionMethodName(receiver, selection),
    receiverRequiresNullCheck: isCsharpReferenceCarrier(receiver.targetType), typeParameters, conversions, emission });
}
