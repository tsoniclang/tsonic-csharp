import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCallClassification, ResolvedSourceCallInfo } from "../../../../../analysis/operations/index.js";
import { csharpTargetParameterValueType } from "../../../../../target-model/types/member-facts.js";
import { isCsharpVoidTargetType } from "../../../../../target-model/types/identity.js";
import type { CsharpArgument, CsharpExpression, CsharpMethodDeclaration, CsharpStatement, CsharpTypeNode } from "../../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../../../types/target-types.js";
import { planTypeParameters } from "../../../types/type-parameters.js";
import { renderCsharpTargetTypeArguments } from "./helpers.js";

export function planCsharpUnionDispatcherCall(
  node: Node,
  source: ResolvedSourceCallInfo,
  classification: CsharpCallClassification,
  receiver: CsharpExpression,
  arguments_: readonly CsharpArgument[],
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const union = classification.unionCall;
  if (union.kind !== "resolved") return undefined;
  const methods = input.scope.generatedMethods;
  const receiverType = csharpTypeFromTargetTypeRef(union.receiverType);
  const resultType = csharpTypeFromTargetTypeRef(union.resultType);
  const selectedTypeArguments = classification.sourceTypeArguments === undefined ? undefined
    : renderCsharpTargetTypeArguments(classification.sourceTypeArguments, node, diagnostics);
  const argumentTypes = source.sourceArguments.map((_, index): CsharpTypeNode | undefined => {
    const bindings = source.sourceArgumentBindings.filter(binding => binding.sourceArgumentIndex === index);
    const binding = bindings[0];
    const bindingIndex = binding === undefined ? -1 : source.sourceArgumentBindings.indexOf(binding);
    const type = classification.sourceArgumentParameterTypes?.[bindingIndex];
    const parameter = binding === undefined ? undefined : source.sourceSelectedSignatureParameters[binding.sourceParameterIndex];
    if (binding === undefined || parameter === undefined || type === undefined || bindings.some(other =>
      other.sourceParameterIndex !== binding.sourceParameterIndex || other.sourceForm !== binding.sourceForm)) return undefined;
    return csharpTypeFromTargetTypeRef(csharpTargetParameterValueType({
      name: parameter.parameterName,
      type,
      passingMode: "by-value",
      ...(parameter.rest ? { paramsArray: true } : {}),
    }, binding.sourceForm));
  });
  if (methods === undefined || receiverType === undefined || resultType === undefined ||
    selectedTypeArguments === undefined || arguments_.length !== argumentTypes.length || argumentTypes.some(type => type === undefined)) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "A closed union dispatcher requires exact native receiver, argument, result and containing-type contracts."));
    return undefined;
  }
  const { ast } = input.program.source;
  const typeParameters = planTypeParameters(enclosingMethodTypeParameters(node, input), input, diagnostics);
  const name = input.names.temporaryName(`__tsonic_union_call_${ast.pos(node)}_${ast.end(node)}`);
  const forwarded: readonly CsharpArgument[] = argumentTypes.map((_, index) => ({
    kind: "Argument", expression: { kind: "IdentifierName", name: `argument${index}` },
  }));
  const statements: CsharpStatement[] = [];
  for (const [index, method] of union.methods.entries()) {
    const invocation: CsharpExpression = {
      kind: "InvocationExpression",
      callee: {
        kind: "SimpleMemberAccessExpression",
        receiver: { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "receiver" }, name: `As${index + 1}` },
        name: method.targetName,
        ...(selectedTypeArguments.length === 0 ? {} : { typeArguments: selectedTypeArguments }),
      },
      arguments: forwarded,
    };
    const branch: readonly CsharpStatement[] = isCsharpVoidTargetType(union.resultType)
      ? [{ kind: "ExpressionStatement", expression: invocation }, { kind: "ReturnStatement" }]
      : [{ kind: "ReturnStatement", expression: invocation }];
    if (index === union.methods.length - 1) statements.push(...branch);
    else statements.push({
      kind: "IfStatement",
      condition: { kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "receiver" }, name: `Is${index + 1}` },
      thenBody: { kind: "Block", statements: branch },
    });
  }
  const declaration: CsharpMethodDeclaration = {
    kind: "MethodDeclaration", name, modifiers: ["private", "static"],
    typeParameters, returnType: resultType,
    parameters: [{ name: "receiver", type: receiverType }, ...argumentTypes.map((type, index) => ({ name: `argument${index}`, type: type! }))],
    body: { kind: "Block", statements },
  };
  methods.set(node, declaration);
  return {
    kind: "InvocationExpression",
    callee: { kind: "IdentifierName", name, ...(typeParameters.length === 0 ? {} : {
      typeArguments: typeParameters.map(parameter => ({ kind: "IdentifierName" as const, name: parameter.name })),
    }) },
    arguments: [{ kind: "Argument", expression: receiver }, ...arguments_],
  };
}

function enclosingMethodTypeParameters(node: Node, input: CsharpPlanningContext): readonly Node[] {
  const { ast } = input.program.source;
  const parameters = new Map<string, Node>();
  for (let parent = ast.parent(node); parent !== undefined; parent = ast.parent(parent)) {
    if (ast.is.IsClassDeclaration(parent) || ast.is.IsClassExpression(parent)) break;
    for (const parameter of ast.typeParameters(parent)) {
      if (parameter === undefined) continue;
      const name = ast.text(ast.name(parameter));
      if (!parameters.has(name)) parameters.set(name, parameter);
    }
  }
  return [...parameters.values()];
}
