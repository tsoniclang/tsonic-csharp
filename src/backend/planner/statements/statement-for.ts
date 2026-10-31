import type { CsharpPlanningContext } from "../context.js";
import {
  AsForStatement,
  HasSourceKind,
  KindVariableDeclarationList,
} from "@tsonic/target-api/source";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import {
  planExpression,
} from "../expressions/index.js";
import {
  planConditionExpression,
} from "./statement-conditionals.js";
import { planLocalDeclarationStatements } from "../bindings/locals.js";
import type {
  NestedStatementPlanner,
} from "./model.js";
import { planResourceScopeStatements } from "./resource-management.js";
import { planCsharpCaptureFrame } from "../bindings/capture-storage.js";
import { allocateExpressionTemp, csharpCaptureFrameName, declareCsharpLocalBindingName, getCsharpLocalBindingName } from "../bindings/binding-state.js";
import { sourceBindingIterationScope, sourceExpressionSequence } from "@tsonic/target-api/source";
import { planCsharpPlannedDiscard, planDiscardedExpression } from "./statement-output.js";
import { csharpLoopContinuationLabel, planCsharpLoopContinuation } from "./loop-regions.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type { CsharpCaptureFrame } from "../../../target-model/records/callables/capture-storage.js";
import type { CsharpPlannedAddressOperand } from "../expressions/planned-values.js";

export function planForStatement(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const statement = AsForStatement(input.program.source.ast, node)!;
  const scope = input.program.records.resourceScope.get(node);
  const resource = scope === undefined ? undefined : { declaration: scope.declarations[0]!, kind: scope.kind };
  return resource === undefined
    ? planForStatementCore(
        node,
        statement,
        sourceFile,
        input,
        diagnostics,
        state,
        planNestedStatementBody,
      )
    : planResourceScopeStatements(
        resource.declaration,
        resource.kind,
        state,
        () => planForStatementCore(
          node,
          statement,
          sourceFile,
          input,
          diagnostics,
          state,
          planNestedStatementBody,
        ),
      );
}

