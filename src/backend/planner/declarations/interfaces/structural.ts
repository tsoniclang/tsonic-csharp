import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact, CsharpTargetParameter } from "../../../../target-model/types/model.js";
import { isCsharpVoidTargetType } from "../../../../target-model/types/identity.js";
import type { CsharpExpression, CsharpParameter, CsharpTypeMember } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { failCsharpPlannerInvariant, unsupportedNodeDiagnostic } from "../../diagnostics.js";
import { planCsharpCallableArguments } from "../callables/parameter-adapters.js";
import { applyCsharpConversionSelection } from "../../expressions/conversions.js";

export function planCsharpStructuralInterfaceMembers(
  shape: CsharpObjectShapeFact, node: Node,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): readonly CsharpTypeMember[] {
  const result: CsharpTypeMember[] = [];
  for (const implementation of input.program.objectShapes.structuralImplementations(shape.targetType)) {
    const explicitInterface = csharpTypeFromTargetTypeRef(implementation.interfaceType, input.scope.typeParameterNames);
    for (const property of implementation.properties) {
      const type = csharpTypeFromTargetTypeRef(property.member.type, input.scope.typeParameterNames);
      if (explicitInterface === undefined || type === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "An analyzed interface property has no exact native forwarding type."));
        continue;
      }
      const access: CsharpExpression = { kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "this" }, name: property.sourceName };
      result.push({ kind: "PropertyDeclaration", name: property.member.targetName, explicitInterface, modifiers: [], type,
        getter: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: access }] },
        ...(property.member.readonly === true || property.member.accessor?.setter === false ? {} : {
          setter: { kind: "Block" as const, statements: [{ kind: "ExpressionStatement" as const, expression: {
            kind: "AssignmentExpression" as const, operatorToken: { kind: "EqualsToken" as const }, left: access,
            right: { kind: "IdentifierName" as const, name: "value" },
          } }] },
        }),
      });
    }
    for (const method of implementation.methods) {
      const sourceFile = input.program.source.ast.getSourceFile(method.declaration);
      if (sourceFile === undefined) {
        return failCsharpPlannerInvariant("An admitted structural interface method lost its checked source declaration file.",
          method.declaration);
      }
      const { forwarding } = method;
      const returnType = csharpTypeFromTargetTypeRef(forwarding.contract.returnType, input.scope.typeParameterNames);
      const parameters = forwarding.contract.parameters.map(parameter => renderParameter(parameter.targetParameter, input));
      const incoming = forwarding.implementation.parameters.map((parameter, index): CsharpParameter | undefined => {
        const selected = renderParameter(parameter.targetParameter, input);
        if (selected === undefined || parameter.targetParameter.optional !== true) return selected;
        return { ...selected, defaultValue: forwarding.parameterDefaults[index]?.kind === "nullable"
          ? { kind: "LiteralExpression", value: null } : { kind: "DefaultExpression", type: selected.type } };
      });
      if (explicitInterface === undefined || returnType === undefined || parameters.some(parameter => parameter === undefined) ||
        incoming.some(parameter => parameter === undefined)) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "An analyzed interface method has no exact native forwarding signature."));
        continue;
      }
      const planned = planCsharpCallableArguments(method.declaration, forwarding.contract, parameters as CsharpParameter[],
        incoming as CsharpParameter[], forwarding.parameters, sourceFile, input, diagnostics);
      if (planned === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "An analyzed interface method has no renderable selected native arguments."));
        continue;
      }
      const call: CsharpExpression = { kind: "InvocationExpression", callee: {
        kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name: method.sourceName,
      }, arguments: planned.arguments.map((expression, index) => ({ kind: "Argument", expression,
        ...(incoming[index]?.passing === undefined ? {} : { passing: incoming[index]!.passing }) })) };
      const value = applyCsharpConversionSelection(method.declaration, sourceFile, input, diagnostics,
        forwarding.result.source, forwarding.result.target, forwarding.result.conversion, call);
      if (value === undefined) continue;
      const typeParameters = (method.member.typeParameters ?? []).map(parameter => {
        const rendered = csharpTypeFromTargetTypeRef({
          kind: "type-parameter", identity: parameter.identity, name: parameter.name,
        }, input.scope.typeParameterNames);
        if (rendered?.kind !== "IdentifierName") return failCsharpPlannerInvariant(
          "An admitted structural method binder has no native identifier rendering.", parameter.declaration);
        return { name: rendered.name };
      });
      result.push({ kind: "MethodDeclaration", name: method.member.targetName, explicitInterface, modifiers: [], returnType,
        parameters: parameters as CsharpParameter[],
        ...(typeParameters.length === 0 ? {} : { typeParameters }),
        body: { kind: "Block", statements: [...planned.statements, isCsharpVoidTargetType(forwarding.contract.returnType)
          ? { kind: "ExpressionStatement", expression: value } : { kind: "ReturnStatement", expression: value }] },
      });
    }
  }
  return result;
}

function renderParameter(parameter: CsharpTargetParameter, input: CsharpPlanningContext): CsharpParameter | undefined {
  const type = csharpTypeFromTargetTypeRef(parameter.type, input.scope.typeParameterNames);
  return type === undefined ? undefined : { name: parameter.name, type,
    ...(parameter.paramsArray === true ? { isParams: true } : {}),
    ...(parameter.passingMode === "by-value" ? {} : { passing: parameter.passingMode === "byref-readonly" ? "in"
      : parameter.passingMode === "byref-readwrite" ? "ref" : "out" }),
  };
}
