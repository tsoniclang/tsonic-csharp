import type { SourceApplication } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import type { CsharpSourceCallableApplication } from "../../../target-model/records/callables/native-application.js";
import type { CsharpTargetParameter } from "../../../target-model/types/model.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { getCsharpGenericOptionalParts } from "../../../target-model/types/projections.js";
import { applyCsharpNativeCallableMember } from "../../../policy/conversions/generic-callable.js";

export function selectCsharpSourceCallableApplication(
  policy: CsharpPolicyContext,
  source: SourceApplication,
): CsharpRepresentationOutcome<CsharpSourceCallableApplication> {
  const publication = policy.facts.applications.application(source.identity.invocation);
  if (publication.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: publication });
  if (publication.value !== source) throw new TypeError("A Native callable application requires the identical published original Source application.");
  const produced = policy.nativeValue(source.callee.occurrence);
  if (produced.kind !== "represented") return produced;
  const carrier = source.optionalCall
    ? getCsharpNullableElementTargetType(produced.value) ?? getCsharpGenericOptionalParts(produced.value)?.element ?? produced.value
    : produced.value;
  const selected = policy.nativeDelegates.member(carrier, source.identity.signature);
  if (selected === undefined) return Object.freeze({ kind: "native-refused", source: "tsonic-csharp",
    code: "CSHARP_SOURCE_CALLABLE_ABI_NOT_PROVEN", site: source.callee.occurrence,
    message: "The original selected Source signature has no authenticated member on its actual Native callable carrier." });
  const arguments_ = policy.representation.applyRequirements(selected.typeParameters, source.identity, source.identity.invocation);
  if (arguments_.kind !== "represented") return arguments_;
  const applied = applyCsharpNativeCallableMember(policy, selected, arguments_.value);
  if (applied === undefined) return Object.freeze({ kind: "native-refused", source: "tsonic-csharp",
    code: "CSHARP_CALLABLE_NATIVE_APPLICATION_NOT_PROVEN", site: source.identity.invocation,
    message: "The exact published Source bindings do not complete the selected Native member's ordered parameters and constraints." });
  return Object.freeze({ kind: "represented", value: Object.freeze({ identity: source.identity,
    original: selected, applied, typeArguments: arguments_.value, carrier, owner: selected.owner }) });
}

export function csharpSourceCallableParameters(application: CsharpSourceCallableApplication): readonly CsharpTargetParameter[] {
  const signature = application.applied.signature;
  const optional = new Set(signature.optionalParameterIndexes ?? []);
  return Object.freeze(signature.parameters.map((type, index) => Object.freeze({ name: `argument${index}`, type,
    passingMode: signature.parameterPassingModes[index]!,
    ...(optional.has(index) ? { optional: true } : {}),
    ...(signature.restParameterIndex === index ? { paramsArray: true } : {}) })));
}
