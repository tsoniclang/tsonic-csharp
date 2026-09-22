import type { Node } from "@tsonic/tsts";
import { csharpSourceTypeParameters } from "../../../../../target-model/names/type-parameters.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCallClassification, ResolvedSourceCallInfo } from "../../../../../analysis/operations/index.js";
import { isCsharpVoidTargetType } from "../../../../../target-model/types/identity.js";
import type { CsharpArgument, CsharpExpression, CsharpMethodDeclaration, CsharpStatement } from "../../../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../../../context.js";
import { unsupportedNodeDiagnostic } from "../../../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../../../types/target-types.js";
import { planTypeParameters } from "../../../types/type-parameters.js";
import { renderCsharpTargetTypeArguments } from "./helpers.js";
import { runtimeUnionArmProjection, runtimeUnionArmTest } from "../../runtime-union-projections.js";
import { csharpSourceArgumentGroups } from "./source-argument-groups.js";

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
  const groups = csharpSourceArgumentGroups(source, classification);
  const argumentTypes = groups?.map(group => csharpTypeFromTargetTypeRef(group.type));
  if (methods === undefined || receiverType === undefined || resultType === undefined ||
    selectedTypeArguments === undefined || argumentTypes === undefined || arguments_.length !== argumentTypes.length || argumentTypes.some(type => type === undefined)) {
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
        receiver: runtimeUnionArmProjection({ kind: "IdentifierName", name: "receiver" }, index),
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
      condition: runtimeUnionArmTest({ kind: "IdentifierName", name: "receiver" }, index),
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
    for (const parameter of csharpSourceTypeParameters(parent, ast)) {
      if (parameter === undefined) continue;
      const selected = input.program.names.resolve(ast.name(parameter), parameter);
      if (selected.kind === "resolved" && !parameters.has(selected.name)) parameters.set(selected.name, parameter);
    }
  }
  return [...parameters.values()];
}
