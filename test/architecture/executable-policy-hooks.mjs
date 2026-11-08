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
  const file = checked.getSourceFile("/architecture/policy.ts");
  const queries = checked.getSourceFileQueries(file);
  const properties = [];
  const pending = [file];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    if (ast.is.IsPropertyAssignment(node)) {
      const name = ast.name(node);
      const range = name === undefined ? undefined : ast.authoredRange(name);
      if (range?.kind === "authored" && isMetadataDefinition(ast, node)) {
        const initializer = ast.as.AsPropertyAssignment(node).Initializer;
        const type = queries.checker.getTypeAtLocation(initializer);
        if (type === undefined || queries.typeShape.isAny(type) || queries.typeShape.isUnknown(type) ||
          queries.typeShape.getCallSignatures(type).length > 0 || queries.typeShape.getConstructSignatures(type).length > 0) {
          properties.push(range);
        }
      }
    }
    ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  return matches.filter(match => {
    const nameOffset = match.index + match[0].search(/\b(?:uses|validate|resolve|result|requiresClosedReceiver|mapCall)\s*:/u);
    return properties.some(property => property.start <= nameOffset && nameOffset < property.end);
  });
}

function isMetadataDefinition(ast, property) {
  let value = ast.parent(property);
  while (value !== undefined) {
    const parent = ast.parent(value);
    if (parent === undefined) return false;
    if (["KindParenthesizedExpression", "KindAsExpression", "KindSatisfiesExpression", "KindTypeAssertionExpression"].includes(ast.kindName(parent))) {
      value = parent;
      continue;
    }
    if (ast.is.IsArrayLiteralExpression(parent)) return true;
    if (ast.is.IsVariableDeclaration(parent)) return ast.as.AsVariableDeclaration(parent).Initializer === value;
    if (ast.is.IsPropertyAssignment(parent)) {
      value = ast.parent(parent);
      continue;
    }
    if (ast.is.IsCallExpression(parent) && ast.arguments(parent)[0] === value) {
      const expression = ast.as.AsCallExpression(parent).Expression;
      if (ast.is.IsPropertyAccessExpression(expression)) {
        const access = ast.as.AsPropertyAccessExpression(expression);
        if (ast.is.IsIdentifier(access.Expression) && ast.text(access.Expression) === "Object" && ast.text(ast.name(expression)) === "freeze") {
          value = parent;
          continue;
        }
      }
    }
    return false;
  }
  return false;
}
