import type { AstReader } from "@tsonic/tsts";
import { sourceCallableUsesLexicalThis } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../target-model/types/model.js";
import { csharpObjectShapeMemberContractKey } from "../../target-model/types/object-shape-identity.js";
import { csharpObjectShapeMethodDeclaration } from "../../target-model/types/method-values.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";

export function selectCsharpCopiedMethodReceiver(
  members: readonly CsharpObjectShapeMemberFact[], sources: readonly CsharpObjectShapeFact[], ast: AstReader,
): { readonly kind: "none" } | { readonly kind: "selected"; readonly shape: CsharpObjectShapeFact } |
  { readonly kind: "rejected" } {
  const candidates = sources.filter(source => source.members.some(member => {
    const declaration = csharpObjectShapeMethodDeclaration(source, member);
    return declaration !== undefined && sourceCallableUsesLexicalThis(ast, declaration);
  }));
  if (candidates.length === 0) return { kind: "none" };
  const identities = new Set(candidates.map(source => source.methodImplementation?.identity));
  const source = candidates[0]!;
  if (identities.size !== 1 || candidates.some(candidate => !targetTypeRefEquals(candidate.targetType, source.targetType)) ||
    source.methodImplementation === undefined || members.length !== source.members.length ||
    members.some(member => !source.members.some(original =>
      csharpObjectShapeMemberContractKey(member) === csharpObjectShapeMemberContractKey(original)))) return { kind: "rejected" };
  for (const member of source.members) {
    const declaration = csharpObjectShapeMethodDeclaration(source, member);
    if (declaration === undefined || member.methodValueContract === undefined) continue;
    const selected = members.find(candidate => csharpObjectShapeMemberContractKey(candidate) === csharpObjectShapeMemberContractKey(member));
    const methods = selected?.sourceDeclarations?.filter(candidate => ast.is.IsMethodDeclaration(candidate) && ast.body(candidate) !== undefined);
    if (methods?.length !== 1 || methods[0] !== declaration) return { kind: "rejected" };
  }
  return { kind: "selected", shape: source };
}
