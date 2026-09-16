import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpDeclarationClassifications } from "../../../analysis/declarations/model.js";
import type { CsharpMethodDeclaration, CsharpTypeMember } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { nullableCsharpType } from "../types/index.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";

export function planCsharpMutableMethod(
  node: Node, method: CsharpMethodDeclaration,
  write: NonNullable<ReturnType<CsharpDeclarationClassifications["methodWrite"]>>,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): readonly CsharpTypeMember[] {
  const type = csharpTypeFromTargetTypeRef(write.type);
  const owner = input.program.source.ast.parent(node);
  const heritage = owner === undefined ? undefined : input.program.sourceNavigation.declaredHeritage(owner);
  if (type === undefined || (method.typeParameters?.length ?? 0) > 0 ||
    method.modifiers.some(modifier => modifier === "static" || modifier === "virtual" || modifier === "override") ||
    heritage?.kind === "resolved" && heritage.edges.length > 0) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "A writable source method requires a closed non-generic instance delegate without native inheritance or interface dispatch obligations."));
    return [];
  }
  return [
    { ...method, name: write.implementationName, modifiers: method.modifiers.map(modifier => modifier === "public" ? "private" : modifier) },
    { kind: "FieldDeclaration", name: write.storageName, type: nullableCsharpType(type), modifiers: ["private"] },
    { kind: "PropertyDeclaration", name: method.name, type, modifiers: ["public"],
      getter: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: {
        kind: "BinaryExpression", operatorToken: { kind: "QuestionQuestionToken" },
        left: { kind: "IdentifierName", name: write.storageName },
        right: { kind: "IdentifierName", name: write.implementationName },
      } }] },
      setter: { kind: "Block", statements: [{ kind: "ExpressionStatement", expression: {
        kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" },
        left: { kind: "IdentifierName", name: write.storageName }, right: { kind: "IdentifierName", name: "value" },
      } }] },
    },
  ];
}
