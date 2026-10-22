// The sealed C# program publishes records only. Its project source files are the published source artifacts: one per
// checked project file, in navigation order (analyzeCsharpSourceArtifacts over source.navigation.sourceFiles).
export function csharpProgramSourceFiles(program) {
  return program.records.sourceArtifacts.get().map(artifact => artifact.sourceFile);
}

// Every published Promise result-use decision of the sealed program, in source order. The program publishes them per
// node (records.promiseResult); the result-use owner decides each one once.
export function csharpProgramPromiseResults(program) {
  const { ast } = program.source;
  const rows = [];
  const visit = node => {
    const row = program.records.promiseResult.get(node);
    if (row !== undefined) rows.push(row);
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  csharpProgramSourceFiles(program).forEach(visit);
  return rows;
}

// The object shape every native object-literal construction of the sealed program builds, in source order. Native demand
// publishes the shape with the literal's use (records.nativeExpression); the physical use wins over a converted one.
export function csharpProgramObjectLiteralShapes(program) {
  const { ast } = program.source;
  const shapes = [];
  const visit = node => {
    if (ast.is.IsObjectLiteralExpression(node)) {
      const selected = program.records.nativeExpression.get(node);
      const shape = selected?.physical?.objectShape ?? (selected?.use.kind === "erased" ? undefined : selected?.use.objectShape);
      if (shape !== undefined) shapes.push(shape);
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  csharpProgramSourceFiles(program).forEach(visit);
  return shapes;
}
