import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { sourceParameterIsProperty } from "@tsonic/target-api/source";
import type { CsharpStatement } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { declareCsharpLocalBindingName, type DestructuringPlannerState } from "../../bindings/index.js";
import { planIdentifierName } from "../../names/source-identifiers.js";

export function planCsharpParameterPropertyAssignments(
  constructor: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const ast = input.program.source.ast;
  return ast.parameters(constructor).flatMap((parameter): readonly CsharpStatement[] => {
    if (parameter === undefined || !sourceParameterIsProperty(ast, parameter)) return [];
    const name = ast.name(parameter);
    const memberName = planIdentifierName(name, "FieldDeclaration", input, diagnostics, "Parameter property name");
    const valueName = declareCsharpLocalBindingName(name, input, diagnostics, state, "Parameter property value", "arg");
    return [{ kind: "ExpressionStatement", expression: {
      kind: "AssignmentExpression",
      left: { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name: memberName },
      operatorToken: { kind: "EqualsToken" }, right: { kind: "IdentifierName", name: valueName },
    } }];
  });
}
