import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeDemandHost } from "./native-demand-batches.js";
import type { CsharpObjectShapeDeclarationNaming, CsharpObjectShapeDemandClosure, CsharpPreparedObjectShapeProjection } from "../../target-model/records/object-shape-demand.js";
import type { CsharpObjectShapeArtifact, CsharpObjectShapeDemand,
  CsharpObjectShapeProjectionDeclaration } from "../../target-model/records/object-shape-demand.js";
import { objectShapeArtifactKey } from "../program/records/object-shape-keys.js";
import type { CsharpNamePlan } from "../../target-model/names/model.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeProjection, TargetTypeRef } from "../../target-model/types/model.js";
import { csharpAuthoredTypeParameterNames, csharpGeneratedTypeParameterNames } from "../../target-model/names/type-parameters.js";
import { closeCsharpOwnerTypeParameterEnvironment, visitCsharpTargetTypeParameters } from "../../target-model/types/generic-references.js";
import { isCsharpReferenceCarrier } from "../../target-model/types/identity.js";
import { csharpObjectShapeAssignmentMembers, csharpObjectShapeProjectionMembers, csharpObjectShapeProjectionMethodName } from "../../target-model/types/object-shape-projection.js";
import { getCsharpJsArrayElementTargetType } from "../../target-model/types/carriers/collections.js";
import { selectCsharpObjectProjection } from "../../policy/objects/closed-object-shapes.js";

export function prepareCsharpObjectShapeDeclarationNames(
  host: CsharpObjectShapeDemandHost,
  fact: CsharpObjectShapeFact,
): CsharpObjectShapeDeclarationNaming {
  const parameters = fact.targetType.kind === "target-named"
    ? (fact.targetType.typeArguments ?? []).filter(argument => argument.kind === "type-parameter") : [];
  const reservedParameters = fact.members.flatMap(member => (member.typeParameters ?? []).map(parameter =>
    Object.freeze({ identity: parameter.identity, name: parameter.name })));
  const reservedNames = [
    ...(host.captureStorage.captureFrameShape.get(fact.targetType)?.methods.flatMap(method =>
      csharpAuthoredTypeParameterNames(method.declaration, host.ast)) ?? []),
    ...(fact.methodImplementation === undefined ? [] : csharpAuthoredTypeParameterNames(fact.methodImplementation.declaration, host.ast)),
  ];
  return Object.freeze({ parameters: Object.freeze(parameters), reservedParameters: Object.freeze(reservedParameters),
    reservedNames: Object.freeze(reservedNames) });
}

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

export function publishCsharpObjectShapeProjectionDeclaration(
  prepared: CsharpPreparedObjectShapeProjection,
  declarationNames: readonly { readonly identity: string; readonly name: string }[],
): CsharpObjectShapeProjectionDeclaration {
  const names = csharpGeneratedTypeParameterNames(prepared.typeParameters,
    [...declarationNames.map(parameter => parameter.name), "receiver", "source", "key"]);
  return Object.freeze({ ...prepared, typeParameterNames: Object.freeze([...names].map(([identity, name]) =>
    Object.freeze({ identity, name }))) });
}

export function publishCsharpNativeArtifactDemand(
  closure: CsharpObjectShapeDemandClosure,
  names: Pick<CsharpNamePlan, "typeParameterNames">,
): CsharpObjectShapeDemand {
  const sourceNames = new Map(names.typeParameterNames.map(parameter => [parameter.identity, parameter.name]));
  const declarationNames = new Map<string, CsharpObjectShapeArtifact["typeParameterNames"]>();
  const publishedProjections = new Map<CsharpPreparedObjectShapeProjection, CsharpObjectShapeProjectionDeclaration>();
  const artifacts = Object.freeze(closure.artifacts.map(artifact => {
    const declarationKey = objectShapeArtifactKey(artifact.fact.declarationTemplate ?? artifact.fact);
    let typeParameterNames = declarationNames.get(declarationKey);
    if (typeParameterNames === undefined) {
      const reserved = [...artifact.naming.reservedParameters.map(parameter => sourceNames.get(parameter.identity) ?? parameter.name),
        ...artifact.naming.reservedNames];
      typeParameterNames = Object.freeze([...csharpGeneratedTypeParameterNames(artifact.naming.parameters, reserved)]
        .map(([identity, name]) => Object.freeze({ identity, name })));
      declarationNames.set(declarationKey, typeParameterNames);
    }
    const projections = Object.freeze(artifact.projections.map(prepared => {
      let published = publishedProjections.get(prepared);
      if (published === undefined) {
        published = publishCsharpObjectShapeProjectionDeclaration(prepared, typeParameterNames);
        publishedProjections.set(prepared, published);
      }
      return published;
    }));
    return Object.freeze({ key: artifact.key, fact: artifact.fact, materialization: artifact.materialization,
      jsonContract: artifact.jsonContract,
      capabilities: artifact.capabilities, projections, typeParameterNames,
      receiverBoundMethodKeys: artifact.receiverBoundMethodKeys, dependencies: artifact.dependencies,
      dependents: artifact.dependents });
  }));
  const byKey = new Map(artifacts.map(artifact => [artifact.key, artifact]));
  const projections = new Map(closure.projectionSubjects.map(({ subject, projection }) => {
    const published = publishedProjections.get(projection);
    if (published === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "A completed native projection requires its prepared physical declaration at publication.", subject);
    return [subject, published] as const;
  }));
  return Object.freeze({ artifacts, targetShapes: closure.targetShapes, get: (key: string) => byKey.get(key),
    projection: (subject: Parameters<CsharpObjectShapeDemand["projection"]>[0]) => projections.get(subject) });
}
