import type { CsharpTranslationContext } from "../../translate/context/index.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  HasSourceKind,
  KindFalseKeyword,
  KindTrueKeyword,
} from "./source-ast.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  missingCarrierDiagnosticDetail,
  probeCarrierFromResolution,
  resolveRuntimeCarrierForExpression,
} from "./runtime-carriers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

export function requireCsharpBoolRuntimeCarrier(
  expression: Node,
  context: string,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): boolean {
  if (HasSourceKind(input.ast, expression, KindTrueKeyword) || HasSourceKind(input.ast, expression, KindFalseKeyword)) {
    return true;
  }
  const carrierResolution = resolveRuntimeCarrierForExpression(input, expression, sourceFile);
  const carrier = probeCarrierFromResolution(carrierResolution);
  if (carrier === undefined) {
    const detail = missingCarrierDiagnosticDetail(carrierResolution, "Runtime carrier fact is missing for the condition expression.");
    diagnostics.push(unsupportedNodeDiagnostic(expression, `${context} requires a finalized C# bool runtime carrier; TypeScript truthiness must be resolved by TSTS/provider facts before C# emission. ${detail.reason}`, detail.evidence));
    return false;
  }
  if (!isCsharpBoolType(csharpTypeFromTargetTypeRef(carrier))) {
    diagnostics.push(unsupportedNodeDiagnostic(expression, `${context} requires a finalized C# bool runtime carrier; TypeScript truthiness must be resolved by TSTS/provider facts before C# emission.`));
    return false;
  }
  return true;
}

function isCsharpBoolType(type: CsharpTypeNode | undefined): boolean {
  return type?.kind === "PredefinedType" && type.name === "bool";
}
