import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../../../policy/model/context.js";
import type { CsharpClosedTypePredicate, CsharpClosedTypeTest } from "../../../../target-model/operations/type-tests.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../../policy/identities/selected-source.js";
import { selectCsharpClosedTypeTestPlan } from "../../../../policy/operations/operators/type-tests.js";

/** A native guard: the tested operand and the closed C# predicate it selects. */
export interface CsharpSourceNativeGuard<Predicate> {
  readonly sourceOperand: Node;
  readonly predicate: Predicate;
}

/** `Array.isArray(x)` as a closed C# type test over the published value carrier of `x`. */
export function selectCsharpArrayTypeTest(
  policy: CsharpPolicyContext,
  call: Node | undefined,
): CsharpClosedTypeTest | undefined {
  const guard = selectCsharpArrayTypeGuard(policy, call);
  if (guard === undefined) return undefined;
  const sourceCarrier = policy.types.value(guard.sourceOperand);
  if (sourceCarrier.kind === "csharp-refused") return undefined;
  const test = selectCsharpClosedTypeTestPlan(sourceCarrier, guard.predicate, undefined, policy.typeDefinitions);
  return test === undefined ? undefined : Object.freeze({ sourceCarrier, predicate: guard.predicate, test });
}

/** The Host-selected callee is the JS profile's `ArrayConstructor.isArray`, applied to one non-spread argument. */
export function selectCsharpArrayTypeGuard(
  policy: Pick<CsharpPolicyContext, "ast" | "facts" | "sourceFacts">,
  call: Node | undefined,
): CsharpSourceNativeGuard<CsharpClosedTypePredicate> | undefined {
  const selection = call === undefined ? undefined : policy.facts.selections.call(call);
  if (selection === undefined || selection.kind === "refused") return undefined;
  const identity = csharpSourceProfileDeclarationIdentity(policy.ast, policy.facts, policy.sourceFacts, selection.signature);
  if (identity?.owner !== "js" || identity.kind !== "member" ||
    identity.declaringName !== "ArrayConstructor" || identity.name !== "isArray") return undefined;
  const arguments_ = policy.ast.arguments(selection.use);
  const argument = arguments_[0];
  if (arguments_.length !== 1 || argument === undefined || policy.ast.is.IsSpreadElement(argument)) return undefined;
  const predicate = Object.freeze({ kind: "array" as const });
  return Object.freeze({ sourceOperand: argument, predicate });
}
