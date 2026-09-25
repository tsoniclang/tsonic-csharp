import type { Node, Type } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef, CsharpStructuralInterfaceImplementation, TargetTypeRef } from "../../target-model/types/model.js";
import { isCsharpValueTypeTargetType, resolveCsharpObjectShapeMemberBySelectedSubject } from "../../target-model/types/index.js";
import { csharpObjectShapeMemberTypeKey } from "../../target-model/types/object-shape-identity.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType, isCsharpNullableReferenceTargetType } from "../../target-model/types/nullable.js";
import { getCsharpDelegateSignature } from "../../target-model/types/delegates.js";
import { substituteTargetTypeParameters } from "../../policy/types/callables/substitution.js";

export function selectCsharpStructuralInterface(
  policy: CsharpPolicyContext, expression: Node,
  source: CsharpObjectShapeFact | undefined, destination: CsharpObjectShapeFact | undefined,
  selectedSourceType?: Type,
): CsharpStructuralInterfaceImplementation | undefined {
  if (source === undefined || destination?.sourceType === undefined ||
    ((destination.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract !== true &&
      (destination.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "interface") ||
    isCsharpValueTypeTargetType(source.targetType) || source.members.some(member => member.bound === true)) return undefined;
  const semantics = policy.semanticsFor(expression);
  const sourceType = selectedSourceType ?? semantics.types.expressionType(expression);
  if (sourceType === undefined) return undefined;
  const selected = semantics.types.structuralMembers(sourceType, destination.sourceType);
  if (selected.kind !== "available" || selected.destination.calls.length > 0 || selected.destination.constructs.length > 0 ||
    selected.destination.indexes.length > 0 || selected.members.length !== destination.members.length) return undefined;
  const template = source.declarationTemplate ?? source;
  const destinationTemplate = destination.declarationTemplate;
  const arguments_ = new Map<string, TargetTypeRef>();
  const methods: CsharpStructuralInterfaceImplementation["methods"][number][] = [];
  for (const pair of selected.members) {
    if (pair.kind !== "present") return undefined;
    const sourceSubjects = [pair.source.property.symbol, ...pair.source.property.rootSymbols, ...pair.source.declarations];
    const destinationSubjects = [pair.destination.property.symbol, ...pair.destination.property.rootSymbols, ...pair.destination.declarations];
    const read = resolveCsharpObjectShapeMemberBySelectedSubject(source, sourceSubjects);
    const write = resolveCsharpObjectShapeMemberBySelectedSubject(destination, destinationSubjects);
    const open = resolveCsharpObjectShapeMemberBySelectedSubject(template, sourceSubjects);
    if (read.kind !== "resolved" || write.kind !== "resolved" || open.kind !== "resolved" ||
      read.member.targetName !== write.member.targetName || read.member.memberKind !== write.member.memberKind ||
      (write.member.readonly !== true && (read.member.readonly === true || read.member.accessor?.setter === false))) return undefined;
    if (read.member.memberKind === "property") {
      const element = getCsharpNullableElementTargetType(write.member.type);
      const referenceWidening = write.member.readonly === true && isCsharpNullableReferenceTargetType(write.member.type) &&
        element !== undefined && targetTypeRefEquals(read.member.type, element);
      if (!targetTypeRefEquals(read.member.type, write.member.type) && !referenceWidening) return undefined;
      if (destinationTemplate !== undefined) {
        const member = resolveCsharpObjectShapeMemberBySelectedSubject(destinationTemplate, destinationSubjects);
        if (member.kind !== "resolved" || member.member.type.kind !== "type-parameter") return undefined;
        arguments_.set(member.member.type.name, open.member.type);
      } else if (!targetTypeRefEquals(open.member.type, read.member.type)) return undefined;
      continue;
    }
    if (csharpObjectShapeMemberTypeKey(read.member) === csharpObjectShapeMemberTypeKey(write.member)) continue;
    const from = getCsharpDelegateSignature(read.member.type);
    const to = getCsharpDelegateSignature(write.member.type);
    const declaration = pair.source.declarations.length === 1 ? pair.source.declarations[0] : undefined;
    if (declaration === undefined || (read.member.typeParameters?.length ?? 0) !== 0 ||
      from === undefined || to === undefined || !targetTypeRefEquals(from.returnType, to.returnType) ||
      from.parameters.length !== to.parameters.length || from.restParameterIndex !== to.restParameterIndex) return undefined;
    const defaults: number[] = [];
    for (const [index, parameter] of from.parameters.entries()) {
      const expected = to.parameters[index]!;
      if (targetTypeRefEquals(parameter, expected)) continue;
      const sourceParameter = policy.ast.parameters(declaration)[index];
      const element = getCsharpNullableElementTargetType(expected);
      if (element === undefined || !targetTypeRefEquals(parameter, element) ||
        sourceParameter === undefined || policy.ast.as.AsParameterDeclaration(sourceParameter)?.Initializer === undefined) return undefined;
      defaults.push(index);
    }
    methods.push({ sourceName: read.member.targetName, declaration, member: write.member, defaultArguments: Object.freeze(defaults) });
  }
  return Object.freeze({ sourceType: template.targetType,
    interfaceType: destinationTemplate === undefined ? destination.targetType
      : substituteTargetTypeParameters(destinationTemplate.targetType, arguments_), methods: Object.freeze(methods) });
}

export interface CsharpStructuralInterfaceRegistration {
  registerStructuralInterface(expression: Node, source: TargetTypeRef, destination: TargetTypeRef, sourceType?: Type): boolean;
}
