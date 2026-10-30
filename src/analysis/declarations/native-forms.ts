import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpProjectTypeClassifications, CsharpProjectTypeHeritage } from "../../target-model/records/types/project-types.js";
import type { CsharpNativeDeclarationForm } from "../../target-model/records/native/native-declaration-forms.js";
import { createCsharpNativeDeclarationRecords } from "../program/records/native/native-declarations.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/objects/required-records.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";

export function analyzeCsharpNativeDeclarationForms(input: {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly projectTypes: CsharpProjectTypeClassifications;
  readonly shapes: Pick<CsharpObjectShapeClassifications, "resolveNode" | "structuralImplementations">;
  readonly required: CsharpRequiredRecord[];
}) {
  const values = new Map<Node, CsharpNativeDeclarationForm>();
  const heritage = new Map<Node, CsharpProjectTypeHeritage>();
  for (const node of input.nodes) {
    if (input.ast.is.IsClassDeclaration(node) || input.ast.is.IsClassExpression(node) || input.ast.is.IsInterfaceDeclaration(node)) {
      const selected = input.projectTypes.heritageForDeclaration(node);
      if (selected !== undefined) {
        const shape = input.ast.is.IsInterfaceDeclaration(node) ? undefined : input.shapes.resolveNode(node);
        const implementations = shape === undefined ? [] : input.shapes.structuralImplementations(shape.targetType);
        heritage.set(node, implementations.length === 0 ? selected : Object.freeze({ ...selected,
          interfaces: Object.freeze([...new Map([...selected.interfaces,
            ...implementations.map(implementation => implementation.interfaceType)].map(type => [targetTypeRefKey(type), type])).values()]) }));
      }
    }
    if (input.ast.is.IsClassDeclaration(node) || input.ast.is.IsClassExpression(node)) {
      const definition = input.projectTypes.definitionContainingDeclaration(node);
      const members: Node[] = [];
      if (definition?.staticCompanion) for (const member of input.ast.members(node)) {
        if (member === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A native class requires dense checked member declarations.", node);
        if (input.ast.hasModifierKind(member, "static") || input.ast.is.IsClassStaticBlockDeclaration(member)) members.push(member);
      }
      values.set(node, Object.freeze({ kind: "class", staticCompanion: definition?.staticCompanion
        ? Object.freeze({ name: definition.sourceName, members: Object.freeze(members) }) : undefined }));
      requireCsharpRecord(input.required, { family: "nativeDeclaration", subject: node, construct: "native class declaration", producer: "analyzeCsharpNativeDeclarationForms" });
      continue;
    }
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
  return createCsharpNativeDeclarationRecords(values, heritage);
}
