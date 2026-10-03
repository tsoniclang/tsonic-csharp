import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPropertyClassification } from "../../../../analysis/operations/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { objectShapeStorageMemberName } from "../../objects/object-shape-storage.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";

export function planCsharpSourceMemberName(
  node: Node,
  declaration: Node | undefined,
  classification: NonNullable<CsharpPropertyClassification["sourceOwned"]>,
  methodValue: boolean,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const member = classification.shapeMember;
  if (member?.kind === "resolved") {
    if (!methodValue) return member.member.targetName;
    if (classification.objectShape !== undefined) return objectShapeStorageMemberName(classification.objectShape, member.member);
    diagnostics.push(unsupportedNodeDiagnostic(node, "A stored source method requires its exact native object shape."));
    return undefined;
  }
  const name = input.program.source.ast.name(declaration) ?? input.program.source.ast.as.AsPropertyAccessExpression(node)?.name;
  const selected = name === undefined ? undefined : input.names.resolve(name, declaration);
  if (selected?.kind === "resolved") return selected.name;
  diagnostics.push(unsupportedNodeDiagnostic(node, "The exact selected source property has no C#-representable declaration name." +
    (selected?.kind === "rejected" ? ` ${selected.reason}` : "")));
  return undefined;
}
