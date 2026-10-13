import type { CsharpNumericRepresentations } from "../../target-model/records/numeric.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import { analyzeSourceIntegerRanges } from "@tsonic/target-api/source";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";

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
    isNumber: expression => isFloat64(input.evidence.nodeTargetType.get(expression)),
  });
  const selected = new WeakSet(ranges.exactInt32Remainders.filter(expression => {
    const operation = input.operations.binaryOperation.get(expression)?.target;
    return operation?.kind === "resolved" && operation.sourceOperator === "%" &&
      operation.targetOperation.kind === "operator" && operation.targetOperation.operator === "%" &&
      isFloat64(operation.leftInputType) && isFloat64(operation.rightInputType) && isFloat64(operation.resultType);
  }));
  return Object.freeze({ int32Remainder: Object.freeze({ get: (expression: Node) => selected.has(expression) }) });
}

function isFloat64(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "source-primitive" && type.name === "float64";
}
