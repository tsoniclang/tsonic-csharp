import { createCompilerSessionFromFiles } from "@tsonic/tsts";

export const executablePolicyHookPattern = /(?:^|[{,]\s*)\b(?:uses|validate|resolve|result|requiresClosedReceiver|mapCall)\s*:\s*(?:(?:\([^\n)]*\)|[A-Za-z_$][\w$]*)\s*=>|function\b|[A-Za-z_$][\w$]*(?=\s*[,}]))/gm;

export function executablePolicyHookMatches(text) {
  const matches = [...text.matchAll(executablePolicyHookPattern)];
  if (matches.length === 0) return [];
  const checked = createCompilerSessionFromFiles({
    currentDirectory: "/architecture",
    files: { "/architecture/policy.ts": text },
    compilerOptions: { noLib: true, noResolve: true, target: "esnext" },
  }).checkSource();
  const ast = checked.ast;
  const properties = [];
  const declarations = new Map();
  const scopeOf = node => {
    for (let parent = ast.parent(node); parent !== undefined; parent = ast.parent(parent)) {
      if (ast.is.IsSourceFile(parent) || ast.is.IsBlock(parent) || ast.is.IsModuleBlock(parent) ||
        ast.is.IsCaseBlock(parent) || ast.is.IsCatchClause(parent) || ast.is.IsForStatement(parent) ||
        ast.is.IsForInStatement(parent) || ast.is.IsForOfStatement(parent) || ast.is.IsFunctionDeclaration(parent) ||
        ast.is.IsFunctionExpression(parent) || ast.is.IsArrowFunction(parent) || ast.is.IsMethodDeclaration(parent) ||
        ast.is.IsGetAccessorDeclaration(parent) || ast.is.IsSetAccessorDeclaration(parent) ||
        ast.is.IsConstructorDeclaration(parent)) return parent;
    }
    return undefined;
  };
  const pending = [checked.getSourceFile("/architecture/policy.ts")];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    if (ast.is.IsPropertyAssignment(node)) {
      const name = ast.name(node);
      const range = name === undefined ? undefined : ast.authoredRange(name);
      if (range?.kind === "authored") properties.push({ range, initializer: ast.as.AsPropertyAssignment(node)?.Initializer });
    }
    if (ast.is.IsVariableDeclaration(node) || ast.is.IsFunctionDeclaration(node) ||
      ast.is.IsParameterDeclaration(node) || ast.is.IsBindingElement(node) || ast.is.IsClassDeclaration(node) ||
      ast.is.IsImportSpecifier(node) || ast.is.IsImportClause(node) || ast.is.IsNamespaceImport(node)) {
      const name = ast.name(node);
      if (name !== undefined && ast.is.IsIdentifier(name)) {
        const text = ast.text(name);
        const named = declarations.get(text) ?? [];
        let scope = scopeOf(node);
        if (ast.is.IsVariableDeclaration(node) && ast.variableDeclarationKind(node) === "var") {
          while (scope !== undefined && !ast.is.IsSourceFile(scope) && !ast.is.IsFunctionDeclaration(scope) &&
            !ast.is.IsFunctionExpression(scope) && !ast.is.IsArrowFunction(scope) && !ast.is.IsMethodDeclaration(scope) &&
            !ast.is.IsGetAccessorDeclaration(scope) && !ast.is.IsSetAccessorDeclaration(scope) &&
            !ast.is.IsConstructorDeclaration(scope)) scope = scopeOf(scope);
        }
        named.push({ node, scope });
        declarations.set(text, named);
      }
    }
    ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  function executableValue(node, active = new Set()) {
    if (node === undefined || active.has(node)) return true;
    if (ast.is.IsArrowFunction(node) || ast.is.IsFunctionExpression(node) ||
      ast.is.IsFunctionDeclaration(node) || ast.is.IsMethodDeclaration(node)) return true;
    if (ast.is.IsParenthesizedExpression(node)) return executableValue(ast.as.AsParenthesizedExpression(node)?.Expression, active);
    if (!ast.is.IsIdentifier(node)) return ast.is.IsCallExpression(node) ||
      ast.is.IsPropertyAccessExpression(node) || ast.is.IsElementAccessExpression(node);
    active.add(node);
    const named = declarations.get(ast.text(node)) ?? [];
    for (let scope = scopeOf(node); scope !== undefined; scope = scopeOf(scope)) {
      const matching = named.filter(declaration => declaration.scope === scope);
      if (matching.length === 0) continue;
      if (matching.length !== 1) return true;
      const declaration = matching[0].node;
      if (!ast.is.IsVariableDeclaration(declaration) || ast.variableDeclarationKind(declaration) !== "const") return true;
      return executableValue(ast.as.AsVariableDeclaration(declaration)?.Initializer, active);
    }
    return true;
  }
  return matches.filter(match => {
    const nameOffset = match.index + match[0].search(/\b(?:uses|validate|resolve|result|requiresClosedReceiver|mapCall)\s*:/u);
    return properties.some(({ range, initializer }) => range.start <= nameOffset && nameOffset < range.end && executableValue(initializer));
  });
}
