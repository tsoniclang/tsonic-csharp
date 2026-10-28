import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import type { SourceCallableSourceContract } from "../../../target-model/records/callables/source-callable-contract.js";
import type { CsharpCallableParameterAdapter } from "../../../target-model/records/callables/callable-adapters.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/carriers/delegates.js";
import { getCsharpJsArrayElementTargetType } from "../../../target-model/types/carriers/collections.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { admitCsharpCallableParameterAdapters, type CsharpCallableConversionPolicy } from "../native/adapters.js";

export function closeCsharpContextualRestInputs(
  policy: Pick<CsharpPolicyContext, "ast">,
  evidence: Pick<CsharpSourceEvidenceIndex, "contextualTargetType">,
  conversions: CsharpCallableConversionPolicy,
  contract: SourceCallableSourceContract,
): SourceCallableSourceContract | undefined {
  const declaration = contract.sourceDeclaration;
  if (!policy.ast.is.IsArrowFunction(declaration) && !policy.ast.is.IsFunctionExpression(declaration)) return contract;
  const signature = getCsharpDelegateSignature(evidence.contextualTargetType.get(declaration));
  const restIndex = signature?.restParameterIndex;
  if (signature === undefined || restIndex === undefined) return contract;
  const sequence = signature.parameters[restIndex];
  if (sequence === undefined || sequence.kind !== "array" && getCsharpJsArrayElementTargetType(sequence) === undefined) return contract;
  const selected = contract.nativeParameters[restIndex];
  if (selected === undefined || selected.targetParameter.paramsArray === true ||
    targetTypeRefEquals(selected.targetParameter.type, sequence)) return contract;
  if (restIndex !== signature.parameters.length - 1 || contract.parameters.length !== contract.nativeParameters.length ||
    signature.parameterPassingModes.length !== signature.parameters.length ||
    signature.parameterPassingModes.some(mode => mode !== "by-value") ||
    contract.nativeParameters.some((parameter, index) => parameter.sourceParameter !== contract.parameters[index] ||
      parameter.targetParameter.paramsArray === true || parameter.targetParameter.passingMode !== "by-value")) return undefined;
  const nativeParameters = Object.freeze(signature.parameters.map((type, index) =>
    index < restIndex && contract.nativeParameters[index]!.targetParameter.optional === true
      ? contract.nativeParameters[index]! : Object.freeze({
    sourceParameter: contract.parameters[index]!,
    targetParameter: Object.freeze({ name: contract.nativeParameters[index]!.targetParameter.name, type, passingMode: "by-value" as const,
      ...(signature.optionalParameterIndexes?.includes(index) ? { optional: true } : {}),
      ...(index === restIndex ? { paramsArray: true } : {}),
    }),
  })));
  const adapters = admitCsharpCallableParameterAdapters(conversions,
    nativeParameters.map(parameter => parameter.targetParameter), contract.nativeParameters.map(parameter => parameter.targetParameter));
  const scalar = (adapter: CsharpCallableParameterAdapter): adapter is Extract<CsharpCallableParameterAdapter,
    { readonly kind: "value" | "rest-element" }> => adapter.kind === "value" || adapter.kind === "rest-element";
  if (adapters === undefined || !adapters.every(scalar)) return undefined;
  const parameters = Object.freeze(contract.nativeParameters.map(parameter => Object.freeze({ ...parameter,
    missing: parameter.targetParameter.optional !== true ? "none" as const
      : getCsharpNullableElementTargetType(parameter.targetParameter.type) === undefined ? "default" as const : "null" as const,
  })));
  return Object.freeze({ ...contract, nativeParameters,
    bodyInputs: Object.freeze({ parameters, adapters: Object.freeze(adapters) }),
  });
}
