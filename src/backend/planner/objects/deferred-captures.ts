import type { CsharpStatement } from "../../target-ast/syntax/index.js";
import type { Node } from "@tsonic/tsts";
import type { CsharpPlanningContext } from "../context.js";
import { declareCsharpLocalBindingName, type DestructuringPlannerState } from "../bindings/binding-state.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planCsharpDeferredOriginalPlaces(
  scope: Node, children: readonly Node[], input: CsharpPlanningContext, state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  return deferredOriginalDeclarations(scope, children, input).map((declaration): CsharpStatement => {
    const name = input.program.source.ast.name(declaration)!;
    const place = input.program.records.capturedPlace.get(declaration);
    const type = place === undefined ? undefined : csharpTypeFromTargetTypeRef(place.type, input.scope.typeParameterNames);
    if (type === undefined) failCsharpPlannerInvariant("A deferred native capture requires its exact original physical storage.", declaration);
    state.predeclaredNativeBindings.add(declaration);
    return { kind: "LocalDeclarationStatement", name: declareCsharpLocalBindingName(name, input, state), type,
      initializer: { kind: "DefaultExpression", type, nullForgiving: true } };
  });
}

export function planCsharpDeferredInitialization(
  statements: readonly CsharpStatement[], input: CsharpPlanningContext, state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  return statements.flatMap((statement): readonly CsharpStatement[] => {
    if (statement.kind !== "LocalDeclarationStatement") return [statement];
    const declaration = [...state.predeclaredNativeBindings].find(declaration =>
      declareCsharpLocalBindingName(input.program.source.ast.name(declaration)!, input, state) === statement.name);
    if (declaration === undefined) return [statement];
    if (statement.initializer === undefined || statement.initializer.kind === "DefaultExpression" &&
        input.program.records.localBinding.get(declaration)?.recursiveInitializer === true) return [];
    return [{ kind: "ExpressionStatement", expression: { kind: "AssignmentExpression",
      left: { kind: "IdentifierName", name: statement.name },
      operatorToken: { kind: "EqualsToken" }, right: statement.initializer } }];
  });
}

function deferredOriginalDeclarations(scope: Node, children: readonly Node[], input: CsharpPlanningContext): readonly Node[] {
  const declarations: Node[] = [];
  const ast = input.program.source.ast;
  const retain = (declaration: Node): void => {
    const name = ast.name(declaration);
    if (name === undefined) return;
    if (!ast.is.IsIdentifier(name)) {
      ast.forEachChild(name, child => { if (child !== undefined && ast.is.IsBindingElement(child)) retain(child); });
      return;
    }
    const place = input.program.records.capturedPlace.get(declaration);
    if (place?.scope === scope && place.initialization === "deferred" &&
        input.program.records.capturedBinding.get(declaration) === undefined) declarations.push(declaration);
  };
  for (const child of children) {
    if (!ast.is.IsVariableStatement(child)) continue;
    const list = ast.as.AsVariableStatement(child)?.DeclarationList;
    if (list !== undefined) ast.forEachChild(list, declaration => {
      if (declaration !== undefined && ast.is.IsVariableDeclaration(declaration)) retain(declaration);
    });
  }
  return declarations;
}
