import type { CsharpPlanningContext } from "../context.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import {
  targetTypeRefEquals,
  type TargetTypeRef,
} from "../../../policy/types/index.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
} from "../../target-ast/roslyn/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  getCsharpRuntimeUnionArms,
  isCsharpRuntimeUnionTargetType,
} from "../../../policy/types/index.js";

export function tryPlanRuntimeUnionTypeTest(
  node: Node,
  targetType: TargetTypeRef,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  baseExpression: CsharpExpression,
  negated: boolean,
): CsharpExpression | undefined {
  const storageCarrier = getRuntimeUnionStorageCarrier(node, sourceFile, input);
  if (!isCsharpRuntimeUnionTargetType(storageCarrier)) {
    return undefined;
  }
  const armIndex = runtimeUnionArmIndex(storageCarrier, targetType);
  if (armIndex === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Runtime union type-test emission requires the selected target comparison type to match a finalized runtime-union arm.",
    ));
    return undefined;
  }
  const test = runtimeUnionArmTest(baseExpression, armIndex);
  return negated
    ? {
        kind: "PrefixUnaryExpression",
        operatorToken: { kind: "ExclamationToken" },
        operand: test,
      }
    : test;
}

export function tryPlanRuntimeUnionProjectionToTargetType(
  node: Node,
  targetType: TargetTypeRef,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  baseExpression: CsharpExpression,
): CsharpExpression | undefined {
  const storageCarrier = getRuntimeUnionStorageCarrier(node, sourceFile, input);
  if (!isCsharpRuntimeUnionTargetType(storageCarrier)) {
    return undefined;
  }
  const armIndex = runtimeUnionArmIndex(storageCarrier, targetType);
  if (armIndex === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Runtime union member projection requires the selected declaring target type to match a finalized runtime-union arm.",
    ));
    return undefined;
  }
  return runtimeUnionArmProjection(baseExpression, armIndex);
}

function getRuntimeUnionStorageCarrier(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
): TargetTypeRef | undefined {
  const storageCarrier = input.types.policy.resolveStorage(node, sourceFile);
  return isCsharpRuntimeUnionTargetType(storageCarrier)
    ? storageCarrier
    : undefined;
}

function runtimeUnionArmIndex(
  unionCarrier: TargetTypeRef,
  targetType: TargetTypeRef,
): number | undefined {
  const armIndex = getCsharpRuntimeUnionArms(unionCarrier)?.findIndex((arm) => targetTypeRefEquals(arm, targetType));
  return armIndex === undefined || armIndex < 0 ? undefined : armIndex;
}

function runtimeUnionArmProjection(
  baseExpression: CsharpExpression,
  armIndex: number,
): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: baseExpression,
      name: `As${armIndex + 1}`,
    },
    arguments: [],
  };
}

function runtimeUnionArmTest(
  baseExpression: CsharpExpression,
  armIndex: number,
): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: baseExpression,
      name: `Is${armIndex + 1}`,
    },
    arguments: [],
  };
}
