import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpPlannedCallable } from "./expressions/planned-values.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpGeneratorProtocol, CsharpTargetParameter } from "../../target-model/types/model.js";
import type { CsharpTargetProgram } from "../../target-model/records/target-program.js";
import type { CsharpDelegateAdapterIdentity } from "../../target-model/records/operations/conversions.js";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode, CsharpMethodDeclaration } from "../target-ast/syntax/index.js";
import type { CsharpPlannedAddressOperand, CsharpPlannedArgument, CsharpPlannedValue } from "./expressions/planned-values.js";

export interface CsharpSyntheticNames {
  temporaryName(preferred: string): string;
}

export interface CsharpPlanningScope {
  readonly delegateAdapters?: ReadonlyMap<CsharpDelegateAdapterIdentity, string>;
  readonly typeParameterNames?: ReadonlyMap<string, string>;
  readonly classValues?: ReadonlyMap<Node, CsharpExpression>;
  readonly capturedBindings?: ReadonlyMap<Node, CsharpPlannedAddressOperand>;
  readonly captureFrames?: ReadonlyMap<Node, CsharpExpression>;
  readonly capturedReceivers?: ReadonlyMap<Node, CsharpExpression>;
  readonly nativeCallableBody?: { readonly declaration: Node; readonly carrier: TargetTypeRef };
  readonly presentOptionalValues?: ReadonlySet<Node>;
  readonly generatedMethods?: Map<Node, CsharpMethodDeclaration>;
  readonly sourceThisBinding?: { readonly name: string; readonly targetType: TargetTypeRef };
}

export type CsharpPlanningNames = CsharpSyntheticNames;

export interface CsharpPlanningContext {
  readonly dispatch: CsharpPlanningDispatch;
  readonly storageExpression?: Node;
  readonly host: CsharpTargetProgram["host"];
  readonly program: {
    readonly source: Pick<CsharpTargetProgram["source"], "ast">;
    readonly records: CsharpTargetProgram["records"];
  };
  readonly names: CsharpPlanningNames;
  readonly scope: CsharpPlanningScope;
}

export interface DestructuringPlannerState {
  readonly captureFrameNames: Map<Node, string>;
  readonly parent?: DestructuringPlannerState;
  nextTempIndex: number;
  nextParameterIndex: number;
  nextForOfIndex: number;
  nextForInIndex: number;
  nextCatchIndex: number;
  nextControlLabelIndex: number;
  nextTypedLocationIdentityIndex: number;
  nextGeneratorIndex: number;
  nextGeneratorDelegationIndex: number;
  nextResourceScopeIndex: number;
  explicitUnsafeContextDepth: number;
  usedNames: Set<string>;
  localBindingNames: WeakMap<object, string>;
  typedLocationIdentityNames: WeakMap<object, string>;
  expressionOverrides: WeakMap<object, CsharpExpression>;
  readonly predeclaredNativeBindings: Set<Node>;
  controlLabels: ControlLabelTarget[];
  readonly loopContinuations: CsharpLoopContinuation[];
  currentReturnType?: CsharpTypeNode;
  currentReturnTypeSubject?: Node;
  currentReturnExpressionType?: CsharpTypeNode;
  currentReturnExpressionTypeSubject?: Node;
  currentReturnExpressionTargetType?: TargetTypeRef;
  currentUndefinedReturn?: boolean;
  generator?: CsharpGeneratorPlannerContext;
  resourceScope?: CsharpResourceScopePlannerContext;
}

export interface CsharpGeneratorPlannerContext {
  readonly declaration: Node;
  readonly controllerName: string;
  readonly returnValueName: string;
  readonly exitLabel: string;
  readonly protocol: CsharpGeneratorProtocol;
}

export interface CsharpResourceScopePlannerContext {
  readonly kind: "sync" | "async";
  readonly continuations: Map<CsharpStatement, CsharpStatement[]>;
}

export interface ResourceScopeSyntheticNames {
  readonly errorName: string;
  readonly caughtErrorName: string;
  readonly disposalErrorName: string;
}

export interface GeneratorSyntheticNames {
  readonly controllerName: string;
  readonly iteratorName: string;
  readonly returnValueName: string;
  readonly exitLabel: string;
}

export interface GeneratorDelegationSyntheticNames {
  readonly generatorName: string;
  readonly resultName: string;
}

export interface ControlLabelTarget {
  readonly source: Node;
  readonly breakLabel: string;
  readonly continueLabel?: string;
  readonly loop?: Node;
  readonly loopBody?: Node;
  breakUsed?: boolean;
  continueUsed?: boolean;
  continueOwned?: boolean;
}

export interface CsharpLoopContinuation {
  readonly loop: Node;
  label?: string;
  used: boolean;
}

export interface ForInSyntheticNames {
  readonly indexName: string;
  readonly collectionName: string;
  readonly keysName: string;
}

export interface StringIterationSyntheticNames {
  readonly collectionName: string;
  readonly indexName: string;
}

export type PlannedExpression = CsharpPlannedValue | undefined;
export type PlannedArgument = CsharpPlannedArgument | undefined;

export type ExpressionPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state?: DestructuringPlannerState,
) => PlannedExpression;

export type CallArgumentPlanner = (
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  conversionExpectedTargetType?: TargetTypeRef,
  expectedArgumentPassingMode?: CsharpTargetParameter["passingMode"],
  selectedTargetParameter?: CsharpTargetParameter,
) => PlannedArgument;

export type NestedStatementPlanner = (
  node: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
) => readonly CsharpStatement[];

export interface CsharpPlanningDispatch {
  readonly planExpression: ExpressionPlanner;
  readonly planCallArgument: (node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
    conversionExpectedTargetType?: TargetTypeRef, state?: DestructuringPlannerState,
    expectedArgumentPassingMode?: CsharpTargetParameter["passingMode"], selectedTargetParameter?: CsharpTargetParameter) => PlannedArgument;
  readonly planStatements: (node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
    state?: DestructuringPlannerState) => readonly CsharpStatement[];
  readonly planBlockStatements: (node: Node | undefined, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
    state?: DestructuringPlannerState, entryPrelude?: readonly CsharpStatement[], skipLeadingStatements?: number) => readonly CsharpStatement[];
}

export type CsharpConversionApplier = (node: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], sourceType: TargetTypeRef | undefined, targetType: TargetTypeRef | undefined,
  selection: CsharpConversionSelection, expression: CsharpExpression | undefined, prelude: CsharpStatement[],
  operandStability: "stable" | "snapshot", absenceConstant?: boolean, callable?: CsharpPlannedCallable) => CsharpExpression | undefined;
