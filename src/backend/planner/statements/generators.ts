import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpBlock,
  CsharpExpression,
  CsharpParameter,
  CsharpStatement,
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpGeneratorProtocol,
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import {
  allocateGeneratorNames,
} from "../bindings/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";

export interface CsharpGeneratorFunctionPlan {
  readonly generatorType: TargetTypeRef;
  readonly generatorTypeNode: CsharpTypeNode;
  readonly protocol: CsharpGeneratorProtocol;
  readonly body: CsharpBlock;
}

type BlockPlanner = (
  blockNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  entryPrelude?: readonly CsharpStatement[],
) => readonly CsharpStatement[];

export function hasCsharpGeneratorPlan(
  declaration: Node,
  input: CsharpPlanningContext,
): boolean {
  return input.program.records.generator.get(declaration) !== undefined;
}

export function planCsharpGeneratorFunction(
  declaration: Node,
  bodyNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  prelude: readonly CsharpStatement[],
  planBlock: BlockPlanner,
): CsharpGeneratorFunctionPlan {
  const source = input.program.records.generator.get(declaration);
  if (source === undefined) {
    failCsharpPlannerInvariant("An admitted generator requires its sealed native protocol.", declaration);
  }
  const generatorType = source.resultCarrier;
  const protocol = source;
  const generatorTypeNode = csharpTypeFromTargetTypeRef(generatorType, input.scope.typeParameterNames);
  const yieldTypeNode = csharpTypeFromTargetTypeRef(protocol.yieldType, input.scope.typeParameterNames);
  const returnTypeNode = csharpTypeFromTargetTypeRef(protocol.returnType, input.scope.typeParameterNames);
  const iteratorTargetType = source.iteratorCarrier;
  const iteratorTypeNode = csharpTypeFromTargetTypeRef(iteratorTargetType, input.scope.typeParameterNames);
  if (
    generatorTypeNode === undefined ||
    yieldTypeNode === undefined ||
    returnTypeNode === undefined ||
    iteratorTypeNode === undefined
  ) {
    failCsharpPlannerInvariant("An admitted generator requires its native protocol type syntax.", declaration);
  }
  const names = allocateGeneratorNames(state);
  state.generator = Object.freeze({
    declaration,
    controllerName: names.controllerName,
    returnValueName: names.returnValueName,
    exitLabel: names.exitLabel,
    protocol,
  });
  state.currentReturnType = returnTypeNode;
  state.currentReturnExpressionType = returnTypeNode;
  state.currentReturnExpressionTargetType = protocol.returnType;
  const hasExplicitReturn = source.hasExplicitReturn;
  const iteratorStatements: readonly CsharpStatement[] = [
    {
      kind: "LocalDeclarationStatement",
      name: names.returnValueName,
      type: returnTypeNode,
      initializer: {
        kind: "DefaultExpression",
        type: returnTypeNode,
        nullForgiving: true,
      },
    },
    ...[{
          kind: "Block" as const,
          body: {
            kind: "Block" as const,
            statements: [
              ...planBlock(bodyNode, sourceFile, input, diagnostics, state, prelude),
            ],
          },
        }],
    hasExplicitReturn
      ? {
          kind: "LabeledStatement",
          name: names.exitLabel,
          statement: completeGeneratorStatement(
            names.controllerName,
            names.returnValueName,
          ),
        }
      : completeGeneratorStatement(
          names.controllerName,
          names.returnValueName,
        ),
    { kind: "YieldBreakStatement" },
  ];
  const localFunction: CsharpStatement = {
    kind: "LocalFunctionStatement",
    name: names.iteratorName,
    modifiers: protocol.kind === "async" ? ["async"] : [],
    returnType: iteratorTypeNode,
    parameters: [generatorControllerParameter(names.controllerName, generatorTypeNode)],
    body: { kind: "Block", statements: iteratorStatements },
  };
  const factoryCall: CsharpExpression = {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver: generatorTypeNode,
      name: "Create",
    },
    arguments: [{
      kind: "Argument",
      expression: { kind: "IdentifierName", name: names.iteratorName },
    }],
  };
  return {
    generatorType,
    generatorTypeNode,
    protocol,
    body: {
      kind: "Block",
      statements: [
        localFunction,
        { kind: "ReturnStatement", expression: factoryCall },
      ],
    },
  };
}

function generatorControllerParameter(
  name: string,
  type: CsharpTypeNode,
): CsharpParameter {
  return { name, type };
}

function completeGeneratorStatement(
  controllerName: string,
  returnValueName: string,
): CsharpStatement {
  return {
    kind: "ExpressionStatement",
    expression: {
      kind: "InvocationExpression",
      callee: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: controllerName },
        name: "Complete",
      },
      arguments: [{
        kind: "Argument",
        expression: { kind: "IdentifierName", name: returnValueName },
      }],
    },
  };
}