function planForStatementCore(
  node: Node,
  statement: NonNullable<ReturnType<typeof AsForStatement>>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planNestedStatementBody: NestedStatementPlanner,
): readonly CsharpStatement[] {
  const bodyNode = statement.Statement;
  if (bodyNode === undefined) failCsharpPlannerInvariant("An admitted for loop requires its original body statement.", node);
  const frame = input.program.records.captureFrame.get(node);
  const headerInput = planForHeaderContext(node, frame, input, state);
  const initializer = statement.Initializer === undefined
    ? undefined
    : planForInitializer(statement.Initializer, sourceFile, headerInput, diagnostics, state);
  const conditionNodes = statement.Condition === undefined ? [] : sourceExpressionSequence(input.program.source.ast, statement.Condition);
  const conditionNode = conditionNodes[conditionNodes.length - 1];
  const condition = conditionNode === undefined
    ? undefined
    : planConditionExpression(conditionNode, "For statement", sourceFile, headerInput, diagnostics, state);
  const conditionPrelude = conditionNodes.slice(0, -1).map(expression => planExpression(expression, sourceFile, headerInput, diagnostics, state));
  if (statement.Condition !== undefined && condition === undefined) {
    failCsharpPlannerInvariant("An admitted for condition requires its native value plan.", node);
  }
  const incrementorNodes = statement.Incrementor === undefined ? [] : sourceExpressionSequence(input.program.source.ast, statement.Incrementor);
  const incrementors = incrementorNodes
    .map(expression => planExpression(expression, sourceFile, headerInput, diagnostics, state));
  if (incrementors.some(expression => expression === undefined) || conditionPrelude.some(expression => expression === undefined)) {
    failCsharpPlannerInvariant("An admitted for continuation requires its native expression plans.", node);
  }
  const nativeBindings = initializer?.preludeScope === "enclosing" ? [] : (initializer?.bindings ?? []).filter(binding =>
    (input.program.records.capturedPlace.get(binding.declaration) !== undefined ||
      input.program.records.capturedBinding.get(binding.declaration)?.frame.scope === node) &&
    sourceBindingIterationScope(binding.declaration, input.program.source.ast) === node);
  const iteration = planForIteration(node, nativeBindings, frame, input, diagnostics, state);
  const iterationPrelude = conditionPrelude.flatMap(expression => planCsharpPlannedDiscard(expression!));
  const expandedIncrement = incrementors.some(expression => expression!.prelude.length !== 0 || expression!.completion.kind !== "value");
  const expandedCondition = iterationPrelude.length !== 0 || (condition?.prelude.length ?? 0) !== 0;
  const label = expandedIncrement ? planCsharpLoopContinuation(node, state) : undefined;
  const body = condition?.completion.kind === "never" ? [] : planNestedStatementBody(bodyNode, sourceFile, iteration.input, diagnostics, state);
  const continuationExits = input.program.records.loopContinuationExit.get(node);
  if (continuationExits === undefined) failCsharpPlannerInvariant("An admitted for body requires its sealed continuation completion.", node);
  const incrementStatements = incrementors.flatMap(expression => planCsharpPlannedDiscard(expression!));
  const conditionTest: readonly CsharpStatement[] = [...iterationPrelude, ...condition?.prelude ?? [],
    ...(condition?.completion.kind === "value" ? [{ kind: "IfStatement" as const,
      condition: { kind: "PrefixUnaryExpression" as const, operatorToken: { kind: "ExclamationToken" as const },
        operand: { kind: "ParenthesizedExpression" as const, expression: condition.completion.expression } },
      thenBody: { kind: "Block" as const, statements: [{ kind: "BreakStatement" as const }] },
    }] : []),
  ];
  const continuation = label === undefined ? [] : csharpLoopContinuationLabel(node, label, state);
  const initializerPrelude: readonly CsharpStatement[] = initializer?.prelude ?? [];
  const footer = expandedIncrement && (continuation.length !== 0 || !continuationExits) ? incrementStatements : [];
  const plannedFor: CsharpStatement = {
    kind: "ForStatement",
    ...(!expandedIncrement && incrementors.length > 0 && continuationExits ? { unreachableIncrementor: true } : {}),
    ...(condition?.completion.kind === "value" && !expandedCondition
      ? { condition: condition.completion.expression }
      : {}),
    incrementors: expandedIncrement ? [] : incrementors.flatMap(expression => {
      if (expression!.completion.kind !== "value") return [];
      const discarded = planDiscardedExpression(expression!.completion.expression, expression!.completion.carrier);
      return discarded === undefined ? [] : [discarded];
    }),
    body: {
      kind: "Block",
      statements: [
        ...(expandedCondition ? conditionTest : []),
        ...iteration.prelude,
        ...(footer.length !== 0 || continuation.length !== 0
          ? [{ kind: "Block" as const, body: { kind: "Block" as const, statements: body } }] : body),
        ...continuation,
        ...footer,
      ],
    },
  };
  const loopStatements = condition?.completion.kind === "never" ? conditionTest : [plannedFor];
  return initializerPrelude.length === 0
    ? loopStatements
    : initializer?.preludeScope === "enclosing"
      ? [...initializerPrelude, ...loopStatements]
      : [{
        kind: "Block",
        body: { kind: "Block", statements: [...initializerPrelude, ...loopStatements] },
      }];
}

interface PlannedForInitializer {
  readonly prelude: readonly CsharpStatement[];
  readonly preludeScope?: "loop" | "enclosing";
  readonly bindings?: readonly NativeIterationBinding[];
}

interface NativeIterationBinding {
  readonly declaration: Node;
  readonly name: string;
  readonly type: CsharpTypeNode;
}

