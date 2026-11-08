import type { SourceApplication, SourcePresence, SourceValueOperand } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../../../policy/model/context.js";
import type { CsharpRepresentationOutcome } from "../../../../target-model/types/representation.js";
import type { CsharpClosedTypeTest } from "../../../../target-model/operations/type-tests.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../../policy/identities/selected-source.js";
import { selectCsharpClosedTypeTestPlan } from "../../../../policy/operations/operators/type-tests.js";

export function selectCsharpArrayTypeTest(
  policy: CsharpPolicyContext,
  source: SourceApplication,
): CsharpRepresentationOutcome<SourcePresence<CsharpClosedTypeTest>> {
  const operand = selectCsharpArrayTypeGuard(policy, source);
  if (operand.kind !== "represented") return operand;
  if (operand.value.kind === "none") return operand;
  const carrier = policy.nativeValue(operand.value.value.occurrence);
  if (carrier.kind !== "represented") return carrier;
  const predicate = Object.freeze({ kind: "array" as const });
  const test = selectCsharpClosedTypeTestPlan(carrier.value, predicate, undefined, policy.typeDefinitions);
  return test === undefined ? Object.freeze({ kind: "native-refused", source: "tsonic-csharp",
    code: "CSHARP_ARRAY_PREDICATE_ABI_NOT_PROVEN", site: source.identity.invocation,
    message: "The selected array predicate has no exact Native carrier test." })
    : Object.freeze({ kind: "represented", value: Object.freeze({ kind: "present",
        value: Object.freeze({ sourceCarrier: carrier.value, predicate, test }) }) });
}

export function selectCsharpArrayTypeGuard(
  policy: Pick<CsharpPolicyContext, "facts">,
  source: SourceApplication,
): CsharpRepresentationOutcome<SourcePresence<SourceValueOperand>> {
  const declaration = source.identity.signature.declaration;
  const identity = declaration === undefined ? undefined
    : csharpSourceProfileDeclarationIdentity(policy.facts.navigation, declaration);
  if (identity?.owner !== "js" || identity.kind !== "member" ||
    identity.declaringName !== "ArrayConstructor" || identity.name !== "isArray") {
    return Object.freeze({ kind: "represented", value: Object.freeze({ kind: "none" }) });
  }
  const argument = source.sourceArguments[0];
  if (source.argumentDisposition === "skip" || source.sourceArguments.length !== 1 || argument?.form !== "value") {
    return Object.freeze({ kind: "native-refused", source: "tsonic-csharp", code: "CSHARP_ARRAY_PREDICATE_ARGUMENT_NOT_PROVEN",
      site: source.identity.invocation, message: "The selected Native array predicate requires one evaluated original scalar argument." });
  }
  return argument.operand.kind === "refused" ? Object.freeze({ kind: "source-refused", refusal: argument.operand })
    : Object.freeze({ kind: "represented", value: Object.freeze({ kind: "present", value: argument.operand.value }) });
}
