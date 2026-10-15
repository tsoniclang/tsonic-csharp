import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import type { TargetPlanningSourceNavigation, TargetUseSiteRef } from "@tsonic/target-api/analysis";
import type { CsharpAttributeApplicationIndex } from "../../../target-model/records/attributes.js";
import type { CsharpClassFactoryIndex } from "../../../target-model/records/class-factories.js";
import type { CsharpClassInitializationIndex } from "../../../target-model/records/class-initialization.js";
import type { CsharpValueReadClassifications } from "../../../target-model/records/conversions.js";
import type {
  CsharpExpectedNativeUseInput,
  CsharpNativeParticipationInput,
  CsharpNativeUseClassifications,
} from "../../../target-model/records/native-demand.js";
import type { CsharpTargetOperationClassifications } from "../../../target-model/records/operations.js";
import type { CsharpProjectTypeClassifications } from "../../../target-model/records/project-types.js";
import type { CsharpSafetyApplicationFactIndex } from "../../../target-model/records/safety.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/source-evidence.js";

export interface CsharpNativeDefaultUseInput {
  readonly unusedDefault: { readonly get: (initializer: Node) => boolean };
}

export interface CsharpNativeDemandAnalysisInput
  extends CsharpNativeParticipationInput, CsharpExpectedNativeUseInput, CsharpNativeDefaultUseInput {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly navigation: Pick<TargetPlanningSourceNavigation, "isProjectDeclaration" | "referenceFor" | "sourceReferenceFor">;
  readonly evidence: Pick<CsharpSourceEvidenceIndex,
    "compileTimeMetadata" | "sourceArgument" | "sourceDefaultValue" | "sourceField" | "sourceStruct">;
  readonly operations: Pick<CsharpTargetOperationClassifications,
    | "binaryOperation"
    | "elementDeletion"
    | "erasedStatement"
    | "exactCatchRethrow"
    | "jsArrayMutation"
    | "jsStringConversion"
    | "memoryBinding"
    | "nativeHandler"
    | "nativePointer"
    | "nativeUnreachable"
    | "operatorForm"
    | "selectedCall"
    | "selectedConstruction"
    | "selectedElement"
    | "selectedProperty"
    | "typedLocation"
    | "unaryOperation"
  >;
  readonly valueReads: CsharpValueReadClassifications;
  readonly attributeApplications: CsharpAttributeApplicationIndex;
  readonly classFactories: Pick<CsharpClassFactoryIndex, "classFactory" | "factories">;
  readonly classInitialization: Pick<CsharpClassInitializationIndex, "classInitializationRegion">;
  readonly projectTypes: Pick<CsharpProjectTypeClassifications, "definitionContainingDeclaration">;
  readonly safetyApplications: Pick<CsharpSafetyApplicationFactIndex, "safetyOperation">;
}

export type CsharpNativeUnadmittedReason = "argument-grouping-refused" | "argument-type-unresolved" | "completion-unresolved";

export interface CsharpNativeUnadmittedUse {
  readonly site: TargetUseSiteRef;
  readonly expression: Node;
  readonly reason: CsharpNativeUnadmittedReason;
}

export interface CsharpNativeDemandAnalysis extends CsharpNativeUseClassifications {
  readonly unadmitted: readonly CsharpNativeUnadmittedUse[];
}
