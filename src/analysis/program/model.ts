import type { SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import type {
  TargetSourceProgram,
} from "@tsonic/target-api/source";
import type {
  CsharpTargetConfiguration,
} from "../../target-model/configuration/model.js";
import type {
  CsharpProviderRelationResolver,
} from "../../providers/model/relation-resolver.js";
import type {
  CsharpAttributeApplicationFactIndex,
} from "../attributes/application-index.js";
import type {
  CsharpSafetyApplicationFactIndex,
} from "../safety/application-index.js";
import type {
  CsharpTypeSystem,
} from "../../policy/types/model/system.js";
import type {
  CsharpSourceIdentityPolicy,
} from "../../policy/identities/source-nodes.js";

export interface CsharpTargetAnalysisRequest {
  readonly input: TargetCompileInput;
  readonly configuration: CsharpTargetConfiguration;
  readonly providers: CsharpProviderRelationResolver;
}

export interface CsharpTargetProgram {
  readonly configuration: CsharpTargetConfiguration;
  readonly source: TargetSourceProgram;
  readonly sourceFiles: readonly SourceFile[];
  readonly providers: CsharpProviderRelationResolver;
  readonly attributeApplications: CsharpAttributeApplicationFactIndex;
  readonly safetyApplications: CsharpSafetyApplicationFactIndex;
  readonly sourceIdentities: CsharpSourceIdentityPolicy;
  readonly typeSystem: CsharpTypeSystem;
}
