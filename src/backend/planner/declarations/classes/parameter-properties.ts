import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { sourceParameterIsProperty } from "@tsonic/target-api/source";
import type { CsharpStatement } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { declareCsharpLocalBindingName, type DestructuringPlannerState } from "../../bindings/index.js";
import { planCsharpAdmittedMemberName } from "../modifiers.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";

export function planCsharpParameterPropertyAssignments(
  constructor: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const ast = input.program.source.ast;
  return ast.parameters(constructor).flatMap((parameter): readonly CsharpStatement[] => {
    if (parameter === undefined) failCsharpPlannerInvariant("An admitted constructor requires its dense source parameter list.", constructor);
    if (!sourceParameterIsProperty(ast, parameter)) return [];
    const name = ast.name(parameter);
    if (name === undefined) failCsharpPlannerInvariant("An admitted parameter property requires its authored identifier.", parameter);
    const memberName = planCsharpAdmittedMemberName(input.program.names, name);
    const valueName = declareCsharpLocalBindingName(name, input, state);
    return [{ kind: "ExpressionStatement", expression: {
      kind: "AssignmentExpression",
      left: { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name: memberName },
      operatorToken: { kind: "EqualsToken" }, right: { kind: "IdentifierName", name: valueName },
    } }];
  });
}
