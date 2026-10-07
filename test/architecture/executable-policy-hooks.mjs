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
  const pending = [checked.getSourceFile("/architecture/policy.ts")];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    if (ast.is.IsPropertyAssignment(node)) {
      const name = ast.name(node);
      const range = name === undefined ? undefined : ast.authoredRange(name);
      if (range?.kind === "authored") properties.push(range);
    }
    ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  return matches.filter(match => {
    const nameOffset = match.index + match[0].search(/\b(?:uses|validate|resolve|result|requiresClosedReceiver|mapCall)\s*:/u);
    return properties.some(property => property.start <= nameOffset && nameOffset < property.end);
  });
}
