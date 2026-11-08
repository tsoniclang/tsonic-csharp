import type { SourceApplication, SourcePresence } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpTargetCallSelection } from "../../target-model/records/operations/member-selections.js";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import { selectCsharpConversion } from "../../policy/conversions/index.js";
import { admitCsharpSourceConversion } from "../../policy/conversions/source-admission.js";
import { getCsharpCallableMembers } from "../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { getCsharpGenericOptionalParts } from "../../target-model/types/projections.js";
import { isCsharpJsValueTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import type { CsharpCallClassification } from "../../target-model/records/operations/operations.js";

type OptionalCallee = NonNullable<CsharpCallClassification["optionalCallee"]>;
type OptionalReceiver = NonNullable<CsharpCallClassification["optionalReceiver"]>;

export function classifyCsharpOptionalCallCallee(
  policy: CsharpPolicyContext, source: SourceApplication,
): CsharpRepresentationOutcome<SourcePresence<OptionalCallee>> {
  if (!source.optionalCall || source.argumentDisposition !== "dynamic") return Object.freeze({ kind: "represented", value: Object.freeze({ kind: "none" }) });
  const selected = policy.nativeValue(source.callee.occurrence);
  if (selected.kind !== "represented") return selected;
  const type = getCsharpNullableElementTargetType(selected.value) ?? getCsharpGenericOptionalParts(selected.value)?.element ?? selected.value;
  if (source.argumentDisposition !== "skip" && getCsharpCallableMembers(type).length === 0 && !isCsharpJsValueTargetType(type)) {
    return Object.freeze({ kind: "native-refused", source: "tsonic-csharp", code: "CSHARP_OPTIONAL_CALLABLE_ABI_NOT_PROVEN",
      site: source.callee.occurrence,
      message: "The evaluated optional Source callable has no actual Native callable storage contract." });
  }
  return Object.freeze({ kind: "represented", value: Object.freeze({ kind: "present",
    value: Object.freeze({ expression: source.callee.occurrence, storage: selected.value, type, guard: true }) }) });
}

export function classifyCsharpOptionalCallReceiver(
  policy: CsharpPolicyContext, source: SourceApplication, target: CsharpTargetCallSelection | undefined,
): CsharpRepresentationOutcome<SourcePresence<OptionalReceiver>> {
  if (source.receiver.kind !== "value" || source.argumentDisposition !== "dynamic") return Object.freeze({ kind: "represented", value: Object.freeze({ kind: "none" }) });
  const publication = policy.facts.objects.use(source.callee.occurrence);
  if (publication.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: publication });
  const member = publication.value;
  if (member.receiver.occurrence !== source.receiver.occurrence) {
    throw new TypeError("An optional receiver requires the identical authenticated Source application occurrence.");
  }
  if (!member.optionalChain && !member.chainContinuation) {
    return Object.freeze({ kind: "represented", value: Object.freeze({ kind: "none" }) });
  }
  const selected = policy.nativeValue(source.receiver.occurrence);
  if (selected.kind !== "represented") return selected;
  const type = getCsharpNullableElementTargetType(selected.value) ?? getCsharpGenericOptionalParts(selected.value)?.element ?? selected.value;
  const parameter = target?.kind === "resolved" && target.call.receiver.kind === "target-parameter"
    ? target.call.targetMember.parameters[target.call.receiver.targetParameterIndex] : undefined;
  if (target?.kind === "resolved" && target.call.receiver.kind === "target-parameter" && parameter === undefined) {
    throw new TypeError("A selected Native optional receiver lost its exact physical parameter.");
  }
  let receiving: Pick<OptionalReceiver, "parameterType" | "conversion"> = {};
  if (parameter !== undefined && source.argumentDisposition !== "skip") {
    const admitted = admitCsharpSourceConversion({
      representation: policy.representation,
      relation: selectCsharpConversion(policy, type, parameter.type, "implicit"),
      source: { evidence: source.receiver.value, carrier: type },
      destination: { evidence: source.receiver.value, carrier: parameter.type },
      site: source.identity.invocation,
    });
    if (admitted.kind !== "represented") return admitted;
    receiving = { parameterType: parameter.type, conversion: admitted.value };
  }
  return Object.freeze({ kind: "represented", value: Object.freeze({ kind: "present", value: Object.freeze({
    expression: source.receiver.occurrence, storage: selected.value, type, guard: member.optionalChain,
    ...receiving,
  }) }) });
}
