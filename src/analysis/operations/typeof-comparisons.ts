import { selectSourceNativeValueGuard } from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import { selectCsharpTypeofComparison } from "../../policy/operations/index.js";
import type { CsharpTypeofRuntimeKind } from "../../policy/types/index.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpBinaryClassification } from "../../target-model/records/operations/operations.js";

export function classifyTypeofComparison(
  policy: CsharpPolicyContext,
  comparison: Node,
  sourceFile: SourceFile,
): CsharpBinaryClassification["typeofComparison"] {
  const guard = selectSourceNativeValueGuard(policy, comparison);
  if (guard?.kind !== "typeof") {
    return undefined;
  }
  const runtimeKind = runtimeKindLiteral(guard.value);
  if (runtimeKind === undefined) {
    return undefined;
  }
  return Object.freeze({
    operand: guard.sourceOperand,
    runtimeKind,
    selection: selectCsharpTypeofComparison(
      policy.types.resolveNode(guard.sourceOperand, sourceFile)?.type,
      runtimeKind,
      guard.negated,
      policy.typeDefinitions,
    ),
  });
}

function runtimeKindLiteral(
  value: string,
): CsharpTypeofRuntimeKind | undefined {
  return value === "string" ||
      value === "number" ||
      value === "boolean" ||
      value === "bigint" ||
      value === "symbol" ||
      value === "object" ||
      value === "function" ||
      value === "undefined"
    ? value
    : undefined;
}
