import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetBackendContext,
  TargetCompilationPaths,
  TargetCompileInput,
  TsonicProjectConfig,
} from "@tsonic/target-api";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { TargetRuntimeReference } from "@tsonic/target-api/artifacts";
import {
  createCsharpProviderRelationResolver,
} from "../../providers/resolution/relation-resolver.js";
import type {
  CsharpObjectShapePolicy,
  CsharpProjectTypePolicy,
  CsharpSourceTargetTypeBinding,
  TargetTypeRef,
} from "../../policy/types/index.js";
import {
  createCsharpTypeSystem,
  targetTypeRefEquals,
} from "../../policy/types/index.js";
import type {
  ResolvedSourceCallInfo,
} from "../../policy/members/index.js";
import type {
  CsharpPolicyContext,
} from "../../policy/context.js";
import type {
  CsharpArtifactGraph,
} from "./artifacts/index.js";
import {
  createCsharpArtifactGraph,
} from "./artifacts/index.js";
import {
  createCsharpSourceOutputIdentityPlanner,
} from "../../policy/names/source-output-identities.js";
import type {
  CsharpSourceNameResolver,
} from "./names/source-names.js";
import {
  createCsharpSourceNameResolver,
} from "./names/source-names.js";
import type {
  CsharpAttributeApplicationFactIndex,
} from "../../analysis/attributes/application-index.js";
import {
  createCsharpAttributeApplicationFactIndex,
} from "../../analysis/attributes/application-index.js";
import type {
  CsharpSafetyApplicationFactIndex,
} from "../../analysis/safety/application-index.js";
import {
  createCsharpSafetyApplicationFactIndex,
} from "../../analysis/safety/application-index.js";
import {
  readCsharpTypescriptCompatibilityMode,
} from "../../options/csharp-target-options.js";

export interface CsharpPlanningContext
  extends CsharpPolicyContext {
  readonly source: TargetSourceProgram;
  readonly project: TsonicProjectConfig;
  readonly runtimeReferences: readonly TargetRuntimeReference[];
  readonly paths: TargetCompilationPaths;
  readonly artifacts: CsharpArtifactGraph;
  readonly names: CsharpSourceNameResolver;
  readonly attributeApplications: CsharpAttributeApplicationFactIndex;
  readonly safetyApplications: CsharpSafetyApplicationFactIndex;
  readonly sourceThisBinding?: {
    readonly name: string;
    readonly targetType: TargetTypeRef;
  };
}

export type { CsharpSourceTargetTypeBinding } from "../../policy/types/index.js";

export type CsharpScopedPlanningContextResult =
  | {
      readonly kind: "resolved";
      readonly context: CsharpPlanningContext;
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };

export function createCsharpPlanningContext(
  backend: TargetBackendContext,
  input: TargetCompileInput,
): CsharpPlanningContext {
  const sourceFiles = input.source.sourceFiles.filter(
    (sourceFile): sourceFile is SourceFile => sourceFile !== undefined,
  );
  const providers = createCsharpProviderRelationResolver(backend);
  const semantics = input.source.semantics.forFile;
  const semanticsFor = input.source.semantics.forNode;
  const hasSemantics = input.source.semantics.includes;
  const typescriptCompatibility = readCsharpTypescriptCompatibilityMode(
    input.target,
  );
  let artifacts: CsharpArtifactGraph | undefined;
  let projectTypes: CsharpProjectTypePolicy | undefined;
  const typePolicyHost = {
    ast: input.source.ast,
    sourceFiles,
    sourceFacts: input.source.sourceFacts,
    navigation: input.source.navigation,
    providers,
    target: input.target,
    typescriptCompatibility,
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
  artifacts = createCsharpArtifactGraph({
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
  const attributeApplications = createCsharpAttributeApplicationFactIndex({
    ast: input.source.ast,
    sourceFiles: input.source.navigation.sourceFiles,
    sourceFacts: input.source.sourceFacts,
  });
  const safetyApplications = createCsharpSafetyApplicationFactIndex({
    ast: input.source.ast,
    sourceFiles: input.source.navigation.sourceFiles,
    sourceFacts: input.source.sourceFacts,
    navigation: input.source.navigation,
  });
  return Object.freeze({
    source: input.source,
    ast: input.source.ast,
    sourceFiles: Object.freeze(sourceFiles),
    sourceFacts: input.source.sourceFacts,
    navigation: typePolicyHost.navigation,
    project: input.project,
    target: input.target,
    typescriptCompatibility,
    runtimeReferences: input.runtimeReferences,
    paths: input.paths,
    providers,
    types,
    objectShapes,
    projectTypes,
    artifacts,
    outputIdentities,
    names,
    attributeApplications,
    safetyApplications,
    semantics,
    semanticsFor,
    hasSemantics,
  });
}

export function createCsharpScopedPlanningContext(
  input: CsharpPlanningContext,
  bindings: readonly CsharpSourceTargetTypeBinding[],
): CsharpScopedPlanningContextResult {
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
    resolveType(type, sourceFile) {
      return input.objectShapes.resolveType(type, sourceFile);
    },
    resolveObjectLiteralTargetShape(expectedShape, objectLiteral, sourceFile) {
      return input.objectShapes.resolveObjectLiteralTargetShape(
        expectedShape,
        objectLiteral,
        sourceFile,
      );
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

export function createCsharpThisBindingPlanningContext(
  input: CsharpPlanningContext,
  name: string,
  targetType: TargetTypeRef,
): CsharpPlanningContext {
  return Object.freeze({
    ...input,
    sourceThisBinding: Object.freeze({ name, targetType }),
  });
}
