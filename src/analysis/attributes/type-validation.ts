import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { isAstNode, type TargetSourceProgram } from "@tsonic/target-api/source";
import type { TsonicAttributeApplicationFactIndex } from "@tsonic/source-core/facts";

export function diagnoseCsharpAttributeTypeValues(
  source: TargetSourceProgram,
  applications: TsonicAttributeApplicationFactIndex,
): readonly TargetDiagnostic[] {
  const diagnostics: TargetDiagnostic[] = [];
  for (const application of applications.all) {
    const node = application.invocation;
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
