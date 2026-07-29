import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  selectCsharpTargetProperty,
} from "../../policy/members/index.js";
import type {
  CsharpTargetPropertySelection,
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
  ExpressionPlanner,
} from "../../backend/planner/expression-planner-types.js";
import {
  requireCsharpIdentifier,
} from "../../backend/planner/identifiers.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../backend/planner/target-types.js";
import type {
  CsharpTranslationContext,
} from "../context/index.js";

export function translateCsharpPropertyAccess(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const selection = selectCsharpTargetProperty(input, node, sourceFile);
  switch (selection.kind) {
    case "resolved":
      return translateSelectedProperty(
        node,
        selection,
        sourceFile,
        input,
        diagnostics,
        planExpression,
      );
    case "source-owned":
      return translateSourceOwnedProperty(
        node,
        selection,
        sourceFile,
        input,
        diagnostics,
        planExpression,
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
        "CSHARP_TARGET_PROPERTY_NOT_CLOSED",
        selection.reason,
        sourceFile,
      ));
      return undefined;
    case "conflict":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_PROPERTY_IDENTITY_CONFLICT",
        selection.reason,
        sourceFile,
      ));
      return undefined;
    case "ambiguous":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_PROPERTY_AMBIGUOUS",
        selection.reason,
        sourceFile,
        selection.candidates.map((candidate) =>
          `candidate=${candidate}`),
      ));
      return undefined;
  }
}

function translateSelectedProperty(
  node: Node,
  selection: Extract<
    CsharpTargetPropertySelection,
    { readonly kind: "resolved" }
  >,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const member = selection.targetMember;
  if (
    member.kind !== "property" &&
    member.kind !== "field" &&
    member.kind !== "event"
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Checked property access selected C# ${member.kind} '${member.id}'.`,
    ));
    return undefined;
  }
  if (selection.receiver.kind === "target-parameter") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "A source property cannot lower to a target-parameter receiver without an explicit target invocation relation.",
    ));
    return undefined;
  }
  const receiver = selection.receiver.kind === "none"
    ? targetStaticReceiver(member, node, diagnostics)
    : planExpression(
        selection.source.receiver.expression,
        sourceFile,
        input,
        diagnostics,
      );
  if (receiver === undefined) {
    return undefined;
  }
  return {
    kind: selection.source.optionalChain
      ? "ConditionalAccessExpression"
      : "SimpleMemberAccessExpression",
    receiver,
    name: member.targetName,
  };
}

function translateSourceOwnedProperty(
  node: Node,
  selection: Extract<
    CsharpTargetPropertySelection,
    { readonly kind: "source-owned" }
  >,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const declaration = selection.source.selectedDeclaration;
  if (
    declaration === undefined ||
    !input.navigation.isProjectDeclaration(declaration)
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected property is neither provider-owned, source-profile-owned, nor declared by this project.",
    ));
    return undefined;
  }
  const expression = input.ast.as.AsPropertyAccessExpression(node);
  const nameNode = input.ast.name(declaration) ?? expression?.name;
  const name = nameNode === undefined
    ? undefined
    : requireCsharpIdentifier(
        input.ast.text(nameNode),
        diagnostics,
        "Source-owned property name",
      );
  if (name === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected source property has no C#-representable declaration name.",
    ));
    return undefined;
  }
  const receiver = planExpression(
    selection.source.receiver.expression,
    sourceFile,
    input,
    diagnostics,
  );
  return receiver === undefined
    ? undefined
    : {
        kind: selection.source.optionalChain
          ? "ConditionalAccessExpression"
          : "SimpleMemberAccessExpression",
        receiver,
        name,
      };
}

function targetStaticReceiver(
  member: Extract<
    CsharpTargetPropertySelection,
    { readonly kind: "resolved" }
  >["targetMember"],
  node: Node,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  const declaringType = member.declaringType;
  if (declaringType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected static target property '${member.id}' has no declaring type.`,
    ));
    return undefined;
  }
  const receiver = csharpTypeFromTargetTypeRef(declaringType);
  if (receiver === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      `Selected static target property '${member.id}' has no renderable declaring type.`,
    ));
  }
  return receiver;
}
