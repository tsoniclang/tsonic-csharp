import type { Node } from "@tsonic/tsts";
import { targetUseSiteRef, type TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpConversionMode } from "../conversions/selection.js";
import { csharpTargetRepresentationContractId } from "../identities/identities.js";
import { targetTypeRefKey } from "../types/equality.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../types/model.js";
import type { CsharpNativeHandler } from "./native-handlers.js";
import type { CsharpExactLiteralRecipe, CsharpNativePropertyKey } from "../conversions/exact-literals.js";
import type { CsharpResolvedBinaryOperation } from "./operator-selection.js";
import type { CsharpDefaultValueContract } from "./value-projections.js";
import type { CsharpJsValueInvocation } from "../operations/js-values.js";

export type CsharpNativeUseSlot =
  | { readonly kind: "effect" | "initializer" | "return" | "thrown" | "condition" | "receiver" | "callee" | "key" |
      "write-target" | "update-target" | "default" | "present-payload" | "constructed-result" }
  | { readonly kind: "operand"; readonly position: "only" | "left" | "right" }
  | { readonly kind: "branch"; readonly branch: "true" | "false" }
  | { readonly kind: "argument"; readonly sourceIndex: number; readonly effectiveIndex: number; readonly parameterIndex?: number;
      readonly sourceParameterIndex?: number }
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
      role = `argument:source=${slot.sourceIndex}:effective=${slot.effectiveIndex}` +
        (slot.parameterIndex === undefined ? "" : `:parameter=${slot.parameterIndex}`) +
        (slot.sourceParameterIndex === undefined ? "" : `:source-parameter=${slot.sourceParameterIndex}`);
      break;
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

export type CsharpNativeCompletion =
  | { readonly kind: "value"; readonly type: TargetTypeRef }
  | { readonly kind: "void" }
  | { readonly kind: "never" };

export type CsharpNativeCallableCreation =
  | { readonly kind: "selected"; readonly carrier: TargetTypeRef }
  | { readonly kind: "discarded" }
  | { readonly kind: "pending" };

export interface CsharpExpectedNativeUse {
  readonly expression: Node;
  readonly target: TargetTypeRef;
  readonly carrier: TargetTypeRef;
  readonly strength: "contextual" | "required";
  readonly exactInteger: boolean;
  readonly representation: "construct" | "forward" | "convert";
  readonly mode: CsharpConversionMode;
  readonly children: readonly TargetUseSiteRef[];
  readonly literal?: CsharpExactLiteralRecipe;
  readonly binary?: CsharpResolvedBinaryOperation;
  readonly objectShape?: CsharpObjectShapeFact;
  readonly construction?: {
    readonly site: TargetUseSiteRef;
    readonly carrier: TargetTypeRef;
    readonly children: readonly TargetUseSiteRef[];
  };
}

export interface CsharpExpectedNativeUseInput {
  readonly expectedUse: { readonly get: (site: TargetUseSiteRef) => CsharpExpectedNativeUse | undefined };
}

export interface CsharpNativeChildUse {
  readonly owner: Node;
  readonly expression: Node;
  readonly slot: CsharpNativeUseSlot;
  readonly context?: CsharpNativeUseContext;
  readonly access?: "location";
  readonly guard?: "if-absent" | "if-present";
}

export type CsharpNativeOrderStep =
  | { readonly kind: "use"; readonly site: TargetUseSiteRef }
  | { readonly kind: "construct"; readonly construct: Node };

export type CsharpNativeEvaluation =
  | { readonly kind: "sequence"; readonly steps: readonly { readonly site: TargetUseSiteRef; readonly guard?: "if-absent" | "if-present" }[] }
  | { readonly kind: "conditional"; readonly condition: TargetUseSiteRef; readonly whenTrue: TargetUseSiteRef; readonly whenFalse: TargetUseSiteRef }
  | { readonly kind: "short-circuit"; readonly left: TargetUseSiteRef; readonly right: TargetUseSiteRef }
  | { readonly kind: "creation" };

