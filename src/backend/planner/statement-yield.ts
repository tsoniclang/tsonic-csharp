import type {
  Node,
  ResolvedSourceYieldInfo,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpStatement,
} from "../roslyn/syntax.js";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import type {
  DestructuringPlannerState,
} from "./bindings.js";
import {
  selectCsharpConversion,
} from "../../policy/conversions/index.js";
import {
  csharpIteratorResultTargetType,
  getCsharpGeneratorProtocol,
  targetTypeRefEquals,
} from "../../policy/types/index.js";
import {
  applyCsharpConversionSelection,
} from "../../translate/expressions/conversions.js";
import {
  allocateGeneratorDelegationNames,
} from "./bindings.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";
import {
  planExpressionWithExpectedType,
} from "./expressions.js";

export interface CsharpYieldValuePlan {
  readonly statements: readonly CsharpStatement[];
  readonly resumeExpression: CsharpExpression;
  readonly resumeType: import("../../policy/types/index.js").TargetTypeRef;
}

export function directSourceYieldExpression(
  node: Node | undefined,
  input: CsharpTranslationContext,
): Node | undefined {
  let current = node;
  while (current !== undefined) {
    if (input.ast.is.IsYieldExpression(current)) {
      return current;
    }
    if (
      input.ast.is.IsParenthesizedExpression(current) ||
      input.ast.is.IsAsExpression(current) ||
      input.ast.is.IsTypeAssertion(current) ||
      input.ast.is.IsSatisfiesExpression(current) ||
      input.ast.is.IsNonNullExpression(current)
    ) {
      const typeNode = input.ast.typeNode(current);
      current = input.ast.children(current).find((child) =>
        child !== undefined &&
        child !== typeNode &&
        !isTypeOnlyYieldWrapperChild(child, input)
      );
      continue;
    }
    return undefined;
  }
  return undefined;
}

export function planCsharpYieldValue(
  yieldExpression: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpYieldValuePlan | undefined {
  const generator = state.generator;
  const source = input.semanticsFor(yieldExpression).getResolvedYieldInfo(
    yieldExpression,
  );
  if (
    generator === undefined ||
    source === undefined ||
    source.generator.declaration !== generator.declaration
  ) {
    diagnostics.push(yieldDiagnostic(
      "CSHARP_YIELD_EVIDENCE_NOT_PROVEN",
      "Yield emission requires exact TSTS evidence owned by the active generator declaration.",
    ));
    return undefined;
  }
  if (source.yieldKind === "delegate") {
    return planCsharpDelegatedYield(
      source,
      sourceFile,
      input,
      diagnostics,
      state,
    );
  }
  const yieldType = csharpTypeFromTargetTypeRef(generator.protocol.yieldType);
  if (yieldType === undefined) {
    diagnostics.push(yieldDiagnostic(
      "CSHARP_YIELD_TYPE_NOT_RENDERABLE",
      "The exact checked yield type has no closed C# source representation.",
    ));
    return undefined;
  }
  const yieldedExpression = source.operand === undefined
    ? {
        kind: "DefaultExpression" as const,
        type: yieldType,
        nullForgiving: true,
      }
    : planExpressionWithExpectedType(
        source.operand.expression,
        sourceFile,
        input,
        diagnostics,
        yieldType,
        source.operand.expression,
        state,
        generator.protocol.yieldType,
      );
  if (yieldedExpression === undefined) {
    return undefined;
  }
  return {
    statements: [{ kind: "YieldReturnStatement", expression: yieldedExpression }],
    resumeExpression: invokeGeneratorController(
      generator.controllerName,
      "ConsumeNext",
      [],
    ),
    resumeType: generator.protocol.nextType,
  };
}

function planCsharpDelegatedYield(
  source: ResolvedSourceYieldInfo,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpYieldValuePlan | undefined {
  const outer = state.generator;
  const operand = source.operand;
  const delegation = source.delegation;
  if (outer === undefined || operand === undefined || delegation === undefined) {
    diagnostics.push(yieldDiagnostic(
      "CSHARP_YIELD_DELEGATION_EVIDENCE_NOT_PROVEN",
      "Delegated yield requires exact TSTS operand and iterator-selection evidence.",
    ));
    return undefined;
  }
  const delegatedType = input.types.resolveSelectedValue(
    operand.expression,
    operand.type,
    sourceFile,
  );
  const inner = getCsharpGeneratorProtocol(delegatedType);
  if (
    delegatedType === undefined ||
    inner === undefined ||
    !targetTypeRefEquals(outer.protocol.yieldType, inner.yieldType) ||
    !targetTypeRefEquals(outer.protocol.nextType, inner.nextType) ||
    (outer.protocol.kind === "sync" && inner.kind !== "sync")
  ) {
    diagnostics.push(yieldDiagnostic(
      "CSHARP_YIELD_DELEGATION_PROTOCOL_NOT_CLOSED",
      "The exact delegated iterator evidence does not reconcile with one closed native generator protocol.",
    ));
    return undefined;
  }
  if (
    delegation.kind !== "synchronous-iterator-protocol" &&
    delegation.kind !== "asynchronous-iterator-protocol" &&
    delegation.kind !== "synchronous-iterator-adapted-to-async"
  ) {
    diagnostics.push(yieldDiagnostic(
      "CSHARP_YIELD_DELEGATION_MECHANISM_UNSUPPORTED",
      "The exact delegated iteration mechanism is not a selected generator protocol.",
    ));
    return undefined;
  }
  const delegatedTypeNode = csharpTypeFromTargetTypeRef(delegatedType);
  const iteratorResultType = csharpTypeFromTargetTypeRef(
    csharpIteratorResultTargetType(inner),
  );
  if (
    delegatedTypeNode === undefined ||
    iteratorResultType === undefined
  ) {
    diagnostics.push(yieldDiagnostic(
      "CSHARP_YIELD_DELEGATION_PROTOCOL_NOT_RENDERABLE",
      "The exact delegated generator protocol has no closed C# source representation.",
    ));
    return undefined;
  }
  const delegatedExpression = planExpressionWithExpectedType(
    operand.expression,
    sourceFile,
    input,
    diagnostics,
    delegatedTypeNode,
    operand.expression,
    state,
    delegatedType,
  );
  if (delegatedExpression === undefined) {
    return undefined;
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
    statements: [
      {
        kind: "LocalDeclarationStatement",
        name: names.generatorName,
        type: delegatedTypeNode,
        initializer: delegatedExpression,
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
    ],
    resumeExpression: member(resultExpression, "ReturnValue"),
    resumeType: inner.returnType,
  };
}

export function convertCsharpYieldResumeExpression(
  yieldExpression: Node,
  plan: CsharpYieldValuePlan,
  targetType: import("../../policy/types/index.js").TargetTypeRef,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  return applyCsharpConversionSelection(
    yieldExpression,
    sourceFile,
    input,
    diagnostics,
    plan.resumeType,
    targetType,
    selectCsharpConversion(input, plan.resumeType, targetType, "implicit"),
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
  input: CsharpTranslationContext,
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
  return plan === undefined
    ? []
    : [
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

function isTypeOnlyYieldWrapperChild(
  child: Node,
  input: CsharpTranslationContext,
): boolean {
  return input.ast.kindName(child).endsWith("Token");
}

function yieldDiagnostic(
  code: string,
  message: string,
): TargetDiagnostic {
  return { code, category: "error", source: "tsonic-csharp", message };
}
