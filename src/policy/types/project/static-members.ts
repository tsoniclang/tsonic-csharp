import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceProgramNavigation } from "@tsonic/target-api/source";
import type { CsharpProjectTypeCatalog, CsharpProjectTypeDefinition } from "../../../target-model/records/types/project-types.js";
import { projectDefinitionTargetType } from "./declaration-carriers.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

export interface CsharpStaticMemberReceiverSource {
  readonly declaration: Node;
  readonly receiver: Node;
  readonly ownerDeclaration: Node | undefined;
  readonly reference: ReturnType<SourceProgramNavigation["sourceReferenceFor"]>;
}

export function formCsharpStaticMemberReceiverSource(
  ast: AstReader,
  navigation: SourceProgramNavigation,
  declaration: Node | undefined,
  receiver: Node | undefined,
): CsharpStaticMemberReceiverSource | undefined {
  if (declaration === undefined || receiver === undefined || !ast.hasModifierKind(declaration, "static")) return undefined;
  return Object.freeze({ declaration, receiver, ownerDeclaration: ast.parent(declaration),
    reference: navigation.sourceReferenceFor(receiver) });
}

export function completeCsharpStaticMemberReceiver(
  source: CsharpStaticMemberReceiverSource | undefined,
  owner: CsharpProjectTypeDefinition | undefined,
): TargetTypeRef | undefined {
  if (source === undefined || owner === undefined || owner.local || source.reference?.declaration !== owner.declaration) return undefined;
  return projectDefinitionTargetType(owner, []);
}

export function resolveCsharpStaticMemberReceiver(
  ast: AstReader,
  navigation: SourceProgramNavigation,
  catalog: CsharpProjectTypeCatalog,
  declaration: Node | undefined,
  receiver: Node | undefined,
): TargetTypeRef | undefined {
  const source = formCsharpStaticMemberReceiverSource(ast, navigation, declaration, receiver);
  return completeCsharpStaticMemberReceiver(source,
    source === undefined ? undefined : catalog.definitionForDeclaration(source.ownerDeclaration));
}
