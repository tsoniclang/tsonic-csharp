import type { TargetCompileInput } from "@tsonic/target-api";
import type { SourceStorageQueries } from "@tsonic/target-api/analysis";
import type { SourceFile } from "@tsonic/tsts";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpSourceIdentityPolicy } from "../../source/extension/identities.js";
import type { CsharpTypeSystem } from "./type-system.js";
import { analyzeCsharpValueDomainCarriers } from "../objects/value-domain-carriers.js";
import type { CsharpValueDomainCarrierIssue } from "../../target-model/records/types/value-domains.js";

export interface CsharpAnalysisPolicyContextInput {
  readonly moduleCallables: CsharpPolicyContext["moduleCallables"];
  readonly integerRanges: CsharpPolicyContext["integerRanges"];
  readonly callOnlyAlias: CsharpPolicyContext["callOnlyAlias"];
  readonly input: TargetCompileInput;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceStorage: SourceStorageQueries;
  readonly pointerStorage: CsharpPolicyContext["pointerStorage"];
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
    types: typeSystem.analysisTypes,
    typeParameters: typeSystem.representation.typeParameters, objectShapes: typeSystem.objectShapes, facts: source.facts },
    context.sourceStorage.invocations.flatMap(node => source.syntax.arguments(node).filter((argument): argument is NonNullable<typeof argument> => argument !== undefined)));
  const policy: CsharpPolicyContext = Object.freeze({
    facts: source.facts,
    moduleCallables: context.moduleCallables,
    integerRanges: context.integerRanges,
    callOnlyAlias: context.callOnlyAlias,
    ast: source.syntax,
    sourceFiles,
    sourceStorage: context.sourceStorage,
    pointerStorage: context.pointerStorage,
    valueDomainCarriers,
    sourceFacts: source.sourceFacts,
    target: input.target,
    providers,
    types: typeSystem.analysisTypes,
    typeDefinitions: typeSystem.typeDefinitions,
    objectShapes: typeSystem.objectShapes,
    projectTypes: typeSystem.projectTypes,
    sourceIdentities,
  });
  return Object.freeze({ policy, issues: valueDomainCarriers.issues });
}
