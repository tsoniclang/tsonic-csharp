import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpClassDeclaration } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { createCsharpMemberPlanningContext } from "../../context.js";
import { planClassMembers } from "./members.js";

export function planGenericClassStaticMembers(
  node: Node, sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): CsharpClassDeclaration | undefined {
  const definition = input.types.projectTypes.definitionContainingDeclaration(node);
  if (!definition?.staticCompanion) return undefined;
  const ast = input.program.source.ast;
  const members = ast.members(node).filter(member => member !== undefined &&
    (ast.hasModifierKind(member, "static") || ast.is.IsClassStaticBlockDeclaration(member)));
  return { kind: "ClassDeclaration", name: definition.sourceName, modifiers: ["public", "static"],
    members: planClassMembers(members, definition.sourceName, new Set(), sourceFile, createCsharpMemberPlanningContext(input), diagnostics) };
}
