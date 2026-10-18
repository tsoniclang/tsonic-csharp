import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeDemandHost } from "./native-demand-batches.js";
import type { CsharpObjectShapeProjectionDeclaration } from "../../target-model/records/object-shape-demand.js";
import type { CsharpObjectShapeCapability, CsharpObjectShapeFact, CsharpObjectShapeProjection, TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { csharpAuthoredTypeParameterNames, csharpGeneratedTypeParameterNames } from "../../target-model/names/type-parameters.js";
import { closeCsharpOwnerTypeParameterEnvironment, visitCsharpTargetTypeParameters } from "../../target-model/types/generic-references.js";
import { isCsharpReferenceCarrier } from "../../target-model/types/identity.js";
import { csharpObjectShapeAssignmentMembers, csharpObjectShapeProjectionMembers, csharpObjectShapeProjectionMethodName } from "../../target-model/types/object-shape-projection.js";
import { getCsharpJsArrayElementTargetType } from "../../target-model/types/carriers/collections.js";
import type { Node } from "@tsonic/tsts";
import type { CsharpArtifactRequestResult, CsharpObjectShapeDemandScope } from "./native-demand-batches.js";
import { rejected } from "./native-demand-batches.js";
import { objectShapeMaterialization } from "../../target-model/records/object-shape-demand.js";
import { csharpObjectShapeMemberLookupFailureMessage, resolveCsharpObjectShapeMemberBySourceKey } from "../../target-model/types/object-shape-members.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { csharpObjectShapeMethodDeclaration } from "../../target-model/types/method-values.js";

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
): { readonly kind: "resolved"; readonly conversions: CsharpObjectShapeProjectionDeclaration["conversions"];
  readonly memberBindings: CsharpObjectShapeProjectionDeclaration["memberBindings"] }
  | { readonly kind: "rejected"; readonly reason: string } {
  const pairs: { readonly source: TargetTypeRef; readonly target: TargetTypeRef }[] = [];
  const selected = projection.kind === "assign" ? csharpObjectShapeAssignmentMembers(receiver, projection)
    : csharpObjectShapeProjectionMembers(receiver, projection)?.map(member => ({ source: member, target: member }));
  if (selected === undefined) return { kind: "rejected", reason:
    `Closed object projection '${projection.kind}' does not identify every exact own member once.` };
  const memberBindings = Object.freeze(selected.map(binding => Object.freeze(binding)));
  if (projection.kind === "assign") {
    for (const assignment of memberBindings) pairs.push({ source: assignment.source.type, target: assignment.target.type });
  } else if (projection.kind === "values" || projection.kind === "entries") {
    const element = getCsharpJsArrayElementTargetType(projection.resultType);
    const target = projection.kind === "entries" && element?.kind === "tuple" && element.elements.length === 2
      ? element.elements[1] : projection.kind === "values" ? element : undefined;
    if (target === undefined) return { kind: "rejected", reason: "Object projection requires exact admitted collection element carriers." };
    for (const binding of memberBindings) pairs.push({ source: binding.target.type, target });
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
  return { kind: "resolved", conversions: Object.freeze(conversions), memberBindings };
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
  memberBindings: CsharpObjectShapeProjectionDeclaration["memberBindings"],
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
    receiverRequiresNullCheck: isCsharpReferenceCarrier(receiver.targetType), typeParameters, typeParameterNames,
    memberBindings: Object.freeze(memberBindings), conversions });
}

export function requireObjectShapeSpread(
  scope: CsharpObjectShapeDemandScope,
  subject: Node,
  expression: Node,
  source: CsharpObjectShapeFact,
  target: CsharpObjectShapeFact,
): CsharpArtifactRequestResult {
  const sourceShape = scope.host.objectShapes.resolveTarget(source.targetType);
  const targetShape = scope.host.objectShapes.resolveTarget(target.targetType);
  if (sourceShape === undefined || targetShape === undefined) return rejected(
    "A native object spread requires its exact completed source and target object-shape carriers.");
  source = sourceShape;
  target = targetShape;
  const previous = scope.spreads.get(subject);
  if (previous !== undefined) return previous.expression === expression && previous.source === source && previous.target === target
    ? { kind: "accepted" } : rejected("One native spread requires its exact original source and target object-shape identities.");
  const sharedImplementation = source.methodImplementation !== undefined &&
    source.methodImplementation.identity === target.methodImplementation?.identity && targetTypeRefEquals(source.targetType, target.targetType);
  const memberBindings: { readonly source: CsharpObjectShapeFact["members"][number]; readonly target: CsharpObjectShapeFact["members"][number] }[] = [];
  for (const member of source.members) {
    const selected = resolveCsharpObjectShapeMemberBySourceKey(target, member.sourceKey, "finalized-object-spread-member");
    if (selected.kind !== "resolved") return rejected(selected.reason === "not-in-finalized-shape"
      ? `Object literal spread source member '${member.sourceName}' requires a finalized target object-shape member carrier before C# emission.`
      : csharpObjectShapeMemberLookupFailureMessage(selected, "Object literal spread target shape"));
    const sourceDeclaration = csharpObjectShapeMethodDeclaration(source, member);
    if (sharedImplementation && selected.member.methodValueContract !== undefined && sourceDeclaration !== undefined &&
      csharpObjectShapeMethodDeclaration(target, selected.member) === sourceDeclaration) continue;
    if (!targetTypeRefEquals(member.type, selected.member.type)) return rejected(
      `Object literal spread member '${member.sourceName}' requires matching finalized source and target member carriers.`);
    memberBindings.push(Object.freeze({ source: member, target: selected.member }));
  }
  const prepared = scope.prepareObjectShapeBatch([{ fact: source, materialization: objectShapeMaterialization(source) },
    { fact: target, materialization: objectShapeMaterialization(target) }]);
  if (prepared.kind === "rejected") return prepared;
  const capabilities = new Map<string, Set<CsharpObjectShapeCapability>>();
  if (memberBindings.some(binding => binding.source.methodValueContract !== undefined)) {
    const closure = scope.collectCapabilityClosure("method-values", source.targetType, source, prepared.batch.shapes);
    if (closure.kind === "rejected") return closure;
    const expanded = scope.addObjectShapesToBatch(prepared.batch, [...closure.shapes.values()].map(fact => ({
      fact, materialization: objectShapeMaterialization(fact),
    })));
    if (expanded.kind === "rejected") return expanded;
    scope.addShapeCapabilities(capabilities, closure.shapes, "method-values");
  }
  const validated = scope.validateObjectShapeBatch(prepared.batch, capabilities, new Map(), new Map());
  if (validated.kind === "rejected") return validated;
  const committed = scope.commitObjectShapeBatch(prepared.batch, capabilities, new Map(), new Map());
  if (committed.kind === "rejected") return committed;
  scope.spreads.set(subject, Object.freeze({ expression, source, target, sharedImplementation,
    memberBindings: Object.freeze(memberBindings) }));
  return committed;
}
