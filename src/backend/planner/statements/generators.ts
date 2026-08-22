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
} from "../../target-ast/roslyn/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpGeneratorProtocol,
  TargetTypeRef,
} from "../../../target-model/types/index.js";
import {
  csharpAsyncEnumerableTargetType,
  csharpEnumerableTargetType,
  getCsharpGeneratorProtocol,
} from "../../../target-model/types/index.js";
import type {
  DestructuringPlannerState,
} from "../bindings/index.js";
import {
  allocateGeneratorNames,
} from "../bindings/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";

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
) => readonly CsharpStatement[];

export function hasCsharpGeneratorSyntax(
  declaration: Node,
  input: CsharpPlanningContext,
): boolean {
  const kind = input.program.source.ast.kindName(declaration);
  if (
    kind !== "KindFunctionDeclaration" &&
    kind !== "KindFunctionExpression" &&
    kind !== "KindMethodDeclaration"
  ) {
    return false;
  }
  return input.program.source.ast.children(declaration).some(
    (child) => child !== undefined && input.program.source.ast.kindName(child) === "KindAsteriskToken",
  );
}

export function isCsharpGeneratorReturnInsideFinally(
  returnStatement: Node,
  generatorDeclaration: Node,
  input: CsharpPlanningContext,
): boolean {
  for (
    let current = input.program.source.ast.parent(returnStatement);
    current !== undefined && current !== generatorDeclaration;
    current = input.program.source.ast.parent(current)
  ) {
    const parent = input.program.source.ast.parent(current);
    if (parent === undefined || !input.program.source.ast.is.IsTryStatement(parent)) {
      continue;
    }
    const tryStatement = input.program.source.ast.as.AsTryStatement(parent)!;
    if (tryStatement.FinallyBlock === current) {
      return true;
    }
  }
  return false;
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
): CsharpGeneratorFunctionPlan | undefined {
  if (!hasCsharpGeneratorSyntax(declaration, input)) {
    return undefined;
  }
  const source = input.program.sourceEvidence.generator(declaration);
  if (source === undefined) {
    diagnostics.push(generatorDiagnostic(
      "CSHARP_GENERATOR_EVIDENCE_NOT_PROVEN",
      "TSTS did not retain exact checked generator protocol evidence for this declaration.",
    ));
    return undefined;
  }
  const generatorType = input.program.sourceEvidence.generatorTargetType(
    declaration,
  );
  const protocol = getCsharpGeneratorProtocol(generatorType);
  if (
    generatorType === undefined ||
    protocol === undefined ||
    protocol.kind !== source.generatorKind
  ) {
    diagnostics.push(generatorDiagnostic(
      "CSHARP_GENERATOR_PROTOCOL_NOT_CLOSED",
      "The exact checked generator yield, return, and next types do not reconcile with one closed C# generator runtime carrier.",
    ));
    return undefined;
  }
  const generatorTypeNode = csharpTypeFromTargetTypeRef(generatorType);
  const yieldTypeNode = csharpTypeFromTargetTypeRef(protocol.yieldType);
  const returnTypeNode = csharpTypeFromTargetTypeRef(protocol.returnType);
  const iteratorTargetType = protocol.kind === "sync"
    ? csharpEnumerableTargetType(protocol.yieldType)
    : csharpAsyncEnumerableTargetType(protocol.yieldType);
  const iteratorTypeNode = csharpTypeFromTargetTypeRef(iteratorTargetType);
  if (
    generatorTypeNode === undefined ||
    yieldTypeNode === undefined ||
    returnTypeNode === undefined ||
    iteratorTypeNode === undefined
  ) {
    diagnostics.push(generatorDiagnostic(
      "CSHARP_GENERATOR_PROTOCOL_NOT_RENDERABLE",
      "The exact checked generator protocol contains a type that has no closed C# source representation.",
    ));
    return undefined;
  }
  const unsupportedYield = firstUnsupportedGeneratorYield(
    declaration,
    bodyNode,
    input,
  );
  if (unsupportedYield !== undefined) {
    diagnostics.push({
      code: "CSHARP_UNSUPPORTED_GENERATOR_SUSPENSION_REGION",
      category: "error",
      source: "tsonic-csharp",
      message: unsupportedYield.reason,
    });
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
  const hasExplicitReturn = unsupportedYield === undefined &&
    hasSupportedGeneratorReturn(declaration, bodyNode, input);
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
    ...(unsupportedYield === undefined
      ? [{
          kind: "Block" as const,
          body: {
            kind: "Block" as const,
            statements: [
              ...prelude,
              ...planBlock(bodyNode, sourceFile, input, diagnostics, state),
            ],
          },
        }]
      : []),
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
    ...(protocol.kind === "async" ? { async: true } : {}),
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

function hasSupportedGeneratorReturn(
  declaration: Node,
  body: Node | undefined,
  input: CsharpPlanningContext,
): boolean {
  if (body === undefined) {
    return false;
  }
  let found = false;
  const visit = (node: Node): void => {
    if (found) {
      return;
    }
    if (node !== body && isFunctionLikeBoundary(node, input)) {
      return;
    }
    if (
      input.program.source.ast.is.IsReturnStatement(node) &&
      !isCsharpGeneratorReturnInsideFinally(node, declaration, input)
    ) {
      found = true;
      return;
    }
    input.program.source.ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        visit(child);
      }
    });
  };
  visit(body);
  return found;
}

function isFunctionLikeBoundary(
  node: Node,
  input: CsharpPlanningContext,
): boolean {
  switch (input.program.source.ast.kindName(node)) {
    case "KindArrowFunction":
    case "KindConstructor":
    case "KindFunctionDeclaration":
    case "KindFunctionExpression":
    case "KindGetAccessor":
    case "KindMethodDeclaration":
    case "KindSetAccessor":
      return true;
    default:
      return false;
  }
}

function firstUnsupportedGeneratorYield(
  declaration: Node,
  body: Node | undefined,
  input: CsharpPlanningContext,
): { readonly node: Node; readonly reason: string } | undefined {
  if (body === undefined) {
    return undefined;
  }
  const stack = [body];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (input.program.source.ast.is.IsYieldExpression(node)) {
      const evidence = input.program.sourceEvidence.yield(node);
      if (evidence?.generator.declaration === declaration) {
        const reason = unsupportedYieldRegionReason(node, declaration, input);
        if (reason !== undefined) {
          return { node, reason };
        }
      }
    }
    const children = input.program.source.ast.children(node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }
  return undefined;
}

function unsupportedYieldRegionReason(
  yieldExpression: Node,
  declaration: Node,
  input: CsharpPlanningContext,
): string | undefined {
  for (
    let current = input.program.source.ast.parent(yieldExpression);
    current !== undefined && current !== declaration;
    current = input.program.source.ast.parent(current)
  ) {
    if (input.program.source.ast.is.IsCatchClause(current)) {
      return "C# native iterators cannot suspend from a catch clause.";
    }
    const parent = input.program.source.ast.parent(current);
    if (parent !== undefined && input.program.source.ast.is.IsTryStatement(parent)) {
      const statement = input.program.source.ast.as.AsTryStatement(parent);
      if (statement?.FinallyBlock === current) {
        return "C# native iterators cannot suspend from a finally clause.";
      }
      if (statement?.TryBlock === current && statement.CatchClause !== undefined) {
        return "C# native iterators cannot suspend from a try block that has a catch clause.";
      }
    }
  }
  return undefined;
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

function generatorDiagnostic(
  code: string,
  message: string,
): TargetDiagnostic {
  return { code, category: "error", source: "tsonic-csharp", message };
}
