import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import {
  resolveCsharpJsValueObjectShapeProperty,
  selectCsharpTargetProperty,
} from "../../../../policy/members/index.js";
import {
  selectCsharpJsValueReceiverExpressionOperation,
} from "../../../../policy/js-value-operations/index.js";
import type {
  CsharpTargetPropertySelection,
} from "../../../../policy/members/index.js";
import type {
  CsharpExpression,
} from "../../../target-ast/roslyn/index.js";
import {
  selectedPolicyDiagnostic,
  targetPolicyDiagnostic,
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";
import type {
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../types/target-types.js";
import {
  resolveCsharpObjectShapeMemberBySelectedSubject,
  resolveCsharpObjectShapeMemberReadTargetType,
  resolveCsharpRuntimeUnionObjectShapeProperty,
} from "../../../../policy/types/index.js";
import type {
  CsharpPlanningContext,
} from "../../context.js";
import {
  translateCsharpJsValueInvocation,
} from "../js-value-operations.js";
import {
  translateCsharpSelectedReceiver,
} from "../receivers.js";
import {
  planFlowReadUseSiteProjection,
} from "../flow-read-projections.js";

export function translateCsharpPropertyAccess(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const selection = selectCsharpTargetProperty(input.policy, node, sourceFile);
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
  input: CsharpPlanningContext,
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
    : translateCsharpSelectedReceiver(
        selection.source.receiver,
        sourceFile,
        input,
        diagnostics,
        planExpression,
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
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const declaration = selection.source.selectedDeclaration;
  const semantics = input.program.source.semantics.forFile(sourceFile);
  const jsValueOperation = selectCsharpJsValueReceiverExpressionOperation(
    input.policy,
    selection.source.receiver.expression,
    sourceFile,
    "property-read",
    selection.source.optionalChain,
  );
  if (jsValueOperation.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, jsValueOperation.reason));
    return undefined;
  }
  const objectShape = input.types.objectShapes.resolveNode(
    selection.source.receiver.expression,
    sourceFile,
  );
  const selectedSubjects = semantics.facts.selectedSubjects(
    selection.source.selectedSymbol,
    selection.source.selectedDeclaration,
  );
  const selectedReceiverType = input.types.policy.resolveSelectedValue(
    selection.source.receiver.expression,
    selection.source.receiver.type,
    sourceFile,
  );
  const runtimeUnionProperty = resolveCsharpRuntimeUnionObjectShapeProperty(
    input.types.objectShapes,
    selectedReceiverType,
    selectedSubjects,
  );
  if (runtimeUnionProperty.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      runtimeUnionProperty.reason,
    ));
    return undefined;
  }
  if (runtimeUnionProperty.kind === "resolved") {
    return translateRuntimeUnionObjectShapeProperty(
      node,
      selection,
      runtimeUnionProperty,
      sourceFile,
      input,
      diagnostics,
      planExpression,
    );
  }
  const jsValueProperty = resolveCsharpJsValueObjectShapeProperty(
    input.types.objectShapes,
    semantics,
    selection,
    sourceFile,
  );
  if (jsValueProperty.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, jsValueProperty.reason));
    return undefined;
  }
  const shapeMember = jsValueProperty.kind === "resolved"
    ? jsValueProperty
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
    jsValueOperation.kind !== "resolved" &&
    (
      declaration === undefined ||
      !input.program.source.navigation.isProjectDeclaration(declaration)
    )
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected property is neither provider-owned, source-profile-owned, nor declared by this project.",
    ));
    return undefined;
  }
  const expression = input.program.source.ast.as.AsPropertyAccessExpression(node);
  const syntaxName = expression?.name;
  const jsValueSourceName = jsValueProperty.kind === "resolved"
    ? jsValueProperty.member.sourceName
    : syntaxName === undefined
      ? undefined
      : input.program.source.ast.text(syntaxName);
  const nameNode = input.program.source.ast.name(declaration) ?? syntaxName;
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
  if (
    jsValueOperation.kind === "resolved"
      ? jsValueSourceName === undefined
      : resolvedName === undefined
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      jsValueOperation.kind === "resolved"
        ? "A JS-value property read requires an exact authored property name."
        : typeof name === "object" && name?.kind === "rejected"
        ? `The exact selected source property has no C#-representable declaration name. ${name.reason}`
        : "The exact selected source property has no C#-representable declaration name.",
    ));
    return undefined;
  }
  const receiver = translateCsharpSelectedReceiver(
    selection.source.receiver,
    sourceFile,
    input,
    diagnostics,
    planExpression,
  );
  if (receiver === undefined) {
    return undefined;
  }
  const planned = jsValueOperation.kind === "resolved" && jsValueSourceName !== undefined
    ? translateCsharpJsValueInvocation(
        jsValueOperation,
        receiver,
        [{ kind: "LiteralExpression", value: jsValueSourceName }],
      )
    : resolvedName === undefined
    ? undefined
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
      "The selected JS-value object-shape property read has no closed runtime operation.",
    ));
    return undefined;
  }
  if (
    selection.source.accessMode !== "read" ||
    selection.source.callCallee
  ) {
    return planned;
  }
  const selectedDeclaration = selection.source.selectedDeclaration;
  if (
    shapeMember?.kind !== "resolved" &&
    (
      selectedDeclaration === undefined ||
      !input.program.source.ast.is.IsPropertyDeclaration(selectedDeclaration) &&
        !input.program.source.ast.is.IsPropertySignatureDeclaration(selectedDeclaration) &&
        !input.program.source.ast.is.IsGetAccessorDeclaration(selectedDeclaration)
    )
  ) {
    return planned;
  }
  const rawReadType = shapeMember?.kind === "resolved"
    ? jsValueOperation.kind === "resolved"
      ? jsValueOperation.resultType
      : shapeMember.member.type
    : input.types.policy.resolveReadStorage(node, sourceFile);
  const selectedReadType = shapeMember?.kind === "resolved"
    ? resolveCsharpObjectShapeMemberReadTargetType(
        shapeMember.member,
        selection.source.sourceReadType,
        (left, right) => semantics.types.relationship(left, right) !== "unrelated",
      ) ?? input.types.policy.resolveSelectedResult(
        selection.source.selectedDeclaration,
        selection.source.sourceReadType,
        sourceFile,
      )
    : input.types.policy.resolveNode(node, sourceFile);
  if (shapeMember?.kind === "resolved" && selectedReadType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact selected source property read has no closed C# flow representation.",
    ));
    return undefined;
  }
  return planFlowReadUseSiteProjection(
    node,
    planned,
    sourceFile,
    input,
    diagnostics,
    {
      ...(rawReadType === undefined ? {} : { storageType: rawReadType }),
      ...(selectedReadType === undefined ? {} : { selectedType: selectedReadType }),
    },
  );
}

