import type { CsharpNumericRepresentations } from "../../target-model/records/operations/numeric.js";
import type { SourceFile } from "@tsonic/tsts";
import type { TargetSourceProgramFacts } from "@tsonic/target-api/source";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { createCsharpNumericRepresentationRecords } from "../program/records/operations/numeric.js";

export function analyzeCsharpNumericRepresentations(input: {
  readonly source: TargetSourceProgramFacts;
  readonly sourceFiles: readonly SourceFile[];
  readonly evidence: CsharpSourceEvidenceIndex;
  readonly operations: CsharpTargetOperationClassifications;
}): CsharpNumericRepresentations {
  // The Host integer-range analysis (facts.analyses.exactInt32Remainders): which number remainders are exact int32
  // remainders. Number-ness is the Host descriptor decision, not the C# carrier.
  const selected = input.source.facts.analyses.exactInt32Remainders().filter(expression => {
    const operation = input.operations.binaryOperation.get(expression)?.target;
    return operation?.kind === "resolved" && operation.sourceOperator === "%" &&
      operation.targetOperation.kind === "operator" && operation.targetOperation.operator === "%" &&
      isFloat64(operation.leftInputType) && isFloat64(operation.rightInputType) && isFloat64(operation.resultType);
  });
  return createCsharpNumericRepresentationRecords(selected);
}

function isFloat64(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "source-primitive" && type.name === "float64";
}
