import type { CsharpJsValueOperationSelection } from "../../../../target-model/operations/js-values.js";
import type { CsharpClosedTypeTest } from "../../../../target-model/operations/type-tests.js";
import type { CsharpCallForm } from "../../../../target-model/records/operations.js";
import type { CsharpSourceFlowCallSelection } from "../../../../target-model/records/source-flow.js";

export function selectCsharpCallForm(
  typeTest: CsharpClosedTypeTest | undefined,
  sourceFlow: CsharpSourceFlowCallSelection,
  jsValue: CsharpJsValueOperationSelection,
): CsharpCallForm {
  if (typeTest !== undefined) return Object.freeze({ kind: "type-test", typeTest });
  switch (sourceFlow.kind) {
    case "keep-alive":
      return Object.freeze({ kind: "keep-alive", sourceFlow: Object.freeze({
        kind: "keep-alive", valueExpression: sourceFlow.valueExpression,
      }) });
    case "rejected":
      return Object.freeze({ kind: "source-flow-rejected", sourceFlow: Object.freeze({
        kind: "rejected", code: sourceFlow.code, reason: sourceFlow.reason,
      }) });
    case "not-source-flow":
      return Object.freeze(jsValue.kind === "not-js-value" ? { kind: "target" } : { kind: "js-value", operation: jsValue });
  }
}
