import type { Node, Type } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpStructuralInterfaceImplementation, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpStructuralInterfaceMemberEvidence } from "../../target-model/records/heritage.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../target-model/types/object-shape-members.js";
import { selectCsharpStructuralInterfaceImplementation } from "../../policy/types/objects/method-values.js";

export function selectCsharpStructuralInterface(
  policy: CsharpPolicyContext, expression: Node,
  source: CsharpObjectShapeFact | undefined, destination: CsharpObjectShapeFact | undefined,
  selectedSourceType?: Type,
): CsharpStructuralInterfaceImplementation | undefined {
  if (source === undefined || destination?.sourceType === undefined) return undefined;
  const semantics = policy.semanticsFor(expression);
  const sourceType = selectedSourceType ?? semantics.types.expressionType(expression);
  if (sourceType === undefined) return undefined;
  const selected = semantics.types.structuralMembers(sourceType, destination.sourceType);
  if (selected.kind !== "available" || selected.destination.calls.length > 0 || selected.destination.constructs.length > 0 ||
    selected.destination.indexes.length > 0 || selected.members.length !== destination.members.length) return undefined;
  const template = source.declarationTemplate ?? source;
  const destinationTemplate = destination.declarationTemplate;
  const members: CsharpStructuralInterfaceMemberEvidence[] = [];
  for (const pair of selected.members) {
    if (pair.kind !== "present") return undefined;
    const sourceSubjects = [pair.source.property.symbol, ...pair.source.property.rootSymbols, ...pair.source.declarations];
    const destinationSubjects = [pair.destination.property.symbol, ...pair.destination.property.rootSymbols, ...pair.destination.declarations];
    const read = resolveCsharpObjectShapeMemberBySelectedSubject(source, sourceSubjects);
    const write = resolveCsharpObjectShapeMemberBySelectedSubject(destination, destinationSubjects);
    const open = resolveCsharpObjectShapeMemberBySelectedSubject(template, sourceSubjects);
    const destinationMember = destinationTemplate === undefined ? write
      : resolveCsharpObjectShapeMemberBySelectedSubject(destinationTemplate, destinationSubjects);
    if (read.kind !== "resolved" || write.kind !== "resolved" || open.kind !== "resolved" ||
      destinationMember.kind !== "resolved") return undefined;
    const declaration = pair.source.declarations.length === 1 ? pair.source.declarations[0] : undefined;
    if (read.member.memberKind === "method" && declaration !== undefined &&
      !policy.ast.is.IsMethodDeclaration(declaration) && !policy.ast.is.IsMethodSignatureDeclaration(declaration)) return undefined;
    members.push(Object.freeze({ source: read.member, destination: write.member, openSource: open.member,
      openDestination: destinationMember.member,
      ...(declaration === undefined ? {} : { declaration }),
    }));
  }
  const selectedImplementation = selectCsharpStructuralInterfaceImplementation({ sourceNode: expression, source, destination, members: Object.freeze(members) });
  if (selectedImplementation === undefined) return undefined;
  if (destination.targetType.kind !== "target-named" ||
    (destination.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "interface") {
    return selectedImplementation;
  }
  const definition = policy.projectTypes.catalog.definitionForTarget(destination.targetType);
  if (definition?.kind !== "interface") return selectedImplementation;
  const ownsMember = (member: CsharpObjectShapeMemberFact): boolean =>
    member.sourceDeclarations?.some(declaration => policy.ast.parent(declaration) === definition.declaration) === true;
  return Object.freeze({ ...selectedImplementation,
    methods: Object.freeze(selectedImplementation.methods.filter(method => ownsMember(method.member))),
    properties: Object.freeze(selectedImplementation.properties.filter(property => ownsMember(property.member))),
  });
}

export interface CsharpStructuralInterfaceRegistration {
  registerStructuralInterface(expression: Node, source: TargetTypeRef, destination: TargetTypeRef, sourceType?: Type): boolean;
}