function translateRuntimeUnionObjectShapeProperty(
  node: Node,
  selection: Extract<
    CsharpTargetPropertySelection,
    { readonly kind: "source-owned" }
  >,
  property: Extract<
    ReturnType<typeof resolveCsharpRuntimeUnionObjectShapeProperty>,
    { readonly kind: "resolved" }
  >,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  if (selection.source.optionalChain) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "Optional runtime-union object-shape property projection requires an explicit nullable-union policy.",
    ));
    return undefined;
  }
  const receiver = translateCsharpSelectedReceiver(
    selection.source.receiver,
    sourceFile,
    input,
    diagnostics,
    planExpression,
  );
  if (receiver === undefined) {
    return undefined;
  }
  const projected: CsharpExpression = {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver,
      name: "Match",
    },
    arguments: property.members.map((entry) => {
      const parameterName = `__tsonic_union_arm${entry.armIndex + 1}`;
      return {
        kind: "Argument" as const,
        expression: {
          kind: "LambdaExpression" as const,
          parameters: [{ kind: "Parameter" as const, name: parameterName }],
          body: {
            kind: "SimpleMemberAccessExpression" as const,
            receiver: {
              kind: "IdentifierName" as const,
              name: parameterName,
            },
            name: entry.member.targetName,
          },
        },
      };
    }),
  };
  const selectedReadType = input.types.policy.resolveSelectedResult(
    selection.source.selectedDeclaration,
    selection.source.sourceReadType,
    sourceFile,
  );
  if (selectedReadType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(
      node,
      "The exact runtime-union object-shape property read has no closed C# selected result representation.",
    ));
    return undefined;
  }
  return planFlowReadUseSiteProjection(
    node,
    projected,
    sourceFile,
    input,
    diagnostics,
    {
      storageType: property.resultType,
      selectedType: selectedReadType,
    },
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
