import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpTranslationContext,
} from "../../../translate/context/index.js";
import type {
  CsharpTypeNode,
} from "../../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  invalidCsharpType,
} from "../csharp-type-primitives.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";

export function getCsharpTypeForNode(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  errorType: CsharpTypeNode = invalidCsharpType("missing C# type"),
  diagnostics?: TargetDiagnostic[],
): CsharpTypeNode {
  if (node === undefined) {
    return errorType;
  }
  const targetType = input.types.resolveNode(node, sourceFile);
  if (targetType === undefined) {
    diagnostics?.push(unsupportedNodeDiagnostic(
      node,
      `C# type policy could not resolve source node kind '${input.ast.kindName(node)}' to a closed target type.`,
    ));
    return errorType;
  }
  const csharpType = csharpTypeFromTargetTypeRef(targetType);
  if (csharpType !== undefined) {
    return csharpType;
  }
  diagnostics?.push(unsupportedNodeDiagnostic(
    node,
    `C# type policy resolved '${targetType.kind}', but that target type has no renderable C# syntax.`,
  ));
  return errorType;
}
