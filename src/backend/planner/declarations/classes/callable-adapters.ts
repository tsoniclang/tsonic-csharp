import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpMethodDeclaration, CsharpParameter } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { isCsharpVoidTargetType } from "../../../../target-model/types/index.js";
import { planCsharpCallableArguments } from "../callables/parameter-adapters.js";
import { applyCsharpConversionSelection } from "../../expressions/conversions.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";

export function planCsharpProjectCallableAdapters(
  node: Node, method: CsharpMethodDeclaration, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): readonly CsharpMethodDeclaration[] {
  const dispatch = input.program.records.callableDispatch.get(node);
  if (dispatch?.kind !== "method") failCsharpPlannerInvariant("An admitted method lost its exact native adapter contract.", node);
  const methods: CsharpMethodDeclaration[] = [];
  for (const adapter of dispatch.adapters) {
    const returnType = csharpTypeFromTargetTypeRef(adapter.contract.returnType, input.scope.typeParameterNames);
    const rendered = adapter.contract.parameters.map(({ sourceParameter, targetParameter }): CsharpParameter | undefined => {
      const type = csharpTypeFromTargetTypeRef(targetParameter.type, input.scope.typeParameterNames);
      if (type === undefined) return undefined;
      const passing = targetParameter.passingMode === "byref-readwrite" ? "ref"
        : targetParameter.passingMode === "byref-readonly" ? "in"
        : targetParameter.passingMode === "byref-writeonly-must-init" ? "out" : undefined;
      const omission = input.program.records.runtimeDefault.get(sourceParameter);
      return { name: input.names.temporaryName(targetParameter.name), type,
        ...(passing === undefined ? {} : { passing }),
        ...(targetParameter.paramsArray ? { isParams: true } : {}),
        ...((omission?.acceptsOmission ?? targetParameter.optional)
          ? { defaultValue: omission?.kind === "nullable" ? { kind: "LiteralExpression", value: null } as const
            : { kind: "DefaultExpression", type } as const } : {}),
      };
    });
    if (rendered.some(parameter => parameter === undefined) || returnType === undefined) {
      failCsharpPlannerInvariant("An admitted native adapter lost its renderable physical signature.", node);
    }
    const planned = planCsharpCallableArguments(node, adapter.contract, rendered as CsharpParameter[], method.parameters,
      adapter.parameters, sourceFile, input, diagnostics);
    if (planned === undefined) {
      failCsharpPlannerInvariant("An admitted native adapter lost its exact logical argument stream.", node);
    }
    const call: CsharpExpression = { kind: "InvocationExpression", callee: {
      kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name: method.name,
      ...((method.typeParameters?.length ?? 0) === 0 ? {} : { typeArguments: method.typeParameters!.map(parameter => ({ kind: "IdentifierName" as const, name: parameter.name })) }),
    }, arguments: planned.arguments.map((expression, index) => ({ kind: "Argument", expression,
      passing: method.parameters[index]?.passing })) };
    const value = applyCsharpConversionSelection(node, sourceFile, input, diagnostics, adapter.result.source,
      adapter.result.target, adapter.result.conversion, call);
    if (value === undefined) failCsharpPlannerInvariant("An admitted native adapter requires its exact return conversion plan.", node);
    methods.push({ kind: "MethodDeclaration", name: method.name,
      modifiers: ["public", "override"],
      typeParameters: method.typeParameters?.map(parameter => ({ name: parameter.name })),
      returnType, parameters: rendered as CsharpParameter[],
      body: { kind: "Block", statements: [...planned.statements, isCsharpVoidTargetType(adapter.contract.returnType)
        ? { kind: "ExpressionStatement", expression: value } : { kind: "ReturnStatement", expression: value }] } });
  }
  return methods;
}
