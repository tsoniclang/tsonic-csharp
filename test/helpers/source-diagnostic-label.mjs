export function csharpSourceDiagnosticLabel(source, issue) {
  const ast = source.ast;
  const node = issue.sourceNode;
  const file = node === undefined ? undefined : ast.getSourceFile(node);
  const location = file === undefined ? "no source file"
    : `${ast.getPath(file)}:${ast.pos(node)}:${ast.end(node)} ${String(ast.getSourceText(file))
      .slice(ast.pos(node), ast.end(node)).trim().slice(0, 1024)}`;
  return `${issue.code}: ${String(issue.message).slice(0, 2048)}; ${location}`;
}
