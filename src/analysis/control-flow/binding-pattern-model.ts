import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import type { SourceEffectiveTypes, SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpConversionShapeQueries } from "../../policy/conversions/shape-queries.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/operations/conversions.js";
import type { CsharpNativeParticipationInput, CsharpExpectedNativeUse } from "../../target-model/records/native/native-demand.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage/storage.js";

export interface CsharpBindingPatternAnalysisInput {
  readonly ast: AstReader;
  readonly effectiveTypes: SourceEffectiveTypes;
  readonly sourceFacts?: CsharpPolicyContext["sourceFacts"];
  readonly semanticsFor: (node: Node) => SourceFileSemantics;
  readonly sourceFiles: readonly SourceFile[];
  readonly participation: CsharpNativeParticipationInput["participation"];
  readonly evidence: CsharpSourceEvidenceIndex;
  readonly operations: CsharpTargetOperationClassifications;
  readonly valueReads: CsharpValueReadClassifications;
  readonly initializerUses: Pick<ReadonlyMap<object, Pick<CsharpExpectedNativeUse, "expression" | "carrier"> | null>, "get">;
  readonly objectShapes: CsharpObjectShapeClassifications;
  readonly typePolicy: Pick<CsharpPolicyContext["types"], "resolveNode">;
  readonly conversionPolicy: Pick<CsharpPolicyContext, "typeDefinitions" | "projectTypes" | "providers" | "target"> & CsharpConversionShapeQueries;
  readonly storage: Pick<CsharpStorageClassifications, "storageType">;
}
