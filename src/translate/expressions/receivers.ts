import type {
  Node,
  SourceFile,
  Type,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  ExpressionPlanner,
} from "../../backend/planner/expression-planner-types.js";
import type {
  CsharpExpression,
} from "../../backend/roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "../../backend/planner/diagnostics.js";
import {
  selectCsharpFlowReadConversion,
} from "../../policy/conversions/index.js";
import type {
  CsharpTranslationContext,
} from "../context/index.js";
import {
  applyCsharpConversionSelection,
} from "./conversions.js";

export interface CsharpSelectedReceiverEvidence {
  readonly expression: Node;
  readonly type: Type;
}

export function translateCsharpSelectedReceiver(
  receiver: CsharpSelectedReceiverEvidence,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const storageType = input.types.resolveStorage(
    receiver.expression,
    sourceFile,
  );
  const selectedType = input.types.resolveSelectedValue(
    receiver.expression,
    receiver.type,
    sourceFile,
  );
  if (storageType === undefined || selectedType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      receiver.expression,
      "The exact checker-selected member receiver has no closed C# storage and selected-flow representations.",
    ));
    return undefined;
  }
  const expression = planExpression(
    receiver.expression,
    sourceFile,
    input,
    diagnostics,
  );
  const conversion = selectCsharpFlowReadConversion(
    input,
    storageType,
    selectedType,
  );
  return applyCsharpConversionSelection(
    receiver.expression,
    sourceFile,
    input,
    diagnostics,
    storageType,
    selectedType,
    conversion,
    expression,
  );
}
