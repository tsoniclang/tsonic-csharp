import type {
  Node,
  SelectedTargetSignatureFact,
  TargetOperationFact,
} from "@tsonic/tsts";
import type {
  TargetCompileInput,
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  csharpTargetOperationFactKey,
} from "../../source/csharp-facts.js";
import type {
  CsharpTargetOperationFact,
  CsharpTargetMemberOperationFact,
} from "../../source/csharp-facts.js";
import type {
  CsharpExpression,
} from "../roslyn/syntax.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  invalidExpression,
} from "./invalid-expression.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

export function getRequiredCsharpTargetOperation(
  input: TargetCompileInput,
  subject: Node,
  selectedOperation: TargetOperationFact,
  diagnostics: TargetDiagnostic[],
  purpose: string,
): CsharpTargetOperationFact | undefined {
  const operation = input.facts.getFact(subject, csharpTargetOperationFactKey);
  if (operation === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} requires a finalized C# target operation fact; the generic TSTS target operation '${selectedOperation.operationId}' is not enough for C# emission.`));
    return undefined;
  }
  if (operation.operationId !== selectedOperation.operationId) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} received mismatched target operation facts: generic '${selectedOperation.operationId}', C# '${operation.operationId}'.`));
    return undefined;
  }
  return operation;
}

export function csharpStaticMemberExpression(
  operation: CsharpTargetOperationFact,
  diagnostics: TargetDiagnostic[],
  node: Node,
  purpose: string,
): CsharpExpression | undefined {
  if (operation.kind !== "member" || operation.static !== true) {
    return undefined;
  }
  const declaringType = operation.declaringType === undefined ? undefined : csharpTypeFromTargetTypeRef(operation.declaringType);
  if (declaringType === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, `${purpose} requires a provider-owned declaring target type fact before C# emission.`));
    return invalidExpression(`${purpose} declaring type`);
  }
  return {
    kind: "SimpleMemberAccessExpression",
    receiver: declaringType,
    name: operation.memberName,
  };
}

export function getRequiredCsharpTargetMemberOperationForSelectedSignature(
  input: TargetCompileInput,
  subject: Node,
  selectedSignature: SelectedTargetSignatureFact,
  diagnostics: TargetDiagnostic[],
  purpose: string,
): CsharpTargetMemberOperationFact | undefined {
  const operation = input.facts.getFact(subject, csharpTargetOperationFactKey);
  if (operation === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} requires a finalized C# target member operation fact; the generic selected target member '${selectedSignature.member.id}' is not enough for C# emission.`));
    return undefined;
  }
  if (operation.operationId !== selectedSignature.member.id) {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} received mismatched target operation facts: generic selected member '${selectedSignature.member.id}', C# '${operation.operationId}'.`));
    return undefined;
  }
  if (operation.kind !== "member") {
    diagnostics.push(unsupportedNodeDiagnostic(subject, `${purpose} requires a finalized C# member operation fact, but provider recorded '${operation.kind}'.`));
    return undefined;
  }
  return operation;
}
