// The sealed C# program publishes records only. Its project source files are the published source artifacts: one per
// checked project file, in navigation order (analyzeCsharpSourceArtifacts over source.navigation.sourceFiles).
export function csharpProgramSourceFiles(program) {
  return program.records.sourceArtifacts.get().map(artifact => artifact.sourceFile);
}
