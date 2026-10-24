import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact, CsharpTargetParameter } from "../../../../target-model/types/model.js";
import { isCsharpVoidTargetType } from "../../../../target-model/types/identity.js";
import type { CsharpExpression, CsharpParameter, CsharpTypeMember } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { csharpTypeFromTargetTypeRef } from "../../types/render.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import { planCsharpCallableArguments } from "../callables/parameter-adapters.js";
import { applyCsharpConversionSelection } from "../../expressions/conversions.js";

export function planCsharpStructuralInterfaceMembers(
  shape: CsharpObjectShapeFact,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): readonly CsharpTypeMember[] {
  const result: CsharpTypeMember[] = [];
  const implementations = input.program.records.structuralInterface.get(shape.targetType);
  if (implementations === undefined) failCsharpPlannerInvariant("An admitted structural shape requires its native interface forwarding records.");
  for (const implementation of implementations) {
    const explicitInterface = csharpTypeFromTargetTypeRef(implementation.interfaceType, input.scope.typeParameterNames);
    for (const property of implementation.properties) {
      const sourceFile = input.program.source.ast.getSourceFile(implementation.sourceNode);
      if (sourceFile === undefined) return failCsharpPlannerInvariant(
        "An admitted structural interface property lost its checked source declaration file.", implementation.sourceNode);
      const type = csharpTypeFromTargetTypeRef(property.member.type, input.scope.typeParameterNames);
      if (explicitInterface === undefined || type === undefined) {
        return failCsharpPlannerInvariant("An admitted structural property lost its exact native forwarding type.", implementation.sourceNode);
      }
      const access: CsharpExpression = { kind: "SimpleMemberAccessExpression",
        receiver: { kind: "IdentifierName", name: "this" }, name: property.sourceName };
      const value = applyCsharpConversionSelection(implementation.sourceNode, sourceFile, input, diagnostics,
        property.read.source, property.read.target, property.read.conversion, access);
      if (value === undefined) failCsharpPlannerInvariant("An admitted structural property requires its native forwarding value.", implementation.sourceNode);
      result.push({ kind: "PropertyDeclaration", name: property.member.targetName, explicitInterface, modifiers: [], type,
        getter: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: value }] },
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
      const binders = forwarding.typeParameters;
      const methodNames = method.typeParameterNames.map(parameter => [parameter.identity, parameter.name] as const);
      const methodInput = binders.length === 0 ? input : { ...input, scope: { ...input.scope,
        typeParameterNames: new Map([...input.scope.typeParameterNames ?? [], ...methodNames]) } };
      const returnType = csharpTypeFromTargetTypeRef(forwarding.contract.returnType, methodInput.scope.typeParameterNames);
      const typeArguments = forwarding.typeArguments.map(type => csharpTypeFromTargetTypeRef(type, methodInput.scope.typeParameterNames));
      const parameters = forwarding.contract.nativeParameters.map(parameter => renderParameter(parameter.targetParameter, methodInput));
      const incoming = forwarding.implementation.nativeParameters.map((parameter, index): CsharpParameter | undefined => {
        const selected = renderParameter(parameter.targetParameter, methodInput);
        if (selected === undefined || parameter.targetParameter.optional !== true) return selected;
        return { ...selected, defaultValue: forwarding.parameterDefaults[index]?.kind === "nullable"
          ? { kind: "LiteralExpression", value: null } : { kind: "DefaultExpression", type: selected.type } };
      });
      if (explicitInterface === undefined || returnType === undefined || parameters.some(parameter => parameter === undefined) ||
        incoming.some(parameter => parameter === undefined) || typeArguments.some(type => type === undefined)) {
        return failCsharpPlannerInvariant("An admitted structural method lost its exact native forwarding signature.", method.declaration);
      }
      const planned = planCsharpCallableArguments(method.declaration, forwarding.contract, parameters as CsharpParameter[],
        incoming as CsharpParameter[], forwarding.parameters, sourceFile, methodInput, diagnostics);
      if (planned === undefined) {
        return failCsharpPlannerInvariant("An admitted structural method lost its canonical native argument adaptation.", method.declaration);
      }
      const typeParameters = binders.map(parameter => {
        const rendered = csharpTypeFromTargetTypeRef({
          kind: "type-parameter", identity: parameter.identity, name: parameter.name,
        }, methodInput.scope.typeParameterNames);
        if (rendered?.kind !== "IdentifierName") return failCsharpPlannerInvariant(
          "An admitted structural method binder has no native identifier rendering.", parameter.csharpDeclaration ?? method.declaration);
        return { name: rendered.name };
      });
      for (const invocation of method.invocations) {
        const call: CsharpExpression = { kind: "InvocationExpression", callee: {
          kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name: invocation.sourceName,
          ...(typeArguments.length === 0 ? {} : { typeArguments: typeArguments as NonNullable<typeof typeArguments[number]>[] }),
        }, arguments: planned.arguments.map((expression, index) => ({ kind: "Argument", expression,
          ...(incoming[index]?.passing === undefined ? {} : { passing: incoming[index]!.passing }) })) };
        const value = applyCsharpConversionSelection(method.declaration, sourceFile, methodInput, diagnostics,
          forwarding.result.source, forwarding.result.target, forwarding.result.conversion, call);
        if (value === undefined) failCsharpPlannerInvariant("An admitted structural method requires its native forwarding result.", method.declaration);
        result.push({ kind: "MethodDeclaration", name: invocation.name, explicitInterface, modifiers: [], returnType,
          parameters: parameters as CsharpParameter[],
          ...(typeParameters.length === 0 ? {} : { typeParameters }),
          body: { kind: "Block", statements: [...planned.statements, isCsharpVoidTargetType(forwarding.contract.returnType)
            ? { kind: "ExpressionStatement", expression: value } : { kind: "ReturnStatement", expression: value }] },
        });
      }
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
