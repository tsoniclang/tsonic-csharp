import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  selectCsharpTargetCall,
} from "../../../policy/members/index.js";
import {
  selectCsharpJsValueReceiverExpressionOperation,
} from "../../../policy/js-value-operations/index.js";
import type {
  CsharpTargetCallSelection,
} from "../../../policy/members/index.js";
import type {
  CsharpExpression,
} from "../../roslyn/syntax.js";
import {
  selectedPolicyDiagnostic,
  targetPolicyDiagnostic,
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import type {
  CallArgumentPlanner,
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import {
  translateSelectedTargetArguments,
  translateSourceOwnedArguments,
} from "./target-members/selected-call.js";
import {
  renderSelectedCsharpTargetMethodTypeArguments,
} from "./selected-method-type-arguments.js";
import {
  translateCsharpJsValueInvocation,
} from "./js-value-operations.js";

export function translateCsharpConstruction(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const expression = input.ast.as.AsNewExpression(node);
  const calleeNode = expression?.Expression;
  const jsValueOperation = selectCsharpJsValueReceiverExpressionOperation(
    input,
    calleeNode,
    sourceFile,
    "construct",
  );
  if (jsValueOperation.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, jsValueOperation.reason));
    return undefined;
  }
  if (jsValueOperation.kind === "resolved") {
    const sourceArguments = input.ast.arguments(node)
      .filter((argument): argument is Node => argument !== undefined);
    if (
      sourceArguments.length !== input.ast.arguments(node).length ||
      sourceArguments.some((argument) =>
        input.ast.is.IsSpreadElement(argument)
      )
    ) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "JS-value construction requires exact non-spread source arguments.",
      ));
      return undefined;
    }
    const callee = calleeNode === undefined
      ? undefined
      : planExpression(calleeNode, sourceFile, input, diagnostics);
    const arguments_ = sourceArguments.map((argument) =>
      planExpression(argument, sourceFile, input, diagnostics)
    );
    if (
      callee === undefined ||
      arguments_.some((argument) => argument === undefined)
    ) {
      return undefined;
    }
    return translateCsharpJsValueInvocation(
      jsValueOperation,
      callee,
      arguments_ as readonly CsharpExpression[],
    );
  }
  const selection = selectCsharpTargetCall(input, node, sourceFile);
  switch (selection.kind) {
    case "resolved":
      return translateSelectedConstruction(
        node,
        selection,
        sourceFile,
        input,
        diagnostics,
        planExpression,
        planCallArgument,
      );
    case "source-owned":
      return translateSourceOwnedConstruction(
        node,
        selection,
        sourceFile,
        input,
        diagnostics,
        planExpression,
        planCallArgument,
      );
    case "rejected":
      diagnostics.push(selectedPolicyDiagnostic(
        node,
        selection.diagnostic,
      ));
      return undefined;
    case "missing":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CONSTRUCTION_NOT_CLOSED",
        selection.reason,
      ));
      return undefined;
    case "conflict":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CONSTRUCTION_IDENTITY_CONFLICT",
        selection.reason,
      ));
      return undefined;
    case "ambiguous":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CONSTRUCTION_AMBIGUOUS",
        selection.reason,
        selection.candidates.map((candidate) =>
          `candidate=${candidate}`),
      ));
      return undefined;
  }
}

function translateSelectedConstruction(
  node: Node,
  selection: Extract<
    CsharpTargetCallSelection,
    { readonly kind: "resolved" }
  >,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const member = selection.call.targetMember;
  if (
    member.kind !== "constructor" ||
    selection.call.receiver.kind !== "none"
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Checked construction selected non-constructor target member '${member.id}'.`,
    ));
    return undefined;
  }
  const arguments_ = translateSelectedTargetArguments(
    node,
    selection.source,
    selection.call,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planCallArgument,
  );
  if (arguments_ === undefined) {
    return undefined;
  }
  if (member.csharpInvocation?.kind === "static-factory-construction") {
    const factoryType = csharpTypeFromTargetTypeRef(
      member.csharpInvocation.factoryType,
    );
    const typeArguments = renderSelectedCsharpTargetMethodTypeArguments(
      selection.call,
      node,
      sourceFile,
      input,
      diagnostics,
    );
    if (factoryType === undefined || typeArguments === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        `Selected static factory constructor '${member.id}' has no renderable factory type.`,
      ));
      return undefined;
    }
    return {
      kind: "InvocationExpression",
      callee: {
        kind: "SimpleMemberAccessExpression",
        receiver: factoryType,
        name: member.targetName,
        ...(typeArguments.length === 0 ? {} : { typeArguments }),
      },
      arguments: arguments_,
    };
  }
  if (member.csharpInvocation !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected constructor '${member.id}' carries non-construction invocation metadata.`,
    ));
    return undefined;
  }
  const type = member.declaringType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(member.declaringType);
  if (type === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected constructor '${member.id}' has no renderable declaring type.`,
    ));
    return undefined;
  }
  return {
    kind: "ObjectCreationExpression",
    type,
    arguments: arguments_,
  };
}

function translateSourceOwnedConstruction(
  node: Node,
  selection: Extract<
    CsharpTargetCallSelection,
    { readonly kind: "source-owned" }
  >,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const declaration = input.semantics(sourceFile)
    .getSignatureDeclaration(selection.source.selectedSignature);
  if (
    !input.navigation.isProjectDeclaration(declaration) &&
    !input.navigation.isProjectConstructibleObject(
      selection.source.sourceCallee.expression,
    )
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected constructor is external to the project and has no C# target relation.",
    ));
    return undefined;
  }
  const targetType = input.types.resolveNode(node, sourceFile);
  const type = targetType === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(targetType);
  if (type === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Source-owned construction has no closed C# result type.",
    ));
    return undefined;
  }
  const arguments_ = translateSourceOwnedArguments(
    node,
    selection.source,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    planCallArgument,
  );
  return arguments_ === undefined
    ? undefined
    : {
        kind: "ObjectCreationExpression",
        type,
        arguments: arguments_,
      };
}
