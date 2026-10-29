import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import { getCsharpDelegateSignature } from "../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../target-model/types/object-shape-members.js";

export function selectCsharpParameterDefaultContext(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  owner: Node,
) {
  if (policy.ast.is.IsFunctionExpression(owner) && policy.ast.name(owner) !== undefined &&
    policy.navigation.declarationUses(owner).some(use =>
      use.kind !== "type-only" && !evidence.compileTimeMetadata.get(use.reference))) return undefined;
  const direct = evidence.contextualType.get(owner)?.targetType;
  const signature = getCsharpDelegateSignature(getCsharpNullableElementTargetType(direct) ?? direct);
  if (signature !== undefined) return signature;
  if (!policy.ast.is.IsMethodDeclaration(owner)) return undefined;
  const literal = policy.ast.parent(owner);
  if (literal === undefined || !policy.ast.is.IsObjectLiteralExpression(literal)) return undefined;
  const element = policy.semanticsFor(owner).operations.objectLiteralElement(owner);
  if (element === undefined || element.objectLiteral !== literal || element.element !== owner) return undefined;
  const target = evidence.contextualType.get(literal)?.targetType;
  const present = getCsharpNullableElementTargetType(target) ?? target;
  const shape = present === undefined ? undefined : policy.objectShapes.resolveTarget(present);
  if (shape === undefined) return undefined;
  const selected = resolveCsharpObjectShapeMemberBySelectedSubject(shape,
    [element.sourceSelectedSymbol, ...element.sourceSelectedDeclarations]);
  if (selected.kind !== "resolved" || selected.member.memberKind !== "method") return undefined;
  return getCsharpDelegateSignature(getCsharpNullableElementTargetType(selected.member.type) ?? selected.member.type);
}
