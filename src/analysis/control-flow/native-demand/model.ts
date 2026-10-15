import type { AstReader, SourceFile } from "@tsonic/tsts";
import type { TargetPlanningSourceNavigation } from "@tsonic/target-api/analysis";
import type { CsharpAttributeApplicationIndex } from "../../../target-model/records/attributes.js";
import type { CsharpClassFactoryIndex } from "../../../target-model/records/class-factories.js";
import type { CsharpValueReadClassifications } from "../../../target-model/records/conversions.js";
import type {
  CsharpExpectedNativeUseInput,
  CsharpNativeParticipationInput,
} from "../../../target-model/records/native-demand.js";
import type { CsharpTargetOperationClassifications } from "../../../target-model/records/operations.js";
import type { CsharpSafetyApplicationFactIndex } from "../../../target-model/records/safety.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/source-evidence.js";

export interface CsharpNativeDemandAnalysisInput extends CsharpNativeParticipationInput, CsharpExpectedNativeUseInput {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly navigation: Pick<TargetPlanningSourceNavigation, "isProjectDeclaration" | "referenceFor" | "sourceReferenceFor">;
  readonly evidence: Pick<CsharpSourceEvidenceIndex, "compileTimeMetadata" | "sourceArgument" | "sourceDefaultValue" | "sourceStruct">;
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
  readonly classFactories: Pick<CsharpClassFactoryIndex, "classFactory">;
  readonly safetyApplications: Pick<CsharpSafetyApplicationFactIndex, "safetyOperation">;
}
