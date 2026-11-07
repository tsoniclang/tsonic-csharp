import { sourceNodesEqual } from "@tsonic/target-api/source";
import type { Node } from "@tsonic/tsts";
import { selectCsharpSourceArgument } from "../../source/extension/arguments.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";

export function classifyExactUnmodifiedCatchRethrow(
  policy: CsharpPolicyContext,
  throwStatement: Node,
  expression: Node,
): boolean {
  const reference = policy.facts.navigation.identity.target(expression);
  const declaration = reference?.project === true ? reference.declaration : undefined;
  if (
    declaration === undefined ||
    !policy.ast.is.IsVariableDeclaration(declaration)
  ) {
    return false;
  }
  const catchClauseNode = policy.ast.parent(declaration);
  if (
    catchClauseNode === undefined ||
    !policy.ast.is.IsCatchClause(catchClauseNode)
  ) {
    return false;
  }
  const catchClause = policy.ast.as.AsCatchClause(catchClauseNode);
  if (
    !sourceNodesEqual(policy.ast, catchClause?.VariableDeclaration, declaration) ||
    catchClause?.Block === undefined ||
    !isLexicallyWithinExactCatch(policy, throwStatement, catchClauseNode) ||
    policy.facts.navigation.uses.writesWithin(declaration, catchClause.Block)
      .length > 0
  ) {
    return false;
  }
  let sourceFactWrite = false;
  const visit = (node: Node | undefined): void => {
    if (node === undefined || sourceFactWrite) return;
    const passing = selectCsharpSourceArgument(policy.sourceFacts, node);
    if (
      passing.passingMode !== "by-value" &&
      passing.passingMode !== "byref-readonly" &&
      passing.passingMode !== "borrow-shared"
    ) {
      const storageDeclaration = policy.facts.navigation.identity.target(
        passing.storageExpression,
      )?.declaration;
      if (sourceNodesEqual(policy.ast, storageDeclaration, declaration)) {
        sourceFactWrite = true;
        return;
      }
    }
    policy.ast.forEachChild(node, visit);
  };
  visit(catchClause.Block);
  return !sourceFactWrite;
}

function isLexicallyWithinExactCatch(
  policy: CsharpPolicyContext,
  node: Node,
  catchClause: Node,
): boolean {
  for (
    let current = policy.ast.parent(node);
    current !== undefined;
    current = policy.ast.parent(current)
  ) {
    if (sourceNodesEqual(policy.ast, current, catchClause)) return true;
    if (
      policy.ast.is.IsCatchClause(current) ||
      isCallableBoundary(policy, current)
    ) {
      return false;
    }
  }
  return false;
}

function isCallableBoundary(
  policy: CsharpPolicyContext,
  node: Node,
): boolean {
  return policy.ast.is.IsArrowFunction(node) ||
    policy.ast.is.IsFunctionExpression(node) ||
    policy.ast.is.IsFunctionDeclaration(node) ||
    policy.ast.is.IsMethodDeclaration(node) ||
    policy.ast.is.IsGetAccessorDeclaration(node) ||
    policy.ast.is.IsSetAccessorDeclaration(node) ||
    policy.ast.is.IsConstructorDeclaration(node) ||
    policy.ast.is.IsClassStaticBlockDeclaration(node);
}