export type CsharpNativeDiscardedGuard =
  | { readonly kind: "coalescing" }
  | { readonly kind: "boolean"; readonly whenTrue: "left" | "right" }
  | { readonly kind: "js-value"; readonly condition: CsharpJsValueInvocation; readonly whenTrue: "left" | "right" };

export type CsharpNativeDiscardedPresence =
  | { readonly kind: "constant"; readonly present: boolean; readonly effects: readonly TargetUseSiteRef[] }
  | { readonly kind: "value" | "never"; readonly site: TargetUseSiteRef }
  | { readonly kind: "sequence"; readonly effects: readonly TargetUseSiteRef[]; readonly result: CsharpNativeDiscardedPresence }
  | { readonly kind: "conditional"; readonly condition: TargetUseSiteRef;
      readonly whenTrue: CsharpNativeDiscardedPresence; readonly whenFalse: CsharpNativeDiscardedPresence }
  | { readonly kind: "coalescing"; readonly left: CsharpNativeDiscardedPresence; readonly right: CsharpNativeDiscardedPresence }
  | { readonly kind: "short-circuit"; readonly left: TargetUseSiteRef;
      readonly guard: Exclude<CsharpNativeDiscardedGuard, { readonly kind: "coalescing" }>;
      readonly leftPresence: CsharpNativeDiscardedPresence; readonly right: CsharpNativeDiscardedPresence };

interface CsharpNativeEvaluatedUse {
  readonly expression: Node;
  readonly carrier: TargetTypeRef;
  readonly completion: CsharpNativeCompletion;
  readonly children: readonly TargetUseSiteRef[];
  readonly evaluation: CsharpNativeEvaluation;
  readonly literal?: CsharpExactLiteralRecipe;
  readonly propertyKeys?: readonly CsharpNativePropertyKey[];
  readonly binary?: CsharpResolvedBinaryOperation;
  readonly objectShape?: CsharpObjectShapeFact;
  readonly defaultValue?: CsharpDefaultValueContract;
  readonly exactInteger?: true;
  readonly discardedPresence?: CsharpNativeDiscardedPresence;
}

export type CsharpNativeUse =
  | { readonly kind: "erased"; readonly expression: Node; readonly cause: "erased-statement" | "discarded-callable" }
  | CsharpNativeEvaluatedUse & (
    | { readonly kind: "value"; readonly handler?: CsharpNativeHandler }
    | { readonly kind: "effect" | "location" | "constructed" | "forwarded" }
    | { readonly kind: "converted"; readonly input: CsharpNativeCompletion; readonly target: TargetTypeRef; readonly mode: CsharpConversionMode }
  );

export interface CsharpNativeUseClassifications {
  readonly nativeUse: {
    readonly get: (site: TargetUseSiteRef) => CsharpNativeUse | undefined;
    readonly order: (construct: Node) => readonly CsharpNativeOrderStep[] | undefined;
    readonly expression: (node: Node) => { readonly site: TargetUseSiteRef; readonly use: CsharpNativeUse } | undefined;
  };
}

export interface CsharpNativeUseRecords {
  readonly nativeUse: { readonly get: (site: TargetUseSiteRef) => CsharpNativeUse | undefined };
  readonly nativeOrder: { readonly get: (construct: Node) => readonly CsharpNativeOrderStep[] | undefined };
  readonly nativeExpression: { readonly get: (node: Node) => CsharpNativeExpressionRecord | undefined };
  readonly nativeDiscard: { readonly get: (site: TargetUseSiteRef) => CsharpNativeDiscardEmission | undefined };
}

export type CsharpNativeDiscardEmission =
  | { readonly kind: "effect"; readonly expression: Node }
  | { readonly kind: "sequence"; readonly steps: readonly TargetUseSiteRef[] };

export interface CsharpNativeExpressionRecord {
  readonly site: TargetUseSiteRef;
  readonly use: CsharpNativeUse;
  readonly physical: Exclude<CsharpNativeUse, { readonly kind: "erased" }> | undefined;
  readonly conversion: Exclude<import("../conversions/selection.js").CsharpConversionSelection, { readonly kind: "rejected" }> | undefined;
  readonly bottom: { readonly effects: readonly TargetUseSiteRef[]; readonly expression: Node } | undefined;
}
