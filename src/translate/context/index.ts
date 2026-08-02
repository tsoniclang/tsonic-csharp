import type {
  AstReader,
  Node,
  ReadonlySourceFactResolver,
  SourceFile,
} from "@tsonic/tsts";
import type {
  SourceFileSemantics,
  SourceProgramNavigation,
  TargetBackendContext,
  TargetCompilationPaths,
  TargetCompileInput,
  TargetRuntimeReference,
  TargetSelection,
  TargetSourceProgram,
  TsonicProjectConfig,
} from "@tsonic/target-api";
import type {
  CsharpProviderRelationResolver,
} from "../../provider/target-relations/resolver.js";
import {
  createCsharpProviderRelationResolver,
} from "../../provider/target-relations/resolver.js";
import type {
  CsharpObjectShapePolicy,
  CsharpProjectTypePolicy,
  CsharpTypePolicy,
} from "../../policy/types/index.js";
import {
  createCsharpTypeSystem,
} from "../../policy/types/index.js";
import type {
  CsharpProviderCallSelectionHost,
} from "../../policy/members/index.js";
import type {
  CsharpTranslationArtifactGraph,
  CsharpSourceOutputIdentityPlanner,
} from "../artifacts/index.js";
import {
  createCsharpTranslationArtifactGraph,
  createCsharpSourceOutputIdentityPlanner,
} from "../artifacts/index.js";

export interface CsharpTranslationContext
  extends CsharpProviderCallSelectionHost {
  readonly source: TargetSourceProgram;
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly navigation: SourceProgramNavigation;
  readonly project: TsonicProjectConfig;
  readonly target: TargetSelection;
  readonly runtimeReferences: readonly TargetRuntimeReference[];
  readonly paths: TargetCompilationPaths;
  readonly providers: CsharpProviderRelationResolver;
  readonly types: CsharpTypePolicy;
  readonly objectShapes: CsharpObjectShapePolicy;
  readonly projectTypes: CsharpProjectTypePolicy;
  readonly artifacts: CsharpTranslationArtifactGraph;
  readonly outputIdentities: CsharpSourceOutputIdentityPlanner;
  semantics(sourceFile: SourceFile): SourceFileSemantics;
  semanticsFor(node: Node): SourceFileSemantics;
  hasSemantics(sourceFile: SourceFile): boolean;
}

export function createCsharpTranslationContext(
  backend: TargetBackendContext,
  input: TargetCompileInput,
): CsharpTranslationContext {
  const sourceFiles = input.source.sourceFiles.filter(
    (sourceFile): sourceFile is SourceFile => sourceFile !== undefined,
  );
  const providers = createCsharpProviderRelationResolver(backend);
  const semantics = input.source.semantics.forFile;
  const semanticsFor = input.source.semantics.forNode;
  const hasSemantics = input.source.semantics.includes;
  const typePolicyHost = {
    ast: input.source.ast,
    sourceFiles,
    sourceFacts: input.source.sourceFacts,
    navigation: input.source.navigation,
    providers,
    target: input.target,
    semantics,
    semanticsFor,
    hasSemantics,
  };
  const { types, objectShapes, projectTypes } = createCsharpTypeSystem(
    typePolicyHost,
  );
  const artifacts = createCsharpTranslationArtifactGraph({ objectShapes });
  const outputIdentities = createCsharpSourceOutputIdentityPlanner({
    ast: input.source.ast,
    sourceFiles,
    paths: input.paths,
  });
  return Object.freeze({
    source: input.source,
    ast: input.source.ast,
    sourceFiles: Object.freeze(sourceFiles),
    sourceFacts: input.source.sourceFacts,
    navigation: typePolicyHost.navigation,
    project: input.project,
    target: input.target,
    runtimeReferences: input.runtimeReferences,
    paths: input.paths,
    providers,
    types,
    objectShapes,
    projectTypes,
    artifacts,
    outputIdentities,
    semantics,
    semanticsFor,
    hasSemantics,
  });
}
