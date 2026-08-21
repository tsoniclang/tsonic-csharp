import {
  type Node,
} from "@tsonic/tsts";
import { sourceNodesEqual } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../policy/types/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpExpression, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import {
  csharpExceptionTargetType,
  csharpTsThrownValueExceptionTargetType,
  isCsharpClosedJsRuntimeCarrier,
} from "../../../policy/types/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { selectCsharpSourceArgument } from "../../../policy/members/index.js";

const tsValueSupportedSourcePrimitives = new Set([
  "bool",
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "float32",
  "float64",
  "decimal",
]);

const tsValueSupportedTargetNamedTypes = new Set([
  "System.String",
  "System.Boolean",
  "System.Byte",
  "System.SByte",
  "System.Int16",
  "System.UInt16",
  "System.Int32",
  "System.UInt32",
  "System.Int64",
  "System.UInt64",
  "System.Single",
  "System.Double",
  "System.Decimal",
  "Tsonic.CSharp.Js.Error",
  "Tsonic.CSharp.Js.TypeError",
  "Tsonic.CSharp.Js.RangeError",
  "Tsonic.CSharp.Js.TsValue",
  "Tsonic.CSharp.Js.TsObject",
  "Tsonic.CSharp.Js.TsArray",
  "Tsonic.CSharp.Js.TsFunction",
]);

export function isCsharpJsThrowableValueCarrier(carrier: TargetTypeRef | undefined): boolean {
  if (carrier === undefined) {
    return false;
  }
  if (isCsharpClosedJsRuntimeCarrier(carrier)) {
    return true;
  }
  if (carrier.kind === "source-primitive") {
    return tsValueSupportedSourcePrimitives.has(carrier.name);
  }
  return carrier.kind === "target-named" && tsValueSupportedTargetNamedTypes.has(carrier.id);
}

export function csharpCatchExceptionType(): CsharpTypeNode | undefined {
  return csharpTypeFromTargetTypeRef(csharpExceptionTargetType());
}

export function csharpThrownValueFromExpression(expression: CsharpExpression): CsharpExpression | undefined {
  const type = csharpTypeFromTargetTypeRef(csharpTsThrownValueExceptionTargetType());
  return type === undefined
    ? undefined
    : {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: type,
          name: "from",
        },
        arguments: [{ kind: "Argument", expression }],
      };
}

export function csharpThrownValueToValueExpression(expression: CsharpExpression): CsharpExpression | undefined {
  const type = csharpTypeFromTargetTypeRef(csharpTsThrownValueExceptionTargetType());
  return type === undefined
    ? undefined
    : {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: type,
          name: "toValue",
        },
        arguments: [{ kind: "Argument", expression }],
      };
}

export function isExactUnmodifiedCatchRethrow(
  throwStatement: Node,
  expression: Node,
  input: CsharpPlanningContext,
): boolean {
  const reference = input.program.source.navigation.referenceFor(expression);
  const declaration = reference?.declaration;
  if (
    reference === undefined ||
    declaration === undefined ||
    !input.program.source.ast.is.IsVariableDeclaration(declaration)
  ) {
    return false;
  }
  const catchClauseNode = input.program.source.ast.parent(declaration);
  if (
    catchClauseNode === undefined ||
    !input.program.source.ast.is.IsCatchClause(catchClauseNode)
  ) {
    return false;
  }
  const catchClause = input.program.source.ast.as.AsCatchClause(catchClauseNode);
  if (
    !sourceNodesEqual(
      input.program.source.ast,
      catchClause?.VariableDeclaration,
      declaration,
    ) ||
    catchClause?.Block === undefined ||
    !isLexicallyWithinExactCatch(throwStatement, catchClauseNode, input)
  ) {
    return false;
  }
  if (
    input.program.source.navigation.bindingWritesWithin(reference.symbol, catchClause.Block)
      .length > 0
  ) {
    return false;
  }
  return !sourceFactsWriteBindingWithin(
    declaration,
    catchClause.Block,
    input,
  );
}

function isLexicallyWithinExactCatch(
  node: Node,
  catchClause: Node,
  input: CsharpPlanningContext,
): boolean {
  for (
    let current = input.program.source.ast.parent(node);
    current !== undefined;
    current = input.program.source.ast.parent(current)
  ) {
    if (sourceNodesEqual(input.program.source.ast, current, catchClause)) {
      return true;
    }
    if (
      input.program.source.ast.is.IsCatchClause(current) ||
      isFunctionBoundary(current, input)
    ) {
      return false;
    }
  }
  return false;
}

function isFunctionBoundary(
  node: Node,
  input: CsharpPlanningContext,
): boolean {
  return input.program.source.ast.is.IsArrowFunction(node) ||
    input.program.source.ast.is.IsFunctionExpression(node) ||
    input.program.source.ast.is.IsFunctionDeclaration(node) ||
    input.program.source.ast.is.IsMethodDeclaration(node) ||
    input.program.source.ast.is.IsGetAccessorDeclaration(node) ||
    input.program.source.ast.is.IsSetAccessorDeclaration(node) ||
    input.program.source.ast.is.IsConstructorDeclaration(node) ||
    input.program.source.ast.is.IsClassStaticBlockDeclaration(node);
}

function sourceFactsWriteBindingWithin(
  declaration: Node,
  root: Node,
  input: CsharpPlanningContext,
): boolean {
  let found = false;
  const visit = (node: Node | undefined): void => {
    if (node === undefined || found) {
      return;
    }
    const passing = selectCsharpSourceArgument(input.program.source.sourceFacts, node);
    if (
      passing.kind === "resolved" &&
      passing.argument.passingMode !== "by-value" &&
      passing.argument.passingMode !== "byref-readonly" &&
      passing.argument.passingMode !== "borrow-shared"
    ) {
      const storageDeclaration = input.program.source.navigation.referenceFor(
        passing.argument.storageExpression,
      )?.declaration;
      if (sourceNodesEqual(input.program.source.ast, storageDeclaration, declaration)) {
        found = true;
        return;
      }
    }
    input.program.source.ast.forEachChild(node, visit);
  };
  visit(root);
  return found;
}