function planForHeaderContext(
  loop: Node, frame: CsharpCaptureFrame | undefined, input: CsharpPlanningContext, state: DestructuringPlannerState,
): CsharpPlanningContext {
  if (frame === undefined) return input;
  const bindings = new Map(input.scope.capturedBindings);
  for (const binding of frame.bindings) {
    if (sourceBindingIterationScope(binding.declaration, input.program.source.ast) !== loop) continue;
    const sourceName = input.program.source.ast.name(binding.declaration);
    if (sourceName === undefined) failCsharpPlannerInvariant("A native for binding requires its original declaration name.", binding.declaration);
    const name = declareCsharpLocalBindingName(sourceName, input, state);
    bindings.set(binding.declaration, { expression: { kind: "IdentifierName", name }, address: { kind: "root" } });
  }
  return { ...input, scope: { ...input.scope, capturedBindings: bindings } };
}

function planForIteration(
  loop: Node, bindings: readonly NativeIterationBinding[], frame: CsharpCaptureFrame | undefined,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState,
): { readonly input: CsharpPlanningContext; readonly prelude: readonly CsharpStatement[] } {
  const nativeBindings = new Map(input.scope.capturedBindings);
  const frames = new Map(input.scope.captureFrames);
  const incoming = new Map<Node, CsharpExpression>();
  const prelude: CsharpStatement[] = [];
  const identifier = (name: string): CsharpExpression => ({ kind: "IdentifierName", name });
  for (const binding of bindings) {
    const captured = input.program.records.capturedBinding.get(binding.declaration);
    let value: CsharpPlannedAddressOperand;
    if (captured !== undefined && captured.frame.scope === loop) {
      const receiver = identifier(csharpCaptureFrameName(loop, state));
      value = { expression: { kind: "SimpleMemberAccessExpression", receiver, name: captured.fieldName },
        address: { kind: "member", receiver: { expression: receiver }, name: captured.fieldName, static: false } };
      incoming.set(binding.declaration, identifier(binding.name));
    } else {
      const name = allocateExpressionTemp(state);
      prelude.push({ kind: "LocalDeclarationStatement", name, type: binding.type, initializer: identifier(binding.name) });
      value = { expression: identifier(name), address: { kind: "root" } };
    }
    nativeBindings.set(binding.declaration, value);
  }
  if (frame !== undefined) {
    prelude.unshift(...planCsharpCaptureFrame(loop, input, diagnostics, state, incoming));
    frames.set(loop, identifier(csharpCaptureFrameName(loop, state)));
  }
  return { input: { ...input, scope: { ...input.scope, capturedBindings: nativeBindings, captureFrames: frames } }, prelude };
}

function planForInitializer(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): PlannedForInitializer {
  if (HasSourceKind(input.program.source.ast, node, KindVariableDeclarationList)) {
    const concreteDeclarations = input.program.source.ast.children(node)
      .filter((declaration): declaration is Node => declaration !== undefined && input.program.source.ast.is.IsVariableDeclaration(declaration));
    const declarationKind = input.program.source.ast.variableDeclarationKind(node);
    const bindings: NativeIterationBinding[] = [];
    const prelude = concreteDeclarations.flatMap(declaration => {
      const planned = planLocalDeclarationStatements(declaration, sourceFile, input, diagnostics, state,
        (binding, original) => bindings.push({ declaration: original, name: binding.name, type: binding.type }));
      const sourceName = input.program.source.ast.name(declaration);
      const name = sourceName === undefined || !input.program.source.ast.is.IsIdentifier(sourceName)
        ? undefined : getCsharpLocalBindingName(sourceName, input, state);
      if (name !== undefined) {
        const local = planned.find(statement => statement.kind === "LocalDeclarationStatement" && statement.name === name);
        if (local?.kind === "LocalDeclarationStatement") bindings.push({ declaration, name, type: local.type });
      }
      return planned;
    });
    return {
      prelude, bindings,
      ...(declarationKind === "var" ? { preludeScope: "enclosing" as const } : {}),
    };
  }
  const expression = planExpression(node, sourceFile, input, diagnostics, state);
  if (expression === undefined) failCsharpPlannerInvariant("An admitted for initializer requires its native value plan.", node);
  return {
    prelude: planCsharpPlannedDiscard(expression),
  };
}

