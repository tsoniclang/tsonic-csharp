import type { TargetCompileInput } from "@tsonic/target-api";
import type { SourceFile } from "@tsonic/tsts";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { CsharpPolicyContext } from "../../policy/context.js";
import type { CsharpSourceIdentityPolicy } from "../../policy/identities/source-nodes.js";
import type { CsharpTypeSystem } from "../../policy/types/model/system.js";
import type { SourceArrayDensityQueries } from "@tsonic/target-api/source";

export interface CsharpAnalysisPolicyContextInput {
  readonly input: TargetCompileInput;
  readonly sourceFiles: readonly SourceFile[];
  readonly providers: CsharpProviderRelationResolver;
  readonly sourceIdentities: CsharpSourceIdentityPolicy;
  readonly typeSystem: CsharpTypeSystem;
  readonly arrayDensity: SourceArrayDensityQueries;
}

export function createCsharpAnalysisPolicyContext(
  context: CsharpAnalysisPolicyContextInput,
): CsharpPolicyContext {
  const { input, sourceFiles, providers, sourceIdentities, typeSystem } = context;
  const source = input.source;
  return Object.freeze({
    ast: source.ast,
    sourceFiles,
    sourceFacts: source.sourceFacts,
    navigation: source.navigation,
    arrayDensity: context.arrayDensity,
    target: input.target,
    providers,
    types: typeSystem.analysisTypes,
    objectShapes: typeSystem.objectShapes,
    projectTypes: typeSystem.projectTypes,
    sourceIdentities,
    semantics: source.semantics.forFile,
    semanticsFor: source.semantics.forNode,
    hasSemantics: source.semantics.includes,
  });
}
