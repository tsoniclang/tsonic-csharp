import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import type { CsharpNativeCallableMember } from "../../../target-model/types/native-type-data.js";

import type { CsharpObjectShapeMemberFact } from "../../../target-model/types/model.js";
import type { CsharpStructuralInterfaceImplementation } from "../../../target-model/records/objects/structural-interface-data.js";
import type { CsharpStructuralInterfaceEvidence } from "../../../target-model/records/objects/heritage.js";
import { isCsharpValueTypeTargetType } from "../../../target-model/types/identity.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { inferCsharpTargetTypeParameterBindings, substituteObjectShapeMemberTargetTypeParameters, substituteTargetTypeParameters } from "../../../target-model/types/substitution.js";
import { csharpFreeTypeParameterIdentities } from "../../../target-model/types/generic-references.js";
import { csharpVariantArgumentImplicitlyAccepts } from "../../constraints/native-relations.js";

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
  const mergeInferredArguments = (bindings: ReadonlyMap<string, TargetTypeRef> | undefined): void => {
    for (const [identity, type] of bindings ?? []) {
      if (ambiguousArguments.has(identity)) continue;
      const existing = inferredArguments.get(identity);
      if (existing !== undefined && !targetTypeRefEquals(existing, type)) {
        inferredArguments.delete(identity);
        ambiguousArguments.add(identity);
      } else inferredArguments.set(identity, type);
    }
  };
  const methods: CsharpStructuralInterfaceImplementation["methods"][number][] = [];
  const properties: CsharpStructuralInterfaceImplementation["properties"][number][] = [];
  for (const pair of evidence.members) {
    const write = pair.destination;
    const readonlyDestination = write.readonly === true || write.accessor?.setter === false;
    if (pair.native !== undefined) {
      if (!readonlyDestination || write.memberKind !== "property") return undefined;
      if (destinationTemplate !== undefined && [...csharpFreeTypeParameterIdentities([pair.openDestination.type])]
        .some(identity => parameterIdentities.has(identity))) {
        const bindings = inferCsharpTargetTypeParameterBindings(pair.openDestination.type, pair.native.member.returnType, parameterIdentities);
        if (bindings === undefined) return undefined;
        mergeInferredArguments(bindings);
      }
      properties.push({ native: pair.native, sourceType: pair.native.member.returnType, member: pair.openDestination });
      continue;
    }
    const read = pair.source;
    if (read.targetName !== write.targetName || read.memberKind !== write.memberKind ||
      (!readonlyDestination && (read.readonly === true || read.accessor?.setter === false))) return undefined;
    if (destinationTemplate !== undefined) {
      const bindings = inferStructuralMemberTypeArguments(pair.openDestination, pair.openSource, parameterIdentities);
      mergeInferredArguments(bindings);
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
  // A source declaration that declares the destination interface (`class InterfaceHead<T> implements Head<T>`) relates
  // their type parameters by that declaration even when a member's shape differs (a reshaped rest parameter).
  if (destinationTemplate !== undefined && destinationTemplate.targetType.kind === "target-named") {
    const declaredId = destinationTemplate.targetType.id;
    const declared = evidence.declaredSupertypes.filter(type => type.kind === "target-named" && type.id === declaredId);
    const bindings = declared.length === 1
      ? inferCsharpTargetTypeParameterBindings(destinationTemplate.targetType, declared[0]!, parameterIdentities) : undefined;
    for (const [identity, type] of bindings ?? []) {
      if (!inferredArguments.has(identity) && !ambiguousArguments.has(identity)) inferredArguments.set(identity, type);
    }
  }
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
  if (pattern.memberKind !== actual.memberKind) return undefined;
  if (pattern.memberKind === "property") return inferCsharpTargetTypeParameterBindings(pattern.type, actual.type, parameterIdentities);
  if (actual.memberKind !== "method" || pattern.methods.length !== actual.methods.length) return undefined;
  const bindings = new Map<string, TargetTypeRef>();
  for (const [index, method] of pattern.methods.entries()) {
    const selected = actual.methods[index]!;
    if (method.member.name !== selected.member.name) return undefined;
    const inferred = inferStructuralMethodTypeArguments(method.member, selected.member, parameterIdentities);
    if (inferred === undefined) return undefined;
    for (const [identity, type] of inferred) {
      const previous = bindings.get(identity);
      if (previous !== undefined && !targetTypeRefEquals(previous, type)) return undefined;
      bindings.set(identity, type);
    }
  }
  return bindings;
}

function inferStructuralMethodTypeArguments(
  pattern: CsharpNativeCallableMember,
  actual: CsharpNativeCallableMember,
  parameterIdentities: ReadonlySet<string>,
): ReadonlyMap<string, TargetTypeRef> | undefined {
  const expected = pattern.signature;
  const supplied = actual.signature;
  if (expected.kind !== supplied.kind || expected.parameters.length !== supplied.parameters.length ||
    expected.returnPassing !== supplied.returnPassing || expected.restParameterIndex !== supplied.restParameterIndex ||
    expected.receiver?.passingMode !== supplied.receiver?.passingMode ||
    JSON.stringify(expected.optionalParameterIndexes ?? []) !== JSON.stringify(supplied.optionalParameterIndexes ?? []) ||
    JSON.stringify(expected.parameterPassingModes) !== JSON.stringify(supplied.parameterPassingModes)) return undefined;
  const patternType: TargetTypeRef = { kind: "tuple", elements: [
    ...(expected.receiver === undefined ? [] : [expected.receiver.type]), ...expected.parameters, expected.returnType,
  ] };
  const actualType: TargetTypeRef = { kind: "tuple", elements: [
    ...(supplied.receiver === undefined ? [] : [supplied.receiver.type]), ...supplied.parameters, supplied.returnType,
  ] };
  const containsParameter = (type: TargetTypeRef): boolean =>
    [...csharpFreeTypeParameterIdentities([type])].some(identity => parameterIdentities.has(identity));
  const constrained = pattern.typeParameters.some(parameter => parameter.constraints.some(constraint =>
    constraint.kind === "type" && containsParameter(constraint.type)));
  if (!containsParameter(patternType) && !constrained) return new Map();
  const from = actual.typeParameters;
  const to = pattern.typeParameters;
  if (from.length !== to.length) return undefined;
  const substitutions = new Map<string, TargetTypeRef>();
  for (const [index, parameter] of from.entries()) {
    const target = to[index]!;
    substitutions.set(parameter.identity, Object.freeze({ kind: "type-parameter", identity: target.identity,
      name: target.name, csharpConstraints: Object.freeze({ kind: "resolved", constraints: target.constraints }) }));
  }
  const inferred = containsParameter(patternType) ? inferCsharpTargetTypeParameterBindings(patternType,
    substituteTargetTypeParameters(actualType, substitutions), parameterIdentities) : new Map<string, TargetTypeRef>();
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
