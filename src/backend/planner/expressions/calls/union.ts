import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpArgument, CsharpExpression, CsharpStatement } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../../types/render.js";
import { planCsharpGeneratedMethodCall } from "../../declarations/generated-methods.js";
import { renderCsharpTargetTypeArguments } from "./helpers.js";
import { runtimeUnionArmProjection, runtimeUnionArmTest } from "../union-access.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { applyCsharpConversionSelection } from "../conversions.js";

export function planCsharpUnionDispatcherCall(
  node: Node,
  receiver: CsharpExpression,
  arguments_: readonly CsharpArgument[],
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const selected = input.program.records.sourceCallEmission.get(node);
  if (selected?.kind !== "union") failCsharpPlannerInvariant("An admitted union dispatcher requires its exact native call plan.", node);
  const union = selected.union;
  const methods = input.scope.generatedMethods;
  const receiverType = csharpTypeFromTargetTypeRef(union.receiverType, input.scope.typeParameterNames);
  const resultType = csharpTypeFromTargetTypeRef(union.resultType, input.scope.typeParameterNames);
  const selectedTypeArguments = renderCsharpTargetTypeArguments(input.scope.typeParameterNames, selected.typeArguments, node, diagnostics);
  const argumentTypes = selected.parameters.map(type => csharpTypeFromTargetTypeRef(type, input.scope.typeParameterNames));
  if (methods === undefined || receiverType === undefined || resultType === undefined ||
    selectedTypeArguments === undefined || argumentTypes === undefined || arguments_.length !== argumentTypes.length || argumentTypes.some(type => type === undefined)) {
    failCsharpPlannerInvariant("An admitted union dispatcher requires its exact native receiver, argument, result and containing-type contracts.", node);
  }
  const forwarded: readonly CsharpArgument[] = argumentTypes.map((_, index) => ({
    kind: "Argument", expression: { kind: "IdentifierName", name: `argument${index}` },
  }));
  const statements: CsharpStatement[] = [];
  const sourceFile = input.program.source.ast.getSourceFile(node);
  if (sourceFile === undefined) failCsharpPlannerInvariant("An admitted union dispatcher requires its original checked source owner.", node);
  for (const [index, method] of union.methods.entries()) {
    const invocation: CsharpExpression = {
      kind: "InvocationExpression",
      callee: {
        kind: "SimpleMemberAccessExpression",
        receiver: runtimeUnionArmProjection({ kind: "IdentifierName", name: "receiver" }, index, union.receiverType, false, input),
        name: method.targetName,
        ...(selectedTypeArguments.length === 0 ? {} : { typeArguments: selectedTypeArguments }),
      },
      arguments: forwarded,
    };
    const result = method.result;
    if (result.completion !== undefined && result.completion.form !== "direct" &&
      !targetTypeRefEquals(result.nativeType, result.selectedType)) {
      failCsharpPlannerInvariant("A deferred union-arm Promise completion must retain its exact physical Task carrier.", node);
    }
    const completed: CsharpExpression = result.completion?.form === "direct" ? {
      kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: {
        kind: "SimpleMemberAccessExpression", receiver: {
          kind: "AliasQualifiedName", alias: "global", name: { kind: "QualifiedName", left: {
            kind: "QualifiedName", left: { kind: "IdentifierName", name: "System" }, name: "Threading",
          }, name: "Tasks" },
        }, name: "TaskExtensions",
      }, name: "Unwrap" }, arguments: [{ kind: "Argument", expression: invocation }],
    } : invocation;
    const prelude: CsharpStatement[] = [];
    const converted = applyCsharpConversionSelection(node, sourceFile, input, diagnostics,
      result.selectedType, union.resultType, method.conversion, completed, prelude, "snapshot");
    if (converted === undefined) return undefined;
    const branch: readonly CsharpStatement[] = selected.void
      ? [...prelude, { kind: "ExpressionStatement", expression: converted }, { kind: "ReturnStatement" }]
      : [...prelude, { kind: "ReturnStatement", expression: converted }];
    if (index === union.methods.length - 1) statements.push(...branch);
    else statements.push({
      kind: "IfStatement",
      condition: runtimeUnionArmTest({ kind: "IdentifierName", name: "receiver" }, index, union.receiverType, input),
      thenBody: { kind: "Block", statements: branch },
    });
  }
  return planCsharpGeneratedMethodCall(node, "union_call", resultType,
    [{ name: "receiver", type: receiverType }, ...argumentTypes.map((type, index) => ({ name: `argument${index}`, type: type! }))],
    { kind: "Block", statements }, [{ kind: "Argument", expression: receiver }, ...arguments_], input, diagnostics);
}
