import {
  type Node,
} from "@tsonic/tsts";
import { sourceNodesEqual } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../policy/types/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpExpression, CsharpTypeNode } from "../../roslyn/syntax.js";
import {
  csharpExceptionTargetType,
  csharpTsThrownValueExceptionTargetType,
  isCsharpAnyRuntimeCarrier,
  isCsharpClosedCompatRuntimeCarrier,
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

export function isCsharpCompatThrowableValueCarrier(carrier: TargetTypeRef | undefined): boolean {
  if (carrier === undefined) {
    return false;
  }
  if (isCsharpAnyRuntimeCarrier(carrier) || isCsharpClosedCompatRuntimeCarrier(carrier)) {
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
  const reference = input.navigation.referenceFor(expression);
  const declaration = reference?.declaration;
  if (
    reference === undefined ||
    declaration === undefined ||
    !input.ast.is.IsVariableDeclaration(declaration)
  ) {
    return false;
  }
  const catchClauseNode = input.ast.parent(declaration);
  if (
    catchClauseNode === undefined ||
    !input.ast.is.IsCatchClause(catchClauseNode)
  ) {
    return false;
  }
  const catchClause = input.ast.as.AsCatchClause(catchClauseNode);
  if (
    !sourceNodesEqual(
      input.ast,
      catchClause?.VariableDeclaration,
      declaration,
    ) ||
    catchClause?.Block === undefined ||
    !isLexicallyWithinExactCatch(throwStatement, catchClauseNode, input)
  ) {
    return false;
  }
  if (
    input.navigation.bindingWritesWithin(reference.symbol, catchClause.Block)
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
    let current = input.ast.parent(node);
    current !== undefined;
    current = input.ast.parent(current)
  ) {
    if (sourceNodesEqual(input.ast, current, catchClause)) {
      return true;
    }
    if (
      input.ast.is.IsCatchClause(current) ||
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
  return input.ast.is.IsArrowFunction(node) ||
    input.ast.is.IsFunctionExpression(node) ||
    input.ast.is.IsFunctionDeclaration(node) ||
    input.ast.is.IsMethodDeclaration(node) ||
    input.ast.is.IsGetAccessorDeclaration(node) ||
    input.ast.is.IsSetAccessorDeclaration(node) ||
    input.ast.is.IsConstructorDeclaration(node) ||
    input.ast.is.IsClassStaticBlockDeclaration(node);
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
    const passing = selectCsharpSourceArgument(input.sourceFacts, node);
    if (
      passing.kind === "resolved" &&
      passing.argument.passingMode !== "by-value" &&
      passing.argument.passingMode !== "byref-readonly" &&
      passing.argument.passingMode !== "borrow-shared"
    ) {
      const storageDeclaration = input.navigation.referenceFor(
        passing.argument.storageExpression,
      )?.declaration;
      if (sourceNodesEqual(input.ast, storageDeclaration, declaration)) {
        found = true;
        return;
      }
    }
    input.ast.forEachChild(node, visit);
  };
  visit(root);
  return found;
}
