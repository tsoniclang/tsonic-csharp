import type { AstReader, Node } from "@tsonic/tsts";
import type { CsharpDeclarationClassifications } from "../../target-model/records/program/declarations.js";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeDemand } from "../../target-model/records/objects/object-shape-demand.js";
import type { CsharpObjectMemberRecords } from "../../target-model/records/objects/object-members.js";
import type { CsharpFrozenDataProperty } from "../../target-model/records/storage/frozen-data-properties.js";
import type { CsharpAttributeApplicationIndex } from "../../target-model/records/program/attributes.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage/storage.js";
import { objectShapeArtifactKey } from "../../target-model/records/objects/object-shape-keys.js";
import { csharpFrozenStorageName, objectShapeStorageMemberName } from "../../target-model/names/object-members.js";
import { createCsharpFrozenDataPropertyRecords } from "../program/records/storage/frozen-data-properties.js";

export function analyzeCsharpFrozenDataProperties(input: {
  readonly ast: AstReader;
  readonly demand: CsharpObjectShapeDemand;
  readonly members: CsharpObjectMemberRecords;
  readonly storage: Pick<CsharpStorageClassifications, "nativeField">;
  readonly operations: Pick<CsharpTargetOperationClassifications, "classPropertyStorage">;
  readonly attributes: CsharpAttributeApplicationIndex;
  readonly methodWrites: CsharpDeclarationClassifications["methodWrite"];
}) {
  const entries = new Map<string, ReadonlyMap<string, CsharpFrozenDataProperty>>();
  const issues: TargetDiagnostic[] = [];
  for (const artifact of input.demand.artifacts) {
    if (!artifact.capabilities.includes("js-freeze")) continue;
    const shape = artifact.fact;
    const fields = new Map<string, CsharpFrozenDataProperty>();
    let invalid: Node | true | undefined;
    for (const member of shape.members) {
      if (input.storage.nativeField.get(shape.targetType, member.targetName) !== undefined) invalid = member.sourceDeclarations?.[0] ?? true;
      if (member.accessor !== undefined) continue;
      // A synthetic shape stores the member as its selected object member; a source artifact uses its class storage.
      if (artifact.materialization === "synthetic") {
        const selected = input.members.objectMember.get(shape, member);
        if (selected === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted frozen object requires its native member storage selection.", member.sourceDeclarations?.[0]);
        const name = objectShapeStorageMemberName(shape, member);
        switch (selected.declaration.kind) {
          case "authored": if (selected.declaration.value.kind !== "fixed") fields.set(name, Object.freeze({ kind: "setter" })); break;
          case "accessor": break;
          case "native-backing": invalid = member.sourceDeclarations?.[0] ?? true; break;
          case "bound": if (!member.readonly) fields.set(member.targetName, Object.freeze({ kind: "setter" })); break;
          case "deferred": fields.set(member.targetName, Object.freeze({ kind: "setter" })); break;
          default: fields.set(name, Object.freeze({ kind: "data", storageName: csharpFrozenStorageName(shape, name) })); break;
        }
        continue;
      }
      for (const declaration of member.sourceDeclarations ?? []) {
        const storage = input.operations.classPropertyStorage.get(declaration);
        if (storage?.kind === "field" && input.attributes.attributeApplication.get(declaration).length !== 0) invalid = declaration;
        if (input.ast.hasModifierKind(declaration, "static") || input.ast.hasModifierKind(declaration, "abstract")) continue;
        if (storage?.kind === "field") fields.set(member.targetName, Object.freeze({ kind: "data", storageName: csharpFrozenStorageName(shape, member.targetName) }));
        else if (storage?.kind === "property" && !storage.readonly) fields.set(member.targetName, Object.freeze({ kind: "data", storageName: csharpFrozenStorageName(shape, member.targetName) }));
        // Only a written method has native delegate storage behind a property setter to guard; an unwritten method has none.
        else if (input.ast.is.IsMethodDeclaration(declaration) && !member.readonly && input.methodWrites.get(declaration) !== undefined) {
          fields.set(member.targetName, Object.freeze({ kind: "setter" }));
        }
      }
    }
    if (invalid !== undefined) issues.push({ code: "CSHARP_FREEZE_STORAGE_NOT_CLOSED", category: "error", source: "tsonic-csharp",
      ...(invalid === true ? {} : { sourceNode: invalid }), message: "Object.freeze cannot replace independently native-addressed or attributed fields with guarded data properties." });
    entries.set(objectShapeArtifactKey(shape), fields);
  }
  return Object.freeze({ records: createCsharpFrozenDataPropertyRecords(entries), issues: Object.freeze(issues) });
}
