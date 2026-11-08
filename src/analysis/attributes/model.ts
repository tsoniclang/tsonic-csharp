import type { Node } from "@tsonic/tsts";
import type { SourceAttributeBuilderFact } from "@tsonic/target-api/source";

export interface CsharpSourceAttributeApplicationIndex {
  readonly all: readonly Extract<SourceAttributeBuilderFact, { readonly kind: "application" }>[];
  forSubject(subject: Node): SourceAttributeBuilderFact | undefined;
}
