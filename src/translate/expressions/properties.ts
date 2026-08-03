import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  resolveCsharpCompatObjectShapeProperty,
  selectCsharpTargetProperty,
} from "../../policy/members/index.js";
import {
  selectCsharpCompatAnyReceiverOperation,
  selectCsharpCompatValueReceiverOperation,
} from "../../policy/compat/index.js";
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
  csharpTypeFromTargetTypeRef,
} from "../../backend/planner/target-types.js";
import {
  resolveCsharpObjectShapeMemberBySelectedSubject,
  resolveCsharpObjectShapeMemberReadTargetType,
} from "../../policy/types/index.js";
import {
  selectCsharpFlowReadConversion,
} from "../../policy/conversions/index.js";
import type {
  CsharpTranslationContext,
} from "../context/index.js";
import {
  translateCsharpCompatInvocation,
} from "./compat.js";
import {
  applyCsharpConversionSelection,
} from "./conversions.js";

export function translateCsharpPropertyAccess(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const expression = input.ast.as.AsPropertyAccessExpression(node);
  const receiverNode = expression?.Expression;
  const compat = selectCsharpCompatAnyReceiverOperation(
    input,
    receiverNode,
    sourceFile,
    "property-read",
    expression?.QuestionDotToken !== undefined,
  );
  if (compat.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, compat.reason));
    return undefined;
  }
  if (compat.kind === "resolved") {
    const nameNode = expression?.name;
    const receiver = receiverNode === undefined
      ? undefined
      : planExpression(receiverNode, sourceFile, input, diagnostics);
    if (nameNode === undefined || receiver === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(
        node,
        "C# compatibility property read requires an exact receiver and property name.",
      ));
      return undefined;
    }
    return translateCsharpCompatInvocation(
      compat,
      receiver,
      [{ kind: "LiteralExpression", value: input.ast.text(nameNode) }],
    );
  }
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
      ));
      return undefined;
    case "missing":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_PROPERTY_NOT_CLOSED",
        selection.reason,
      ));
      return undefined;
    case "conflict":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_PROPERTY_IDENTITY_CONFLICT",
        selection.reason,
      ));
      return undefined;
    case "ambiguous":
      diagnostics.push(targetPolicyDiagnostic(
        node,
        "CSHARP_TARGET_PROPERTY_AMBIGUOUS",
        selection.reason,
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
  const semantics = input.semantics(sourceFile);
  const objectShape = input.objectShapes.resolveNode(
    selection.source.receiver.expression,
    sourceFile,
  );
  const selectedSubjects = semantics.getSelectedFactSubjects(
    selection.source.selectedSymbol,
    selection.source.selectedDeclaration,
  );
  const compatProperty = resolveCsharpCompatObjectShapeProperty(
    input.objectShapes,
    semantics,
    selection,
    sourceFile,
  );
  if (compatProperty.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, compatProperty.reason));
    return undefined;
  }
  const shapeMember = compatProperty.kind === "resolved"
    ? compatProperty
    : objectShape === undefined
    ? undefined
    : resolveCsharpObjectShapeMemberBySelectedSubject(
        objectShape,
        selectedSubjects,
      );
  if (objectShape !== undefined && shapeMember?.kind !== "resolved") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected source property is absent from its finalized object-shape contract.",
    ));
    return undefined;
  }
  if (
    shapeMember?.kind !== "resolved" &&
    (
      declaration === undefined ||
      !input.navigation.isProjectDeclaration(declaration)
    )
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected property is neither provider-owned, source-profile-owned, nor declared by this project.",
    ));
    return undefined;
  }
  const expression = input.ast.as.AsPropertyAccessExpression(node);
  const nameNode = input.ast.name(declaration) ?? expression?.name;
  const name = shapeMember?.kind === "resolved"
    ? shapeMember.member.targetName
    : nameNode === undefined
      ? undefined
      : input.names.resolve(nameNode, declaration);
  const resolvedName = typeof name === "string"
    ? name
    : name?.kind === "resolved"
      ? name.name
      : undefined;
  if (resolvedName === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      typeof name === "object" && name?.kind === "rejected"
        ? `The exact selected source property has no C#-representable declaration name. ${name.reason}`
        : "The exact selected source property has no C#-representable declaration name.",
    ));
    return undefined;
  }
  const receiver = planExpression(
    selection.source.receiver.expression,
    sourceFile,
    input,
    diagnostics,
  );
  if (receiver === undefined) {
    return undefined;
  }
  const compat = compatProperty.kind === "resolved"
    ? selectCsharpCompatValueReceiverOperation(
        compatProperty.shape.targetType,
        "property-read",
        selection.source.optionalChain,
      )
    : { kind: "not-any" as const };
  if (compat.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, compat.reason));
    return undefined;
  }
  const compatSourceName = compatProperty.kind === "resolved"
    ? compatProperty.member.sourceName
    : undefined;
  const planned = compat.kind === "resolved" && compatSourceName !== undefined
    ? translateCsharpCompatInvocation(
        compat,
        receiver,
        [{ kind: "LiteralExpression", value: compatSourceName }],
      )
    : {
        kind: selection.source.optionalChain
          ? "ConditionalAccessExpression"
          : "SimpleMemberAccessExpression" as const,
        receiver,
        name: resolvedName,
      } as CsharpExpression;
  if (planned === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The selected compatibility object-shape property read has no closed runtime operation.",
    ));
    return undefined;
  }
  if (
    shapeMember?.kind !== "resolved" ||
    selection.source.accessMode !== "read"
  ) {
    return planned;
  }
  const selectedReadType = resolveCsharpObjectShapeMemberReadTargetType(
    shapeMember.member,
    selection.source.sourceReadType,
  ) ?? input.types.resolveSelectedResult(
      selection.source.selectedDeclaration,
      selection.source.sourceReadType,
      sourceFile,
    );
  if (selectedReadType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected source property read has no closed C# flow representation.",
    ));
    return undefined;
  }
  const conversion = selectCsharpFlowReadConversion(
    input,
    shapeMember.member.type,
    selectedReadType,
  );
  return applyCsharpConversionSelection(
    node,
    sourceFile,
    input,
    diagnostics,
    shapeMember.member.type,
    selectedReadType,
    conversion,
    planned,
  );
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
