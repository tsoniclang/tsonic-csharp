import type { TargetCompileInput } from "@tsonic/target-api";
import type { CsharpTargetConfiguration } from "../../target-model/configuration/model.js";
import type { CsharpProviderRuntimeAcquisition, CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { CsharpTargetBinaryExecutionDriver } from "../../target-model/types/model.js";
import type { CsharpProjectClassifications } from "../../target-model/project/plan.js";
import type { SourceFile } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpTargetProgram } from "../../target-model/records/target-program.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/native-definitions.js";
import type { CsharpRepresentationAnalysis } from "./iteration.js";
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
