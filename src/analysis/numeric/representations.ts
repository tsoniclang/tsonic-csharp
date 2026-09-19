import type { Node, SourceFile } from "@tsonic/tsts";
import { analyzeSourceIntegerRanges } from "@tsonic/target-api/source";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/index.js";
import type { CsharpTargetOperationClassifications } from "../operations/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

export interface CsharpNumericRepresentations {
  usesInt32Remainder(expression: Node): boolean;
}

export function analyzeCsharpNumericRepresentations(input: {
  readonly source: TargetSourceProgram;
  readonly sourceFiles: readonly SourceFile[];
  readonly evidence: CsharpSourceEvidenceIndex;
  readonly operations: CsharpTargetOperationClassifications;
}): CsharpNumericRepresentations {
  const ranges = analyzeSourceIntegerRanges({
    ast: input.source.ast,
    navigation: input.source.navigation,
    sourceFiles: input.sourceFiles,
    isNumber: expression => isFloat64(input.evidence.nodeTargetType(expression)),
  });
  const selected = new WeakSet(ranges.exactInt32Remainders.filter(expression => {
    const operation = input.operations.binary(expression)?.target;
    return operation?.kind === "resolved" && operation.sourceOperator === "%" &&
      operation.targetOperation.kind === "operator" && operation.targetOperation.operator === "%" &&
      isFloat64(operation.leftInputType) && isFloat64(operation.rightInputType) && isFloat64(operation.resultType);
  }));
  return Object.freeze({ usesInt32Remainder: (expression: Node) => selected.has(expression) });
}

function isFloat64(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "source-primitive" && type.name === "float64";
}
