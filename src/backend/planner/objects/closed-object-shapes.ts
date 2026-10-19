import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpClosedShapeConversion } from "../../../target-model/records/closed-object-shapes.js";
import type { CsharpObjectShapeProjectionDeclaration } from "../../../target-model/records/object-shape-demand.js";
import type { CsharpNativeMemberHidingReader } from "../../../target-model/records/native-member-names.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpExpression, CsharpMethodDeclaration, CsharpStatement, CsharpTypeNode, CsharpTypeParameter } from "../../target-ast/syntax/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { csharpGenericConstraintFromTargetTypeParameterConstraint } from "../types/type-parameters.js";
import { planCsharpArtifactMemberHiding } from "../declarations/modifiers.js";
import { qualifiedCsharpType } from "../types/csharp-type-primitives.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";

export function renderObjectShapeProjectionMethods(
  input: CsharpPlanningContext, projections: readonly CsharpObjectShapeProjectionDeclaration[], diagnostics: TargetDiagnostic[],
): readonly CsharpMethodDeclaration[] {
  return projections.map(projection => renderObjectShapeProjectionMethod(input.scope.typeParameterNames, projection, input.program.records.nativeMemberHiding));
}

export function renderObjectShapeProjectionMethod(
  names: ReadonlyMap<string, string> | undefined, declaration: CsharpObjectShapeProjectionDeclaration,
  memberNames: CsharpNativeMemberHidingReader,
): CsharpMethodDeclaration {
  const selected = declaration.emission;
  const typeParameterNames = new Map([...names ?? [], ...declaration.typeParameterNames.map(parameter => [parameter.identity, parameter.name] as const)]);
  const render = (carrier: TargetTypeRef): CsharpTypeNode => {
    const result = csharpTypeFromTargetTypeRef(carrier, typeParameterNames);
    if (result === undefined) failCsharpPlannerInvariant("An admitted object projection requires its renderable native carrier.");
    return result;
  };
  const typeParameters: CsharpTypeParameter[] = declaration.typeParameters.map(parameter => {
    if (parameter.csharpConstraints?.kind !== "resolved") failCsharpPlannerInvariant("An admitted object projection requires its sealed native generic constraints.", parameter.csharpDeclaration);
    const constraints = parameter.csharpConstraints.constraints.map(constraint => {
      const result = csharpGenericConstraintFromTargetTypeParameterConstraint(typeParameterNames, constraint, parameter.csharpDeclaration!, []);
      if (result === undefined) failCsharpPlannerInvariant("An admitted object projection requires renderable native constraints.", parameter.csharpDeclaration);
      return result;
    });
    const name = typeParameterNames.get(parameter.identity);
    if (name === undefined) failCsharpPlannerInvariant("An admitted object projection requires its native generic name.", parameter.csharpDeclaration);
    return { name, ...(constraints.length === 0 ? {} : { constraints }) };
  });
  const statements: CsharpStatement[] = [];
  const receiver: CsharpExpression = { kind: "IdentifierName", name: "receiver" };
  if (declaration.receiverRequiresNullCheck) statements.push({
    kind: "IfStatement", condition: { kind: "NullPatternExpression", expression: receiver, negated: false },
    thenBody: { kind: "Block", statements: [{ kind: "ThrowStatement", expression: {
      kind: "ObjectCreationExpression", type: qualifiedCsharpType("System", "NullReferenceException"), arguments: [],
    } }] },
  });
  const member = (name: string, source: CsharpExpression = receiver): CsharpExpression => ({
    kind: "SimpleMemberAccessExpression", receiver: source, name,
  });
  let expression: CsharpExpression;
  switch (selected.kind) {
    case "keys": case "values": case "entries": {
      const elements: CsharpExpression[] = selected.kind === "keys"
        ? selected.keys.map(value => ({ kind: "LiteralExpression", value }))
        : selected.members.map(value => {
            const converted = renderCsharpClosedShapeConversion(typeParameterNames, value.conversion, member(value.name));
            return selected.kind === "entries" ? { kind: "TupleExpression", elements: [{ kind: "LiteralExpression", value: value.key }, converted] } : converted;
          });
      expression = { kind: "ObjectCreationExpression", type: render(declaration.selection.resultType),
        arguments: [{ kind: "Argument", expression: { kind: "ArrayCreationExpression", elementType: render(selected.element), elements } }] };
      break;
    }
    case "has-own":
      expression = selected.keys.reduce<CsharpExpression>((left, value) => ({
        kind: "BinaryExpression", left, operatorToken: { kind: "BarBarToken" }, right: {
          kind: "BinaryExpression", left: { kind: "IdentifierName", name: "key" },
          operatorToken: { kind: "EqualsEqualsToken" }, right: { kind: "LiteralExpression", value },
        },
      }), { kind: "LiteralExpression", value: false });
      break;
    case "assign":
      for (const assignment of selected.assignments) statements.push({ kind: "ExpressionStatement", expression: {
        kind: "AssignmentExpression", left: member(assignment.target), operatorToken: { kind: "EqualsToken" },
        right: renderCsharpClosedShapeConversion(typeParameterNames, assignment.conversion, member(assignment.source, { kind: "IdentifierName", name: "source" })),
      } });
      expression = receiver;
      break;
  }
  statements.push({ kind: "ReturnStatement", expression });
  return {
    kind: "MethodDeclaration", name: declaration.methodName,
    modifiers: [...planCsharpArtifactMemberHiding(memberNames, declaration.receiver, declaration.methodName), "public", "static"],
    ...(typeParameters.length === 0 ? {} : { typeParameters }), returnType: render(declaration.selection.resultType),
    parameters: [{ name: "receiver", type: render(declaration.receiver.targetType) }, ...(selected.kind === "has-own"
      ? [{ name: "key", type: { kind: "PredefinedType" as const, name: "string" as const } }]
      : selected.kind === "assign" ? [{ name: "source", type: render(selected.source) }] : [])],
    body: { kind: "Block", statements },
  };
}

export function renderCsharpClosedShapeConversion(
  names: ReadonlyMap<string, string> | undefined, selected: CsharpClosedShapeConversion, expression: CsharpExpression,
): CsharpExpression {
  if (selected.kind === "identity") return expression;
  const type = csharpTypeFromTargetTypeRef(selected.target, names);
  if (type === undefined) failCsharpPlannerInvariant("An admitted closed object conversion requires its native output carrier.");
  switch (selected.kind) {
    case "empty-record": return { kind: "SimpleMemberAccessExpression", receiver: {
      kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: {
        kind: "AliasQualifiedName", alias: "global", name: { kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "ValueTuple" },
      }, name: "Create" }, arguments: [{ kind: "Argument", expression }, { kind: "Argument", expression: { kind: "ObjectCreationExpression", type, arguments: [] } }],
    }, name: "Item2" };
    case "runtime-union": return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: type, name: selected.constructor },
      arguments: [{ kind: "Argument", expression: renderCsharpClosedShapeConversion(names, selected.operand, expression) }] };
    case "js-value": return { kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: type, name: "from" },
      arguments: [{ kind: "Argument", expression }] };
  }
}
