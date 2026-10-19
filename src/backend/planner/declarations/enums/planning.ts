import type { CsharpPlanningContext } from "../../context.js";
import {
  AsEnumDeclaration,
  AsEnumMember,
  Node_Name,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpEnumDeclaration,
  CsharpEnumMember,
} from "../../../target-ast/syntax/index.js";
import { planAttributesForSubject } from "../attributes.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import { planCsharpAdmittedMemberName } from "../modifiers.js";
import { planIntegerLiteral } from "../../expressions/literal-conversions.js";

export function planEnumDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpEnumDeclaration {
  const declaration = AsEnumDeclaration(input.program.source.ast, node);
  if (declaration === undefined) failCsharpPlannerInvariant("An admitted enum requires its checked source declaration.", node);
  const definition = input.program.records.nativeDeclaration.get(node);
  if (definition?.kind !== "enum") failCsharpPlannerInvariant("A source enum requires its admitted integer-width definition.", node);
  return {
    kind: "EnumDeclaration",
    name: planCsharpAdmittedMemberName(input.program.names, declaration.name),
    underlyingType: definition.integerWidth === 32 ? "int" : "long",
    modifiers: ["public"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    members: definition.members.map((member): CsharpEnumMember => {
      return planEnumMember(member, definition.integerWidth, input, diagnostics);
    }),
  };
}

function planEnumMember(
  node: Node,
  integerWidth: 32 | 64,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpEnumMember {
  void diagnostics;
  const member = AsEnumMember(input.program.source.ast, node);
  if (member === undefined) failCsharpPlannerInvariant("An admitted enum member requires its checked source declaration.", node);
  const enumValue = input.program.records.constantValue.get(node)?.value;
  if (typeof enumValue !== "bigint") failCsharpPlannerInvariant("A native enum member requires its admitted exact integer constant.", node);
  return {
    kind: "EnumMemberDeclaration",
    name: planCsharpAdmittedMemberName(input.program.names, member.name ?? Node_Name(input.program.source.ast, node)),
    value: planIntegerLiteral(input.scope.typeParameterNames, enumValue,
      { kind: "source-primitive", name: integerWidth === 32 ? "int32" : "int64" }) ??
        failCsharpPlannerInvariant("An admitted enum integer requires its native literal syntax.", node),
  };
}
