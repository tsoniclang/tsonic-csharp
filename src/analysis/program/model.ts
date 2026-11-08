import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpGenericProjectionIndex } from "../../target-model/records/types/type-projections.js";
import type { CsharpCallableContractIndex, CsharpCallableCreationIndex } from "../../target-model/records/callables/callable-values.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage/storage.js";
import type { CsharpTypeDefinitionRegistry } from "../project-types/type-definitions.js";
import type { CsharpTypeAnalysis } from "./type-system.js";
import type { CsharpFlowReadClassifications } from "../../target-model/records/program/source-evidence.js";
import type { CsharpSourceEvidenceResult } from "../source-evidence/model.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/program/declarations.js";
import type { CsharpExpectedTypeAnalysis } from "../expected-types/model.js";
import type { CsharpConversionClassifications, CsharpValueReadClassifications, CsharpValueReadStageIndex } from "../../target-model/records/operations/conversions.js";
import type { CsharpOptionalLocalPlan } from "../storage/optional-locals.js";
import type { CsharpRequiredRecord } from "./records/objects/required-records.js";
import type { CsharpSourceNameBuilder } from "../names/plan.js";
import type { CsharpAttributeApplicationIndex } from "../../target-model/records/program/attributes.js";
import type { CsharpClassFactoryIndex } from "../../target-model/records/objects/class-factories.js";
import type { CsharpCaptureStorage } from "../../target-model/records/callables/capture-storage.js";
import type { CsharpNativeParticipationInput, CsharpNativeDemandAnalysis } from "../../target-model/records/native/native-demand.js";
import type { CsharpClassInitializationIndex } from "../../target-model/records/objects/class-initialization.js";
import type { CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import type { CsharpBindingPatternClassifications, CsharpBindingPatternIssue } from "../../target-model/records/objects/value-projections.js";
import type { TargetCompileInput } from "@tsonic/target-api";
import type { CsharpTargetConfiguration } from "../../target-model/configuration/model.js";
import type { CsharpProviderRuntimeAcquisition, CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { CsharpTargetBinaryExecutionDriver } from "../../target-model/types/model.js";
import type { CsharpProjectClassifications } from "../../target-model/project/plan.js";
import type { SourceFile } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpTargetProgram } from "../../target-model/records/target-program.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/native-definitions.js";
import type { CsharpProjectTypeClassifications } from "../../target-model/records/types/project-types.js";
import type { CsharpObjectShapeAnalysis, CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import type { CsharpFinalStructuralInterfaceImplementation } from "../../target-model/records/objects/heritage.js";
import type { CsharpNamePlan } from "../../target-model/names/model.js";
import type { CsharpClassFactory } from "../../target-model/records/objects/class-factories.js";
import type { CsharpCaptureFrame } from "../../target-model/records/callables/capture-storage.js";

export interface CsharpTargetAnalysisRequest {
  readonly input: TargetCompileInput;
  readonly configuration: CsharpTargetConfiguration;
  readonly providers: CsharpProviderRelationResolver;
  readonly providerAcquisition: CsharpProviderRuntimeAcquisition;
  readonly project: CsharpProjectClassifications;
  readonly binaryExecutionDriver?: CsharpTargetBinaryExecutionDriver;
}

/**
 * The complete C# analysis program: the sealed target program plus the analysis catalogs it was built from. The
 * backend plans only from the sealed program (analyzeCsharpTargetProgram); analysis tests read the catalogs.
 */
export interface CsharpAnalysisProgram extends Omit<CsharpTargetProgram, "source"> {
  readonly source: TargetSourceProgram;
  readonly representation: import("../../target-model/types/representation.js").CsharpRepresentationView;
  readonly analysis: CsharpRepresentationAnalysis;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceNavigation: TargetSourceProgram["facts"]["navigation"];
  readonly typeDefinitions: CsharpTypeDefinitions;
  readonly projectTypes: CsharpProjectTypeClassifications;
  readonly objectShapes: CsharpObjectShapeClassifications<CsharpFinalStructuralInterfaceImplementation> &
    Pick<CsharpObjectShapeAnalysis, "targetShapes">;
  readonly names: CsharpNamePlan;
  readonly classFactories: readonly CsharpClassFactory[];
  readonly captureFrames: readonly CsharpCaptureFrame[];
}

export interface CsharpRepresentationContract {
  readonly typeProjections: CsharpGenericProjectionIndex;
  readonly callables: CsharpCallableContractIndex;
  readonly storage: CsharpStorageClassifications;
}

export interface CsharpRepresentationAnalysis extends CsharpRepresentationContract {
  readonly policy: CsharpPolicyContext;
  readonly typeDefinitions: CsharpTypeDefinitionRegistry;
  readonly typeSystem: CsharpTypeAnalysis;
  readonly sourceEvidence: CsharpSourceEvidenceResult["index"];
  readonly nativeExpressionIssues: CsharpSourceEvidenceResult["nativeExpressionIssues"];
  readonly operations: CsharpTargetOperationClassifications;
  readonly declarations: CsharpDeclarationClassifications;
  readonly objectShapes: CsharpObjectShapeAnalysis;
  readonly expectedTypes: CsharpExpectedTypeAnalysis;
  readonly conversions: CsharpConversionClassifications;
  readonly storage: CsharpStorageClassifications;
  readonly optionalLocals: CsharpOptionalLocalPlan;
  readonly valueReads: CsharpValueReadClassifications;
  readonly valueReadStages: CsharpValueReadStageIndex;
  readonly flowReads: CsharpFlowReadClassifications;
  readonly requiredRecords: CsharpRequiredRecord[];
  readonly names: CsharpSourceNameBuilder;
  readonly attributes: { readonly index: CsharpAttributeApplicationIndex; readonly diagnostics: readonly TargetDiagnostic[] };
  readonly classFactories: CsharpClassFactoryIndex;
  readonly captureStorage: CsharpCaptureStorage;
  readonly callableCreations: CsharpCallableCreationIndex;
  readonly nativeParticipation: CsharpNativeParticipationInput;
  readonly classInitialization: CsharpClassInitializationIndex;
  readonly exactLiterals: CsharpExactLiteralSelectionIndex;
  readonly nativeDemand: CsharpNativeDemandAnalysis;
  readonly bindingPatterns: CsharpBindingPatternClassifications & { readonly issues: readonly CsharpBindingPatternIssue[] };
  readonly refLikeDiagnostics: readonly TargetDiagnostic[];
}
