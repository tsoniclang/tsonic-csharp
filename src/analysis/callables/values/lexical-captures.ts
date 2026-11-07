// The lexical captures of a callable or local class, as C# reads them (closures, named self bindings, object-literal
// method sources, local class factories): the Host's published selection (R-E2-1).
import type { Node } from "@tsonic/tsts";
import type { SourceLexicalCaptureSelection, SourceProgramFacts } from "@tsonic/target-api/source";

export type CsharpLexicalCaptureSelection = SourceLexicalCaptureSelection;

/** The Host lexical capture selection of `owner`: captured bindings with references, self references, receivers. */
export function csharpLexicalCaptures(facts: SourceProgramFacts, owner: Node): CsharpLexicalCaptureSelection {
  return facts.analyses.lexicalCaptures(owner);
}
