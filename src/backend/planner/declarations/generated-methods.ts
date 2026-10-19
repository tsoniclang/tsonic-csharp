import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpArgument, CsharpBlock, CsharpExpression, CsharpParameter, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import { planTypeParameters } from "../types/type-parameters.js";

export function planCsharpGeneratedMethodCall(
  node: Node,
  purpose: string,
  returnType: CsharpTypeNode,
  parameters: readonly CsharpParameter[],
  body: CsharpBlock,
  arguments_: readonly CsharpArgument[],
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const methods = input.scope.generatedMethods;
  if (methods === undefined || parameters.length !== arguments_.length) {
    return failCsharpPlannerInvariant("A generated native method lost its containing scope or exact constructed argument contract.", node);
  }
  const { ast } = input.program.source;
  const enclosing = input.program.names.generatedMethodTypeParameters.get(node);
  if (enclosing === undefined) return failCsharpPlannerInvariant(
    "A generated native method requires the sealed enclosing generic-name inventory.", node);
  const typeParameters = planTypeParameters(enclosing, input, diagnostics);
  const name = input.names.temporaryName(`__tsonic_${purpose}_${ast.pos(node)}_${ast.end(node)}`);
  methods.set(node, { kind: "MethodDeclaration", name, modifiers: ["private", "static"],
    typeParameters, returnType, parameters, body });
  return { kind: "InvocationExpression", callee: { kind: "IdentifierName", name,
    ...(typeParameters.length === 0 ? {} : { typeArguments: typeParameters.map(parameter => ({ kind: "IdentifierName" as const, name: parameter.name })) }) },
    arguments: arguments_ };
}
