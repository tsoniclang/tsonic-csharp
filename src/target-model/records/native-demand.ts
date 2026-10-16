import type { Node } from "@tsonic/tsts";
import { targetUseSiteRef, type TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpConversionMode } from "../conversions/selection.js";
import { csharpTargetRepresentationContractId } from "../identities/identities.js";
import { targetTypeRefKey } from "../types/equality.js";
import type { TargetTypeRef } from "../types/model.js";

export type CsharpNativeUseSlot =
  | { readonly kind: "effect" | "initializer" | "return" | "thrown" | "condition" | "receiver" | "callee" | "key" |
      "write-target" | "update-target" | "default" | "present-payload" | "constructed-result" }
  | { readonly kind: "operand"; readonly position: "only" | "left" | "right" }
  | { readonly kind: "branch"; readonly branch: "true" | "false" }
  | { readonly kind: "argument"; readonly sourceIndex: number; readonly effectiveIndex: number; readonly parameterIndex: number;
      readonly sourceParameterIndex?: number }
  | { readonly kind: "base-argument"; readonly sourceIndex: number }
  | { readonly kind: "element" | "member" | "span" | "case" | "attribute-invocation"; readonly index: number }
  | { readonly kind: "intrinsic-operand"; readonly operand: "value" | "offset" | "location" | "initial" | "left" | "right" | "argument";
      readonly index?: number };

export interface CsharpNativeUseContext {
  readonly target?: TargetTypeRef;
  readonly mode?: CsharpConversionMode;
}

export type CsharpNativeArgumentSlot = Extract<CsharpNativeUseSlot, { readonly kind: "argument" }>;

export interface CsharpNativeArgumentBinding {
  readonly sourceArgumentIndex: number;
  readonly sequence: boolean;
  readonly slot: CsharpNativeArgumentSlot;
}

export type CsharpNativeArgumentBindings =
  | { readonly kind: "bound"; readonly bindings: readonly CsharpNativeArgumentBinding[] }
  | { readonly kind: "refused" | "unresolved"; readonly reason: string }
  | { readonly kind: "inconsistent"; readonly reason: string; readonly sourceArgumentIndex?: number };

export function csharpNativeUseSite(owner: Node, slot: CsharpNativeUseSlot, context: CsharpNativeUseContext = {}): TargetUseSiteRef {
  let role: string;
  switch (slot.kind) {
    case "operand": role = `operand:${slot.position}`; break;
    case "branch": role = `branch:${slot.branch}`; break;
    case "argument":
      role = `argument:source=${slot.sourceIndex}:effective=${slot.effectiveIndex}:parameter=${slot.parameterIndex}` +
        (slot.sourceParameterIndex === undefined ? "" : `:source-parameter=${slot.sourceParameterIndex}`);
      break;
    case "base-argument": role = `base-argument:source=${slot.sourceIndex}`; break;
    case "element": case "member": case "span": case "case": case "attribute-invocation": role = `${slot.kind}:${slot.index}`; break;
    case "intrinsic-operand": role = `intrinsic-operand:${slot.operand}` + (slot.index === undefined ? "" : `:${slot.index}`); break;
    default: role = slot.kind;
  }
  const target = context.target === undefined ? "" : targetTypeRefKey(context.target);
  const mode = context.mode ?? "implicit";
  return targetUseSiteRef(owner, role, csharpTargetRepresentationContractId,
    context.target === undefined && mode === "implicit" ? undefined : `${target.length}:${target}|${mode}`);
}

export type CsharpNativeParticipation = "erased" | "frame-body" | "body" | "signature";

export interface CsharpNativeParticipationInput {
  readonly participation: { readonly get: (declaration: Node) => CsharpNativeParticipation | undefined };
}
