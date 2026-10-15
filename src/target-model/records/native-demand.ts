import type { Node } from "@tsonic/tsts";
import { targetUseSiteRef, type TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpConversionMode } from "../conversions/selection.js";
import { csharpTargetRepresentationContractId } from "../identities/identities.js";
import { targetTypeRefKey } from "../types/equality.js";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpNativeLocationSelection } from "./native-locations.js";
import type { CsharpNativeHandler } from "./operations.js";

export type CsharpNativeCompletion =
  | { readonly kind: "value"; readonly carrier: TargetTypeRef }
  | { readonly kind: "void"; readonly carrier: TargetTypeRef }
  | { readonly kind: "never"; readonly carrier: TargetTypeRef };

export type CsharpNativeUseSlot =
  | {
      readonly kind:
        | "effect"
        | "initializer"
        | "return"
        | "thrown"
        | "condition"
        | "receiver"
        | "callee"
        | "key"
        | "write-target"
        | "update-target"
        | "default"
        | "present-payload"
        | "constructed-result";
    }
  | { readonly kind: "operand"; readonly position: "only" | "left" | "right" }
  | { readonly kind: "branch"; readonly branch: "true" | "false" }
  | { readonly kind: "argument"; readonly sourceIndex: number; readonly effectiveIndex: number; readonly parameterIndex?: number }
  | { readonly kind: "base-argument"; readonly sourceIndex: number }
  | { readonly kind: "element" | "member" | "span" | "case" | "attribute-invocation"; readonly index: number }
  | {
      readonly kind: "intrinsic-operand";
      readonly operand: "value" | "offset" | "location" | "initial" | "left" | "right" | "argument";
      readonly index?: number;
    };

export interface CsharpNativeUseContext {
  readonly target?: TargetTypeRef;
}

export type CsharpNativeUse =
  | {
      readonly kind: "converted";
      readonly expression: Node;
      readonly input: CsharpNativeCompletion;
      readonly target: TargetTypeRef;
      readonly mode: CsharpConversionMode;
      readonly children: readonly TargetUseSiteRef[];
      readonly completion: CsharpNativeCompletion;
    }
  | {
      readonly kind: "constructed" | "forwarded";
      readonly expression: Node;
      readonly children: readonly TargetUseSiteRef[];
      readonly completion: CsharpNativeCompletion;
    }
  | {
      readonly kind: "value";
      readonly expression: Node;
      readonly handler?: CsharpNativeHandler;
      readonly children: readonly TargetUseSiteRef[];
      readonly completion: CsharpNativeCompletion;
    }
  | {
      readonly kind: "location";
      readonly expression: Node;
      readonly location: Extract<CsharpNativeLocationSelection, { readonly kind: "resolved" }>;
      readonly children: readonly TargetUseSiteRef[];
      readonly completion: CsharpNativeCompletion;
    }
  | {
      readonly kind: "effect";
      readonly expression: Node;
      readonly children: readonly TargetUseSiteRef[];
      readonly completion: CsharpNativeCompletion;
    }
  | {
      readonly kind: "erased";
      readonly expression: Node;
      readonly cause: "erased-statement" | "discarded-callable" | "unemitted-body" | "intrinsic-unconsumed";
    };

export interface CsharpNativeUseClassifications {
  readonly nativeUse: { readonly get: (site: TargetUseSiteRef) => CsharpNativeUse | undefined };
}

export type CsharpNativeParticipation = "erased" | "frame-body" | "body" | "signature";

export interface CsharpNativeParticipationInput {
  readonly participation: { readonly get: (declaration: Node) => CsharpNativeParticipation | undefined };
}

export interface CsharpExpectedNativeUse {
  readonly expression: Node;
  readonly target: TargetTypeRef;
  readonly strength: "contextual" | "required";
  readonly representation: "convert" | "construct" | "forward";
  readonly mode: CsharpConversionMode;
  readonly children: readonly TargetUseSiteRef[];
}

export interface CsharpExpectedNativeUseInput {
  readonly expectedUse: { readonly get: (site: TargetUseSiteRef) => CsharpExpectedNativeUse | undefined };
}

export function csharpNativeUseSite(
  owner: Node,
  slot: CsharpNativeUseSlot,
  context: CsharpNativeUseContext = {},
): TargetUseSiteRef {
  return targetUseSiteRef(
    owner,
    csharpNativeUseRole(slot),
    csharpTargetRepresentationContractId,
    context.target === undefined ? undefined : targetTypeRefKey(context.target),
  );
}

function csharpNativeUseRole(slot: CsharpNativeUseSlot): string {
  switch (slot.kind) {
    case "operand":
      return `operand:${slot.position}`;
    case "branch":
      return `branch:${slot.branch}`;
    case "argument":
      return `argument:source=${slot.sourceIndex}:effective=${slot.effectiveIndex}` +
        (slot.parameterIndex === undefined ? "" : `:parameter=${slot.parameterIndex}`);
    case "base-argument":
      return `base-argument:source=${slot.sourceIndex}`;
    case "element":
    case "member":
    case "span":
    case "case":
    case "attribute-invocation":
      return `${slot.kind}:${slot.index}`;
    case "intrinsic-operand":
      return `intrinsic-operand:${slot.operand}` + (slot.index === undefined ? "" : `:${slot.index}`);
    default:
      return slot.kind;
  }
}
