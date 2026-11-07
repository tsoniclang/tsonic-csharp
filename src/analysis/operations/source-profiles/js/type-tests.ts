import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
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
  policy: Pick<CsharpPolicyContext, "ast" | "facts">,
  call: Node | undefined,
): CsharpSourceNativeGuard<CsharpClosedTypePredicate> | undefined {
  const selection = call === undefined ? undefined : policy.facts.selections.call(call);
  if (selection === undefined) return undefined;
  if (selection.kind === "refused") return failTargetAnalysisInvariant("tsonic-csharp",
    `A Host call-selection refusal (${selection.code}) reached C# analysis; Host refusals are forwarded before C# analysis.`, call);
  const identity = csharpSourceProfileDeclarationIdentity(policy.ast, policy.facts, selection.signature);
  if (identity?.owner !== "js" || identity.kind !== "member" ||
    identity.declaringName !== "ArrayConstructor" || identity.name !== "isArray") return undefined;
  // The Host argument bindings of the selected call (selection.arguments): exactly one non-spread value argument.
  const binding = selection.arguments[0];
  if (selection.arguments.length !== 1 || binding === undefined || binding.form !== "value") return undefined;
  const argument = binding.argument;
  const predicate = Object.freeze({ kind: "array" as const });
  return Object.freeze({ sourceOperand: argument, predicate });
}
