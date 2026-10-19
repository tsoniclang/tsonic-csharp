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
  CsharpTargetBinaryExecutionDriver,
} from "../../target-model/metadata/provider-metadata.js";
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
import type { CsharpFinalStructuralInterfaceImplementation } from "../../target-model/records/heritage.js";

export interface CsharpTargetAnalysisRequest {
  readonly input: TargetCompileInput;
  readonly configuration: CsharpTargetConfiguration;
  readonly providers: CsharpProviderRelationResolver;
  readonly binaryExecutionDriver?: CsharpTargetBinaryExecutionDriver;
}

export interface CsharpPlanningHost {
  readonly paths: TargetCompileInput["paths"];
  readonly entryPoint: string;
}

export interface CsharpTargetProgram {
  readonly typeDefinitions: import("../../target-model/types/source-union-definitions.js").CsharpTypeDefinitions;
  readonly records: CsharpProgramRecords;
  readonly promiseResults: import("../../target-model/records/promise-results.js").CsharpPromiseResults;
  readonly classFactories: readonly CsharpClassFactory[];
  readonly captureFrames: readonly CsharpCaptureFrame[];
  readonly host: CsharpPlanningHost;
  readonly configuration: CsharpTargetConfiguration;
  readonly project: CsharpProjectClassifications;
  readonly source: TargetSourceSyntaxProgram;
  readonly sourceNavigation: TargetPlanningSourceNavigation;
  readonly sourceFiles: readonly SourceFile[];
  readonly projectTypes: CsharpProjectTypeClassifications;
  readonly objectShapes: CsharpObjectShapeClassifications<CsharpFinalStructuralInterfaceImplementation>;
  readonly names: CsharpNamePlan;
  readonly sourceModuleConstructions: Omit<CsharpSourceModuleConstructionIndex, "sourceModuleConstruction">;
  readonly moduleInitialization: Pick<CsharpModuleInitializationIndex, "entrypointInitializer">;
  readonly binaryExecutionDriver?: CsharpTargetBinaryExecutionDriver;
}
