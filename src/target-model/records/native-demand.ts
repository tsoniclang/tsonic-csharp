import type { Node } from "@tsonic/tsts";
import { targetUseSiteRef, type TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpConversionMode } from "../conversions/selection.js";
import { csharpTargetRepresentationContractId } from "../identities/identities.js";
import { targetTypeRefKey } from "../types/equality.js";
import type { TargetTypeRef } from "../types/model.js";
import type { CsharpSelectedTargetCall } from "./members.js";
import type { CsharpNativeLocationSelection } from "./native-locations.js";
import type { CsharpNativeHandler, CsharpSourceArgumentGrouping } from "./operations.js";

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
      readonly cause: "erased-statement" | "discarded-callable";
    };

export type CsharpNativeOrderStep =
  | { readonly kind: "use"; readonly site: TargetUseSiteRef }
  | { readonly kind: "construct"; readonly construct: Node };

export interface CsharpNativeUseClassifications {
  readonly nativeUse: {
    readonly get: (site: TargetUseSiteRef) => CsharpNativeUse | undefined;
    readonly order: (construct: Node) => readonly CsharpNativeOrderStep[] | undefined;
  };
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

export type CsharpNativeArgumentSlot = Extract<CsharpNativeUseSlot, { readonly kind: "argument" }>;

export interface CsharpNativeArgumentBinding {
  readonly sourceArgumentIndex: number;
  readonly sequence: boolean;
  readonly slot: CsharpNativeArgumentSlot;
}

function argumentBinding(sourceArgumentIndex: number, effectiveIndex: number, parameterIndex: number, sequence: boolean): CsharpNativeArgumentBinding {
  return Object.freeze({ sourceArgumentIndex, sequence,
    slot: Object.freeze({ kind: "argument" as const, sourceIndex: sourceArgumentIndex, effectiveIndex, parameterIndex }) });
}

export function csharpNativePositionalArgumentSlot(sourceIndex: number): CsharpNativeArgumentSlot {
  return Object.freeze({ kind: "argument", sourceIndex, effectiveIndex: sourceIndex });
}

export type CsharpNativeArgumentBindings =
  | { readonly kind: "bound"; readonly bindings: readonly CsharpNativeArgumentBinding[] }
  | { readonly kind: "refused" }
  | { readonly kind: "unresolved" }
  | { readonly kind: "inconsistent"; readonly sourceArgumentIndex: number };

const refusedBindings: CsharpNativeArgumentBindings = Object.freeze({ kind: "refused" });
const unresolvedBindings: CsharpNativeArgumentBindings = Object.freeze({ kind: "unresolved" });

export function csharpSelectedTargetArgumentBindings(call: CsharpSelectedTargetCall): CsharpNativeArgumentBindings {
  const sequences = new Map((call.sequenceArguments ?? []).map(sequence => [sequence.sourceArgumentIndex, sequence]));
  const bound = new Set<number>();
  const bindings: CsharpNativeArgumentBinding[] = [];
  for (const selection of call.arguments) {
    const sequence = sequences.get(selection.sourceArgumentIndex);
    if (sequence !== undefined && bound.has(sequence.sourceArgumentIndex)) continue;
    if (sequence !== undefined && sequence.targetParameterIndex !== selection.targetParameterIndex) {
      return Object.freeze({ kind: "inconsistent", sourceArgumentIndex: selection.sourceArgumentIndex });
    }
    if (sequence !== undefined) bound.add(sequence.sourceArgumentIndex);
    bindings.push(argumentBinding(selection.sourceArgumentIndex, selection.effectiveArgumentIndex, selection.targetParameterIndex,
      sequence !== undefined));
  }
  return Object.freeze({ kind: "bound", bindings: Object.freeze(bindings) });
}

export function csharpSourceOwnedArgumentBindings(grouping: CsharpSourceArgumentGrouping | undefined): CsharpNativeArgumentBindings {
  if (grouping === undefined || grouping.kind === "unresolved") return unresolvedBindings;
  if (grouping.kind === "refused") return refusedBindings;
  return Object.freeze({ kind: "bound", bindings: Object.freeze(grouping.arguments.map(entry =>
    argumentBinding(entry.sourceArgumentIndex, entry.effectiveArgumentIndex, entry.parameterIndex, entry.spread))) });
}
