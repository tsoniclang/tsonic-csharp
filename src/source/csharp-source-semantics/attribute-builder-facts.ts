import {
  attributeFactKey,
} from "@tsonic/tsts";
import type {
  AstReader,
  AttributeFact,
  ExtensionEvidence,
  ExtensionFactStore,
  ExtensionFactSubject,
  Node,
  SourceFileBoundLifecycleRequest,
} from "@tsonic/tsts";

const csharpAttributeBuilderChainMethods = new Set([
  "constructor",
  "method",
  "parameter",
  "property",
  "target",
]);

const csharpAttributeBuilderEvidence = [{
  message: "C# source-profile attribute builder chain",
}] satisfies readonly ExtensionEvidence[];

export function recordCsharpAttributeBuilderFacts(
  request: SourceFileBoundLifecycleRequest,
  ast: AstReader,
  facts: ExtensionFactStore,
): void {
  const sourceFile = request.sourceFile as Node | undefined;
  visitSourceFile(sourceFile, ast, (node): void => {
    if (!ast.is.IsCallExpression(node) || facts.get(node, attributeFactKey) !== undefined) {
      return;
    }
    const call = ast.as.AsCallExpression(node);
    const callee = call?.Expression;
    if (!ast.is.IsPropertyAccessExpression(callee) || ast.text(ast.name(callee)) !== "add") {
      return;
    }
    const attributeExpression = ast.arguments(node)[0];
    if (attributeExpression === undefined) {
      return;
    }
    const applicationTarget = resolveCsharpAttributeBuilderTarget(ast.as.AsPropertyAccessExpression(callee)?.Expression, ast, facts);
    if (applicationTarget === undefined) {
      return;
    }
    const attributeFactArguments: ExtensionFactSubject[] = [];
    for (const argument of ast.arguments(node).slice(1)) {
      if (argument !== undefined) {
        attributeFactArguments.push(argument);
      }
    }
    facts.set(node, attributeFactKey, {
      target: attributeExpression,
      attributeName: staticExpressionName(attributeExpression, ast),
      arguments: attributeFactArguments,
    } satisfies AttributeFact, csharpAttributeBuilderEvidence);
  });
}

function resolveCsharpAttributeBuilderTarget(
  expression: Node | undefined,
  ast: AstReader,
  facts: ExtensionFactStore,
): ExtensionFactSubject | undefined {
  if (expression === undefined || !ast.is.IsCallExpression(expression)) {
    return undefined;
  }
  const rootFact = facts.get<AttributeFact>(expression, attributeFactKey);
  if (rootFact !== undefined) {
    return rootFact.target;
  }
  const callee = ast.as.AsCallExpression(expression)?.Expression;
  if (!ast.is.IsPropertyAccessExpression(callee)) {
    return undefined;
  }
  const methodName = ast.text(ast.name(callee));
  if (!csharpAttributeBuilderChainMethods.has(methodName)) {
    return undefined;
  }
  return resolveCsharpAttributeBuilderTarget(ast.as.AsPropertyAccessExpression(callee)?.Expression, ast, facts);
}

function staticExpressionName(node: Node, ast: AstReader): string {
  if (ast.is.IsPropertyAccessExpression(node)) {
    const access = ast.as.AsPropertyAccessExpression(node);
    const receiver = access?.Expression === undefined ? "" : staticExpressionName(access.Expression, ast);
    const name = ast.text(ast.name(node));
    return receiver === "" ? name : `${receiver}.${name}`;
  }
  return ast.text(ast.name(node) ?? node);
}

function visitSourceFile(
  node: Node | undefined,
  ast: AstReader,
  visit: (node: Node) => void,
): void {
  if (node === undefined) {
    return;
  }
  visit(node);
  ast.forEachChild(node, (child) => {
    visitSourceFile(child, ast, visit);
  });
}
