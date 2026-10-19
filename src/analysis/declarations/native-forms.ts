import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpProjectTypeClassifications } from "../../target-model/records/project-types.js";
import type { CsharpNativeEnumDeclaration } from "../../target-model/records/native-declaration-forms.js";
import { createCsharpNativeDeclarationRecords } from "../program/records/native-declarations.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";

export function analyzeCsharpNativeDeclarationForms(input: {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly projectTypes: CsharpProjectTypeClassifications;
  readonly required: CsharpRequiredRecord[];
}) {
  const values = new Map<Node, CsharpNativeEnumDeclaration>();
  for (const node of input.nodes) {
    if (!input.ast.is.IsEnumDeclaration(node)) continue;
    const definition = input.projectTypes.definitionContainingDeclaration(node);
    if (definition?.kind !== "enum") failTargetAnalysisInvariant("tsonic-csharp", "An admitted enum requires its selected native integer-width definition.", node);
    const members: Node[] = [];
    for (const member of input.ast.as.AsEnumDeclaration(node)?.Members?.Nodes ?? []) {
      if (member === undefined || !input.ast.is.IsEnumMember(member))
        failTargetAnalysisInvariant("tsonic-csharp", "An admitted enum requires its dense checked native member declarations.", node);
      members.push(member);
    }
    values.set(node, Object.freeze({ kind: "enum", integerWidth: definition.integerWidth, members: Object.freeze(members) }));
    requireCsharpRecord(input.required, { family: "nativeDeclaration", subject: node, construct: "native enum declaration", producer: "analyzeCsharpNativeDeclarationForms" });
  }
  return createCsharpNativeDeclarationRecords(values);
}
