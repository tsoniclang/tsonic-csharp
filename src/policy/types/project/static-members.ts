import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceProgramNavigation } from "@tsonic/target-api/source";
import type { CsharpProjectTypeCatalog } from "./project-types.js";
import { projectDefinitionTargetType } from "./project-types.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

export function resolveCsharpStaticMemberReceiver(
  ast: AstReader,
  navigation: SourceProgramNavigation,
  catalog: CsharpProjectTypeCatalog,
  declaration: Node | undefined,
  receiver: Node | undefined,
): TargetTypeRef | undefined {
  if (declaration === undefined || receiver === undefined || !ast.hasModifierKind(declaration, "static")) return undefined;
  const owner = catalog.definitionForDeclaration(ast.parent(declaration));
  if (owner === undefined || owner.local || navigation.sourceReferenceFor(receiver)?.declaration !== owner.declaration) return undefined;
  return projectDefinitionTargetType(owner, []);
}
