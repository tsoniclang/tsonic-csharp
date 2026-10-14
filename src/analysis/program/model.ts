import type { SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import type {
  TargetPlanningSourceNavigation,
  TargetSourceSyntaxProgram,
} from "@tsonic/target-api/analysis";
import type {
  CsharpTargetConfiguration,
} from "../../target-model/configuration/model.js";
import type {
  CsharpProviderRelationResolver,
} from "../../providers/model/relation-resolver.js";
import type {
  CsharpProviderBinaryExecutionDriver,
} from "../../providers/model/provider-policy-contribution.js";
import type { CsharpProjectTypeClassifications } from "../../target-model/records/project-types.js";
import type { CsharpProgramRecords } from "../../target-model/records/program.js";
import type { CsharpClassFactory } from "../../target-model/records/class-factories.js";
import type { CsharpCaptureFrame } from "../../target-model/records/capture-storage.js";
import type { CsharpNamePlan } from "../../target-model/names/model.js";
import type {
  CsharpObjectShapeClassifications,
} from "../objects/index.js";
import type {
  CsharpProjectClassifications,
} from "../project/index.js";
import type { CsharpSourceModuleConstructionIndex } from "../../target-model/records/source-modules.js";
import type { CsharpModuleInitializationIndex } from "../../target-model/records/module-initialization.js";

export interface CsharpTargetAnalysisRequest {
  readonly input: TargetCompileInput;
  readonly configuration: CsharpTargetConfiguration;
  readonly providers: CsharpProviderRelationResolver;
  readonly binaryExecutionDriver?: CsharpProviderBinaryExecutionDriver;
}

export interface CsharpPlanningHost {
  readonly paths: TargetCompileInput["paths"];
  readonly entryPoint: string;
}

export interface CsharpTargetProgram {
  readonly typeDefinitions: import("../../target-model/types/source-union-definitions.js").CsharpTypeDefinitions;
  readonly records: CsharpProgramRecords;
  readonly classFactories: readonly CsharpClassFactory[];
  readonly captureFrames: readonly CsharpCaptureFrame[];
  readonly host: CsharpPlanningHost;
  readonly configuration: CsharpTargetConfiguration;
  readonly project: CsharpProjectClassifications;
  readonly source: TargetSourceSyntaxProgram;
  readonly sourceNavigation: TargetPlanningSourceNavigation;
  readonly sourceFiles: readonly SourceFile[];
  readonly projectTypes: CsharpProjectTypeClassifications;
  readonly objectShapes: CsharpObjectShapeClassifications;
  readonly names: CsharpNamePlan;
  readonly sourceModuleConstructions: Omit<CsharpSourceModuleConstructionIndex, "sourceModuleConstruction">;
  readonly moduleInitialization: Pick<CsharpModuleInitializationIndex, "entrypointInitializer">;
  readonly binaryExecutionDriver?: CsharpProviderBinaryExecutionDriver;
}
