import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/context.js";
import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import { isCsharpValueTypeTargetType, resolveCsharpObjectShapeMemberBySelectedSubject, targetTypeRefEquals } from "../../target-model/types/index.js";

export function selectCsharpStructuralInterface(
  policy: CsharpPolicyContext, expression: Node,
  source: CsharpObjectShapeFact | undefined, destination: CsharpObjectShapeFact | undefined,
): boolean {
  if (source === undefined || destination?.sourceType === undefined ||
    (destination.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract !== true ||
    isCsharpValueTypeTargetType(source.targetType) || source.members.some(member => member.bound === true)) return false;
  const semantics = policy.semanticsFor(expression);
  const sourceType = semantics.types.expressionType(expression);
  if (sourceType === undefined) return false;
  const selected = semantics.types.structuralMembers(sourceType, destination.sourceType);
  if (selected.kind !== "available" || selected.destination.calls.length > 0 || selected.destination.constructs.length > 0 ||
    selected.destination.indexes.length > 0 || selected.members.length !== destination.members.length) return false;
  return selected.members.every(pair => {
    if (pair.kind !== "present") return false;
    const read = resolveCsharpObjectShapeMemberBySelectedSubject(source,
      [pair.source.property.symbol, ...pair.source.property.rootSymbols, ...pair.source.declarations]);
    const write = resolveCsharpObjectShapeMemberBySelectedSubject(destination,
      [pair.destination.property.symbol, ...pair.destination.property.rootSymbols, ...pair.destination.declarations]);
    return read.kind === "resolved" && write.kind === "resolved" &&
      read.member.targetName === write.member.targetName && read.member.memberKind === write.member.memberKind &&
      targetTypeRefEquals(read.member.type, write.member.type) &&
      (write.member.readonly === true || read.member.accessor === undefined || read.member.accessor.setter === true);
  });
}

export interface CsharpStructuralInterfaceRegistration {
  registerStructuralInterface(expression: Node, source: TargetTypeRef, destination: TargetTypeRef): boolean;
}
