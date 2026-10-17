import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeDemandHost } from "./native-demand-batches.js";
import type { CsharpObjectShapeProjectionDeclaration } from "../../target-model/records/object-shape-demand.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeProjection, TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { csharpAuthoredTypeParameterNames, csharpGeneratedTypeParameterNames } from "../../target-model/names/type-parameters.js";
import { closeCsharpOwnerTypeParameterEnvironment, visitCsharpTargetTypeParameters } from "../../target-model/types/generic-references.js";
import { isCsharpReferenceCarrier } from "../../target-model/types/identity.js";
import { csharpObjectShapeAssignmentMembers, csharpObjectShapeProjectionMembers, csharpObjectShapeProjectionMethodName } from "../../target-model/types/object-shape-projection.js";
import { getCsharpJsArrayElementTargetType } from "../../target-model/types/carriers/collections.js";

export function objectShapeDeclarationTypeParameterNames(
  host: CsharpObjectShapeDemandHost,
  fact: CsharpObjectShapeFact,
): readonly { readonly identity: string; readonly name: string }[] {
  const sourceNames = new Map(host.names.typeParameterNames.map(parameter => [parameter.identity, parameter.name]));
  const parameters = fact.targetType.kind === "target-named"
    ? (fact.targetType.typeArguments ?? []).filter(argument => argument.kind === "type-parameter") : [];
  const reserved = [
    ...fact.members.flatMap(member => (member.typeParameters ?? []).map(parameter => sourceNames.get(parameter.identity) ?? parameter.name)),
    ...(host.captureStorage.captureFrameShape.get(fact.targetType)?.methods.flatMap(method =>
      csharpAuthoredTypeParameterNames(method.declaration, host.ast)) ?? []),
    ...(fact.methodImplementation === undefined ? [] : csharpAuthoredTypeParameterNames(fact.methodImplementation.declaration, host.ast)),
  ];
  return Object.freeze([...csharpGeneratedTypeParameterNames(parameters, reserved)].map(([identity, name]) =>
    Object.freeze({ identity, name })));
}

export function objectShapeProjectionConversions(
  host: CsharpObjectShapeDemandHost,
  receiver: CsharpObjectShapeFact,
  projection: CsharpObjectShapeProjection,
): { readonly kind: "resolved"; readonly conversions: CsharpObjectShapeProjectionDeclaration["conversions"] }
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
    const reason = projectionConversionRejection(selection);
    if (reason !== undefined) return { kind: "rejected", reason };
    conversions.push(Object.freeze({ ...pair, selection }));
  }
  return { kind: "resolved", conversions: Object.freeze(conversions) };
}

function projectionConversionRejection(selection: CsharpConversionSelection): string | undefined {
  switch (selection.kind) {
    case "identity": case "empty-record": case "js-value-box": return undefined;
    case "implicit": return selection.proof === "runtime-union-arm" ? projectionConversionRejection(selection.sourceToArm) : undefined;
    case "ambiguous": case "rejected": return selection.reason;
    default: return `Selected conversion '${selection.kind}' requires source-expression evidence unavailable to a generated object projection.`;
  }
}

export function objectShapeProjectionDeclaration(
  receiver: CsharpObjectShapeFact,
  selection: CsharpObjectShapeProjection,
  declarationNames: readonly { readonly identity: string; readonly name: string }[],
  conversions: CsharpObjectShapeProjectionDeclaration["conversions"],
): CsharpObjectShapeProjectionDeclaration {
  const types = [receiver.targetType, selection.resultType, ...(selection.kind === "assign" ? [selection.sourceShape.targetType] : [])];
  const parameters: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>[] = [];
  for (const type of types) visitCsharpTargetTypeParameters(type, parameter => {
    parameters.push(parameter);
  });
  const closed = closeCsharpOwnerTypeParameterEnvironment(parameters, parameter => parameter.csharpConstraints ??
    failTargetAnalysisInvariant("tsonic-csharp", "An admitted object projection requires exact sealed native generic constraints."));
  const classIdentities = new Set(declarationNames.map(parameter => parameter.identity));
  const typeParameters = Object.freeze(closed.filter(parameter => !classIdentities.has(parameter.identity)));
  const names = csharpGeneratedTypeParameterNames(typeParameters, [...declarationNames.map(parameter => parameter.name), "receiver", "source", "key"]);
  const typeParameterNames = Object.freeze([...names].map(([identity, name]) => Object.freeze({ identity, name })));
  for (const parameter of typeParameters) {
    if (parameter.csharpConstraints?.kind !== "resolved") failTargetAnalysisInvariant("tsonic-csharp",
      "An admitted object projection requires representable native generic constraints.", parameter.csharpDeclaration);
  }
  return Object.freeze({ receiver, selection, methodName: csharpObjectShapeProjectionMethodName(receiver, selection),
    receiverRequiresNullCheck: isCsharpReferenceCarrier(receiver.targetType), typeParameters, typeParameterNames, conversions });
}
