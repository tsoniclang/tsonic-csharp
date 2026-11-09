import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { SourceClosedArrayStorage, SourceMemoryMetadata, SourceMemorySelection, SourcePresence, SourceSignatureIdentity } from "@tsonic/target-api/source";
import type { SourceStorageBindings, SourceStorageUnresolved } from "@tsonic/target-api/analysis";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";

export interface CsharpSourceEvidenceBuilder {
  readonly nativeExpressionIssues: readonly (TargetDiagnostic & {
    readonly sourceNode: Node;
    readonly requiredBy: readonly Node[];
  })[];
  value(occurrence: Node): CsharpRepresentationOutcome<TargetTypeRef>;
  declaration(declaration: Node): CsharpRepresentationOutcome<TargetTypeRef>;
  parameter(declaration: Node): CsharpRepresentationOutcome<void>;
  argument(occurrence: Node): CsharpRepresentationOutcome<void>;
  enumMember(declaration: Node): CsharpRepresentationOutcome<void>;
  generator(declaration: Node): CsharpRepresentationOutcome<void>;
  callableReturn(declaration: Node, signature: SourceSignatureIdentity): CsharpRepresentationOutcome<TargetTypeRef>;
  yielded(occurrence: Node): CsharpRepresentationOutcome<void>;
  returned(declaration: Node, bindings: SourceStorageBindings): CsharpRepresentationOutcome<void> | SourceStorageUnresolved;
  propertyName(name: Node, requiredBy: Node): CsharpRepresentationOutcome<void>;
  metadata(occurrence: Node, bindings: SourceStorageBindings): SourceMemorySelection<SourcePresence<SourceMemoryMetadata>>;
  compileTimeExpression(occurrence: Node): SourceMemorySelection<boolean>;
  closedArray(occurrence: Node, bindings: SourceStorageBindings): SourceMemorySelection<SourceClosedArrayStorage>;
  pointerBacking(occurrence: Node): CsharpRepresentationOutcome<void> | SourceStorageUnresolved;
  eraseCompileTimeDeclaration(declaration: Node): void;
  seal(): CsharpSourceEvidenceIndex;
}
