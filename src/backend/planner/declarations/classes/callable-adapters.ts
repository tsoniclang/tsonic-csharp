import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpMethodDeclaration, CsharpParameter } from "../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { isCsharpVoidTargetType } from "../../../../target-model/types/index.js";
import { planCsharpCallableArguments } from "../callables/parameter-adapters.js";
import { planParameters } from "../callables/parameters.js";
import { applyCsharpConversionSelection } from "../../expressions/conversions.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../../diagnostics.js";

export function planCsharpProjectCallableAdapters(
  node: Node, method: CsharpMethodDeclaration, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpMethodDeclaration[] {
  const dispatch = input.program.callableAdapters.get(node);
  if (dispatch === undefined) return [];
  const methods: CsharpMethodDeclaration[] = [];
  for (const adapter of dispatch.adapters) {
    const parameters = planParameters(adapter.contract.parameters.map(parameter => parameter.sourceParameter), sourceFile, input, diagnostics);
    const rendered = adapter.contract.parameters.map((parameter, index): CsharpParameter | undefined => {
      const type = csharpTypeFromTargetTypeRef(parameter.targetParameter.type, input.scope.typeParameterNames);
      return type === undefined || parameters[index] === undefined ? undefined : { ...parameters[index]!, type };
    });
    const returnType = csharpTypeFromTargetTypeRef(adapter.contract.returnType, input.scope.typeParameterNames);
    const interfaceType = adapter.interfaceType === undefined ? undefined : csharpTypeFromTargetTypeRef(adapter.interfaceType, input.scope.typeParameterNames);
    if (rendered.some(parameter => parameter === undefined) || returnType === undefined || adapter.interfaceType !== undefined && interfaceType === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "A sealed callable adapter has an unrenderable native signature."));
      continue;
    }
    const planned = planCsharpCallableArguments(node, adapter.contract, rendered as CsharpParameter[], method.parameters,
      adapter.parameters, sourceFile, input, diagnostics);
    if (planned === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(node, "A sealed callable adapter has an invalid logical argument stream."));
      continue;
    }
    const call: CsharpExpression = { kind: "InvocationExpression", callee: {
      kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name: method.name,
      ...((method.typeParameters?.length ?? 0) === 0 ? {} : { typeArguments: method.typeParameters!.map(parameter => ({ kind: "IdentifierName" as const, name: parameter.name })) }),
    }, arguments: planned.arguments.map(expression => ({ kind: "Argument", expression })) };
    const value = applyCsharpConversionSelection(node, sourceFile, input, diagnostics, adapter.result.source,
      adapter.result.target, adapter.result.conversion, call);
    if (value === undefined) continue;
    methods.push({ kind: "MethodDeclaration", name: method.name,
      modifiers: interfaceType === undefined ? ["public", "override"] : [],
      ...(interfaceType === undefined ? {} : { explicitInterface: interfaceType }),
      typeParameters: method.typeParameters?.map(parameter => ({ name: parameter.name })),
      returnType, parameters: rendered as CsharpParameter[],
      body: { kind: "Block", statements: [...planned.statements, isCsharpVoidTargetType(adapter.contract.returnType)
        ? { kind: "ExpressionStatement", expression: value } : { kind: "ReturnStatement", expression: value }] } });
  }
  return methods;
}
