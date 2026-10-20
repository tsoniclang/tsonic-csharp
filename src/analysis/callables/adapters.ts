import type { CsharpCallableParameterAdapter, CsharpCallableValueAdapter } from "../../target-model/records/callable-adapters.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpConversionIsApplicable, selectCsharpConversion } from "../../policy/conversions/selection.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../target-model/types/model.js";
import { selectCsharpFlowReadConversion } from "../../policy/conversions/expression.js";
import type { CsharpSourceCallableContract } from "../../target-model/records/source-callable-contract.js";
import { admitCsharpConversionSelection } from "../conversions/validation.js";
import { csharpCallableParameterConversionRequests, selectCsharpCallableParameterAdapters } from "../../policy/conversions/callable-parameters.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";

export type CsharpCallableConversionPolicy = Pick<CsharpPolicyContext,
  "typeDefinitions" | "projectTypes" | "providers" | "target"> & {
  readonly objectShapes: Pick<CsharpObjectShapeClassifications, "resolveNode" | "resolveTarget">;
};

export function admitCsharpCallableValueAdapter(
  policy: CsharpCallableConversionPolicy, source: TargetTypeRef, target: TargetTypeRef,
): CsharpCallableValueAdapter | undefined {
  const conversion = admitCsharpConversionSelection(policy, source, target, selectCsharpConversion(policy, source, target, "implicit"));
  return csharpConversionIsApplicable(conversion, "implicit")
    ? Object.freeze({ source, target, conversion }) : undefined;
}

export function admitCsharpCallableResultAdapter(
  policy: CsharpCallableConversionPolicy, implementation: CsharpSourceCallableContract, target: TargetTypeRef,
): CsharpCallableValueAdapter | undefined {
  if (implementation.sourceReturnType === undefined) return admitCsharpCallableValueAdapter(policy, implementation.returnType, target);
  const sourceContract = admitCsharpCallableValueAdapter(policy, implementation.sourceReturnType, target);
  if (sourceContract === undefined) return undefined;
  const conversion = admitCsharpConversionSelection(policy, implementation.returnType, target,
    selectCsharpFlowReadConversion(policy, implementation.returnType, target));
  return csharpConversionIsApplicable(conversion, "explicit")
    ? Object.freeze({ source: implementation.returnType, target, conversion }) : undefined;
}

export function admitCsharpCallableParameterAdapters(
  policy: CsharpCallableConversionPolicy,
  source: readonly CsharpTargetParameter[],
  target: readonly CsharpTargetParameter[],
): readonly CsharpCallableParameterAdapter[] | undefined {
  const admitted = csharpCallableParameterConversionRequests(source, target).flatMap(request => {
    const adapter = admitCsharpCallableValueAdapter(policy, request.source, request.target);
    return adapter === undefined ? [] : [adapter];
  });
  return selectCsharpCallableParameterAdapters(source, target, Object.freeze(admitted));
}
