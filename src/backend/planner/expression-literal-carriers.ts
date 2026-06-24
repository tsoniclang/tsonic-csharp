import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import {
  csharpStringTargetType,
} from "../../source/csharp-source-semantics/target-types.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  getRuntimeCarrierForExpression,
} from "./runtime-carriers.js";
import {
  targetTypeRefsMatch,
} from "./target-types.js";

export function requireCsharpStringRuntimeCarrier(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  description: string,
): boolean {
  const carrier = getRuntimeCarrierForExpression(input, node, sourceFile);
  if (carrier === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `${description} requires a finalized target string runtime carrier fact before C# emission.`));
    return false;
  }
  if (!targetTypeRefsMatch(carrier, csharpStringTargetType())) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `${description} requires a finalized System.String runtime carrier fact before C# emission.`));
    return false;
  }
  return true;
}
