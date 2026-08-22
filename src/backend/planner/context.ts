import type {
  Node,
} from "@tsonic/tsts";
import type {
  TargetTypeRef,
} from "../../target-model/types/index.js";
import type {
  CsharpProjectTypeClassifications,
} from "../../analysis/project-types/index.js";
import type {
  CsharpObjectShapeClassifications,
} from "../../analysis/object-shapes/index.js";
import type {
  CsharpArtifactGraph,
} from "./artifacts/index.js";
import {
  createCsharpArtifactGraph,
} from "./artifacts/index.js";
import type {
  CsharpSourceNameResolver,
} from "../../analysis/names/index.js";
import {
  createCsharpSourceOutputIdentityPlanner,
} from "./names/source-output-identities.js";
import type {
  CsharpSourceOutputIdentityPlanner,
} from "./names/source-output-identities.js";
import type {
  CsharpTargetProgram,
} from "../../analysis/program/index.js";
import type { SourceFile } from "@tsonic/tsts";

export interface CsharpPlanningTypeClassifications {
  resolveNode(
    node: Node | undefined,
    sourceFile?: SourceFile,
  ): TargetTypeRef | undefined;
  resolveStorage(
    node: Node | undefined,
    sourceFile?: SourceFile,
  ): TargetTypeRef | undefined;
  resolveReadStorage(
    node: Node | undefined,
    sourceFile?: SourceFile,
  ): TargetTypeRef | undefined;
}

export interface CsharpPlanningTypeView {
  readonly classifications: CsharpPlanningTypeClassifications;
  readonly objectShapes: CsharpObjectShapeClassifications;
  readonly projectTypes: CsharpProjectTypeClassifications;
}

export interface CsharpPlanningScope {
  readonly sourceThisBinding?: {
    readonly name: string;
    readonly targetType: TargetTypeRef;
  };
}

export interface CsharpPlanningContext {
  readonly program: CsharpTargetProgram;
  readonly host: CsharpTargetProgram["host"];
  readonly types: CsharpPlanningTypeView;
  readonly artifacts: CsharpArtifactGraph;
  readonly outputIdentities: CsharpSourceOutputIdentityPlanner;
  readonly names: CsharpSourceNameResolver;
  readonly scope: CsharpPlanningScope;
}

export function createCsharpPlanningContext(
  program: CsharpTargetProgram,
): CsharpPlanningContext {
  const { objectShapes, projectTypes } = program;
  const artifacts = createCsharpArtifactGraph({
    ast: program.source.ast,
    objectShapes,
  });
  const classifications = createCsharpPlanningTypeClassifications(program);
  const types: CsharpPlanningTypeView = Object.freeze({
    classifications,
    objectShapes,
    projectTypes,
  });
  const outputIdentities = createCsharpSourceOutputIdentityPlanner({
    ast: program.source.ast,
    sourceFiles: program.sourceFiles,
    paths: program.host.paths,
  });
  const names = program.names;
  return Object.freeze({
    program,
    host: program.host,
    types,
    artifacts,
    outputIdentities,
    names,
    scope: Object.freeze({}),
  });
}

function createCsharpPlanningTypeClassifications(
  program: CsharpTargetProgram,
): CsharpPlanningTypeClassifications {
  return Object.freeze({
    resolveNode(node: Node | undefined) {
      return node === undefined
        ? undefined
        : program.sourceEvidence.valueRefinement(node)?.flowReadTargetType ??
          program.operations.resultType(node) ??
          program.storage.type(node) ??
          program.sourceEvidence.nodeTargetType(node);
    },
    resolveStorage(node: Node | undefined) {
      return node === undefined
        ? undefined
        : program.storage.type(node);
    },
    resolveReadStorage(node: Node | undefined) {
      return node === undefined
        ? undefined
        : program.storage.type(node) ??
          program.sourceEvidence.readStorageTargetType(node);
    },
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
