import type { AstReader, Node } from "@tsonic/tsts";
import { analyzeSourceStatementExits } from "@tsonic/target-api/analysis";
import type { CsharpStatementExitRecords } from "../../target-model/records/statement-exits.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpNativeParticipationInput } from "../../target-model/records/native-demand.js";
import { isCsharpNeverTargetType } from "../../target-model/types/carriers/scalar-types.js";
import { createCsharpStatementExitRecords } from "../program/records/statement-exits.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";

export function analyzeCsharpStatementExits(input: {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly operations: Pick<CsharpTargetOperationClassifications, "nativeUnreachable" | "nativeGuardResult" | "erasedStatement">;
  readonly metadata: CsharpSourceEvidenceIndex["compileTimeMetadata"];
  readonly participation: CsharpNativeParticipationInput["participation"];
  readonly values: CsharpValueReadClassifications["valueRead"];
  readonly required: CsharpRequiredRecord[];
}): CsharpStatementExitRecords {
  const exits = analyzeSourceStatementExits(input.ast, input.nodes, {
    erased: node => input.operations.nativeUnreachable.get(node) === true || input.metadata.get(node) === true ||
      input.participation.get(node) === "erased" || input.operations.erasedStatement.get(node) === true,
    expressionExits: node => isCsharpNeverTargetType(input.values.get(node)?.value),
    guardResult: node => input.operations.nativeGuardResult.get(node),
  });
  for (const subject of exits.keys()) {
    requireCsharpRecord(input.required, { family: "statementExit", subject, construct: input.ast.kindName(subject),
      producer: "analyzeCsharpStatementExits" });
  }
  return createCsharpStatementExitRecords(exits);
}
