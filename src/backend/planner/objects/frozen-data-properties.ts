import type { CsharpObjectShapeFact } from "../../../target-model/types/index.js";
import type { CsharpExpression, CsharpStatement, CsharpTypeMember } from "../../target-ast/roslyn/index.js";
import { qualifiedCsharpType } from "../types/index.js";
import { objectShapeStorageMemberName } from "./object-shape-storage.js";
import type { CsharpPlanningContext } from "../context.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";

export function csharpFrozenStorageName(shape: CsharpObjectShapeFact, name: string): string {
  const reserved = new Set(shape.members.map(member => objectShapeStorageMemberName(shape, member)));
  let candidate = `__tsonic_frozen_${name}`;
  while (reserved.has(candidate)) candidate = `_${candidate}`;
  return candidate;
}

export function guardCsharpFrozenDataProperties(
  shape: CsharpObjectShapeFact, members: readonly CsharpTypeMember[],
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): readonly CsharpTypeMember[] {
  const unsafeStorage = shape.members.some(member => input.program.storage.nativeField(shape.targetType, member.targetName) !== undefined);
  const attributedFields = members.some(member => member.kind === "FieldDeclaration" && (member.attributes?.length ?? 0) > 0);
  if (unsafeStorage || attributedFields) {
    diagnostics.push({ code: "CSHARP_FREEZE_STORAGE_NOT_CLOSED", category: "error", source: "tsonic-csharp",
      message: "Object.freeze cannot replace independently native-addressed or attributed fields with guarded data properties." });
    return [];
  }
  const check: CsharpStatement = { kind: "ExpressionStatement", expression: {
    kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
      receiver: qualifiedCsharpType("Tsonic.CSharp.Js", "FrozenObject"), name: "CheckWrite" },
    arguments: [{ kind: "Argument", expression: { kind: "IdentifierName", name: "this" } }],
  } };
  return members.flatMap((member): readonly CsharpTypeMember[] => {
    if ((member.kind !== "FieldDeclaration" && member.kind !== "PropertyDeclaration") ||
      member.modifiers.includes("static")) return [member];
    const selected = shape.members.find(candidate => candidate.accessor === undefined &&
      (objectShapeStorageMemberName(shape, candidate) === member.name ||
        candidate.memberKind === "method" && candidate.targetName === member.name));
    if (selected === undefined) return [member];
    if (member.kind === "PropertyDeclaration" && member.setter !== undefined) {
      return [{ ...member, setter: { ...member.setter, statements: [check, ...member.setter.statements] } }];
    }
    if (member.kind === "PropertyDeclaration" && member.autoSetter !== true) return [member];
    const storageName = csharpFrozenStorageName(shape, member.name);
    const storage: CsharpExpression = { kind: "IdentifierName", name: storageName };
    return [{ kind: "FieldDeclaration", name: storageName, modifiers: ["private"], type: member.type,
      initializer: member.initializer ?? { kind: "DefaultExpression", type: member.type, nullForgiving: true } },
    { kind: "PropertyDeclaration", name: member.name, modifiers: member.modifiers.filter(modifier => modifier !== "readonly"),
      type: member.type, ...(member.attributes === undefined ? {} : { attributes: member.attributes }),
      getter: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: storage }] },
      setter: { kind: "Block", statements: [check, { kind: "ExpressionStatement", expression: {
        kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" }, left: storage,
        right: { kind: "IdentifierName", name: "value" },
      } }] },
    }];
  });
}
