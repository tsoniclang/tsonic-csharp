import type {
  SourceFile,
} from "@tsonic/tsts";
import {
  resolvedTargetStage,
} from "@tsonic/target-api/artifacts";
import type {
  TargetStageResult,
} from "@tsonic/target-api/artifacts";
import {
  createCsharpTypeSystem,
} from "../../policy/types/model/system.js";
import {
  createCsharpAttributeApplicationFactIndex,
} from "../attributes/application-index.js";
import {
  createCsharpSafetyApplicationFactIndex,
} from "../safety/application-index.js";
import type {
  CsharpTargetAnalysisRequest,
  CsharpTargetProgram,
} from "./model.js";
import {
  createCsharpSourceIdentityPolicy,
} from "../../policy/identities/source-nodes.js";

export function analyzeCsharpTargetProgram(
  request: CsharpTargetAnalysisRequest,
): TargetStageResult<CsharpTargetProgram> {
  const { input, configuration, providers } = request;
  const sourceFiles = Object.freeze(input.source.sourceFiles.filter(
    (sourceFile): sourceFile is SourceFile => sourceFile !== undefined,
  ));
  const source = input.source;
  const program: CsharpTargetProgram = Object.freeze({
    configuration,
    source,
    sourceFiles,
    providers,
    attributeApplications: createCsharpAttributeApplicationFactIndex({
      ast: source.ast,
      sourceFiles: source.navigation.sourceFiles,
      sourceFacts: source.sourceFacts,
    }),
    safetyApplications: createCsharpSafetyApplicationFactIndex({
      ast: source.ast,
      sourceFiles: source.navigation.sourceFiles,
      sourceFacts: source.sourceFacts,
      navigation: source.navigation,
    }),
    sourceIdentities: createCsharpSourceIdentityPolicy(
      source.ast,
      input.paths.projectRoot,
    ),
    typeSystem: createCsharpTypeSystem({
      ast: source.ast,
      sourceFiles,
      sourceFacts: source.sourceFacts,
      navigation: source.navigation,
      providers,
      target: input.target,
      semantics: source.semantics.forFile,
      semanticsFor: source.semantics.forNode,
      hasSemantics: source.semantics.includes,
    }),
  });
  return resolvedTargetStage(program);
}
