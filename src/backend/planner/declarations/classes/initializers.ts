import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpStatement } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { planExpressionWithExpectedType } from "../../expressions/index.js";
import { planIdentifierName } from "../../names/source-identifiers.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { planClassStaticBlockDeclaration } from "./constructors.js";

export function planClassInitializers(
  declaration: Node, sourceFile: SourceFile, className: string, isStatic: boolean,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): readonly CsharpStatement[] {
  return input.program.source.ast.members(declaration).flatMap(node => {
    if (node !== undefined && isStatic && input.program.source.ast.is.IsClassStaticBlockDeclaration(node)) {
      return planClassStaticBlockDeclaration(node, className, sourceFile, input, diagnostics).body.statements;
    }
    if (node === undefined || input.program.source.ast.hasModifierKind(node, "static") !== isStatic ||
      !input.program.source.ast.is.IsPropertyDeclaration(node)) return [];
    const property = input.program.source.ast.as.AsPropertyDeclaration(node)!;
    if (property.Initializer === undefined) return [];
    const target = input.types.classifications.resolveNode(property.Type ?? property.name);
    const type = target === undefined ? undefined : csharpTypeFromTargetTypeRef(target, input.scope.typeParameterNames);
    const value = type === undefined ? undefined : planExpressionWithExpectedType(property.Initializer, sourceFile,
      input, diagnostics, type, property.Type ?? property.name);
    if (value === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "A class initializer requires its exact native value contract."));
      return [];
    }
    return [{ kind: "ExpressionStatement" as const, expression: { kind: "AssignmentExpression" as const,
      left: { kind: "SimpleMemberAccessExpression" as const, receiver: { kind: "IdentifierName" as const, name: "this" },
        name: planIdentifierName(property.name, "Field", input, diagnostics, "Class field") },
      operatorToken: { kind: "EqualsToken" as const }, right: value,
    } }];
  });
}
