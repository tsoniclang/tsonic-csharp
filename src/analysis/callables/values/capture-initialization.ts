import type { AstReader, Node } from "@tsonic/tsts";
import { sourceBindingCapturedBeforeFirstWrite, sourceBindingCapturedBeforeInitialization,
  type SourceNodeNavigationFacts } from "@tsonic/target-api/source";
import type { CsharpCaptureInitialization } from "../../../target-model/types/model.js";

export function csharpCapturedBindingInitialization(
  declaration: Node,
  ast: AstReader,
  navigation: Pick<SourceNodeNavigationFacts, "declarationUses">,
): CsharpCaptureInitialization {
  return sourceBindingCapturedBeforeInitialization(declaration, ast, navigation) ||
    sourceBindingCapturedBeforeFirstWrite(declaration, ast, navigation) ? "deferred" : "initialized";
}
