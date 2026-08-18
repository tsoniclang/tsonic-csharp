import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  createCsharpScopedTranslationContext,
  createCsharpThisBindingTranslationContext,
} from "../../translate/context/index.js";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import {
  csharpDelegateTargetType,
} from "../../policy/types/index.js";
import type {
  CsharpObjectShapeFact,
} from "../../policy/types/index.js";
import type {
  CsharpExpression,
  CsharpObjectInitializerAssignment,
} from "../roslyn/syntax.js";
import {
  allocateSyntheticParameter,
  createDestructuringPlannerState,
} from "./bindings.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  lambdaTargetContextFromTargetRef,
  planLambdaBlockBody,
  planLambdaParameters,
} from "./expression-lambdas.js";
import {
  findObjectShapeMember,
  getObjectLiteralPropertySourceName,
} from "./expression-object-literal-support.js";
import {
  objectShapeAccessorGetterStorageMemberName,
  objectShapeAccessorSetterStorageMemberName,
} from "./object-shapes.js";
import {
  AsGetAccessorDeclaration,
  AsParameterDeclaration,
  AsSetAccessorDeclaration,
  KindGetAccessor,
  SourceKind,
} from "./source-ast.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

export function planObjectShapeAccessorMemberAssignment(
  accessorNode: Node,
  objectShape: CsharpObjectShapeFact,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): CsharpObjectInitializerAssignment | undefined {
  const sourceName = getObjectLiteralPropertySourceName(
    accessorNode,
    input,
    diagnostics,
  );
  const member = sourceName === undefined
    ? undefined
    : findObjectShapeMember(objectShape, sourceName);
  const getter = SourceKind(input.ast, accessorNode) === KindGetAccessor;
  if (member?.accessor === undefined ||
    (!getter && member.accessor.setter !== true)) {
    diagnostics.push(unsupportedNodeDiagnostic(
      accessorNode,
      "Object-literal accessor must match one exact finalized accessor-shape member.",
    ));
    return undefined;
  }
  const selfType = csharpTypeFromTargetTypeRef(objectShape.targetType);
  if (selfType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      accessorNode,
      `Object-shape accessor '${member.sourceName}' has no renderable receiver carrier.`,
    ));
    return undefined;
  }
  const state = createDestructuringPlannerState(accessorNode, input.ast);
  const selfName = allocateSyntheticParameter(state);
  const scopedInput = createCsharpThisBindingTranslationContext(
    input,
    selfName,
    objectShape.targetType,
  );
  const expression = getter
    ? planGetter(
        accessorNode,
        member.type,
        selfName,
        selfType,
        sourceFile,
        scopedInput,
        diagnostics,
        state,
      )
    : planSetter(
        accessorNode,
        member.type,
        selfName,
        selfType,
        sourceFile,
        scopedInput,
        diagnostics,
        state,
      );
  if (expression === undefined) {
    return undefined;
  }
  return {
    kind: "AssignmentExpression",
    name: getter
      ? objectShapeAccessorGetterStorageMemberName(objectShape, member)
      : objectShapeAccessorSetterStorageMemberName(objectShape, member),
    expression,
  };
}

function planGetter(
  accessorNode: Node,
  resultType: CsharpObjectShapeFact["members"][number]["type"],
  selfName: string,
  selfType: NonNullable<ReturnType<typeof csharpTypeFromTargetTypeRef>>,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: ReturnType<typeof createDestructuringPlannerState>,
): CsharpExpression | undefined {
  const declaration = AsGetAccessorDeclaration(accessorNode);
  const bodyTarget = lambdaTargetContextFromTargetRef(
    csharpDelegateTargetType("System.Func", [], resultType),
  );
  const body = declaration?.Body === undefined || bodyTarget === undefined
    ? undefined
    : planLambdaBlockBody(
        accessorNode,
        declaration.Body,
        sourceFile,
        input,
        diagnostics,
        state,
        bodyTarget,
      );
  if (body === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      accessorNode,
      "Object-literal getter requires one exact body and result-carrier contract.",
    ));
    return undefined;
  }
  return {
    kind: "LambdaExpression",
    parameters: [{ kind: "Parameter", name: selfName, type: selfType }],
    body,
  };
}

function planSetter(
  accessorNode: Node,
  valueType: CsharpObjectShapeFact["members"][number]["type"],
  selfName: string,
  selfType: NonNullable<ReturnType<typeof csharpTypeFromTargetTypeRef>>,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: ReturnType<typeof createDestructuringPlannerState>,
): CsharpExpression | undefined {
  const declaration = AsSetAccessorDeclaration(accessorNode);
  const parameterNodes = declaration?.Parameters?.Nodes ?? [];
  const parameterNode = parameterNodes.filter(
    (parameter): parameter is Node => parameter !== undefined,
  )[0];
  if (declaration?.Body === undefined || parameterNode === undefined ||
    parameterNodes.filter((parameter) => parameter !== undefined).length !== 1 ||
    AsParameterDeclaration(parameterNode) === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      accessorNode,
      "Object-literal setter requires one exact parameter and body.",
    ));
    return undefined;
  }
  const sourceTarget = csharpDelegateTargetType("System.Action", [valueType]);
  const bodyTarget = lambdaTargetContextFromTargetRef(sourceTarget);
  const scoped = createCsharpScopedTranslationContext(input, [{
    declaration: parameterNode,
    targetType: valueType,
  }]);
  if (bodyTarget === undefined || scoped.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(
      accessorNode,
      scoped.kind === "rejected"
        ? scoped.reason
        : "Object-literal setter has no exact parameter-carrier contract.",
    ));
    return undefined;
  }
  const parameters = planLambdaParameters(
    parameterNodes,
    sourceFile,
    scoped.context,
    diagnostics,
    state,
    bodyTarget,
  );
  const body = planLambdaBlockBody(
    accessorNode,
    declaration.Body,
    sourceFile,
    scoped.context,
    diagnostics,
    state,
    bodyTarget,
  );
  return body === undefined
    ? undefined
    : {
        kind: "LambdaExpression",
        parameters: [
          { kind: "Parameter", name: selfName, type: selfType },
          ...parameters,
        ],
        body,
      };
}
