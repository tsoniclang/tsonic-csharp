import type { ExtensionFactSubject } from "@tsonic/tsts";
import type { CsharpTypePolicyHost } from "../resolution/model.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../../target-model/types/model.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";
import { csharpMethodValueType, csharpObjectShapeMethodDeclaration, csharpPresentObjectShapeMethod } from "../../../target-model/types/method-values.js";
import { csharpSourceMemberKeyParts } from "../../../target-model/types/source-member-keys.js";
import { csharpMethodEnvironment } from "./object-shape-policy/method-values.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import type { CsharpObjectShapeMemberFact, CsharpStructuralInterfaceImplementation } from "../../../target-model/types/model.js";
import type { CsharpStructuralInterfaceEvidence } from "../../../target-model/records/heritage.js";
import { isCsharpValueTypeTargetType } from "../../../target-model/types/identity.js";
import { csharpObjectShapeMemberTypeKey } from "../../../target-model/types/object-shape-identity.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/carriers/delegates.js";
import { inferCsharpTargetTypeParameterBindings, substituteObjectShapeMemberTargetTypeParameters, substituteTargetTypeParameters } from "../../../target-model/types/substitution.js";
import { csharpFreeTypeParameterIdentities } from "../../../target-model/types/generic-references.js";

export function selectCsharpMethodValue(
  owner: TargetTypeRef | undefined, subjects: readonly ExtensionFactSubject[], host: CsharpTypePolicyHost, directCall = false,
): TargetTypeRef | undefined {
  if (owner === undefined) return undefined;
  const shape = host.structuralTypes.resolveTarget(owner);
  if (shape === undefined) return undefined;
  const member = resolveCsharpObjectShapeMemberBySelectedSubject(shape, subjects);
  if (member.kind !== "resolved" || member.member.memberKind !== "method" || member.member.methodValueContract === undefined) return undefined;
  if (directCall && member.member.optional !== true) return undefined;
  if (member.member.methodStorageType === undefined && shape.methodImplementation !== undefined) {
    if (csharpObjectShapeMethodDeclaration(shape, member.member) === undefined) return undefined;
  } else if (member.member.methodStorageType === undefined && (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract !== true &&
    (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "interface") return undefined;
  const environment = csharpMethodEnvironment(shape, member.member);
  if (environment === undefined) return undefined;
  const identity = JSON.stringify(csharpSourceMemberKeyParts(member.member.sourceKey));
  const signature = csharpPresentObjectShapeMethod(member.member);
  const value = signature === undefined ? undefined : csharpMethodValueType(environment, member.member.targetName, identity,
    signature.type, (member.member.typeParameters ?? []).map(parameter => parameter.identity));
  return value === undefined || member.member.optional !== true ? value : csharpNullableTargetType(value);
}

export function selectCsharpStructuralInterfaceImplementation(
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
      if (bindings === undefined) return undefined;
      for (const [identity, type] of bindings) {
        const existing = arguments_.get(identity);
        if (existing !== undefined && !targetTypeRefEquals(existing, type)) return undefined;
        arguments_.set(identity, type);
      }
    } else if (!targetTypeRefEquals(pair.openSource.type, read.type)) return undefined;
    if (read.memberKind === "property") {
      if (!targetTypeRefEquals(read.type, write.type) && !readonlyDestination) return undefined;
      if (read.accessor === undefined || !targetTypeRefEquals(read.type, write.type)) {
        properties.push({ sourceName: read.targetName, sourceType: pair.openSource.type, member: pair.openDestination });
      }
      continue;
    }
    if (csharpObjectShapeMemberTypeKey(read) === csharpObjectShapeMemberTypeKey(write)) continue;
    const from = getCsharpDelegateSignature(read.type);
    const to = getCsharpDelegateSignature(write.type);
    if (pair.declaration === undefined || (read.typeParameters?.length ?? 0) !== 0 ||
      from === undefined || to === undefined || !targetTypeRefEquals(from.returnType, to.returnType) ||
      from.parameters.length !== to.parameters.length || from.restParameterIndex !== to.restParameterIndex) return undefined;
    const defaults: number[] = [];
    for (const [index, parameter] of from.parameters.entries()) {
      const expected = to.parameters[index]!;
      if (targetTypeRefEquals(parameter, expected)) continue;
      const element = getCsharpNullableElementTargetType(expected);
      if (element === undefined || !targetTypeRefEquals(parameter, element) || pair.parameterDefaults[index] !== true) return undefined;
      defaults.push(index);
    }
    methods.push({ sourceName: read.targetName, declaration: pair.declaration, member: pair.openDestination,
      defaultArguments: Object.freeze(defaults) });
  }
  const sourceParameters = csharpFreeTypeParameterIdentities([template.targetType]);
  if (destinationTemplate !== undefined) {
    const supplied = inferCsharpTargetTypeParameterBindings(destinationTemplate.targetType, destination.targetType, parameterIdentities);
    const sourceArguments = inferCsharpTargetTypeParameterBindings(template.targetType, source.targetType, sourceParameters);
    if (supplied === undefined || sourceArguments === undefined) return undefined;
    for (const [identity, actual] of supplied) {
      const inferred = arguments_.get(identity);
      if (inferred === undefined) arguments_.set(identity, actual);
      else if (!targetTypeRefEquals(substituteTargetTypeParameters(inferred, sourceArguments), actual)) return undefined;
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
  if (![...csharpFreeTypeParameterIdentities([pattern.type])].some(identity => parameterIdentities.has(identity))) return new Map();
  const from = actual.typeParameters ?? [];
  const to = pattern.typeParameters ?? [];
  if (from.length !== to.length) return undefined;
  const substitutions = new Map<string, TargetTypeRef>();
  for (const [index, parameter] of from.entries()) {
    const target = to[index]!;
    substitutions.set(parameter.identity, Object.freeze({ kind: "type-parameter", identity: target.identity,
      name: target.name, csharpDeclaration: target.declaration }));
  }
  return inferCsharpTargetTypeParameterBindings(pattern.type,
    substituteTargetTypeParameters(actual.type, substitutions), parameterIdentities);
}
