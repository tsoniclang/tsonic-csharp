import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";

import type { CsharpObjectShapeMemberFact, CsharpStructuralInterfaceImplementation } from "../../../target-model/types/model.js";
import type { CsharpStructuralInterfaceEvidence } from "../../../target-model/records/heritage.js";
import { isCsharpValueTypeTargetType } from "../../../target-model/types/identity.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { inferCsharpTargetTypeParameterBindings, substituteObjectShapeMemberTargetTypeParameters, substituteTargetTypeParameters } from "../../../target-model/types/substitution.js";
import { csharpFreeTypeParameterIdentities } from "../../../target-model/types/generic-references.js";
import { csharpVariantArgumentImplicitlyAccepts } from "../../conversions/carriers.js";

export function selectCsharpStructuralInterfaceImplementation(
  policy: Parameters<typeof csharpVariantArgumentImplicitlyAccepts>[0],
  evidence: CsharpStructuralInterfaceEvidence,
): CsharpStructuralInterfaceImplementation | undefined {
  const { source, destination } = evidence;
  const selectedDestination = destination.targetType as CsharpTargetNamedTypeRef;
  if ((selectedDestination.csharpStructuralContract !== true && selectedDestination.csharpSourceDeclarationKind !== "interface") ||
    isCsharpValueTypeTargetType(source.targetType) || source.members.some(member => member.bound === true)) return undefined;
  const template = source.declarationTemplate ?? source;
  const destinationTemplate = destination.declarationTemplate;
  const parameterIdentities = destinationTemplate === undefined ? new Set<string>()
    : csharpFreeTypeParameterIdentities([destinationTemplate.targetType]);
  const arguments_ = new Map<string, TargetTypeRef>();
  const inferredArguments = new Map<string, TargetTypeRef>();
  const ambiguousArguments = new Set<string>();
  const methods: CsharpStructuralInterfaceImplementation["methods"][number][] = [];
  const properties: CsharpStructuralInterfaceImplementation["properties"][number][] = [];
  for (const pair of evidence.members) {
    const read = pair.source;
    const write = pair.destination;
    const readonlyDestination = write.readonly === true || write.accessor?.setter === false;
    if (read.targetName !== write.targetName || read.memberKind !== write.memberKind ||
      (!readonlyDestination && (read.readonly === true || read.accessor?.setter === false))) return undefined;
    if (destinationTemplate !== undefined) {
      const bindings = inferStructuralMemberTypeArguments(pair.openDestination, pair.openSource, parameterIdentities);
      for (const [identity, type] of bindings ?? []) {
        if (ambiguousArguments.has(identity)) continue;
        const existing = inferredArguments.get(identity);
        if (existing !== undefined && !targetTypeRefEquals(existing, type)) {
          inferredArguments.delete(identity);
          ambiguousArguments.add(identity);
        } else inferredArguments.set(identity, type);
      }
    }
    if (read.memberKind === "property") {
      if (!targetTypeRefEquals(read.type, write.type) && !readonlyDestination) return undefined;
      if (read.accessor === undefined || !targetTypeRefEquals(read.type, write.type)) {
        properties.push({ sourceName: read.targetName, sourceType: pair.openSource.type, member: pair.openDestination });
      }
      continue;
    }
    if (pair.declaration === undefined) return undefined;
    methods.push({ sourceName: read.targetName, declaration: pair.declaration, member: pair.openDestination });
  }
  const sourceParameters = csharpFreeTypeParameterIdentities([template.targetType]);
  if (destinationTemplate !== undefined) {
    const supplied = inferCsharpTargetTypeParameterBindings(destinationTemplate.targetType, destination.targetType, parameterIdentities);
    const sourceArguments = inferCsharpTargetTypeParameterBindings(template.targetType, source.targetType, sourceParameters);
    if (supplied === undefined || sourceArguments === undefined) return undefined;
    for (const [identity, actual] of supplied) {
      const inferred = inferredArguments.get(identity);
      const free = inferred === undefined ? new Set<string>() : csharpFreeTypeParameterIdentities([inferred]);
      const exactSourceRelationship = inferred !== undefined && free.size > 0 &&
        [...free].every(parameter => sourceParameters.has(parameter)) &&
        (targetTypeRefEquals(substituteTargetTypeParameters(inferred, sourceArguments), actual) ||
          destinationTemplate.covariantTypeParameterIdentities?.includes(identity) === true &&
          csharpVariantArgumentImplicitlyAccepts(policy, substituteTargetTypeParameters(inferred, sourceArguments), actual, new Set()));
      arguments_.set(identity, exactSourceRelationship ? inferred! : actual);
    }
  }
  const interfaceType = destinationTemplate === undefined ? destination.targetType
    : substituteTargetTypeParameters(destinationTemplate.targetType, arguments_);
  if ([...csharpFreeTypeParameterIdentities([interfaceType])].some(identity => !sourceParameters.has(identity))) return undefined;
  return Object.freeze({ sourceNode: evidence.sourceNode, sourceType: template.targetType, interfaceType,
    properties: Object.freeze(properties.map(property => Object.freeze({ ...property,
      member: substituteObjectShapeMemberTargetTypeParameters(property.member, arguments_),
    }))),
    methods: Object.freeze(methods.map(method => Object.freeze({ ...method,
      member: substituteObjectShapeMemberTargetTypeParameters(method.member, arguments_),
    }))),
  });
}

function inferStructuralMemberTypeArguments(
  pattern: CsharpObjectShapeMemberFact,
  actual: CsharpObjectShapeMemberFact,
  parameterIdentities: ReadonlySet<string>,
): ReadonlyMap<string, TargetTypeRef> | undefined {
  const containsParameter = (type: TargetTypeRef): boolean =>
    [...csharpFreeTypeParameterIdentities([type])].some(identity => parameterIdentities.has(identity));
  const constrained = pattern.typeParameters?.some(parameter => parameter.constraints.some(constraint =>
    constraint.kind === "type" && containsParameter(constraint.type))) === true;
  if (!containsParameter(pattern.type) && !constrained) return new Map();
  const from = actual.typeParameters ?? [];
  const to = pattern.typeParameters ?? [];
  if (from.length !== to.length) return undefined;
  const substitutions = new Map<string, TargetTypeRef>();
  for (const [index, parameter] of from.entries()) {
    const target = to[index]!;
    substitutions.set(parameter.identity, Object.freeze({ kind: "type-parameter", identity: target.identity,
      name: target.name, csharpConstraints: Object.freeze({ kind: "resolved", constraints: target.constraints }) }));
  }
  const inferred = containsParameter(pattern.type) ? inferCsharpTargetTypeParameterBindings(pattern.type,
    substituteTargetTypeParameters(actual.type, substitutions), parameterIdentities) : new Map<string, TargetTypeRef>();
  if (inferred === undefined) return undefined;
  const bindings = new Map(inferred);
  for (const [index, parameter] of to.entries()) {
    for (const constraint of parameter.constraints) {
      if (constraint.kind !== "type" || !containsParameter(constraint.type)) continue;
      const matches = from[index]!.constraints.flatMap(candidate => {
        if (candidate.kind !== "type") return [];
        const selected = inferCsharpTargetTypeParameterBindings(constraint.type,
          substituteTargetTypeParameters(candidate.type, substitutions), parameterIdentities);
        return selected !== undefined && [...selected].every(([identity, type]) =>
          !bindings.has(identity) || targetTypeRefEquals(bindings.get(identity)!, type)) ? [selected] : [];
      });
      if (matches.length !== 1) return undefined;
      for (const [identity, type] of matches[0]!) bindings.set(identity, type);
    }
  }
  return bindings;
}
