import type {
  CsharpTargetNamedTypeRef,
  CsharpTypeofRuntimeKind,
  TargetTypeRef,
} from "../types/index.js";
import {
  getCsharpNullableElementTargetType,
  getCsharpRuntimeUnionArms,
} from "../types/index.js";

export type CsharpTypeofComparisonSelection =
  | {
      readonly kind: "constant";
      readonly value: boolean;
    }
  | {
      readonly kind: "target-type-test";
      readonly targetType: TargetTypeRef;
      readonly negated: boolean;
    }
  | {
      readonly kind: "runtime-union-arm-test";
      readonly targetType: TargetTypeRef;
      readonly negated: boolean;
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };

export function getCsharpTypeofRuntimeKind(
  type: TargetTypeRef | undefined,
): CsharpTypeofRuntimeKind | undefined {
  if (
    type === undefined ||
    getCsharpNullableElementTargetType(type) !== undefined
  ) {
    return undefined;
  }
  if (type.kind === "target-named") {
    return (type as CsharpTargetNamedTypeRef).csharpTypeofRuntimeKind;
  }
  if (type.kind !== "source-primitive") {
    return undefined;
  }
  if (type.name === "bool") {
    return "boolean";
  }
  if (type.name === "char") {
    return "string";
  }
  return type.name === "int64" ||
    type.name === "uint64" ||
    type.name === "int128" ||
    type.name === "uint128"
    ? "bigint"
    : "number";
}

export function selectCsharpTypeofComparison(
  operandType: TargetTypeRef | undefined,
  runtimeKind: CsharpTypeofRuntimeKind,
  negated: boolean,
): CsharpTypeofComparisonSelection {
  if (operandType === undefined) {
    return rejected(
      "The selected typeof comparison has no exact target operand type.",
    );
  }
  const exactRuntimeKind = getCsharpTypeofRuntimeKind(operandType);
  if (exactRuntimeKind !== undefined) {
    return {
      kind: "constant",
      value: (exactRuntimeKind === runtimeKind) !== negated,
    };
  }
  const nullableElement = getCsharpNullableElementTargetType(operandType);
  if (nullableElement !== undefined) {
    const valueRuntimeKind = getCsharpTypeofRuntimeKind(nullableElement);
    if (valueRuntimeKind === undefined) {
      return rejected(
        "The selected nullable typeof comparison has no exact target runtime-kind representation.",
      );
    }
    return valueRuntimeKind === runtimeKind
      ? {
          kind: "target-type-test",
          targetType: nullableElement,
          negated,
        }
      : {
          kind: "constant",
          value: negated,
        };
  }
  const matchingArms = (getCsharpRuntimeUnionArms(operandType) ?? [])
    .filter((arm) => getCsharpTypeofRuntimeKind(arm) === runtimeKind);
  if (matchingArms.length === 1) {
    return {
      kind: "runtime-union-arm-test",
      targetType: matchingArms[0]!,
      negated,
    };
  }
  return rejected(
    matchingArms.length === 0
      ? "The selected typeof comparison has no target runtime-kind representation."
      : "The selected typeof comparison needs a single-evaluation multi-arm runtime-union condition plan.",
  );
}

function rejected(reason: string): CsharpTypeofComparisonSelection {
  return { kind: "rejected", reason };
}
