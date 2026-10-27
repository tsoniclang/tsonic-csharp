import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpStatement,
} from "../../target-ast/syntax/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type { CsharpYieldFact } from "../../../target-model/records/callables/generators.js";
import {
  applyCsharpConversionSelection,
  readCsharpConversionClassification,
} from "../expressions/conversions.js";
import {
  allocateGeneratorDelegationNames,
} from "../bindings/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { planExpression } from "../expressions/index.js";
import { csharpPlannedValue } from "../expressions/planned-values.js";
import { consumeCsharpPlannedValue } from "./statement-output.js";
export interface CsharpYieldValuePlan {
  readonly statements: readonly CsharpStatement[];
  readonly resumeExpression: CsharpExpression;
  readonly resumeType: import("../../../target-model/types/index.js").TargetTypeRef;
}

export function planCsharpYieldValue(
  yieldExpression: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpYieldValuePlan {
  const generator = state.generator;
  const source = input.program.records.yield.get(yieldExpression);
  if (
    generator === undefined ||
    source === undefined ||
    source.generatorDeclaration !== generator.declaration
  ) {
    failCsharpPlannerInvariant("An admitted yield requires its sealed native generator completion.", yieldExpression);
  }
  if (source.kind === "delegate") {
    return planCsharpDelegatedYield(
      source,
      sourceFile,
      input,
      diagnostics,
      state,
    );
  }
  const yieldType = csharpTypeFromTargetTypeRef(generator.protocol.yieldType, input.scope.typeParameterNames);
  if (yieldType === undefined) {
    failCsharpPlannerInvariant("An admitted yield requires its native yielded-value type syntax.", yieldExpression);
  }
  const yieldedExpression = source.operand === undefined
    ? csharpPlannedValue(generator.protocol.yieldType, {
        kind: "DefaultExpression" as const,
        type: yieldType,
        nullForgiving: true,
      })
    : planExpression(source.operand, sourceFile, input, diagnostics, state
      );
  if (yieldedExpression === undefined) {
    failCsharpPlannerInvariant("An admitted yield requires its native operand plan.", yieldExpression);
  }
  return {
    statements: consumeCsharpPlannedValue(yieldedExpression, value => [{ kind: "YieldReturnStatement", expression: value }]),
    resumeExpression: invokeGeneratorController(
      generator.controllerName,
      "ConsumeNext",
      [],
    ),
    resumeType: generator.protocol.nextType,
  };
}

function planCsharpDelegatedYield(
  source: Extract<CsharpYieldFact, { readonly kind: "delegate" }>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpYieldValuePlan {
  const outer = state.generator;
  const operand = source.operand;
  if (outer === undefined) failCsharpPlannerInvariant("An admitted delegated yield requires its active native generator frame.", operand);
  const delegatedType = source.delegatedCarrier;
  const inner = source.protocol;
  const delegatedTypeNode = csharpTypeFromTargetTypeRef(delegatedType, input.scope.typeParameterNames);
  const iteratorResultType = csharpTypeFromTargetTypeRef(
    source.resultCarrier, input.scope.typeParameterNames,
  );
  if (
    delegatedTypeNode === undefined ||
    iteratorResultType === undefined
  ) {
    failCsharpPlannerInvariant("An admitted delegated yield requires its native protocol type syntax.", operand);
  }
  const delegatedExpression = planExpression(operand, sourceFile, input, diagnostics, state
  );
  if (delegatedExpression === undefined) {
    failCsharpPlannerInvariant("An admitted delegated yield requires its native operand plan.", operand);
  }
  const names = allocateGeneratorDelegationNames(state);
  const generatorExpression = identifier(names.generatorName);
  const resultExpression = identifier(names.resultName);
  const firstResult = invokeDelegatedGenerator(inner.kind, generatorExpression, []);
  const nextValue = invokeGeneratorController(
    outer.controllerName,
    "ConsumeNext",
    [],
  );
  const nextResult = invokeDelegatedGenerator(
    inner.kind,
    generatorExpression,
    [nextValue],
  );
  const disposal = invokeDelegatedGeneratorDisposal(
    inner.kind,
    generatorExpression,
  );
  return {
    statements: consumeCsharpPlannedValue(delegatedExpression, value => [
      {
        kind: "LocalDeclarationStatement",
        name: names.generatorName,
        type: delegatedTypeNode,
        initializer: value,
      },
      {
        kind: "LocalDeclarationStatement",
        name: names.resultName,
        type: iteratorResultType,
        initializer: firstResult,
      },
      {
        kind: "TryStatement",
        tryBody: {
          kind: "Block",
          statements: [{
            kind: "WhileStatement",
            condition: {
              kind: "PrefixUnaryExpression",
              operatorToken: { kind: "ExclamationToken" },
              operand: member(resultExpression, "Done"),
            },
            body: {
              kind: "Block",
              statements: [
                {
                  kind: "YieldReturnStatement",
                  expression: member(resultExpression, "YieldValue"),
                },
                {
                  kind: "ExpressionStatement",
                  expression: {
                    kind: "AssignmentExpression",
                    left: resultExpression,
                    operatorToken: { kind: "EqualsToken" },
                    right: nextResult,
                  },
                },
              ],
            },
          }],
        },
        finallyBody: {
          kind: "Block",
          statements: [{
            kind: "ExpressionStatement",
            expression: disposal,
          }],
        },
      },
    ]),
    resumeExpression: member(resultExpression, "ReturnValue"),
    resumeType: inner.returnType,
  };
}

export function convertCsharpYieldResumeExpression(
  yieldExpression: Node,
  plan: CsharpYieldValuePlan,
  targetType: import("../../../target-model/types/index.js").TargetTypeRef,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const selection = readCsharpConversionClassification(
    yieldExpression,
    input,
    diagnostics,
    plan.resumeType,
    targetType,
    "implicit",
  );
  if (selection === undefined) {
    failCsharpPlannerInvariant("An admitted yield resume requires its sealed native conversion.", yieldExpression);
  }
  return applyCsharpConversionSelection(
    yieldExpression,
    sourceFile,
    input,
    diagnostics,
    plan.resumeType,
    targetType,
    selection,
    plan.resumeExpression,
  );
}

function invokeDelegatedGenerator(
  kind: "sync" | "async",
  generator: CsharpExpression,
  arguments_: readonly CsharpExpression[],
): CsharpExpression {
  const invocation: CsharpExpression = {
    kind: "InvocationExpression",
    callee: member(generator, kind === "sync" ? "Next" : "NextAsync"),
    arguments: arguments_.map((expression) => ({
      kind: "Argument" as const,
      expression,
    })),
  };
  return kind === "sync"
    ? invocation
    : { kind: "AwaitExpression", expression: invocation };
}

function invokeDelegatedGeneratorDisposal(
  kind: "sync" | "async",
  generator: CsharpExpression,
): CsharpExpression {
  const invocation: CsharpExpression = {
    kind: "InvocationExpression",
    callee: member(generator, kind === "sync" ? "Dispose" : "DisposeAsync"),
    arguments: [],
  };
  return kind === "sync"
    ? invocation
    : { kind: "AwaitExpression", expression: invocation };
}

function identifier(name: string): CsharpExpression {
  return { kind: "IdentifierName", name };
}

function member(
  receiver: CsharpExpression,
  name: string,
): CsharpExpression {
  return { kind: "SimpleMemberAccessExpression", receiver, name };
}

export function planDiscardedCsharpYield(
  yieldExpression: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const plan = planCsharpYieldValue(
    yieldExpression,
    sourceFile,
    input,
    diagnostics,
    state,
  );
  return [
        ...plan.statements,
        { kind: "ExpressionStatement", expression: plan.resumeExpression },
      ];
}

export function invokeGeneratorController(
  controllerName: string,
  memberName: string,
  arguments_: readonly CsharpExpression[],
): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: { kind: "IdentifierName", name: controllerName },
      name: memberName,
    },
    arguments: arguments_.map((expression) => ({
      kind: "Argument" as const,
      expression,
    })),
  };
}

