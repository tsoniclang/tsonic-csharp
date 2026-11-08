import type { CsharpNumericRepresentations } from "../../target-model/records/operations/numeric.js";
import type { Node } from "@tsonic/tsts";
import type { SourceIntegerRange, SourceResult, TargetSourceProgram } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native/native-demand.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { createCsharpNumericRepresentationRecords } from "../program/records/operations/numeric.js";

export function analyzeCsharpNumericRepresentations(input: {
  readonly source: TargetSourceProgram;
  readonly demand: CsharpNativeDemandAnalysis;
  readonly operations: CsharpTargetOperationClassifications;
}): SourceResult<CsharpNumericRepresentations> {
  const selected: Node[] = [];
  const visited = new Set<Node>();
  for (const { use } of input.demand.entries) {
    if (use.kind === "erased" || !isFloat64(use.carrier) || visited.has(use.expression)) continue;
    const expression = use.expression;
    visited.add(expression);
    const operation = input.operations.binaryOperation.get(expression)?.target;
    if (operation?.kind !== "resolved" || operation.sourceOperator !== "%" ||
      operation.targetOperation.kind !== "operator" || operation.targetOperation.operator !== "%" ||
      !isFloat64(operation.leftType) || !isFloat64(operation.rightType) ||
      !isFloat64(operation.leftInputType) || !isFloat64(operation.rightInputType) || !isFloat64(operation.resultType)) continue;
    const source = input.source.facts.values.operation(expression);
    if (source.kind === "refused") return source;
    if (source.value.kind !== "binary" || source.value.operator !== "remainder" ||
      source.value.operands.length !== 2 || source.value.operands[0]!.occurrence !== operation.left ||
      source.value.operands[1]!.occurrence !== operation.right) {
      return failTargetAnalysisInvariant("tsonic-csharp", "A Native remainder proof requires the same original Source operation and operands.", expression);
    }
    const left = input.source.facts.integers.range(source.value.operands[0]!.occurrence);
    if (left.kind === "refused") return left;
    const right = input.source.facts.integers.range(source.value.operands[1]!.occurrence);
    if (right.kind === "refused") return right;
    const result = input.source.facts.integers.range(expression);
    if (result.kind === "refused") return result;
    if (left.value.kind === "present" && right.value.kind === "present" && result.value.kind === "present" &&
      isInt32Range(left.value.value) && left.value.value.minimum >= 0n &&
      isInt32Range(right.value.value) && right.value.value.minimum > 0n &&
      isInt32Range(result.value.value) && result.value.value.minimum >= 0n) selected.push(expression);
  }
  return Object.freeze({ kind: "resolved", value: createCsharpNumericRepresentationRecords(selected) });
}

function isInt32Range(range: SourceIntegerRange): boolean {
  return range.minimum >= -2_147_483_648n && range.maximum <= 2_147_483_647n;
}

function isFloat64(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "source-primitive" && type.name === "float64";
}
