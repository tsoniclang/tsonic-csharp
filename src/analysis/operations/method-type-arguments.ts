import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpSelectedTargetCall } from "../../target-model/records/members.js";
import type { CsharpCallClassification } from "../../target-model/records/operations.js";

export function classifyMethodTypeArgumentProjections(
  policy: CsharpPolicyContext,
  selection: CsharpSelectedTargetCall,
  contextNode: Node,
  sourceFile: SourceFile,
): NonNullable<
  CsharpCallClassification["methodTypeArgumentProjections"]
> {
  const projections = selection.targetMember
    .csharpMethodTypeArgumentProjections ?? [];
  return Object.freeze(projections.flatMap((projection) => {
    const argument = selection.targetMethodTypeArguments[
      projection.targetTypeParameterIndex
    ];
    if (argument?.kind !== "selected-source") {
      return [];
    }
    return [Object.freeze({
      targetTypeParameterIndex: projection.targetTypeParameterIndex,
      projection: policy.objectShapes.resolveProjectConstructibleSelectedType(
        argument.targetType,
        argument.explicitTypeNode,
        argument.selectedType,
        contextNode,
        sourceFile,
      ),
    })];
  }));
}
