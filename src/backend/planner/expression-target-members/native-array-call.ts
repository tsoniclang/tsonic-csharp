import type {
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
} from "../../roslyn/syntax.js";
import type {
  CsharpTargetOperationFact,
} from "../../../source/csharp-facts.js";
import {
  AsCallExpression,
} from "../source-ast.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import type {
  CallArgumentPlanner,
} from "../expression-planner-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";

export function planNativeArrayCreationCall(
  node: Node,
  expression: NonNullable<ReturnType<typeof AsCallExpression>>,
  operation: Extract<CsharpTargetOperationFact, { readonly kind: "array-creation" }>,
  selectedTargetCall: NonNullable<ReturnType<TargetCompileInput["facts"]["getSelectedTargetCall"]>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const lengthArgumentNode = expression.Arguments?.Nodes?.[operation.lengthArgumentIndex];
  if (lengthArgumentNode === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# native array creation requires the finalized length argument."));
    return undefined;
  }
  const elementType = substituteSelectedTargetTypeParameters(operation.elementType, selectedTargetCall);
  const csharpElementType = csharpTypeFromTargetTypeRef(elementType);
  if (csharpElementType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "C# native array creation requires a renderable finalized array element target type."));
    return undefined;
  }
  const size = planCallArgument(lengthArgumentNode, sourceFile, input, diagnostics);
  if (size === undefined) {
    return undefined;
  }
  return {
    kind: "ArrayCreationExpression",
    elementType: csharpElementType,
    size: size.expression,
    elements: [],
  };
}

function substituteSelectedTargetTypeParameters(
  type: TargetTypeRef,
  selectedTargetCall: NonNullable<ReturnType<TargetCompileInput["facts"]["getSelectedTargetCall"]>>,
): TargetTypeRef {
  const substitutions = new Map<string, TargetTypeRef>();
  const typeParameters = selectedTargetCall.member.typeParameters ?? [];
  const typeArguments = selectedTargetCall.targetTypeArguments ?? [];
  for (let index = 0; index < typeParameters.length; index += 1) {
    const parameter = typeParameters[index];
    const argument = typeArguments[index];
    if (parameter !== undefined && argument !== undefined) {
      substitutions.set(parameter.name, argument);
    }
  }
  return substituteTargetTypeParameterReferences(type, substitutions);
}

function substituteTargetTypeParameterReferences(
  type: TargetTypeRef,
  substitutions: ReadonlyMap<string, TargetTypeRef>,
): TargetTypeRef {
  switch (type.kind) {
    case "type-parameter":
      return substitutions.get(type.name) ?? type;
    case "source-global":
    case "target-named":
      return {
        ...type,
        ...(type.typeArguments === undefined ? {} : { typeArguments: type.typeArguments.map((argument) => substituteTargetTypeParameterReferences(argument, substitutions)) }),
      };
    case "array":
      return { ...type, element: substituteTargetTypeParameterReferences(type.element, substitutions) };
    case "tuple":
      return { ...type, elements: type.elements.map((element) => substituteTargetTypeParameterReferences(element, substitutions)) };
    case "pointer":
      return { ...type, pointee: substituteTargetTypeParameterReferences(type.pointee, substitutions) };
    case "function-pointer":
      return {
        ...type,
        args: type.args.map((argument) => substituteTargetTypeParameterReferences(argument, substitutions)),
        result: substituteTargetTypeParameterReferences(type.result, substitutions),
      };
    case "associated-type":
      return { ...type, owner: substituteTargetTypeParameterReferences(type.owner, substitutions) };
    case "source-primitive":
    case "opaque":
    case "lifetime":
    case "target-specific":
      return type;
  }
}
