import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpBlock, CsharpExpression, CsharpLambdaParameter, CsharpStatement } from "../../target-ast/roslyn/index.js";
import type { LambdaTargetContext } from "./expression-lambdas.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { withCsharpSafetyModifiers } from "../safety/explicit-safety.js";
import type { CsharpLambdaCreation } from "../../../analysis/callables/capture-storage.js";

export function planCsharpLocalLambdaCreation(
  node: Node, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
  target: LambdaTargetContext | undefined, name: string,
  parameters: readonly CsharpLambdaParameter[], body: CsharpBlock,
  asynchronous: boolean, creation: CsharpLambdaCreation,
): { readonly method: CsharpStatement; readonly value: CsharpExpression } | undefined {
  const returnType = target?.signature.returnTargetType === undefined ? undefined
    : csharpTypeFromTargetTypeRef(target.signature.returnTargetType, input.scope.typeParameterNames);
  const nativeParameters = parameters.map((parameter, index) => {
    const type = parameter.type ?? target?.signature.parameters[index];
    return type === undefined ? undefined : { name: parameter.name, type,
      ...(target?.signature.restParameterIndex === index ? { isParams: true } : {}) };
  });
  if (target === undefined || returnType === undefined || nativeParameters.some(parameter => parameter === undefined) ||
    creation.kind === "cached" && !creation.staticBody) {
    diagnostics.push(unsupportedNodeDiagnostic(node,
      "A native callable creation requires its exact delegate signature."));
    return undefined;
  }
  return {
    method: { kind: "LocalFunctionStatement", name, returnType,
      modifiers: withCsharpSafetyModifiers([
        ...(creation.staticBody ? ["static" as const] : []), ...(asynchronous ? ["async" as const] : []),
      ], node, "declaration", input),
      parameters: nativeParameters as NonNullable<typeof nativeParameters[number]>[], body },
    value: creation.kind === "cached"
      ? { kind: "CastExpression", type: target.type, expression: { kind: "IdentifierName", name } }
      : { kind: "ObjectCreationExpression", type: target.type,
        arguments: [{ kind: "Argument", expression: { kind: "IdentifierName", name } }] },
  };
}
