import type {
  Node,
} from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import type {
  CsharpObjectShapePolicy,
  CsharpProjectTypePolicy,
  CsharpSourceTargetTypeBinding,
  CsharpTypePolicy,
  TargetTypeRef,
} from "../../policy/types/index.js";
import {
  targetTypeRefEquals,
} from "../../policy/types/index.js";
import type {
  CsharpArtifactGraph,
} from "./artifacts/index.js";
import {
  createCsharpArtifactGraph,
} from "./artifacts/index.js";
import {
  createCsharpSourceOutputIdentityPlanner,
} from "./names/source-output-identities.js";
import type {
  CsharpSourceNameResolver,
} from "./names/source-names.js";
import {
  createCsharpSourceNameResolver,
} from "./names/source-names.js";
import type {
  CsharpTargetProgram,
} from "../../analysis/program/index.js";
import {
  createCsharpPlanningRepresentationQueries,
} from "./types/representation-queries.js";
import type {
  CsharpPolicyContext,
} from "../../policy/context.js";

export interface CsharpPlanningTypeView {
  readonly policy: CsharpTypePolicy;
  readonly objectShapes: CsharpObjectShapePolicy;
  readonly projectTypes: CsharpProjectTypePolicy;
}

export interface CsharpPlanningScope {
  readonly sourceThisBinding?: {
    readonly name: string;
    readonly targetType: TargetTypeRef;
  };
}

export interface CsharpPlanningContext {
  readonly input: TargetCompileInput;
  readonly program: CsharpTargetProgram;
  readonly policy: CsharpPolicyContext;
  readonly types: CsharpPlanningTypeView;
  readonly artifacts: CsharpArtifactGraph;
  readonly outputIdentities: ReturnType<typeof createCsharpSourceOutputIdentityPlanner>;
  readonly names: CsharpSourceNameResolver;
  readonly scope: CsharpPlanningScope;
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
  input: TargetCompileInput,
  program: CsharpTargetProgram,
): CsharpPlanningContext {
  const { objectShapes, projectTypes } = program.typeSystem;
  const artifacts = createCsharpArtifactGraph({
    ast: program.source.ast,
    objectShapes,
    navigation: program.source.navigation,
  });
  const planningTypes = program.typeSystem.createPlanningTypes(
    createCsharpPlanningRepresentationQueries(program, artifacts, projectTypes),
  );
  const types: CsharpPlanningTypeView = Object.freeze({
    policy: planningTypes,
    objectShapes,
    projectTypes,
  });
  const outputIdentities = createCsharpSourceOutputIdentityPlanner({
    ast: program.source.ast,
    sourceFiles: program.sourceFiles,
    paths: input.paths,
  });
  const names = createCsharpSourceNameResolver({
    ast: program.source.ast,
    navigation: program.source.navigation,
    outputIdentities,
  });
  const policy = createCsharpPlanningPolicyContext(input, program, types);
  return Object.freeze({
    input,
    program,
    policy,
    types,
    artifacts,
    outputIdentities,
    names,
    scope: Object.freeze({}),
  });
}

export function createCsharpScopedPlanningContext(
  input: CsharpPlanningContext,
  bindings: readonly CsharpSourceTargetTypeBinding[],
): CsharpScopedPlanningContextResult {
  if (bindings.length === 0) {
    return { kind: "resolved", context: input };
  }
  const scopedTypes = input.types.policy.withSourceTargetBindings(bindings);
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
    const reference = input.program.source.navigation.referenceFor(node);
    return targetTypes.get(reference?.declaration ?? node) ??
      targetTypes.get(node);
  };
  const objectShapes: CsharpObjectShapePolicy = {
    resolveNode(node, sourceFile) {
      const targetType = scopedTargetType(node);
      return targetType === undefined
        ? input.types.objectShapes.resolveNode(node, sourceFile)
        : input.types.objectShapes.resolveTarget(targetType);
    },
    resolveTarget(type) {
      return input.types.objectShapes.resolveTarget(type);
    },
    resolveType(type, sourceFile) {
      return input.types.objectShapes.resolveType(type, sourceFile);
    },
    resolveObjectLiteralTargetShape(expectedShape, objectLiteral, sourceFile) {
      return input.types.objectShapes.resolveObjectLiteralTargetShape(
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
      return input.types.objectShapes.resolveProjectConstructibleSelectedType(
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
      policy: Object.freeze({
        ...input.policy,
        types: scopedTypes.policy,
        objectShapes,
        projectTypes: input.types.projectTypes,
      }),
      types: Object.freeze({
        policy: scopedTypes.policy,
        objectShapes,
        projectTypes: input.types.projectTypes,
      }),
    }),
  };
}

function createCsharpPlanningPolicyContext(
  input: TargetCompileInput,
  program: CsharpTargetProgram,
  types: CsharpPlanningTypeView,
): CsharpPolicyContext {
  const source = program.source;
  return Object.freeze({
    ast: source.ast,
    sourceFiles: program.sourceFiles,
    sourceFacts: source.sourceFacts,
    navigation: source.navigation,
    target: input.target,
    providers: program.providers,
    types: types.policy,
    objectShapes: types.objectShapes,
    projectTypes: types.projectTypes,
    sourceIdentities: program.sourceIdentities,
    semantics: source.semantics.forFile,
    semanticsFor: source.semantics.forNode,
    hasSemantics: source.semantics.includes,
  });
}

export function createCsharpThisBindingPlanningContext(
  input: CsharpPlanningContext,
  name: string,
  targetType: TargetTypeRef,
): CsharpPlanningContext {
  return Object.freeze({
    ...input,
    scope: Object.freeze({
      ...input.scope,
      sourceThisBinding: Object.freeze({ name, targetType }),
    }),
  });
}
