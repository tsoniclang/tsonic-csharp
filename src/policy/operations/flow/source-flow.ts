import {
  flowStateFactKey,
} from "@tsonic/tsts";
import type {
  FlowStateFact,
  ExtensionFactSubject,
  Node,
  ReadonlySourceFactResolver,
} from "@tsonic/tsts";
import type {
  CsharpPolicyContext,
} from "../../context.js";
import { tsonicKeepAliveFactKey } from "@tsonic/source-core/facts";

export function readCsharpSourceKeepAlive(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): { readonly call: Node; readonly valueExpression: Node } | undefined {
  const fact = sourceFacts?.getFact(subject, tsonicKeepAliveFactKey);
  return fact === undefined ? undefined : Object.freeze({
    call: fact.call,
    valueExpression: fact.valueExpression,
  });
}

export type CsharpSourceFlowCallSelection =
  | { readonly kind: "not-source-flow" }
  | { readonly kind: "keep-alive"; readonly valueExpression: Node }
  | {
      readonly kind: "rejected";
      readonly code: "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED" | "CSHARP_KEEP_ALIVE_EVIDENCE_CONFLICT";
      readonly reason: string;
    };

export function selectCsharpSourceFlowCall(
  input: CsharpPolicyContext,
  call: Node,
): CsharpSourceFlowCallSelection {
  const keepAlive = readCsharpSourceKeepAlive(input.sourceFacts, call);
  if (keepAlive !== undefined) {
    const arguments_ = input.ast.arguments(call);
    if (keepAlive.call !== call || arguments_.length !== 1 || arguments_[0] !== keepAlive.valueExpression) {
      return { kind: "rejected", code: "CSHARP_KEEP_ALIVE_EVIDENCE_CONFLICT",
        reason: "Reachability requires the exact selected source call and value." };
    }
    return { kind: "keep-alive", valueExpression: keepAlive.valueExpression };
  }
  const flowState = input.sourceFacts?.getFact(call, flowStateFactKey);
  return flowState === undefined
    ? { kind: "not-source-flow" }
    : {
        kind: "rejected",
        code: "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED",
        reason:
          `C# target does not implement source flow marker '${sourceFlowMarkerName(flowState)}'; this intrinsic requires an explicit target contract and cannot be erased or lowered as an identity call.`,
      };
}

function sourceFlowMarkerName(
  flowState: FlowStateFact,
): "shared-borrow" | "mutable-borrow" | "move" {
  switch (flowState.state) {
    case "borrowed-shared":
      return "shared-borrow";
    case "borrowed-mut":
      return "mutable-borrow";
    case "moved":
      return "move";
  }
}
