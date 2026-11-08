import type { Node } from "@tsonic/tsts";
import type { SourceLiteralUnit, SourcePresence } from "@tsonic/target-api/source";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";

export interface CsharpNativeLiteralQueries {
  hasRecipeSyntax(occurrence: Node): boolean;
  scalar(occurrence: Node): CsharpRepresentationOutcome<SourcePresence<SourceLiteralUnit>>;
  recipe(occurrence: Node): CsharpRepresentationOutcome<SourcePresence<SourceLiteralUnit>>;
}
