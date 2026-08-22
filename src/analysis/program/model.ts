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
  CsharpAttributeApplicationFactIndex,
} from "../attributes/application-index.js";
import type {
  CsharpSafetyApplicationFactIndex,
} from "../safety/application-index.js";
import type {
  CsharpProjectTypeClassifications,
} from "../project-types/index.js";
import type {
  CsharpTargetOperationClassifications,
} from "../operations/index.js";
import type {
  CsharpSourceEvidenceIndex,
} from "../source-evidence/index.js";
import type {
  CsharpDeclarationClassifications,
} from "../declarations/index.js";
import type {
  CsharpSourceNameResolver,
} from "../names/index.js";
import type {
  CsharpObjectShapeClassifications,
} from "../object-shapes/index.js";
import type {
  CsharpConversionClassifications,
} from "../conversions/index.js";
import type {
  CsharpStorageClassifications,
} from "../storage/index.js";
import type {
  CsharpProjectClassifications,
} from "../project/index.js";
import type {
  CsharpExpectedTypeClassifications,
} from "../expected-types/index.js";

export interface CsharpTargetAnalysisRequest {
  readonly input: TargetCompileInput;
  readonly configuration: CsharpTargetConfiguration;
  readonly providers: CsharpProviderRelationResolver;
}

export interface CsharpPlanningHost {
  readonly paths: TargetCompileInput["paths"];
  readonly entryPoint: string;
}

export interface CsharpTargetProgram {
  readonly host: CsharpPlanningHost;
  readonly configuration: CsharpTargetConfiguration;
  readonly project: CsharpProjectClassifications;
  readonly source: TargetSourceSyntaxProgram;
  readonly sourceNavigation: TargetPlanningSourceNavigation;
  readonly sourceFiles: readonly SourceFile[];
  readonly attributeApplications: CsharpAttributeApplicationFactIndex;
  readonly safetyApplications: CsharpSafetyApplicationFactIndex;
  readonly projectTypes: CsharpProjectTypeClassifications;
  readonly objectShapes: CsharpObjectShapeClassifications;
  readonly operations: CsharpTargetOperationClassifications;
  readonly sourceEvidence: CsharpSourceEvidenceIndex;
  readonly declarations: CsharpDeclarationClassifications;
  readonly names: CsharpSourceNameResolver;
  readonly conversions: CsharpConversionClassifications;
  readonly expectedTypes: CsharpExpectedTypeClassifications;
  readonly storage: CsharpStorageClassifications;
}
