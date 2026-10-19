import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpProgramRecords } from "../../../target-model/records/program.js";
import type { TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpConversionMode } from "../../../target-model/conversions/selection.js";
import type { CsharpExactLiteralRole } from "../../../target-model/conversions/exact-literals.js";

export interface CsharpRequiredRecordOrigin {
  readonly subject: Node;
  readonly construct: string;
  readonly producer: string;
}

export interface CsharpRequiredNodeRecord extends CsharpRequiredRecordOrigin {
  readonly family: "classFactory" | "requiredStorageType" | "nativeParticipation" | "nativeHandler" |
    "sourceArgument" | "bindingPatternProjection" | "callableTarget" | "nativeValueDeclaration" | "statementExit" |
    "controlExit" | "labeledStatement";
}

export type CsharpRequiredRecord = CsharpRequiredNodeRecord
  | CsharpRequiredRecordOrigin & { readonly family: "objectShapeArtifact"; readonly key: string }
  | CsharpRequiredRecordOrigin & { readonly family: "nativeUse"; readonly site: TargetUseSiteRef }
  | CsharpRequiredRecordOrigin & { readonly family: "exactLiteral"; readonly target: TargetTypeRef | undefined; readonly role?: CsharpExactLiteralRole }
  | CsharpRequiredRecordOrigin & { readonly family: "conversion" | "expressionConversion";
      readonly source: TargetTypeRef; readonly target: TargetTypeRef; readonly mode: CsharpConversionMode };

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
    case "objectShapeArtifact":
      return records.objectShapeArtifact.get(requirement.key) !== undefined;
    case "classFactory":
      return records.classFactory.get(requirement.subject) !== undefined;
    case "requiredStorageType":
      return records.requiredStorageType.get(requirement.subject) !== undefined;
    case "nativeParticipation":
      return records.nativeParticipation.get(requirement.subject) !== undefined;
    case "nativeHandler":
      return records.nativeHandler.get(requirement.subject) !== undefined;
    case "sourceArgument":
      return records.sourceArgument.get(requirement.subject) !== undefined;
    case "bindingPatternProjection":
      return records.bindingPatternProjection.get(requirement.subject) !== undefined;
    case "callableTarget":
      return records.callableTarget.get(requirement.subject) !== undefined;
    case "nativeValueDeclaration":
      return records.nativeValueDeclaration.get(requirement.subject) !== undefined;
    case "statementExit":
      return records.statementExit.get(requirement.subject) !== undefined;
    case "controlExit":
      return records.controlExit.get(requirement.subject) !== undefined;
    case "labeledStatement":
      return records.labeledStatement.get(requirement.subject) !== undefined;
    case "nativeUse":
      return records.nativeUse.get(requirement.site) !== undefined;
    case "exactLiteral": {
      const selection = records.exactLiteral.get(requirement.subject, requirement.target, requirement.role);
      return selection?.kind === "resolved";
    }
    case "conversion":
      return records.conversion.get(requirement.source, requirement.target, requirement.mode) !== undefined;
    case "expressionConversion":
      return records.expressionConversion.get(requirement.subject, requirement.source, requirement.target, requirement.mode) !== undefined;
  }
}
