import type { AstReader, Node } from "@tsonic/tsts";
import { sourceBindingCapturedBeforeFirstWrite, sourceBindingCapturedBeforeInitialization,
  type SourceProgramNavigation } from "@tsonic/target-api/source";
import type { CsharpCaptureInitialization } from "../../../target-model/types/model.js";

export function csharpCapturedBindingInitialization(
  declaration: Node,
  ast: AstReader,
  navigation: Pick<SourceProgramNavigation, "declarationUses">,
): CsharpCaptureInitialization {
  return sourceBindingCapturedBeforeInitialization(declaration, ast, navigation) ||
    sourceBindingCapturedBeforeFirstWrite(declaration, ast, navigation) ? "deferred" : "initialized";
}
