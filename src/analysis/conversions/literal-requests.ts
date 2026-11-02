import type { Node } from "@tsonic/tsts";
import type { SourceLiteralIndex } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpExactLiteralRequest, CsharpExactLiteralValueRequest } from "../../target-model/conversions/exact-literals.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";

export interface CsharpExactLiteralRequestCollector {
  readonly requests: readonly CsharpExactLiteralRequest[];
  readonly seal: () => readonly CsharpExactLiteralRequest[];
  readonly requestReads: (
    expression: Node,
    sourceTypes: readonly TargetTypeRef[],
    expectedTypes: readonly TargetTypeRef[],
    operations: Pick<CsharpTargetOperationClassifications, "unaryOperation">,
    source: TargetTypeRef | undefined,
  ) => void;
  readonly requestConversion: (
    expression: Node,
    source: TargetTypeRef,
    target: TargetTypeRef,
    selection: CsharpConversionSelection,
  ) => void;
}

export function createCsharpExactLiteralRequestCollector(literalValues: SourceLiteralIndex): CsharpExactLiteralRequestCollector {
  const requests: CsharpExactLiteralValueRequest[] = [];
  const requestedTargets = new WeakMap<Node, Map<string, number>>();
  let closed = false;
  return Object.freeze({ requests, requestReads, requestConversion, seal });

  function seal(): readonly CsharpExactLiteralRequest[] {
    if (closed) return failTargetAnalysisInvariant("tsonic-csharp", "Exact native literal requests close exactly once.");
    closed = true;
    return Object.freeze(requests);
  }

  function request(expression: Node, target: TargetTypeRef | undefined, source: TargetTypeRef | undefined): void {
    const key = target === undefined ? "" : targetTypeRefKey(target);
    let targets = requestedTargets.get(expression);
    const index = targets?.get(key);
    if (index !== undefined) {
      const previous = requests[index]!;
      if (previous.source !== undefined && source !== undefined && !targetTypeRefEquals(previous.source, source)) {
        failTargetAnalysisInvariant("tsonic-csharp", "An exact literal endpoint requires one completed native source carrier.", expression);
      }
      if (previous.source === undefined && source !== undefined) {
        if (closed) failTargetAnalysisInvariant("tsonic-csharp", "A closed exact literal endpoint cannot acquire source evidence.", expression);
        requests[index] = Object.freeze({ ...previous, source });
      }
      return;
    }
    if (closed) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "A consumed native literal conversion requires its exact endpoint before literal publication.", expression);
    }
    if (targets === undefined) {
      targets = new Map();
      requestedTargets.set(expression, targets);
    }
    targets.set(key, requests.length);
    requests.push(Object.freeze({ expression, source, ...(target === undefined ? {} : { target }) }));
  }

  function requestReads(
    expression: Node,
    sourceTypes: readonly TargetTypeRef[],
    expectedTypes: readonly TargetTypeRef[],
    operations: Pick<CsharpTargetOperationClassifications, "unaryOperation">,
    source: TargetTypeRef | undefined,
  ): void {
    if (closed) return failTargetAnalysisInvariant("tsonic-csharp", "Closed native literal requests cannot read another source use.", expression);
    if (literalValues.literalValue.get(expression) === undefined) return;
    request(expression, undefined, source);
    for (const target of sourceTypes) request(expression, target, source);
    for (const target of expectedTypes) request(expression, target, source);
    const unary = operations.unaryOperation.get(expression)?.target;
    if (unary?.kind === "resolved") request(expression, unary.resultType, source);
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
        request(expression, entry.target, source);
      } else if (current.kind === "js-value-box") {
        request(expression, entry.source, source);
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
