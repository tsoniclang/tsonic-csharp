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
  CsharpSourceTargetTypeBinding,
  CsharpTypePolicy,
  TargetTypeRef,
} from "../../policy/types/index.js";
import {
  createCsharpTypeSystem,
  targetTypeRefEquals,
} from "../../policy/types/index.js";
import type {
  CsharpProviderCallSelectionHost,
  ResolvedSourceCallInfo,
} from "../../policy/members/index.js";
import type {
  CsharpTranslationArtifactGraph,
  CsharpSourceOutputIdentityPlanner,
} from "../artifacts/index.js";
import {
  createCsharpTranslationArtifactGraph,
  createCsharpSourceOutputIdentityPlanner,
} from "../artifacts/index.js";
import type {
  CsharpSourceNameResolver,
} from "../names/index.js";
import {
  createCsharpSourceNameResolver,
} from "../names/index.js";

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
  readonly names: CsharpSourceNameResolver;
  semantics(sourceFile: SourceFile): SourceFileSemantics;
  semanticsFor(node: Node): SourceFileSemantics;
  hasSemantics(sourceFile: SourceFile): boolean;
}

export type { CsharpSourceTargetTypeBinding } from "../../policy/types/index.js";

export type CsharpScopedTranslationContextResult =
  | {
      readonly kind: "resolved";
      readonly context: CsharpTranslationContext;
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };

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
  let artifacts: CsharpTranslationArtifactGraph | undefined;
  let projectTypes: CsharpProjectTypePolicy | undefined;
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
    scopedTargetType(node: Node): TargetTypeRef | undefined {
      return artifacts?.requiredStorageType(node);
    },
    sourceCallable(
      source: ResolvedSourceCallInfo,
      sourceFile: SourceFile,
    ) {
      const selectedCallee = source.sourceCallee.selectedDeclaration;
      if (
        selectedCallee !== undefined &&
        input.source.ast.is.IsClassDeclaration(selectedCallee)
      ) {
        const constructor = projectTypes?.implicitConstructorForSignature(
          selectedCallee,
          source.selectedSignature,
        );
        if (constructor !== undefined) {
          return artifacts?.sourceCallable({
            kind: "project-constructor",
            targetMemberId: constructor.targetMember.id,
          });
        }
      }
      const declaration = semantics(sourceFile).getSignatureDeclaration(
        source.selectedSignature,
      );
      return declaration !== undefined &&
          input.source.navigation.isProjectDeclaration(declaration)
        ? artifacts?.sourceCallable({ kind: "declaration", declaration })
        : undefined;
    },
  };
  const typeSystem = createCsharpTypeSystem(
    typePolicyHost,
  );
  const { types, objectShapes } = typeSystem;
  projectTypes = typeSystem.projectTypes;
  artifacts = createCsharpTranslationArtifactGraph({
    ast: input.source.ast,
    objectShapes,
    navigation: input.source.navigation,
  });
  const outputIdentities = createCsharpSourceOutputIdentityPlanner({
    ast: input.source.ast,
    sourceFiles,
    paths: input.paths,
  });
  const names = createCsharpSourceNameResolver({
    ast: input.source.ast,
    navigation: input.source.navigation,
    outputIdentities,
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
    names,
    semantics,
    semanticsFor,
    hasSemantics,
  });
}

export function createCsharpScopedTranslationContext(
  input: CsharpTranslationContext,
  bindings: readonly CsharpSourceTargetTypeBinding[],
): CsharpScopedTranslationContextResult {
  if (bindings.length === 0) {
    return { kind: "resolved", context: input };
  }
  const scopedTypes = input.types.withSourceTargetBindings(bindings);
  if (scopedTypes.kind === "rejected") {
    return scopedTypes;
  }
  const targetTypes = new WeakMap<Node, TargetTypeRef>();
  for (const binding of bindings) {
    const current = targetTypes.get(binding.declaration);
    if (
      current !== undefined &&
      !targetTypeRefEquals(current, binding.targetType)
    ) {
      return {
        kind: "rejected",
        reason:
          "One exact source declaration is related to incompatible scoped C# target representations.",
      };
    }
    targetTypes.set(binding.declaration, binding.targetType);
  }
  const scopedTargetType = (
    node: Node | undefined,
  ): TargetTypeRef | undefined => {
    if (node === undefined) {
      return undefined;
    }
    const reference = input.navigation.referenceFor(node);
    return targetTypes.get(reference?.declaration ?? node) ??
      targetTypes.get(node);
  };
  const objectShapes: CsharpObjectShapePolicy = {
    resolveNode(node, sourceFile) {
      const targetType = scopedTargetType(node);
      return targetType === undefined
        ? input.objectShapes.resolveNode(node, sourceFile)
        : input.objectShapes.resolveTarget(targetType);
    },
    resolveTarget(type) {
      return input.objectShapes.resolveTarget(type);
    },
    resolveObjectLiteralTargetShape(expectedShape) {
      return input.objectShapes.resolveObjectLiteralTargetShape(expectedShape);
    },
    resolveProjectConstructibleSelectedType(
      targetType,
      explicitTypeNode,
      selectedType,
      contextNode,
      sourceFile,
    ) {
      return input.objectShapes.resolveProjectConstructibleSelectedType(
        targetType,
        explicitTypeNode,
        selectedType,
        contextNode,
        sourceFile,
      );
    },
  };
  Object.freeze(objectShapes);
  return {
    kind: "resolved",
    context: Object.freeze({
      ...input,
      types: scopedTypes.policy,
      objectShapes,
    }),
  };
}
