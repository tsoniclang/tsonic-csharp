import type {
  Node,
} from "@tsonic/tsts";
import type {
  TargetTypeRef,
} from "../../target-model/types/index.js";
import type { CsharpProjectTypeClassifications } from "../../target-model/records/project-types.js";
import type {
  CsharpObjectShapeClassifications,
} from "../../analysis/objects/index.js";
import type { CsharpNamePlan } from "../../target-model/names/model.js";
import { createCsharpSyntheticNames } from "./names/synthetic.js";
import type { CsharpSyntheticNames } from "./names/synthetic.js";
import type {
  CsharpTargetProgram,
} from "../../analysis/program/index.js";
import type { SourceFile } from "@tsonic/tsts";
import type { CsharpExpression, CsharpMethodDeclaration } from "../target-ast/syntax/index.js";
import type { CsharpDelegateAdapterIdentity } from "../../target-model/records/conversions.js";

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
  readonly delegateAdapters?: ReadonlyMap<CsharpDelegateAdapterIdentity, string>;
  readonly typeParameterNames?: ReadonlyMap<string, string>;
  readonly classValues?: ReadonlyMap<Node, CsharpExpression>;
  readonly capturedBindings?: ReadonlyMap<Node, CsharpExpression>;
  readonly captureFrames?: ReadonlyMap<Node, CsharpExpression>;
  readonly capturedReceivers?: ReadonlyMap<Node, CsharpExpression>;
  readonly nativeCallableBody?: {
    readonly declaration: Node;
    readonly carrier: TargetTypeRef;
  };
  readonly presentOptionalValues?: ReadonlySet<Node>;
  readonly generatedMethods?: Map<Node, CsharpMethodDeclaration>;
  readonly sourceThisBinding?: {
    readonly name: string;
    readonly targetType: TargetTypeRef;
  };
}

export function createCsharpMemberPlanningContext(
  input: CsharpPlanningContext,
): CsharpPlanningContext {
  return Object.freeze({
    ...input,
    scope: Object.freeze({ ...input.scope, generatedMethods: new Map<Node, CsharpMethodDeclaration>() }),
  });
}

export type CsharpPlanningNames = Pick<CsharpNamePlan, "resolve"> & CsharpSyntheticNames;

export interface CsharpPlanningContext {
  readonly storageExpression?: Node;
  readonly program: CsharpTargetProgram;
  readonly host: CsharpTargetProgram["host"];
  readonly types: CsharpPlanningTypeView;
  readonly names: CsharpPlanningNames;
  readonly scope: CsharpPlanningScope;
}

export function createCsharpPlanningContext(
  program: CsharpTargetProgram,
): CsharpPlanningContext {
  const { objectShapes, projectTypes } = program;
  const classifications = createCsharpPlanningTypeClassifications(program);
  const types: CsharpPlanningTypeView = Object.freeze({
    classifications,
    objectShapes,
    projectTypes,
  });
  const names: CsharpPlanningNames = Object.freeze({
    resolve: program.names.resolve,
    temporaryName: createCsharpSyntheticNames(program.names.reservedNames).temporaryName,
  });
  return Object.freeze({
    program,
    host: program.host,
    types,
    names,
    scope: Object.freeze({ typeParameterNames: new Map(program.names.typeParameterNames.map(parameter => [parameter.identity, parameter.name])) }),
  });
}

function createCsharpPlanningTypeClassifications(
  program: CsharpTargetProgram,
): CsharpPlanningTypeClassifications {
  return Object.freeze({
    resolveNode(node: Node | undefined) {
      return node === undefined ? undefined : program.records.valueRead.get(node)?.value;
    },
    resolveStorage(node: Node | undefined) {
      return node === undefined
        ? undefined
        : program.records.storageType.get(node);
    },
    resolveReadStorage(node: Node | undefined) {
      return node === undefined ? undefined : program.records.valueRead.get(node)?.readStorageValue;
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
