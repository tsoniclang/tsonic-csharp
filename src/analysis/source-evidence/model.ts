import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TsonicClosedArrayStorage } from "@tsonic/source-core/facts";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";

export interface CsharpSourceEvidenceResult {
  readonly index: CsharpSourceEvidenceIndex;
  readonly nativeExpressionIssues: readonly (TargetDiagnostic & {
    readonly sourceNode: Node;
    readonly requiredBy: readonly Node[];
  })[];
  inspectClosedArrayStorage(node: Node): TsonicClosedArrayStorage;
  eraseCompileTimeDeclaration(declaration: Node): void;
  sealCompileTimeDeclarations(): void;
}

export interface CsharpSourceEvidenceAnalysis extends CsharpSourceEvidenceIndex {
  inspectClosedArrayStorage(node: Node): TsonicClosedArrayStorage;
}
