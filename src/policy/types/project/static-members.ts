import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import type { CsharpProjectTypeCatalog } from "../../../target-model/records/types/project-types.js";
import { projectDefinitionTargetType } from "./declaration-carriers.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

export function resolveCsharpStaticMemberReceiver(
  ast: AstReader,
  facts: SourceProgramFacts,
  catalog: CsharpProjectTypeCatalog,
  declaration: Node | undefined,
  receiver: Node | undefined,
): TargetTypeRef | undefined {
  if (declaration === undefined || receiver === undefined || !ast.hasModifierKind(declaration, "static")) return undefined;
  const owner = catalog.definitionForDeclaration(ast.parent(declaration));
  if (owner === undefined || owner.local || facts.navigation.identity.target(receiver)?.declaration !== owner.declaration) return undefined;
  return projectDefinitionTargetType(owner, []);
}
