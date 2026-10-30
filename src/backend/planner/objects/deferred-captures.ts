import type { CsharpTypeMember, CsharpTypeNode, CsharpExpression, CsharpStatement } from "../../target-ast/syntax/index.js";
import type { Node } from "@tsonic/tsts";
import type { CsharpPlanningContext } from "../context.js";
import { allocateExpressionTemp, declareCsharpLocalBindingName, type DestructuringPlannerState } from "../bindings/binding-state.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { csharpDeferredCaptureStorageNames } from "../../../target-model/names/object-members.js";
import type { CsharpNativeMemberHidingReader } from "../../../target-model/records/native/native-member-names.js";
import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import { planCsharpArtifactMemberHiding } from "../declarations/modifiers.js";

export function planCsharpDeferredOriginalPlaces(
  scope: Node, children: readonly Node[], input: CsharpPlanningContext, state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const statements: CsharpStatement[] = [];
  const ast = input.program.source.ast;
  const retain = (declaration: Node): void => {
    const name = ast.name(declaration);
    if (name === undefined) return;
    if (!ast.is.IsIdentifier(name)) {
      ast.forEachChild(name, child => { if (child !== undefined && ast.is.IsBindingElement(child)) retain(child); });
      return;
    }
    const place = input.program.records.capturedPlace.get(declaration);
    if (place?.scope !== scope || place.initialization !== "deferred" ||
        input.program.records.capturedBinding.get(declaration) !== undefined) return;
    const type = csharpTypeFromTargetTypeRef(place.type, input.scope.typeParameterNames);
    if (type === undefined) failCsharpPlannerInvariant("A deferred native capture requires its exact original physical storage.", declaration);
    const flag = allocateExpressionTemp(state);
    state.deferredCaptureInitializations.set(declaration, flag);
    statements.push({ kind: "LocalDeclarationStatement", name: declareCsharpLocalBindingName(name, input, state), type,
      initializer: { kind: "DefaultExpression", type, nullForgiving: true } });
    statements.push({ kind: "LocalDeclarationStatement", name: flag,
      type: { kind: "PredefinedType", name: "bool" }, initializer: { kind: "LiteralExpression", value: false } });
  };
  for (const child of children) {
    if (!ast.is.IsVariableStatement(child)) continue;
    const list = ast.as.AsVariableStatement(child)?.DeclarationList;
    if (list !== undefined) ast.forEachChild(list, declaration => {
      if (declaration !== undefined && ast.is.IsVariableDeclaration(declaration)) retain(declaration);
    });
  }
  return statements;
}

export function planCsharpDeferredInitialization(
  statements: readonly CsharpStatement[], input: CsharpPlanningContext, state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const names = new Map([...state.deferredCaptureInitializations].map(([declaration, flag]) => {
    const sourceName = input.program.source.ast.name(declaration);
    if (sourceName === undefined) failCsharpPlannerInvariant("A deferred capture requires its checked original binding name.", declaration);
    return [declareCsharpLocalBindingName(sourceName, input, state), {
      flag, recursive: input.program.records.localBinding.get(declaration)?.recursiveInitializer === true,
    }] as const;
  }));
  return statements.flatMap((statement): readonly CsharpStatement[] => {
    let name: string;
    let initialization: CsharpStatement;
    if (statement.kind === "LocalDeclarationStatement" && names.has(statement.name)) {
      const selected = names.get(statement.name)!;
      if (statement.initializer === undefined || selected.recursive && statement.initializer.kind === "DefaultExpression") return [];
      name = statement.name;
      initialization = { kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", left: { kind: "IdentifierName", name },
        operatorToken: { kind: "EqualsToken" }, right: statement.initializer } };
    } else if (statement.kind === "ExpressionStatement" && statement.expression.kind === "AssignmentExpression" &&
        statement.expression.operatorToken.kind === "EqualsToken" && statement.expression.left.kind === "IdentifierName" &&
        names.has(statement.expression.left.name)) {
      name = statement.expression.left.name;
      initialization = statement;
    } else return [statement];
    const flag = names.get(name)!.flag;
    return [initialization, { kind: "ExpressionStatement" as const, expression: {
      kind: "AssignmentExpression" as const, left: { kind: "IdentifierName" as const, name: flag },
      operatorToken: { kind: "EqualsToken" as const }, right: { kind: "LiteralExpression" as const, value: true },
    } }];
  });
}

export function planCsharpDeferredReadGuard(name: string): CsharpStatement {
  return { kind: "IfStatement", condition: { kind: "PrefixUnaryExpression", operatorToken: { kind: "ExclamationToken" },
    operand: { kind: "IdentifierName", name } }, thenBody: { kind: "Block", statements: [{ kind: "ThrowStatement",
    expression: { kind: "ObjectCreationExpression", type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" },
      name: "InvalidOperationException" }, arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression",
      value: "captured binding is not initialized" } }] } }] } };
}

export function renderCsharpDeferredCaptureMember(name: string, type: CsharpTypeNode,
  shape: CsharpObjectShapeFact, names: CsharpNativeMemberHidingReader): readonly CsharpTypeMember[] {
  const { valueName, initializedName } = csharpDeferredCaptureStorageNames(name);
  const field = (name: string): CsharpExpression => ({ kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name });
  const assign = (name: string, expression: CsharpExpression) => ({ kind: "ExpressionStatement" as const,
    expression: { kind: "AssignmentExpression" as const, left: field(name), operatorToken: { kind: "EqualsToken" as const }, right: expression } });
  return [
    { kind: "FieldDeclaration", name: valueName, type, modifiers: ["private", ...planCsharpArtifactMemberHiding(names, shape, valueName)],
      initializer: { kind: "DefaultExpression", type, nullForgiving: true } },
    { kind: "FieldDeclaration", name: initializedName, type: { kind: "PredefinedType", name: "bool" },
      modifiers: ["private", ...planCsharpArtifactMemberHiding(names, shape, initializedName)] },
    { kind: "PropertyDeclaration", name, type, modifiers: ["public", ...planCsharpArtifactMemberHiding(names, shape, name)], getter: { kind: "Block", statements: [
      { kind: "IfStatement", condition: field(initializedName), thenBody: { kind: "Block", statements: [
        { kind: "ReturnStatement", expression: field(valueName) },
      ] } },
      { kind: "ThrowStatement", expression: { kind: "ObjectCreationExpression",
        type: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "InvalidOperationException" },
        arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: "captured binding is not initialized" } }] } },
    ] }, setter: { kind: "Block", statements: [assign(valueName, { kind: "IdentifierName", name: "value" }),
      assign(initializedName, { kind: "LiteralExpression", value: true })] } },
  ];
}
