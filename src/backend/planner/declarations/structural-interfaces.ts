import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/delegates.js";
import type { CsharpExpression, CsharpTypeMember } from "../../target-ast/roslyn/index.js";
import type { CsharpPlanningContext } from "../context.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import { planParametersWithPrelude } from "../bindings/parameters.js";

export function planCsharpStructuralInterfaceMethods(
  shape: CsharpObjectShapeFact, node: Node,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): readonly CsharpTypeMember[] {
  const result: CsharpTypeMember[] = [];
  for (const implementation of input.program.objectShapes.structuralImplementations(shape.targetType)) {
    const explicitInterface = csharpTypeFromTargetTypeRef(implementation.interfaceType);
    for (const method of implementation.methods) {
      const sourceFile = input.program.source.ast.getSourceFile(method.declaration);
      if (sourceFile === undefined) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "An analyzed interface method lost its source declaration file."));
        continue;
      }
      const original = planParametersWithPrelude(input.program.source.ast.parameters(method.declaration),
        sourceFile, input, diagnostics);
      const signature = getCsharpDelegateSignature(method.member.type);
      const returnType = signature === undefined ? undefined : csharpTypeFromTargetTypeRef(signature.returnType);
      const parameters = signature?.parameters.map((type, index) => ({ name: `argument${index}`, type: csharpTypeFromTargetTypeRef(type) }));
      if (explicitInterface === undefined || returnType === undefined || parameters === undefined || original.prelude.length !== 0 ||
        parameters.some(parameter => parameter.type === undefined) || original.parameters.length !== parameters.length ||
        method.defaultArguments.some(index => original.parameters[index]?.defaultValue === undefined)) {
        diagnostics.push(unsupportedNodeDiagnostic(node, "An analyzed interface method has no exact native forwarding signature."));
        continue;
      }
      const call: CsharpExpression = { kind: "InvocationExpression", callee: {
        kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "this" }, name: method.sourceName,
      }, arguments: parameters.map((parameter, index) => ({ kind: "Argument", expression: method.defaultArguments.includes(index)
        ? { kind: "BinaryExpression", operatorToken: { kind: "QuestionQuestionToken" },
          left: { kind: "IdentifierName", name: parameter.name }, right: original.parameters[index]!.defaultValue! }
        : { kind: "IdentifierName", name: parameter.name } })) };
      result.push({ kind: "MethodDeclaration", name: method.member.targetName, explicitInterface, modifiers: [], returnType,
        parameters: parameters.map(parameter => ({ name: parameter.name, type: parameter.type! })),
        body: { kind: "Block", statements: [returnType.kind === "PredefinedType" && returnType.name === "void"
          ? { kind: "ExpressionStatement", expression: call } : { kind: "ReturnStatement", expression: call }] },
      });
    }
  }
  return result;
}
