import {
  AsIdentifier,
  HasSourceKind,
  KindIdentifier,
  KindPrivateIdentifier,
  KindString,
  Node_Text,
} from "./source-ast.js";
import type { Node } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import { requireCsharpIdentifier } from "./identifiers.js";
import {
  csharpTargetNameFactKey,
} from "../../source/csharp-facts.js";

export function planIdentifierName(
  node: Node | undefined,
  errorName: string,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  description: string,
): string {
  if (node === undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_NAME",
      category: "error",
      source: "tsonic-csharp",
      message: `${description} must be present for direct C# source emission; backend name synthesis is not allowed without finalized TSTS/provider facts.`,
    });
    return errorName;
  }
  if (HasSourceKind(input.ast, node, KindIdentifier)) {
    return requireCsharpIdentifier(Node_Text(input.ast, AsIdentifier(node)), diagnostics, description);
  }
  if (HasSourceKind(input.ast, node, KindPrivateIdentifier)) {
    const targetName = getFinalizedTargetName(node, input);
    if (targetName !== undefined) {
      return targetName;
    }
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_NAME",
      category: "error",
      source: "tsonic-csharp",
      message: `${description} is a private JavaScript identifier and requires a finalized C# target-name fact before emission.`,
    });
    return errorName;
  }
  diagnostics.push({
    code: "CSHARP_UNSUPPORTED_NAME",
    category: "error",
    source: "tsonic-csharp",
    message: `${description} must be an identifier for direct C# source emission. Node kind: ${KindString(node.Kind)}.`,
  });
  return errorName;
}

function getFinalizedTargetName(
  node: Node,
  input: TargetCompileInput,
): string | undefined {
  const direct = input.facts.getFact(node, csharpTargetNameFactKey)?.name;
  if (direct !== undefined) {
    return direct;
  }
  const sourceFile = input.ast.getSourceFile(node);
  if (sourceFile === undefined) {
    return undefined;
  }
  const symbol = input.analysis.getSymbolAtLocation(node, { sourceFile }) ??
    input.analysis.getResolvedSymbol(node, { sourceFile });
  return input.facts.getFact(symbol, csharpTargetNameFactKey)?.name;
}
