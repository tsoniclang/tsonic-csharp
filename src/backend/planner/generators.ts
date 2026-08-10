import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpBlock,
  CsharpExpression,
  CsharpParameter,
  CsharpStatement,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import type {
  CsharpGeneratorProtocol,
  TargetTypeRef,
} from "../../policy/types/index.js";
import {
  csharpAsyncEnumerableTargetType,
  csharpEnumerableTargetType,
  getCsharpGeneratorProtocol,
} from "../../policy/types/index.js";
import type {
  DestructuringPlannerState,
} from "./bindings.js";
import {
  allocateGeneratorNames,
} from "./bindings.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

export interface CsharpGeneratorFunctionPlan {
  readonly generatorType: TargetTypeRef;
  readonly generatorTypeNode: CsharpTypeNode;
  readonly protocol: CsharpGeneratorProtocol;
  readonly body: CsharpBlock;
}

type BlockPlanner = (
  blockNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
) => readonly CsharpStatement[];

export function hasCsharpGeneratorSyntax(
  declaration: Node,
  input: CsharpTranslationContext,
): boolean {
  const kind = input.ast.kindName(declaration);
  if (
    kind !== "KindFunctionDeclaration" &&
    kind !== "KindFunctionExpression" &&
    kind !== "KindMethodDeclaration"
  ) {
    return false;
  }
  return input.ast.children(declaration).some(
    (child) => child !== undefined && input.ast.kindName(child) === "KindAsteriskToken",
  );
}

export function planCsharpGeneratorFunction(
  declaration: Node,
  bodyNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  prelude: readonly CsharpStatement[],
  planBlock: BlockPlanner,
): CsharpGeneratorFunctionPlan | undefined {
  if (!hasCsharpGeneratorSyntax(declaration, input)) {
    return undefined;
  }
  const source = input.semantics(sourceFile).getResolvedGeneratorInfo(
    declaration,
  );
  if (source === undefined) {
    diagnostics.push(generatorDiagnostic(
      "CSHARP_GENERATOR_EVIDENCE_NOT_PROVEN",
      "TSTS did not retain exact checked generator protocol evidence for this declaration.",
    ));
    return undefined;
  }
  const generatorType = input.types.resolveSelectedType(
    input.ast.typeNode(declaration),
    source.sourceReturnType,
    sourceFile,
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
    protocol,
  });
  state.currentReturnType = returnTypeNode;
  state.currentReturnExpressionType = returnTypeNode;
  state.currentReturnExpressionTargetType = protocol.returnType;
  state.observedReturnTargetTypes = undefined;
  state.returnTargetObservationIncomplete = undefined;
  const iteratorStatements = unsupportedYield === undefined
    ? [
        ...prelude,
        ...planBlock(bodyNode, sourceFile, input, diagnostics, state),
        completeGeneratorStatement(names.controllerName, returnTypeNode),
        { kind: "YieldBreakStatement" as const },
      ]
    : [
        completeGeneratorStatement(names.controllerName, returnTypeNode),
        { kind: "YieldBreakStatement" as const },
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

function firstUnsupportedGeneratorYield(
  declaration: Node,
  body: Node | undefined,
  input: CsharpTranslationContext,
): { readonly node: Node; readonly reason: string } | undefined {
  if (body === undefined) {
    return undefined;
  }
  const stack = [body];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (input.ast.is.IsYieldExpression(node)) {
      const evidence = input.semanticsFor(node).getResolvedYieldInfo(node);
      if (evidence?.generator.declaration === declaration) {
        const reason = unsupportedYieldRegionReason(node, declaration, input);
        if (reason !== undefined) {
          return { node, reason };
        }
      }
    }
    const children = input.ast.children(node);
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
  input: CsharpTranslationContext,
): string | undefined {
  for (
    let current = input.ast.parent(yieldExpression);
    current !== undefined && current !== declaration;
    current = input.ast.parent(current)
  ) {
    if (input.ast.is.IsCatchClause(current)) {
      return "C# native iterators cannot suspend from a catch clause.";
    }
    const parent = input.ast.parent(current);
    if (parent !== undefined && input.ast.is.IsTryStatement(parent)) {
      const statement = input.ast.as.AsTryStatement(parent);
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
  returnType: CsharpTypeNode,
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
        expression: {
          kind: "DefaultExpression",
          type: returnType,
          nullForgiving: true,
        },
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
