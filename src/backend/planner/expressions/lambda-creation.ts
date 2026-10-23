import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpBlock, CsharpExpression, CsharpLambdaParameter, CsharpStatement } from "../../target-ast/syntax/index.js";
import type { LambdaTargetContext } from "./callable.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { withCsharpSafetyModifiers } from "../safety/explicit-safety.js";
import type { CsharpLambdaCreation } from "../../../target-model/records/capture-storage.js";
import { plannedCsharpValueParameterNodes } from "../bindings/index.js";

export function planCsharpLocalLambdaCreation(
  node: Node, input: CsharpPlanningContext, _diagnostics: TargetDiagnostic[],
  target: LambdaTargetContext | undefined, name: string,
  parameters: readonly CsharpLambdaParameter[], body: CsharpBlock,
  asynchronous: boolean, creation: CsharpLambdaCreation,
): { readonly method: CsharpStatement; readonly value: CsharpExpression } | undefined {
  const returnType = target?.signature.returnTargetType === undefined ? undefined
    : csharpTypeFromTargetTypeRef(target.signature.returnTargetType, input.scope.typeParameterNames);
  const self = input.program.records.namedSelf.get(node);
  const authoredParameterCount = plannedCsharpValueParameterNodes(input.program.source.ast.parameters(node), input).length;
  const nativeParameters = parameters.map((parameter, index) => {
    const type = parameter.type ?? target?.signature.parameters[index];
    return type === undefined ? undefined : { name: parameter.name, type,
      ...(target?.signature.restParameterIndex === index ? { isParams: true }
        : self !== undefined && self.values.length === 0 && index >= authoredParameterCount
          ? { defaultValue: { kind: "DefaultExpression" as const, type, nullForgiving: true } } : {}) };
  });
  if (target === undefined || returnType === undefined || nativeParameters.some(parameter => parameter === undefined)) {
    failCsharpPlannerInvariant("An admitted native callable creation requires its exact delegate signature.", node);
  }
  return {
    method: { kind: "LocalFunctionStatement", name, returnType,
      modifiers: withCsharpSafetyModifiers([
        ...(creation.staticBody ? ["static" as const] : []), ...(asynchronous ? ["async" as const] : []),
      ], node, "declaration", input),
      parameters: nativeParameters as NonNullable<typeof nativeParameters[number]>[], body },
    value: creation.kind === "direct"
      ? { kind: "IdentifierName", name }
      : creation.kind === "cached"
      ? { kind: "CastExpression", type: target.type, expression: { kind: "IdentifierName", name } }
      : { kind: "ObjectCreationExpression", type: target.type,
        arguments: [{ kind: "Argument", expression: { kind: "IdentifierName", name } }] },
  };
}
