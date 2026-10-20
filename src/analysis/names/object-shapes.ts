import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { type CsharpObjectShapeNameCandidate } from "../objects/display-names.js";
import { type CsharpObjectShapeDemandHost } from "../objects/native-demand-batches.js";
import { type CsharpObjectShapeDeclarationNaming, type CsharpObjectShapeDemandClosure, type CsharpPreparedObjectShapeProjection, type CsharpObjectShapeArtifact, type CsharpObjectShapeProjectionDeclaration, type CsharpObjectShapeDemandPublication } from "../../target-model/records/object-shape-demand.js";
import { objectShapeArtifactKey } from "../program/records/object-shape-keys.js";
import { type CsharpNamePlan } from "../../target-model/names/model.js";
import { type CsharpObjectShapeFact } from "../../target-model/types/model.js";
import { csharpAuthoredTypeParameterNames, csharpGeneratedTypeParameterNames } from "../../source/extension/type-parameters.js";

export function selectCsharpObjectShapeDisplayNames(
  candidates: readonly CsharpObjectShapeNameCandidate[],
  reservedNames: ReadonlySet<string> = new Set(),
): ReadonlyMap<string, string> {
  const unique = new Map<string, CsharpObjectShapeNameCandidate>();
  for (const candidate of candidates) {
    const previous = unique.get(candidate.canonicalName);
    if (
      previous !== undefined &&
      (
        previous.identity !== candidate.identity ||
        previous.preferredStem !== candidate.preferredStem
      )
    ) {
      failTargetAnalysisInvariant("tsonic-csharp",
        `Canonical C# object-shape name '${candidate.canonicalName}' has contradictory display identities.`,
      );
    }
    unique.set(candidate.canonicalName, candidate);
  }
  const ordered = [...unique.values()].sort((left, right) =>
    left.identity.localeCompare(right.identity, "en") ||
    left.preferredStem.localeCompare(right.preferredStem, "en") ||
    left.canonicalName.localeCompare(right.canonicalName, "en"));
  const assigned = new Set(reservedNames);
  const result = new Map<string, string>();
  for (const candidate of ordered) {
    const base = `${sanitizeStem(candidate.preferredStem)}Shape`;
    let length = Math.min(12, candidate.identity.length);
    let name = candidateName(base, candidate.identity, length);
    while (
      length < candidate.identity.length &&
      (
        assigned.has(name) ||
        ordered.some((other) =>
          other !== candidate &&
          `${sanitizeStem(other.preferredStem)}Shape` === base &&
          other.identity.slice(0, length) === candidate.identity.slice(0, length))
      )
    ) {
      length += 1;
      name = candidateName(base, candidate.identity, length);
    }
    if (assigned.has(name)) {
      let suffix = 2;
      while (assigned.has(`${name}_${suffix}`)) {
        suffix += 1;
      }
      name = `${name}_${suffix}`;
    }
    assigned.add(name);
    result.set(candidate.canonicalName, name);
  }
  return result;
}

function candidateName(base: string, identity: string, length: number): string {
  return `${base}_${identity.slice(0, length)}`;
}

function sanitizeStem(value: string): string {
  const sanitized = value
    .replace(/^@/u, "")
    .replace(/[^A-Za-z0-9_]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  if (sanitized.length === 0) {
    return "Object";
  }
  return /^[A-Za-z_]/u.test(sanitized)
    ? sanitized
    : `Type_${sanitized}`;
}

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
