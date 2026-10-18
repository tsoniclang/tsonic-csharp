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
import { planIdentifierName } from "../../names/source-identifiers.js";
import { planIntegerLiteral } from "../../expressions/literal-conversions.js";

export function planEnumDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpEnumDeclaration {
  const declaration = AsEnumDeclaration(input.program.source.ast, node)!;
  const definition = input.types.projectTypes.definitionContainingDeclaration(node);
  if (definition?.kind !== "enum") failCsharpPlannerInvariant("A source enum requires its admitted integer-width definition.", node);
  return {
    kind: "EnumDeclaration",
    name: planIdentifierName(declaration.name, "AnonymousEnum", input, diagnostics, "Enum name"),
    underlyingType: definition.integerWidth === 32 ? "int" : "long",
    modifiers: ["public"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    members: (declaration.Members?.Nodes ?? []).map((member): CsharpEnumMember => {
      if (member === undefined || !input.program.source.ast.is.IsEnumMember(member)) failCsharpPlannerInvariant(
        "A source enum requires its admitted member declarations.", node);
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
  const member = AsEnumMember(input.program.source.ast, node)!;
  const enumValue = input.program.records.constantValue.get(node)?.value;
  if (typeof enumValue !== "bigint") failCsharpPlannerInvariant("A native enum member requires its admitted exact integer constant.", node);
  return {
    kind: "EnumMemberDeclaration",
    name: planIdentifierName(member.name ?? Node_Name(input.program.source.ast, node), "AnonymousMember", input, diagnostics, "Enum member name"),
    value: planIntegerLiteral(input.scope.typeParameterNames, enumValue,
      { kind: "source-primitive", name: integerWidth === 32 ? "int32" : "int64" }) ??
        failCsharpPlannerInvariant("An admitted enum integer requires its native literal syntax.", node),
  };
}
