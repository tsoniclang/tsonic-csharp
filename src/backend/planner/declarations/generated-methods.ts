import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpArgument, CsharpBlock, CsharpExpression, CsharpParameter, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { csharpSourceTypeParameters } from "../../../target-model/names/type-parameters.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
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
): CsharpExpression | undefined {
  const methods = input.scope.generatedMethods;
  if (methods === undefined || parameters.length !== arguments_.length) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "A generated native method requires its containing scope and exact argument contract."));
    return undefined;
  }
  const { ast } = input.program.source;
  const typeParameters = planTypeParameters(enclosingMethodTypeParameters(node, input), input, diagnostics);
  const name = input.names.temporaryName(`__tsonic_${purpose}_${ast.pos(node)}_${ast.end(node)}`);
  methods.set(node, { kind: "MethodDeclaration", name, modifiers: ["private", "static"],
    typeParameters, returnType, parameters, body });
  return { kind: "InvocationExpression", callee: { kind: "IdentifierName", name,
    ...(typeParameters.length === 0 ? {} : { typeArguments: typeParameters.map(parameter => ({ kind: "IdentifierName" as const, name: parameter.name })) }) },
    arguments: arguments_ };
}

function enclosingMethodTypeParameters(node: Node, input: CsharpPlanningContext): readonly Node[] {
  const { ast } = input.program.source;
  const parameters = new Map<string, Node>();
  for (let parent = ast.parent(node); parent !== undefined; parent = ast.parent(parent)) {
    if (ast.is.IsClassDeclaration(parent) || ast.is.IsClassExpression(parent)) break;
    for (const parameter of csharpSourceTypeParameters(parent, ast)) {
      if (parameter === undefined) continue;
      const selected = input.program.names.resolve(ast.name(parameter), parameter);
      if (selected.kind === "resolved" && !parameters.has(selected.name)) parameters.set(selected.name, parameter);
    }
  }
  return [...parameters.values()];
}
