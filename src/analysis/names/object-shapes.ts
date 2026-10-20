import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeDemandHost } from "../objects/native-demand-batches.js";
import type { CsharpObjectShapeDeclarationNaming, CsharpObjectShapeDemandClosure, CsharpPreparedObjectShapeProjection } from "../../target-model/records/object-shape-demand.js";
import type { CsharpObjectShapeArtifact, CsharpObjectShapeProjectionDeclaration } from "../../target-model/records/object-shape-demand.js";
import { objectShapeArtifactKey } from "../program/records/object-shape-keys.js";
import type { CsharpNamePlan } from "../../target-model/names/model.js";
import type { CsharpObjectShapeFact } from "../../target-model/types/model.js";
import { csharpAuthoredTypeParameterNames, csharpGeneratedTypeParameterNames } from "../../target-model/names/type-parameters.js";

import type { CsharpObjectShapeDemandPublication } from "../../target-model/records/object-shape-demand.js";
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

export function publishCsharpObjectShapeProjectionDeclaration(
  prepared: CsharpPreparedObjectShapeProjection,
  declarationNames: readonly { readonly identity: string; readonly name: string }[],
): CsharpObjectShapeProjectionDeclaration {
  const names = csharpGeneratedTypeParameterNames(prepared.typeParameters,
    [...declarationNames.map(parameter => parameter.name), "receiver", "source", "key"]);
  return Object.freeze({ ...prepared, typeParameterNames: Object.freeze([...names].map(([identity, name]) =>
    Object.freeze({ identity, name }))) });
}

export function selectCsharpObjectShapePublication(
  closure: CsharpObjectShapeDemandClosure,
  names: Pick<CsharpNamePlan, "typeParameterNames">,
): CsharpObjectShapeDemandPublication {
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
  const projections = new Map(closure.projectionSubjects.map(({ subject, projection }) => {
    const published = publishedProjections.get(projection);
    if (published === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
      "A completed native projection requires its prepared physical declaration at publication.", subject);
    return [subject, published] as const;
  }));
  return Object.freeze({ artifacts, targetShapes: closure.targetShapes,
    projectionSubjects: Object.freeze([...projections].map(([subject, projection]) => Object.freeze({ subject, projection }))) });
}
