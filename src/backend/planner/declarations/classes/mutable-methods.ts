import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpDeclarationClassifications } from "../../../../target-model/records/declarations.js";
import type { CsharpMethodDeclaration, CsharpTypeMember } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { nullableCsharpType } from "../../types/index.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";
import { planCsharpNativeMemberHiding } from "../modifiers.js";
import { withCsharpSafetyModifiers } from "../../safety/explicit-safety.js";

export function planCsharpMutableMethod(
  node: Node, method: CsharpMethodDeclaration,
  write: NonNullable<ReturnType<CsharpDeclarationClassifications["methodWrite"]["get"]>>,
  input: CsharpPlanningContext, _diagnostics: TargetDiagnostic[],
): readonly CsharpTypeMember[] {
  const type = csharpTypeFromTargetTypeRef(write.type, input.scope.typeParameterNames);
  if (type === undefined) return failCsharpPlannerInvariant(
    "An admitted writable method lost its renderable native delegate storage.", node);
  const modifiers = input.program.records.memberModifiers.get(node);
  if (modifiers?.method === undefined) failCsharpPlannerInvariant("An admitted writable method requires its native implementation modifiers.", node);
  return [
    { ...method, name: write.implementationName, modifiers: withCsharpSafetyModifiers([
      ...modifiers.implementation,
      ...planCsharpNativeMemberHiding(input.program.records.nativeMemberHiding, { kind: "source", declaration: node, role: "implementation" }),
      ...modifiers.method,
    ], node, "declaration", input) },
    { kind: "FieldDeclaration", name: write.storageName, type: nullableCsharpType(type),
      modifiers: ["private", ...planCsharpNativeMemberHiding(input.program.records.nativeMemberHiding, { kind: "source", declaration: node, role: "storage" })] },
    { kind: "PropertyDeclaration", name: method.name, type,
      modifiers: ["public", ...planCsharpNativeMemberHiding(input.program.records.nativeMemberHiding, { kind: "source", declaration: node, role: "member" })],
      getter: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: {
        kind: "AssignmentExpression", operatorToken: { kind: "QuestionQuestionEqualsToken" },
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
