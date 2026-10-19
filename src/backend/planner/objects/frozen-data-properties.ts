import type { CsharpObjectShapeFact } from "../../../target-model/types/index.js";
import type { CsharpExpression, CsharpStatement, CsharpTypeMember } from "../../target-ast/syntax/index.js";
import { qualifiedCsharpType } from "../types/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { planCsharpArtifactMemberHiding } from "../declarations/modifiers.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

export function guardCsharpFrozenDataProperties(
  shape: CsharpObjectShapeFact, members: readonly CsharpTypeMember[],
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): readonly CsharpTypeMember[] {
  const selections = input.program.records.frozenDataProperties.get(shape);
  if (selections === undefined) return members;
  const check: CsharpStatement = { kind: "ExpressionStatement", expression: {
    kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression",
      receiver: qualifiedCsharpType("Tsonic.CSharp.Js", "FrozenObject"), name: "CheckWrite" },
    arguments: [{ kind: "Argument", expression: { kind: "IdentifierName", name: "this" } }],
  } };
  return members.flatMap((member): readonly CsharpTypeMember[] => {
    const selected = selections.get(member.name);
    if (selected === undefined) return [member];
    if (selected.kind === "setter") {
      if (member.kind !== "PropertyDeclaration" || member.setter === undefined) failCsharpPlannerInvariant("An admitted frozen setter requires its native property body.", shape.methodImplementation?.declaration);
      return [{ ...member, setter: { ...member.setter, statements: [check, ...member.setter.statements] } }];
    }
    if (member.kind !== "FieldDeclaration" && member.kind !== "PropertyDeclaration") failCsharpPlannerInvariant("An admitted frozen data member requires its native storage declaration.", shape.methodImplementation?.declaration);
    const storageName = selected.storageName;
    const storage: CsharpExpression = { kind: "IdentifierName", name: storageName };
    return [{ kind: "FieldDeclaration", name: storageName,
      modifiers: ["private", ...planCsharpArtifactMemberHiding(input.program.records.nativeMemberHiding, shape, storageName)], type: member.type,
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
