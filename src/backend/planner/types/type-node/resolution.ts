import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpPlanningContext,
} from "../../context.js";
import type {
  CsharpTypeNode,
} from "../../../target-ast/roslyn/index.js";
import {
  targetPolicyDiagnostic,
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";
import {
  invalidCsharpType,
} from "../csharp-type-primitives.js";
import {
  csharpTypeFromTargetTypeRefWithObjectShapeDeclarations,
} from "../target-type-object-shapes.js";

export function getCsharpTypeForNode(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  errorType: CsharpTypeNode = invalidCsharpType("missing C# type"),
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  if (node === undefined) {
    return errorType;
  }
  const targetType = input.types.policy.resolveNode(node, sourceFile);
  if (targetType === undefined) {
    diagnostics?.push(unsupportedNodeDiagnostic(
      node,
      `C# type policy could not resolve source node kind '${input.program.source.ast.kindName(node)}' to a closed target type.`,
    ));
    return errorType;
  }
  const csharpType = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(
    input,
    targetType,
    diagnostics,
    node,
  );
  if (csharpType !== undefined) {
    return csharpType;
  }
  if (targetType.kind === "opaque") {
    diagnostics?.push(targetPolicyDiagnostic(
      node,
      "CSHARP_OPAQUE_TARGET_TYPE_UNSUPPORTED",
      `Opaque target type '${targetType.id}' has no renderable C# source representation.`,
    ));
    return errorType;
  }
  diagnostics?.push(unsupportedNodeDiagnostic(
    node,
    `C# type policy resolved '${targetType.kind}', but that target type has no renderable C# syntax.`,
  ));
  return errorType;
}
