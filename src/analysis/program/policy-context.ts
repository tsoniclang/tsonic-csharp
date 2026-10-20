import type { TargetCompileInput } from "@tsonic/target-api";
import type { SourceStorageQueries } from "@tsonic/target-api/analysis";
import type { SourceFile } from "@tsonic/tsts";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpSourceIdentityPolicy } from "../../source/extension/identities.js";
import type { CsharpTypeSystem } from "./type-system.js";
import { analyzeCsharpValueDomainCarriers } from "../objects/value-domain-carriers.js";
import type { CsharpValueDomainCarrierIssue } from "../../target-model/records/value-domains.js";

export interface CsharpAnalysisPolicyContextInput {
  readonly integerRanges: CsharpPolicyContext["integerRanges"];
  readonly literalValues: CsharpPolicyContext["literalValues"];
  readonly callOnlyAlias: CsharpPolicyContext["callOnlyAlias"];
  readonly input: TargetCompileInput;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceStorage: SourceStorageQueries;
  readonly providers: CsharpProviderRelationResolver;
  readonly sourceIdentities: CsharpSourceIdentityPolicy;
  readonly typeSystem: CsharpTypeSystem;
}

interface CsharpAnalysisPolicyContextResult {
  readonly policy: CsharpPolicyContext;
  readonly issues: readonly CsharpValueDomainCarrierIssue[];
}

export function createCsharpAnalysisPolicyContext(
  context: CsharpAnalysisPolicyContextInput,
): CsharpAnalysisPolicyContextResult {
  const { input, sourceFiles, providers, sourceIdentities, typeSystem } = context;
  const source = input.source;
  const valueDomainCarriers = analyzeCsharpValueDomainCarriers({ sourceStorage: context.sourceStorage,
    types: typeSystem.analysisTypes, objectShapes: typeSystem.objectShapes, semantics: source.semantics.forFile },
    context.sourceStorage.invocations.flatMap(node => source.ast.arguments(node).filter((argument): argument is NonNullable<typeof argument> => argument !== undefined)));
  const policy: CsharpPolicyContext = Object.freeze({
    integerRanges: context.integerRanges,
    literalValues: context.literalValues,
    callOnlyAlias: context.callOnlyAlias,
    ast: source.ast,
    sourceFiles,
    sourceStorage: context.sourceStorage,
    valueDomainCarriers,
    sourceFacts: source.sourceFacts,
    navigation: source.navigation,
    target: input.target,
    providers,
    types: typeSystem.analysisTypes,
    typeDefinitions: typeSystem.typeDefinitions,
    objectShapes: typeSystem.objectShapes,
    projectTypes: typeSystem.projectTypes,
    sourceIdentities,
    semantics: source.semantics.forFile,
    semanticsFor: source.semantics.forNode,
    hasSemantics: source.semantics.includes,
  });
  return Object.freeze({ policy, issues: valueDomainCarriers.issues });
}
