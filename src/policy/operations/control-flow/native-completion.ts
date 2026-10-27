import type { CsharpNativeCompletion } from "../../../target-model/records/native/native-demand.js";
import { isCsharpNeverTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { isCsharpVoidTargetType } from "../../../target-model/types/identity.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

export type CsharpNativeCompletionFlow = { readonly discarded?: true } & (
  | { readonly kind: "sequence"; readonly children: readonly { readonly completion: CsharpNativeCompletion | undefined; readonly guarded?: boolean }[] }
  | { readonly kind: "conditional"; readonly condition: CsharpNativeCompletion | undefined;
      readonly whenTrue: CsharpNativeCompletion | undefined; readonly whenFalse: CsharpNativeCompletion | undefined }
  | { readonly kind: "short-circuit"; readonly left: CsharpNativeCompletion | undefined; readonly right: CsharpNativeCompletion | undefined }
  | { readonly kind: "creation" });

export function selectCsharpNativeCompletion(
  carrier: TargetTypeRef | undefined,
  flow: CsharpNativeCompletionFlow,
): CsharpNativeCompletion | undefined {
  const never: CsharpNativeCompletion = Object.freeze({ kind: "never" });
  let hasVoidChild = false;
  if (flow.kind === "sequence") {
    for (const child of flow.children) {
      if (child.completion === undefined) return undefined;
      if (child.completion.kind === "never" && child.guarded !== true) return never;
      if (child.completion.kind === "void") hasVoidChild = true;
    }
  } else if (flow.kind === "conditional") {
    if (flow.condition === undefined) return undefined;
    if (flow.condition.kind === "never") return never;
    if (flow.whenTrue === undefined || flow.whenFalse === undefined) return undefined;
    if (flow.whenTrue.kind === "never" && flow.whenFalse.kind === "never") return never;
    hasVoidChild = flow.whenTrue.kind === "void" || flow.whenFalse.kind === "void";
  } else if (flow.kind === "short-circuit") {
    if (flow.left === undefined) return undefined;
    if (flow.left.kind === "never") return never;
    if (flow.right === undefined) return undefined;
    hasVoidChild = flow.left.kind === "void" || flow.right.kind === "void";
  }
  if (flow.discarded === true && hasVoidChild) return Object.freeze({ kind: "void" });
  if (carrier === undefined) return undefined;
  if (isCsharpNeverTargetType(carrier)) return never;
  return Object.freeze(isCsharpVoidTargetType(carrier) ? { kind: "void" } : { kind: "value", type: carrier });
}
