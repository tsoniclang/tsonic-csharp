import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpNamePlan } from "../../target-model/names/model.js";
import type { CsharpSourceMemberName } from "../../target-model/records/source-member-names.js";
import { objectShapeStorageMemberName } from "../../target-model/names/object-members.js";
import { createCsharpSourceMemberNameRecords } from "../program/records/source-member-names.js";

export function analyzeCsharpSourceMemberNames(input: { readonly ast: AstReader; readonly nodes: readonly Node[];
  readonly operations: CsharpTargetOperationClassifications; readonly names: CsharpNamePlan; readonly admitted: (node: Node) => boolean }) {
  const values = new Map<Node, CsharpSourceMemberName>();
  const issues: TargetDiagnostic[] = [];
  for (const node of input.nodes) {
    if (!input.admitted(node)) continue;
    const property = input.operations.selectedProperty.get(node);
    const classification = property?.sourceOwned;
    if (property?.selection.kind !== "source-owned" || classification === undefined || classification.jsValueOperation.kind === "resolved") continue;
    const member = classification.shapeMember;
    if (member?.kind === "resolved") {
      values.set(node, { read: member.member.targetName, method: classification.objectShape === undefined ? undefined
        : objectShapeStorageMemberName(classification.objectShape, member.member) });
      continue;
    }
    const declaration = property.selection.source.selectedDeclaration;
    const name = input.ast.name(declaration) ?? input.ast.as.AsPropertyAccessExpression(node)?.name;
    const selected = name === undefined ? undefined : input.names.resolve(name, declaration);
    if (selected?.kind === "resolved") { values.set(node, { read: selected.name, method: undefined }); continue; }
    issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node,
      message: "The exact selected source property has no C#-representable declaration name." + (selected?.kind === "rejected" ? ` ${selected.reason}` : "") });
  }
  return Object.freeze({ records: createCsharpSourceMemberNameRecords(values), issues: Object.freeze(issues) });
}
