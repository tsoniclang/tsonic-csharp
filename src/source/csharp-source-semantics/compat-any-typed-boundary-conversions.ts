import type {
  ExtensionEvidence,
  TargetOperationFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetOperationFact,
} from "../csharp-facts.js";
import {
  compatAnyRuntimeUnionTypedBoundaryCastOperation,
  compatAnyTypedBoundaryBoxOperation,
  compatAnyTypedBoundaryCastOperation,
  csharpCompatRuntimeEvidence,
  tsValueType,
} from "./compat-runtime-operation-model.js";
import {
  targetOperation,
} from "./operations.js";
import {
  getCsharpRuntimeUnionArms,
  isCsharpAnyRuntimeCarrier,
} from "./target-types.js";

export type CsharpCompatAnyTypedBoundaryConversionDecision =
  | { readonly kind: "identity" }
  | CsharpCompatAnyTypedBoundaryConversion;

export interface CsharpCompatAnyTypedBoundaryConversion {
  readonly kind: "cast" | "box";
  readonly convertedType: TargetTypeRef;
  readonly operation: TargetOperationFact;
  readonly csharpOperation: CsharpTargetOperationFact;
}

export function getCompatAnyTypedBoundaryConversion(
  source: TargetTypeRef | undefined,
  target: TargetTypeRef,
  sourceHasOpaqueAnyCarrier = false,
): CsharpCompatAnyTypedBoundaryConversionDecision | undefined {
  const sourceAny = sourceHasOpaqueAnyCarrier || isCsharpAnyRuntimeCarrier(source);
  if (isCsharpAnyRuntimeCarrier(target)) {
    if (sourceAny) {
      return { kind: "identity" };
    }
    if (source === undefined) {
      return undefined;
    }
    const csharpOperation = compatAnyTypedBoundaryBoxOperation(source);
    return {
      kind: "box",
      convertedType: tsValueType,
      operation: targetOperation(csharpOperation.operationId, "method", csharpOperation.memberName, { resultType: tsValueType }),
      csharpOperation,
    };
  }
  if (!sourceAny) {
    return undefined;
  }
  const runtimeUnionArms = getCsharpRuntimeUnionArms(target);
  const csharpOperation = runtimeUnionArms === undefined
    ? compatAnyTypedBoundaryCastOperation(target)
    : compatAnyRuntimeUnionTypedBoundaryCastOperation(target, runtimeUnionArms);
  return {
    kind: "cast",
    convertedType: target,
    operation: targetOperation(csharpOperation.operationId, "method", csharpOperation.memberName, { resultType: target }),
    csharpOperation,
  };
}

export function getCompatAnyTypedBoundaryEvidence(kind: CsharpCompatAnyTypedBoundaryConversion["kind"]): readonly ExtensionEvidence[] {
  return [
    ...csharpCompatRuntimeEvidence,
    {
      message: kind === "cast"
        ? "C# compat typed-boundary conversion casts the closed TsValue carrier to the selected target type."
        : "C# compat typed-boundary conversion boxes the selected target type into the closed TsValue carrier.",
    },
  ];
}
