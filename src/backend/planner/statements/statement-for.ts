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
import { planCsharpCaptureFrame, planCsharpProtocolFrameRotation } from "../bindings/capture-storage.js";
import { allocateExpressionTemp, csharpCaptureFrameName, getCsharpLocalBindingName } from "../bindings/binding-state.js";
import { sourceBindingIterationScope, sourceExpressionSequence } from "@tsonic/target-api/source";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { planCsharpNativeMemoryCall } from "../expressions/native-memory.js";
import { expressionStatement, planCsharpPlannedDiscard, planDiscardedExpression } from "./statement-output.js";
import { csharpLoopContinuationLabel, planCsharpLoopContinuation } from "./loop-regions.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type { CsharpCaptureFrame } from "../../../target-model/records/callables/capture-storage.js";
import { csharpTypeFromObjectShapeFact } from "../objects/planning.js";

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
  const capturePrelude = planCsharpCaptureFrame(node, input, diagnostics, state);
  const frame = input.program.records.captureFrame.get(node);
  const initializer = statement.Initializer === undefined
    ? undefined
    : planForInitializer(statement.Initializer, sourceFile, input, diagnostics, state);
  const conditionNodes = statement.Condition === undefined ? [] : sourceExpressionSequence(input.program.source.ast, statement.Condition);
  const conditionNode = conditionNodes[conditionNodes.length - 1];
  const condition = conditionNode === undefined
    ? undefined
    : planConditionExpression(conditionNode, "For statement", sourceFile, input, diagnostics, state);
  const conditionPrelude = conditionNodes.slice(0, -1).map(expression => planExpression(expression, sourceFile, input, diagnostics, state));
  if (statement.Condition !== undefined && condition === undefined) {
    failCsharpPlannerInvariant("An admitted for condition requires its native value plan.", node);
  }
  const incrementorNodes = statement.Incrementor === undefined ? [] : sourceExpressionSequence(input.program.source.ast, statement.Incrementor);
  const incrementors = incrementorNodes
    .map(expression => planExpression(expression, sourceFile, input, diagnostics, state));
  if (incrementors.some(expression => expression === undefined) || conditionPrelude.some(expression => expression === undefined)) {
    failCsharpPlannerInvariant("An admitted for continuation requires its native expression plans.", node);
  }
  const nativeBindings = initializer?.preludeScope !== "enclosing" &&
    (frame !== undefined || initializer?.bindings?.some(binding => input.program.records.capturedPlace.get(binding.declaration) !== undefined &&
      sourceBindingIterationScope(binding.declaration, input.program.source.ast) === node))
    ? initializer?.bindings : undefined;
  const iterationPrelude = conditionPrelude.flatMap(expression => planCsharpPlannedDiscard(expression!));
  const expandedIncrement = incrementors.some(expression => expression!.prelude.length !== 0 || expression!.completion.kind !== "value");
  const expandedCondition = iterationPrelude.length !== 0 || (condition?.prelude.length ?? 0) !== 0;
  const label = expandedIncrement || frame !== undefined || nativeBindings !== undefined ? planCsharpLoopContinuation(node, state) : undefined;
  const body = condition?.completion.kind === "never" ? [] : planNestedStatementBody(statement.Statement, sourceFile, input, diagnostics, state);
  const continuationExits = input.program.records.loopContinuationExit.get(node);
  if (continuationExits === undefined) failCsharpPlannerInvariant("An admitted for body requires its sealed continuation completion.", node);
  const incrementStatements = [
    ...incrementors.flatMap(expression => planCsharpPlannedDiscard(expression!)),
  ];
  const conditionTest: readonly CsharpStatement[] = [...iterationPrelude, ...condition?.prelude ?? [],
    ...(condition?.completion.kind === "value" ? [{ kind: "IfStatement" as const,
      condition: { kind: "PrefixUnaryExpression" as const, operatorToken: { kind: "ExclamationToken" as const },
        operand: { kind: "ParenthesizedExpression" as const, expression: condition.completion.expression } },
      thenBody: { kind: "Block" as const, statements: [{ kind: "BreakStatement" as const }] },
    }] : []),
  ];
  const continuation = label === undefined ? [] : csharpLoopContinuationLabel(node, label, state);
  const initializerPrelude: readonly CsharpStatement[] = [...capturePrelude, ...initializer?.prelude ?? []];
  if (frame !== undefined || nativeBindings !== undefined) {
    return planNativeIterationPlaces(nativeBindings ?? [], frame, initializerPrelude, incrementStatements,
      conditionTest, body, continuation, state, input, diagnostics);
  }
  const plannedFor: CsharpStatement = expandedIncrement ? {
    kind: "WhileStatement",
    condition: !expandedCondition && condition?.completion.kind === "value" ? condition.completion.expression : { kind: "LiteralExpression", value: true },
    body: { kind: "Block", statements: [
      ...(expandedCondition ? conditionTest : []),
      { kind: "Block", body: { kind: "Block", statements: body } },
      ...continuation,
      ...(continuation.length === 0 && continuationExits ? [] : incrementStatements),
    ] },
  } : {
    kind: "ForStatement",
    ...(incrementors.length > 0 && continuationExits ? { unreachableIncrementor: true } : {}),
    ...(condition?.completion.kind === "value" && !expandedCondition
      ? { condition: condition.completion.expression }
      : {}),
    incrementors: incrementors.flatMap(expression => {
      if (expression!.completion.kind !== "value") return [];
      const discarded = planDiscardedExpression(expression!.completion.expression, expression!.completion.carrier);
      return discarded === undefined ? [] : [discarded];
    }),
    body: {
      kind: "Block",
      statements: [
        ...(expandedCondition ? conditionTest : []),
        ...body,
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

function planNativeIterationPlaces(
  bindings: readonly NativeIterationBinding[], frame: CsharpCaptureFrame | undefined, initialization: readonly CsharpStatement[],
  increment: readonly CsharpStatement[], condition: readonly CsharpStatement[],
  body: readonly CsharpStatement[], continuation: readonly CsharpStatement[], state: DestructuringPlannerState,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): readonly CsharpStatement[] {
  const nativeSlots = bindings.map(binding => {
    const backing = input.program.records.nativeBacking.get(binding.declaration);
    const carryType = backing === undefined ? binding.type : csharpTypeFromTargetTypeRef(backing.pointeeType, input.scope.typeParameterNames);
    if (carryType === undefined) failCsharpPlannerInvariant("A native iteration place requires its exact carried value type.", binding.declaration);
    return { ...binding, carry: allocateExpressionTemp(state), carryType, backing };
  });
  const frameType = frame === undefined ? undefined : csharpTypeFromObjectShapeFact(input, frame.shape, diagnostics, frame.scope);
  if (frame !== undefined && frameType === undefined) {
    failCsharpPlannerInvariant("A protocol iteration place requires its exact native frame type.", frame.scope);
  }
  const slots = [...nativeSlots, ...(frame === undefined ? [] : [{
    name: csharpCaptureFrameName(frame.scope, state), type: frameType!,
    carry: allocateExpressionTemp(state), carryType: frameType!, backing: undefined,
  }])];
  const rotation = frame === undefined ? undefined : planCsharpProtocolFrameRotation(frame, input, diagnostics, state);
  const first = allocateExpressionTemp(state);
  const identifier = (name: string): CsharpExpression => ({ kind: "IdentifierName", name });
  const assign = (name: string, value: CsharpExpression): CsharpStatement => ({ kind: "ExpressionStatement",
    expression: { kind: "AssignmentExpression", left: identifier(name), operatorToken: { kind: "EqualsToken" }, right: value } });
  const carriedValue = (slot: typeof slots[number]): CsharpExpression => slot.backing === undefined ? identifier(slot.name)
    : { kind: "SimpleMemberAccessExpression", receiver: identifier(slot.name), name: "Value" };
  return [{ kind: "Block", body: { kind: "Block", statements: [
    ...slots.map((slot): CsharpStatement => ({ kind: "LocalDeclarationStatement", name: slot.carry, type: slot.carryType,
      initializer: { kind: "DefaultExpression", type: slot.carryType, nullForgiving: true } })),
    { kind: "Block", body: { kind: "Block", statements: [...initialization,
      ...slots.map(slot => assign(slot.carry, carriedValue(slot)))] } },
    { kind: "LocalDeclarationStatement", name: first, type: { kind: "PredefinedType", name: "bool" },
      initializer: { kind: "LiteralExpression", value: true } },
    { kind: "WhileStatement", condition: { kind: "LiteralExpression", value: true }, body: { kind: "Block", statements: [
      ...slots.map((slot): CsharpStatement => ({ kind: "LocalDeclarationStatement", name: slot.name, type: slot.type,
        initializer: slot.backing === undefined ? identifier(slot.carry)
          : planCsharpNativeMemoryCall(input.scope.typeParameterNames, "Allocate", identifier(slot.carry), slot.backing, input.program.records) })),
      ...(rotation === undefined ? [] : [expressionStatement(rotation)]),
      { kind: "IfStatement", condition: identifier(first),
        thenBody: { kind: "Block", statements: [assign(first, { kind: "LiteralExpression", value: false })] },
        elseBody: { kind: "Block", statements: increment } },
      ...condition,
      { kind: "TryStatement", tryBody: { kind: "Block", statements: [
        { kind: "Block", body: { kind: "Block", statements: body } }, ...continuation,
      ] }, finallyBody: { kind: "Block", statements: slots.map(slot => assign(slot.carry, carriedValue(slot))) } },
    ] } },
  ] } }];
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

