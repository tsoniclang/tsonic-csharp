import type {
  AstReader,
  CheckedSourceProgram,
  Node,
  ReadonlySourceFactResolver,
  SourceFile,
  SourceFileQueries,
} from "@tsonic/tsts";
import type {
  SourceProgramNavigation,
  TargetBackendContext,
  TargetCompilationPaths,
  TargetCompileInput,
  TargetRuntimeReference,
  TargetSelection,
  TsonicProjectConfig,
} from "@tsonic/target-api";
import {
  createSourceProgramNavigation,
} from "@tsonic/target-api";
import type {
  CsharpProviderRelationResolver,
} from "../../provider/target-relations/resolver.js";
import {
  createCsharpProviderRelationResolver,
} from "../../provider/target-relations/resolver.js";
import type {
  CsharpObjectShapePolicy,
  CsharpTypePolicy,
  CsharpTypePolicyHost,
} from "../../policy/types/index.js";
import {
  createCsharpObjectShapePolicy,
  createCsharpTypePolicy,
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
  readonly source: CheckedSourceProgram;
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
  readonly artifacts: CsharpTranslationArtifactGraph;
  readonly outputIdentities: CsharpSourceOutputIdentityPlanner;
  queries(sourceFile: SourceFile): SourceFileQueries;
  queriesFor(node: Node): SourceFileQueries;
}

export function createCsharpTranslationContext(
  backend: TargetBackendContext,
  input: TargetCompileInput,
): CsharpTranslationContext {
  const sourceFiles = input.source.sourceFiles.filter(
    (sourceFile): sourceFile is SourceFile => sourceFile !== undefined,
  );
  const providers = createCsharpProviderRelationResolver(backend);
  const queries = (sourceFile: SourceFile): SourceFileQueries =>
    input.source.getSourceFileQueries(sourceFile);
  const queriesFor = (node: Node): SourceFileQueries => {
    const sourceFile = input.source.ast.getSourceFile(node);
    if (sourceFile === undefined) {
      throw new Error("C# translation requires every source node to belong to the checked program.");
    }
    return input.source.getSourceFileQueries(sourceFile);
  };
  const typePolicyHost: CsharpTypePolicyHost = {
    ast: input.source.ast,
    sourceFiles,
    sourceFacts: input.source.sourceFacts,
    navigation: createSourceProgramNavigation(input.source),
    providers,
    queries,
    queriesFor,
  };
  const types = createCsharpTypePolicy(typePolicyHost);
  const objectShapes = createCsharpObjectShapePolicy({
    ...typePolicyHost,
    types,
  });
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
    artifacts,
    outputIdentities,
    queries,
    queriesFor,
  });
}
