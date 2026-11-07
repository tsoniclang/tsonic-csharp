import type { Node } from "@tsonic/tsts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpExactLiteralRequest } from "../../target-model/conversions/exact-literals.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";

export interface CsharpExactLiteralRequestCollector {
  readonly requests: readonly CsharpExactLiteralRequest[];
  readonly seal: () => readonly CsharpExactLiteralRequest[];
  readonly requestReads: (
    expression: Node,
    physicalSource: TargetTypeRef | undefined,
    sourceTypes: readonly TargetTypeRef[],
    expectedTypes: readonly TargetTypeRef[],
    operations: Pick<CsharpTargetOperationClassifications, "unaryOperation">,
  ) => void;
  readonly requestConversion: (
    expression: Node,
    source: TargetTypeRef,
    target: TargetTypeRef,
    selection: CsharpConversionSelection,
    physicalSource: TargetTypeRef | undefined,
  ) => void;
}

interface CsharpRequestedLiteralEndpoint {
  request: CsharpExactLiteralRequest;
  readonly positions: number[];
}

export function createCsharpExactLiteralRequestCollector(facts: SourceProgramFacts): CsharpExactLiteralRequestCollector {
  const requests: CsharpExactLiteralRequest[] = [];
  const requestedTargets = new WeakMap<Node, Map<string, CsharpRequestedLiteralEndpoint>>();
  let closed = false;
  return Object.freeze({ requests, requestReads, requestConversion, seal });

  function seal(): readonly CsharpExactLiteralRequest[] {
    if (closed) return failTargetAnalysisInvariant("tsonic-csharp", "Exact native literal requests close exactly once.");
    closed = true;
    return Object.freeze(requests);
  }

  function request(expression: Node, source: TargetTypeRef | undefined, target?: TargetTypeRef): void {
    collectRequest(requests, requestedTargets, { expression, source, ...(target === undefined ? {} : { target }) }, closed);
  }

  function requestReads(
    expression: Node,
    physicalSource: TargetTypeRef | undefined,
    sourceTypes: readonly TargetTypeRef[],
    expectedTypes: readonly TargetTypeRef[],
    operations: Pick<CsharpTargetOperationClassifications, "unaryOperation">,
  ): void {
    if (closed) return failTargetAnalysisInvariant("tsonic-csharp", "Closed native literal requests cannot read another source use.", expression);
    if (facts.values.literal(expression) === undefined) return;
    request(expression, physicalSource);
    for (const target of sourceTypes) request(expression, physicalSource, target);
    for (const target of expectedTypes) request(expression, physicalSource, target);
    const unary = operations.unaryOperation.get(expression)?.target;
    if (unary?.kind === "resolved") request(expression, physicalSource, unary.resultType);
  }

  function requestConversion(
    expression: Node,
    source: TargetTypeRef,
    target: TargetTypeRef,
    selection: CsharpConversionSelection,
    physicalSource: TargetTypeRef | undefined,
  ): void {
    if (facts.values.literal(expression) === undefined) return;
    const pending: { readonly source: TargetTypeRef; readonly target: TargetTypeRef; readonly selection: CsharpConversionSelection }[] =
      [{ source, target, selection }];
    for (let entry = pending.pop(); entry !== undefined; entry = pending.pop()) {
      const current = entry.selection;
      if (current.kind === "implicit" && current.proof === "literal") {
        request(expression, physicalSource, entry.target);
      } else if (current.kind === "js-value-box") {
        request(expression, physicalSource, entry.source);
      } else if (current.kind === "exact-number-erasure") {
        // A3: the literal is requested for the erasure destination (float64), never boxed as its int64 carrier.
        request(expression, physicalSource, current.result);
        pending.push({ source: current.result, target: entry.target, selection: current.conversion });
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

export function coalesceCsharpExactLiteralRequests(
  requests: Iterable<CsharpExactLiteralRequest>,
): readonly CsharpExactLiteralRequest[] {
  const selected: CsharpExactLiteralRequest[] = [];
  const endpoints = new WeakMap<Node, Map<string, CsharpRequestedLiteralEndpoint>>();
  for (const request of requests) collectRequest(selected, endpoints, request, false);
  return Object.freeze([...new Set(selected)]);
}

function collectRequest(
  requests: CsharpExactLiteralRequest[],
  endpoints: WeakMap<Node, Map<string, CsharpRequestedLiteralEndpoint>>,
  request: CsharpExactLiteralRequest,
  closed: boolean,
): void {
  if (!Object.prototype.hasOwnProperty.call(request, "source")) return failTargetAnalysisInvariant("tsonic-csharp",
    "An exact literal request requires its completed native source field.", request.expression);
  const role = request.propertyKey === undefined ? "value" : "property-key";
  if (role === "property-key" && request.source !== undefined) failTargetAnalysisInvariant("tsonic-csharp",
    "A property-key literal request has no runtime value source.", request.expression);
  const key = role + ":" + (request.target === undefined ? "" : targetTypeRefKey(request.target));
  let targets = endpoints.get(request.expression);
  let endpoint = targets?.get(key);
  if (endpoint === undefined) {
    if (closed) return failTargetAnalysisInvariant("tsonic-csharp",
      "A consumed native literal conversion requires its exact endpoint before literal publication.", request.expression);
    if (targets === undefined) {
      targets = new Map();
      endpoints.set(request.expression, targets);
    }
    endpoint = { request: Object.freeze(request), positions: [] };
    targets.set(key, endpoint);
  }
  const previous = endpoint.request;
  if (previous.source !== undefined && request.source !== undefined &&
    !targetTypeRefEquals(previous.source, request.source)) return failTargetAnalysisInvariant("tsonic-csharp",
      "An exact literal endpoint requires one completed native source carrier.", request.expression);
  if (previous.source === undefined && request.source !== undefined) {
    if (closed) return failTargetAnalysisInvariant("tsonic-csharp",
      "A completed native literal source is required before literal publication.", request.expression);
    endpoint.request = Object.freeze({ ...previous, source: request.source });
    for (const position of endpoint.positions) requests[position] = endpoint.request;
  }
  if (closed) return;
  endpoint.positions.push(requests.length);
  requests.push(endpoint.request);
}
