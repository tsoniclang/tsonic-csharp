import type { TargetCompileInput } from "@tsonic/target-api";
import type { SourceStorageQueries } from "@tsonic/target-api/analysis";
import type { SourceFile } from "@tsonic/tsts";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpSourceIdentityPolicy } from "../../source/extension/identities.js";
import type { CsharpTypeSystem } from "./type-system.js";

export interface CsharpAnalysisPolicyContextInput {
  readonly moduleCallables: CsharpPolicyContext["moduleCallables"];
  readonly literals: CsharpPolicyContext["literals"];
  readonly callOnlyAlias: CsharpPolicyContext["callOnlyAlias"];
  readonly input: TargetCompileInput;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceStorage: SourceStorageQueries;
  readonly providers: CsharpProviderRelationResolver;
  readonly sourceIdentities: CsharpSourceIdentityPolicy;
  readonly typeSystem: CsharpTypeSystem;
}

export function createCsharpAnalysisPolicyContext(
  context: CsharpAnalysisPolicyContextInput,
): CsharpPolicyContext {
  const { input, sourceFiles, providers, sourceIdentities, typeSystem } = context;
  const source = input.source;
  const policy: CsharpPolicyContext = Object.freeze({
    facts: source.facts,
    representation: typeSystem.representation,
    moduleCallables: context.moduleCallables,
    integerRanges: typeSystem.integerRanges,
    literals: context.literals,
    callOnlyAlias: context.callOnlyAlias,
    ast: source.ast,
    sourceFiles,
    sourceStorage: context.sourceStorage,
    target: input.target,
    providers,
    types: typeSystem.analysisTypes,
    typeDefinitions: typeSystem.typeDefinitions,
    objectShapes: typeSystem.objectShapes,
    projectTypes: typeSystem.projectTypes,
    nativeDelegates: typeSystem.nativeDelegates,
    nativeValue: typeSystem.nativeValue,
    sourceIdentities,
  });
  return policy;
}
