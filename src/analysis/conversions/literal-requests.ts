import type { Node } from "@tsonic/tsts";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpExactLiteralRequest } from "../../target-model/conversions/exact-literals.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpSourceLiteralIndex } from "../../target-model/records/source-literals.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

export interface CsharpExactLiteralRequestCollector {
  readonly requests: readonly CsharpExactLiteralRequest[];
  readonly requestReads: (
    expression: Node,
    sourceTypes: readonly TargetTypeRef[],
    expectedTypes: readonly TargetTypeRef[],
    operations: Pick<CsharpTargetOperationClassifications, "unaryOperation">,
  ) => void;
  readonly requestConversion: (
    expression: Node,
    source: TargetTypeRef,
    target: TargetTypeRef,
    selection: CsharpConversionSelection,
  ) => void;
}

export function createCsharpExactLiteralRequestCollector(literalValues: CsharpSourceLiteralIndex): CsharpExactLiteralRequestCollector {
  const requests: CsharpExactLiteralRequest[] = [];
  return Object.freeze({ requests, requestReads, requestConversion });

  function requestReads(
    expression: Node,
    sourceTypes: readonly TargetTypeRef[],
    expectedTypes: readonly TargetTypeRef[],
    operations: Pick<CsharpTargetOperationClassifications, "unaryOperation">,
  ): void {
    if (literalValues.literalValue.get(expression) === undefined) return;
    requests.push(Object.freeze({ expression }));
    for (const target of sourceTypes) requests.push(Object.freeze({ expression, target }));
    for (const target of expectedTypes) requests.push(Object.freeze({ expression, target }));
    const unary = operations.unaryOperation.get(expression)?.target;
    if (unary?.kind === "resolved") requests.push(Object.freeze({ expression, target: unary.resultType }));
  }

  function requestConversion(
    expression: Node,
    source: TargetTypeRef,
    target: TargetTypeRef,
    selection: CsharpConversionSelection,
  ): void {
    if (literalValues.literalValue.get(expression) === undefined) return;
    const pending: { readonly source: TargetTypeRef; readonly target: TargetTypeRef; readonly selection: CsharpConversionSelection }[] =
      [{ source, target, selection }];
    for (let entry = pending.pop(); entry !== undefined; entry = pending.pop()) {
      const current = entry.selection;
      if (current.kind === "implicit" && current.proof === "literal") {
        requests.push(Object.freeze({ expression, target: entry.target }));
      } else if (current.kind === "js-value-box") {
        requests.push(Object.freeze({ expression, target: entry.source }));
      } else if (current.kind === "nullable-map") {
        pending.push({ source: current.sourceElement, target: current.targetElement, selection: current.conversion });
      } else if (current.kind === "implicit" && current.proof === "runtime-union-arm") {
        pending.push({ source: entry.source, target: current.armType, selection: current.sourceToArm });
      } else if (current.kind === "provider-argument-adapter") {
        pending.push({ source: entry.source, target: current.adapter.inputType, selection: current.sourceToInput });
        pending.push({ source: current.adapter.resultType, target: entry.target, selection: current.resultToTarget });
      }
    }
  }
}
