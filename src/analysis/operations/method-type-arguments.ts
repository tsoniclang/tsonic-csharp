import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpSelectedTargetCall } from "../../target-model/records/objects/members.js";
import type { CsharpCallClassification, CsharpOperationIssue } from "../../target-model/records/operations/operations.js";
import { selectCsharpTypeEmission } from "../../policy/types/resolution/type-emission.js";

export function classifyMethodTypeArgumentProjections(
  policy: CsharpPolicyContext,
  selection: CsharpSelectedTargetCall,
  contextNode: Node,
  sourceFile: SourceFile,
  issues: CsharpOperationIssue[] | undefined,
): NonNullable<
  CsharpCallClassification["methodTypeArgumentProjections"]
> {
  const projections = selection.targetMember
    .csharpMethodTypeArgumentProjections ?? [];
  const refuse = (message: string, node: Node = contextNode): void => {
    issues?.push(Object.freeze({ node, code: "CSHARP_UNSUPPORTED_AST", message }));
  };
  const indexed = new Map(projections.map(projection => [projection.targetTypeParameterIndex, projection]));
  if (indexed.size !== projections.length) {
    refuse(`Selected target member '${selection.targetMember.id}' has contradictory method type-argument projections.`);
    return Object.freeze([]);
  }
  if ([...indexed.keys()].some(index => !Number.isInteger(index) || index < 0 || index >= selection.targetMethodTypeArguments.length)) {
    refuse(`Selected target member '${selection.targetMember.id}' has an out-of-range method type-argument projection.`);
    return Object.freeze([]);
  }
  return Object.freeze(selection.targetMethodTypeArguments.map((argument, index) => {
    const required = indexed.has(index);
    const projection = required && argument.kind === "selected-source"
      ? policy.objectShapes.resolveProjectConstructibleSelectedType(argument.targetType, argument.explicitTypeNode,
          argument.selectedType, contextNode, sourceFile)
      : required ? Object.freeze({ kind: "rejected" as const, reason: "Exact source-selected type evidence is required." })
        : Object.freeze({ kind: "unchanged" as const });
    const subject = argument.kind === "selected-source" ? argument.explicitTypeNode ?? contextNode : contextNode;
    if (required && argument.kind !== "selected-source")
      refuse(`Selected target member '${selection.targetMember.id}' requires exact source-selected type evidence for target method type argument ${index}.`);
    else if (projection.kind === "rejected")
      refuse(`Selected target member '${selection.targetMember.id}' cannot close target method type argument ${index}. ${projection.reason}`, subject);
    else if (!selectCsharpTypeEmission({ carrier: projection.kind === "resolved" ? projection.shape.targetType : argument.targetType }))
      refuse(`Selected target member '${selection.targetMember.id}' has an unrenderable ${required ? "unchanged " : ""}target method type argument at index ${index}.`, subject);
    return Object.freeze({ targetTypeParameterIndex: index, projection });
  }));
}
