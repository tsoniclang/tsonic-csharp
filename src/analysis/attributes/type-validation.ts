import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { isAstNode, type TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpAttributeApplicationFactIndex } from "./application-index.js";

export function diagnoseCsharpAttributeTypeValues(
  source: TargetSourceProgram,
  applications: CsharpAttributeApplicationFactIndex,
): readonly TargetDiagnostic[] {
  const diagnostics: TargetDiagnostic[] = [];
  for (const application of applications.all) {
    const node = application.invocation;
    if (application.applicationPlacement === "module") {
      diagnostics.push({
        code: "CSHARP_ATTRIBUTE_MODULE_NOT_SUPPORTED",
        category: "error",
        source: "tsonic-csharp",
        message: "A source-module attribute has no corresponding C# source-module declaration; it does not implicitly select an assembly or CLR module.",
        ...(isAstNode(source.ast, node) ? { sourceNode: node } : {}),
      });
      continue;
    }
    const semantics = isAstNode(source.ast, node) ? source.semantics.forNode(node) : undefined;
    if (isAstNode(source.ast, node) && source.ast.is.IsNewExpression(node) &&
      semantics?.operations.call(node)?.outcome === "applicable") continue;
    diagnostics.push({
      code: "CSHARP_ATTRIBUTE_CONSTRUCTION_REQUIRED",
      category: "error",
      source: "tsonic-csharp",
      message: "A C# attribute requires an inline lambda containing an exact checked construction: () => new AttributeType(...).",
      ...(isAstNode(source.ast, node) ? { sourceNode: node } : {}),
    });
  }
  return diagnostics;
}
