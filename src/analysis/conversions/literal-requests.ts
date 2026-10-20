import type { Node } from "@tsonic/tsts";
import type { SourceLiteralIndex } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpExactLiteralRequest } from "../../target-model/conversions/exact-literals.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";

export interface CsharpExactLiteralRequestCollector {
  readonly requests: readonly CsharpExactLiteralRequest[];
  readonly seal: () => readonly CsharpExactLiteralRequest[];
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

export function createCsharpExactLiteralRequestCollector(literalValues: SourceLiteralIndex): CsharpExactLiteralRequestCollector {
  const requests: CsharpExactLiteralRequest[] = [];
  const requestedTargets = new WeakMap<Node, Set<string>>();
  let closed = false;
  return Object.freeze({ requests, requestReads, requestConversion, seal });

  function seal(): readonly CsharpExactLiteralRequest[] {
    if (closed) return failTargetAnalysisInvariant("tsonic-csharp", "Exact native literal requests close exactly once.");
    closed = true;
    return Object.freeze(requests);
  }

  function request(expression: Node, target?: TargetTypeRef): void {
    const key = target === undefined ? "" : targetTypeRefKey(target);
    let targets = requestedTargets.get(expression);
    if (closed) {
      if (targets?.has(key) !== true) failTargetAnalysisInvariant("tsonic-csharp",
        "A consumed native literal conversion requires its exact endpoint before literal publication.", expression);
      return;
    }
    if (targets === undefined) {
      targets = new Set();
      requestedTargets.set(expression, targets);
    }
    if (targets.has(key)) return;
    targets.add(key);
    requests.push(Object.freeze({ expression, ...(target === undefined ? {} : { target }) }));
  }

  function requestReads(
    expression: Node,
    sourceTypes: readonly TargetTypeRef[],
    expectedTypes: readonly TargetTypeRef[],
    operations: Pick<CsharpTargetOperationClassifications, "unaryOperation">,
  ): void {
    if (closed) return failTargetAnalysisInvariant("tsonic-csharp", "Closed native literal requests cannot read another source use.", expression);
    if (literalValues.literalValue.get(expression) === undefined) return;
    request(expression);
    for (const target of sourceTypes) request(expression, target);
    for (const target of expectedTypes) request(expression, target);
    const unary = operations.unaryOperation.get(expression)?.target;
    if (unary?.kind === "resolved") request(expression, unary.resultType);
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
        request(expression, entry.target);
      } else if (current.kind === "js-value-box") {
        request(expression, entry.source);
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
