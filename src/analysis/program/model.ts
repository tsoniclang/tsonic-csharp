import type { TargetCompileInput } from "@tsonic/target-api";
import type { CsharpTargetConfiguration } from "../../target-model/configuration/model.js";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { CsharpTargetBinaryExecutionDriver } from "../../target-model/metadata/provider-metadata.js";
import type { CsharpProjectClassifications } from "../../target-model/project/plan.js";

export interface CsharpTargetAnalysisRequest {
  readonly input: TargetCompileInput;
  readonly configuration: CsharpTargetConfiguration;
  readonly providers: CsharpProviderRelationResolver;
  readonly project: CsharpProjectClassifications;
  readonly binaryExecutionDriver?: CsharpTargetBinaryExecutionDriver;
}
