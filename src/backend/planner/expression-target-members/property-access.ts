import {
  AsPropertyAccessExpression,
  Node_Text,
} from "../source-ast.js";
import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
} from "../../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import {
  planIdentifierName,
} from "../names.js";
import {
  getSemanticOwnership,
  pushMissingTargetFactDiagnostic,
} from "../semantic-guards.js";
import {
  planProjectSourceModuleMemberReference,
  tryPlanProjectSourceModuleStaticMemberReference,
} from "../expression-source-references.js";
import type {
  ExpressionPlanner,
} from "../expression-planner-types.js";
import {
  planSelectedTargetReceiverExpression,
  targetStaticMemberExpression,
} from "../expression-selected-target-members.js";
import {
  isCsharpSourceOwnedPropertyOperation,
} from "../../../source/csharp-facts.js";
import {
  getRequiredCsharpTargetOperation,
} from "../csharp-target-operations.js";
import {
  getCsharpObjectShapeFactForNode,
} from "../csharp-fact-queries.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../target-types.js";
import {
  tryPlanCompatRuntimePropertyGet,
} from "../compat-runtime-operations.js";

export function planPropertyAccessExpression(
  propertyAccess: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const expression = AsPropertyAccessExpression(propertyAccess)!;
  const sourceName = Node_Text(expression.name!);
  const sourceModuleStaticMemberReference = tryPlanProjectSourceModuleStaticMemberReference(propertyAccess, sourceFile, input, diagnostics);
  if (sourceModuleStaticMemberReference !== undefined) {
    return sourceModuleStaticMemberReference;
  }
  const compatDiagnosticsStart = diagnostics.length;
  const compatRuntimePropertyGet = tryPlanCompatRuntimePropertyGet(propertyAccess, expression.Expression, expression.QuestionDotToken !== undefined, sourceFile, input, diagnostics, planExpression);
  if (compatRuntimePropertyGet !== undefined) {
    return compatRuntimePropertyGet;
  }
  if (diagnostics.length > compatDiagnosticsStart) {
    return undefined;
  }
  const targetOperation = input.facts.getSelectedTargetProperty(propertyAccess);
  const sourceOwnedPropertyOperation = isCsharpSourceOwnedPropertyOperation(targetOperation);
  if (sourceOwnedPropertyOperation) {
    const sourceModuleMemberReference = planProjectSourceModuleMemberReference(propertyAccess, sourceFile, input, diagnostics);
    if (sourceModuleMemberReference !== undefined) {
      return sourceModuleMemberReference;
    }
  } else if (targetOperation !== undefined && targetOperation.operationKind === "property") {
    const csharpOperation = getRequiredCsharpTargetOperation(input, propertyAccess, targetOperation, diagnostics, "C# property access emission");
    if (csharpOperation === undefined) {
      return undefined;
    }
    if (csharpOperation.kind !== "member" || csharpOperation.operationKind !== "property") {
      diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, "C# property access emission requires a finalized C# member property operation fact."));
      return undefined;
    }
    if (csharpOperation.static === true) {
      const staticMember = targetStaticMemberExpression(csharpOperation, diagnostics, propertyAccess);
      if (staticMember !== undefined) {
        return staticMember;
      }
      return undefined;
    }
    const receiverExpression = planSelectedTargetReceiverExpression(expression.Expression!, sourceFile, input, diagnostics, planExpression);
    if (receiverExpression === undefined) {
      return undefined;
    }
    return {
      kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
      receiver: receiverExpression,
      name: csharpOperation.memberName,
    };
  }
  if (!sourceOwnedPropertyOperation && targetOperation !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, `Property access expected a provider property fact, but provider selected a ${targetOperation.operationKind} operation.`));
    return undefined;
  }
  const sourceModuleMemberReference = planProjectSourceModuleMemberReference(propertyAccess, sourceFile, input, diagnostics);
  if (sourceModuleMemberReference !== undefined) {
    return sourceModuleMemberReference;
  }
  const receiver = expression.Expression;
  const objectShape = getCsharpObjectShapeFactForNode(receiver, sourceFile, input);
  if (objectShape !== undefined) {
    return planObjectShapePropertyAccess(propertyAccess, sourceName, objectShape, sourceFile, input, diagnostics, planExpression);
  }
  const ownership = getSemanticOwnership(receiver, sourceFile, input);
  if (ownership.requiresTargetFact || !ownership.sourceOwned) {
    pushMissingTargetFactDiagnostic(diagnostics, propertyAccess, `C# property access '${sourceName}' must be selected by TSTS/provider facts before emission.`, ownership);
    return undefined;
  }
  const receiverExpression = planExpression(expression.Expression!, sourceFile, input, diagnostics);
  if (receiverExpression === undefined) {
    return undefined;
  }
  return {
    kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
    receiver: receiverExpression,
    name: planIdentifierName(expression.name, "InvalidPropertyName", input, diagnostics, "Source-owned property name"),
  };
}

function planObjectShapePropertyAccess(
  propertyAccess: Node,
  sourceName: string,
  objectShape: NonNullable<ReturnType<typeof getCsharpObjectShapeFactForNode>>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const expression = AsPropertyAccessExpression(propertyAccess)!;
  const member = objectShape.members.find((candidate) => candidate.sourceName === sourceName);
  if (member === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, `Object-shape property access '${sourceName}' must match a finalized object-shape member before C# emission.`));
    return undefined;
  }
  if (csharpTypeFromTargetTypeRef(member.type) === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(propertyAccess, `Object-shape member '${member.sourceName}' must carry a renderable target type before C# emission.`));
    return undefined;
  }
  const receiverExpression = planExpression(expression.Expression!, sourceFile, input, diagnostics);
  if (receiverExpression === undefined) {
    return undefined;
  }
  return {
    kind: expression.QuestionDotToken === undefined ? "SimpleMemberAccessExpression" : "ConditionalAccessExpression",
    receiver: receiverExpression,
    name: member.targetName,
  };
}
