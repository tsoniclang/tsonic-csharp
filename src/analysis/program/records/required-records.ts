import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpProgramRecords } from "../../../target-model/records/program.js";

export interface CsharpRequiredRecordOrigin {
  readonly subject: Node;
  readonly construct: string;
  readonly producer: string;
}

export interface CsharpRequiredNodeRecord extends CsharpRequiredRecordOrigin {
  readonly family: "classFactory" | "requiredStorageType" | "nativeParticipation" | "nativeHandler";
}

export type CsharpRequiredRecord = CsharpRequiredNodeRecord;

export function requireCsharpRecord(
  requirements: CsharpRequiredRecord[],
  requirement: CsharpRequiredRecord,
): void {
  requirements.push(requirement);
}

export function assertCsharpRequiredRecords(
  records: CsharpProgramRecords,
  requirements: readonly CsharpRequiredRecord[],
): void {
  for (const requirement of requirements) {
    if (!csharpRequiredRecordPublished(records, requirement)) {
      failTargetAnalysisInvariant("tsonic-csharp",
        `Required C# semantic plan '${requirement.family}' was not published for '${requirement.construct}' by '${requirement.producer}'.`,
        requirement.subject);
    }
  }
}

function csharpRequiredRecordPublished(records: CsharpProgramRecords, requirement: CsharpRequiredRecord): boolean {
  switch (requirement.family) {
    case "classFactory":
      return records.classFactory.get(requirement.subject) !== undefined;
    case "requiredStorageType":
      return records.requiredStorageType.get(requirement.subject) !== undefined;
    case "nativeParticipation":
      return records.nativeParticipation.get(requirement.subject) !== undefined;
    case "nativeHandler":
      return records.nativeHandler.get(requirement.subject) !== undefined;
  }
}
