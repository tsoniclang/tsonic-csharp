import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  selectCsharpTargetCall,
} from "../../policy/members/index.js";
import type {
  CsharpTargetCallSelection,
} from "../../policy/members/index.js";
import type {
  CsharpExpression,
} from "../../backend/roslyn/syntax.js";
import {
  selectedPolicyDiagnostic,
  targetPolicyDiagnostic,
  unsupportedNodeDiagnostic,
} from "../../backend/planner/diagnostics.js";
import type {
  CallArgumentPlanner,
} from "../../backend/planner/expression-planner-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../backend/planner/target-types.js";
import type {
  CsharpTranslationContext,
} from "../context/index.js";
import {
  renderCsharpTargetTypeArguments,
  translateSelectedTargetArguments,
  translateSourceOwnedArguments,
} from "./calls.js";

export function translateCsharpConstruction(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const selection = selectCsharpTargetCall(input, node, sourceFile);
  switch (selection.kind) {
    case "resolved":
      return translateSelectedConstruction(
        node,
        selection,
        sourceFile,
        input,
        diagnostics,
        planCallArgument,
      );
    case "source-owned":
      return translateSourceOwnedConstruction(
        node,
        selection,
        sourceFile,
        input,
        diagnostics,
        planCallArgument,
      );
    case "rejected":
      diagnostics.push(selectedPolicyDiagnostic(
        node,
        selection.diagnostic,
        sourceFile,
      ));
      return undefined;
    case "missing":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CONSTRUCTION_NOT_CLOSED",
        selection.reason,
        sourceFile,
      ));
      return undefined;
    case "conflict":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CONSTRUCTION_IDENTITY_CONFLICT",
        selection.reason,
        sourceFile,
      ));
      return undefined;
    case "ambiguous":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_CONSTRUCTION_AMBIGUOUS",
        selection.reason,
        sourceFile,
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
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
    planCallArgument,
  );
  if (arguments_ === undefined) {
    return undefined;
  }
  if (member.csharpInvocation?.kind === "static-factory-construction") {
    const factoryType = csharpTypeFromTargetTypeRef(
      member.csharpInvocation.factoryType,
    );
    const typeArguments = renderCsharpTargetTypeArguments(
      selection.call.targetMethodTypeArguments,
      node,
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
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planCallArgument: CallArgumentPlanner,
): CsharpExpression | undefined {
  const declaration = input.queries(sourceFile).checker
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
  const targetType = input.types.resolveType(
    selection.source.sourceResultType,
    sourceFile,
  );
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
