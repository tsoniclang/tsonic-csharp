import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import type { SourceCallableSourceContract } from "../../../target-model/records/callables/source-callable-contract.js";
import type { CsharpCallableParameterAdapter } from "../../../target-model/records/callables/callable-adapters.js";
import { getCsharpLambdaSignature } from "../../../target-model/types/carriers/delegates.js";
import { getCsharpJsArrayElementTargetType } from "../../../target-model/types/carriers/collections.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { admitCsharpCallableParameterAdapters } from "../native/adapters.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpConversionClassifications } from "../../../target-model/records/operations/conversions.js";
import { csharpConversionIsApplicable } from "../../../policy/conversions/applicability.js";

export function completeCsharpContextualInputs(
  policy: Pick<CsharpPolicyContext, "ast">,
  context: TargetTypeRef | undefined,
  conversions: Pick<CsharpConversionClassifications, "conversion">,
  contract: SourceCallableSourceContract,
): SourceCallableSourceContract | undefined {
  const declaration = contract.sourceDeclaration;
  if (!policy.ast.is.IsArrowFunction(declaration) && !policy.ast.is.IsFunctionExpression(declaration)) return contract;
  if (contract.nativeSignature.methodTypeParameterIdentities.length !== 0) return contract;
  if (policy.ast.is.IsFunctionExpression(declaration) && policy.ast.name(declaration) !== undefined &&
    contract.nativeParameters.some(parameter => parameter.targetParameter.optional === true)) return contract;
  const signature = getCsharpLambdaSignature(context);
  const restIndex = signature?.restParameterIndex;
  if (signature === undefined) return contract;
  const sequence = restIndex === undefined ? undefined : signature.parameters[restIndex];
  if (restIndex !== undefined && (sequence === undefined ||
      sequence.kind !== "array" && getCsharpJsArrayElementTargetType(sequence) === undefined)) return contract;
  const selected = restIndex === undefined ? undefined : contract.nativeParameters[restIndex];
  if (restIndex !== undefined && (selected === undefined || selected.targetParameter.paramsArray === true ||
      targetTypeRefEquals(selected.targetParameter.type, sequence!))) return contract;
  if (restIndex === undefined && contract.nativeParameters.every((parameter, index) =>
      signature.parameters[index] !== undefined && targetTypeRefEquals(parameter.targetParameter.type, signature.parameters[index]!))) return contract;
  if (restIndex !== undefined && restIndex !== signature.parameters.length - 1 ||
    contract.parameters.length !== contract.nativeParameters.length ||
    signature.parameterPassingModes.length !== signature.parameters.length ||
    signature.parameterPassingModes.some(mode => mode !== "by-value") ||
    contract.nativeParameters.some((parameter, index) => parameter.sourceParameter !== contract.parameters[index] ||
      parameter.targetParameter.paramsArray === true || parameter.targetParameter.passingMode !== "by-value")) return undefined;
  const types = restIndex === undefined ? signature.parameters.slice(0, contract.nativeParameters.length) : signature.parameters;
  if (types.length > contract.parameters.length || restIndex === undefined && types.length !== contract.nativeParameters.length) return undefined;
  const nativeParameters = Object.freeze(types.map((type, index) =>
    restIndex !== undefined && index < restIndex && contract.nativeParameters[index]!.targetParameter.optional === true
      ? contract.nativeParameters[index]! : Object.freeze({
    sourceParameter: contract.parameters[index]!,
    targetParameter: Object.freeze({ name: contract.nativeParameters[index]!.targetParameter.name, type, passingMode: "by-value" as const,
      ...(contract.nativeParameters[index]?.targetParameter.optional === true ? { optional: true } : {}),
      ...(index === restIndex ? { paramsArray: true } : {}),
    }),
  })));
  const adapters = admitCsharpCallableParameterAdapters((source, target) => {
    const conversion = conversions.conversion.get(source, target, "implicit");
    return conversion !== undefined && csharpConversionIsApplicable(conversion, "implicit")
      ? Object.freeze({ source, target, conversion }) : undefined;
  },
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
