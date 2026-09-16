import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { isAstNode, type TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpAttributeApplicationFactIndex } from "./application-index.js";

export function diagnoseCsharpAttributeTypeValues(
  source: TargetSourceProgram,
  applications: CsharpAttributeApplicationFactIndex,
): readonly TargetDiagnostic[] {
  const diagnostics: TargetDiagnostic[] = [];
  for (const application of applications.all) {
    const node = application.attributeType;
    const semantics = isAstNode(source.ast, node) ? source.semantics.forNode(node) : undefined;
    const type = isAstNode(source.ast, node) ? semantics?.types.expressionType(node) : undefined;
    if (type !== undefined && semantics!.types.constructSignatures(type).length > 0) continue;
    diagnostics.push({
      code: "CSHARP_ATTRIBUTE_TYPE_NOT_CONSTRUCTIBLE",
      category: "error",
      source: "tsonic-csharp",
      message: "An attribute requires an exact checked constructor type; an ordinary object value is not an attribute type.",
      ...(isAstNode(source.ast, node) ? { sourceNode: node } : {}),
    });
  }
  return diagnostics;
}
