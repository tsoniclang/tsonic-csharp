import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpArgument, CsharpExpression, CsharpStatement } from "../../../target-ast/syntax/index.js";
import type { CsharpTargetInvocationEmission } from "../../../../target-model/records/calls/target-call-emission.js";
import type { CsharpPlanningContext } from "../../context.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import { planCsharpGeneratedMethodCall } from "../../declarations/generated-methods.js";
import { csharpTypeFromTargetTypeRef } from "../../types/render.js";
import { qualifiedCsharpType } from "../../types/index.js";
import { applyCsharpConversionSelection } from "../conversions.js";
import { runtimeUnionArmProjection, runtimeUnionArmTest } from "../union-access.js";

export function planCsharpUnionArrayCopy(
  node: Node,
  selected: Extract<CsharpTargetInvocationEmission, { readonly kind: "array-copy" }>,
  arguments_: readonly CsharpArgument[],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const sourceType = csharpTypeFromTargetTypeRef(selected.sourceType, input.scope.typeParameterNames);
  const resultType = csharpTypeFromTargetTypeRef(selected.resultType, input.scope.typeParameterNames);
  if (sourceType === undefined || resultType === undefined || arguments_.length !== 1 || selected.arms.length < 2) {
    return failCsharpPlannerInvariant("A union-array copy requires its exact native source, result and argument.", node);
  }
  const sourceName = input.names.temporaryName("__tsonic_arraySource");
  const source: CsharpExpression = { kind: "IdentifierName", name: sourceName };
  const integer = { kind: "PredefinedType", name: "int" } as const;
  const statements: CsharpStatement[] = [];
  for (const [armIndex, arm] of selected.arms.entries()) {
    const viewName = input.names.temporaryName("__tsonic_arrayView");
    const lengthName = input.names.temporaryName("__tsonic_arrayLength");
    const resultName = input.names.temporaryName("__tsonic_arrayResult");
    const indexName = input.names.temporaryName("__tsonic_arrayIndex");
    const valueName = input.names.temporaryName("__tsonic_arrayValue");
    const view: CsharpExpression = { kind: "IdentifierName", name: viewName };
    const length: CsharpExpression = { kind: "IdentifierName", name: lengthName };
    const result: CsharpExpression = { kind: "IdentifierName", name: resultName };
    const index: CsharpExpression = { kind: "IdentifierName", name: indexName };
    const value: CsharpExpression = { kind: "IdentifierName", name: valueName };
    const element = csharpTypeFromTargetTypeRef(arm.sourceElementType, input.scope.typeParameterNames);
    if (element === undefined) return failCsharpPlannerInvariant("A union-array copy requires each selected element carrier.", node);
    const conversionPrelude: CsharpStatement[] = [];
    const converted = applyCsharpConversionSelection(node, sourceFile, input, diagnostics,
      arm.sourceElementType, selected.targetElementType, arm.conversion, value, conversionPrelude, "stable");
    if (converted === undefined) return failCsharpPlannerInvariant("A union-array copy lost its admitted element conversion.", node);
    const branch: CsharpStatement[] = [
      { kind: "LocalDeclarationStatement", name: viewName, type: qualifiedCsharpType("Tsonic.CSharp.Js", "IArrayLike", [element]),
        initializer: runtimeUnionArmProjection(source, armIndex, selected.sourceType, false, input) },
      { kind: "LocalDeclarationStatement", name: lengthName, type: integer,
        initializer: { kind: "SimpleMemberAccessExpression", receiver: view, name: "Length" } },
      { kind: "LocalDeclarationStatement", name: resultName, type: resultType, initializer: {
        kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: resultType, name: "createWithCapacity" },
        arguments: [{ kind: "Argument", expression: length }] } },
      { kind: "ForStatement", initializer: { kind: "VariableDeclaration", locals: [{ kind: "VariableDeclarator", name: indexName,
        type: integer, initializer: { kind: "LiteralExpression", value: 0 } }] },
        condition: { kind: "BinaryExpression", left: index, operatorToken: { kind: "LessThanToken" }, right: length },
        incrementors: [{ kind: "PostfixUnaryExpression", operand: index, operatorToken: { kind: "PlusPlusToken" } }],
        body: { kind: "Block", statements: [
          { kind: "LocalDeclarationStatement", name: valueName, type: element },
          { kind: "IfStatement", condition: { kind: "PrefixUnaryExpression", operatorToken: { kind: "ExclamationToken" }, operand: {
            kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: view, name: "TryGet" },
            arguments: [{ kind: "Argument", expression: index }, { kind: "Argument", expression: value, passing: "out" }] } },
            thenBody: { kind: "Block", statements: [{ kind: "ThrowStatement", expression: { kind: "ObjectCreationExpression",
              type: qualifiedCsharpType("System", "InvalidOperationException"), arguments: [{ kind: "Argument",
                expression: { kind: "LiteralExpression", value: "Checked array density invariant violated." } }] } }] } },
          ...conversionPrelude,
          { kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", operatorToken: { kind: "EqualsToken" },
            left: { kind: "ElementAccessExpression", receiver: result, arguments: [index] }, right: converted } },
        ] } },
      { kind: "ReturnStatement", expression: result },
    ];
    if (armIndex === selected.arms.length - 1) statements.push(...branch);
    else statements.push({ kind: "IfStatement", condition: runtimeUnionArmTest(source, armIndex, selected.sourceType, input),
      thenBody: { kind: "Block", statements: branch } });
  }
  return planCsharpGeneratedMethodCall(node, "array_copy", resultType, [{ name: sourceName, type: sourceType }],
    { kind: "Block", statements }, arguments_, input, diagnostics);
}
