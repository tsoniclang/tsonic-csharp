import {
  acceptObservation,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  ExtensionObservation,
  ExtensionObservationContext,
} from "@tsonic/tsts";
import type {
  CsharpOperationsProviderHost,
} from "../operations-provider.js";
import {
  resolveCsharpObjectShapeMemberByFinalizedSourceName,
} from "../../csharp-facts.js";
import {
  asNodeSubject,
  visitAstReaderNodes,
} from "../ast-utils.js";
import {
  getCsharpCheckedPropertyAccessRequestContext,
} from "../checked-member-access-request-context.js";
import {
  csharpTargetMemberOperation,
  recordCsharpTargetOperation,
  sourceOwnedPropertyOperation,
  targetOperation,
} from "../operations.js";
import {
  getSourceReceiverTargetType,
  selectedDeclarationIsAmbientOrExternal,
  targetTypeRefIsSourceDeclaredReceiver,
} from "./lifecycle-helpers.js";
import type {
  CheckedPropertyAccessContext,
} from "./types.js";

export function mapCsharpObjectShapeCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  if (isNamespaceImportReceiver(request.receiver, context)) {
    return undefined;
  }
  const objectShape = host.getCsharpObjectShapeFactForSubject(request.receiver, context) ??
    host.getCsharpObjectShapeFactForSubject(requestContext.receiverType, context) ??
    host.getCsharpObjectShapeFactForSubject(requestContext.receiverSymbol, context) ??
    host.getCsharpObjectShapeFactForSubject(requestContext.receiverResolvedSymbol, context) ??
    host.getCsharpObjectShapeFactForSubject(requestContext.receiverAliasedSymbol, context);
  if (objectShape === undefined) {
    return undefined;
  }
  const memberLookup = resolveCsharpObjectShapeMemberByFinalizedSourceName(objectShape, request.propertyName, "checked-property-access");
  if (memberLookup.kind !== "resolved") {
    return undefined;
  }
  const member = memberLookup.member;
  const existingOperation = context.factResolver.resolve(request.expression, targetOperationFactKey);
  if (existingOperation !== undefined) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: existingOperation,
    }, [{ message: "C# object-shape property access reused finalized TSTS/source operation fact for the same checked expression." }]);
  }
  const operationId = `tsonic.csharp.objectShape.${request.propertyName}`;
  recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation(operationId, member.memberKind === "method" ? "method" : "property", member.targetName, {
    resultType: member.type,
  }), [{ message: "C# object-shape member operation recorded from finalized structural shape fact." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation(
      operationId,
      member.memberKind === "method" ? "method" : "property",
      member.targetName,
      { resultType: member.type },
    ),
  }, [{ message: "C# object-shape property access selected from finalized structural shape fact." }]);
}

export function mapCsharpProjectSourceCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  const selectedDeclaration = asNodeSubject(requestContext.sourceSelectedDeclaration);
  const compiler = context.compiler;
  if (selectedDeclaration === undefined || compiler === undefined) {
    return undefined;
  }
  if (selectedDeclarationIsAmbientOrExternal(requestContext.sourceSelectedDeclaration, context)) {
    return undefined;
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: sourceOwnedPropertyOperation(request.propertyName),
  }, [{ message: "C# source-owned property access accepted from TSTS-selected project source declaration; backend renders source syntax without provider target-member facts." }]);
}

export function mapCsharpSourceDeclaredReceiverCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: CheckedPropertyAccessContext,
  host: CsharpOperationsProviderHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  if (selectedDeclarationIsAmbientOrExternal(requestContext.sourceSelectedDeclaration, context)) {
    return undefined;
  }
  const receiverType = getSourceReceiverTargetType(requestContext.receiverType, request.receiver, context, host);
  if (!targetTypeRefIsSourceDeclaredReceiver(receiverType)) {
    return undefined;
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: sourceOwnedPropertyOperation(request.propertyName),
  }, [{ message: "C# source-owned property access accepted from checked TSTS source declaration receiver facts." }]);
}

function isNamespaceImportReceiver(
  receiver: unknown,
  context: ExtensionObservationContext,
): boolean {
  const ast = context.compiler?.ast;
  const receiverNode = asNodeSubject(receiver);
  if (ast === undefined || receiverNode === undefined || !ast.is.IsIdentifier(receiverNode)) {
    return false;
  }
  const sourceFile = ast.getSourceFile(receiverNode);
  const receiverName = ast.text(receiverNode);
  if (sourceFile === undefined) {
    return false;
  }
  let matched = false;
  visitAstReaderNodes(ast, sourceFile, (node) => {
    if (matched || !ast.is.IsImportDeclaration(node)) {
      return;
    }
    const importDeclaration = ast.as.AsImportDeclaration(node);
    const rawImportClause = asNodeSubject(importDeclaration?.ImportClause);
    const importClause = rawImportClause === undefined
      ? undefined
      : ast.as.AsImportClause(rawImportClause);
    const namedBindings = importClause?.NamedBindings;
    if (namedBindings === undefined || ast.as.AsNamespaceImport(namedBindings) === undefined) {
      return;
    }
    const name = ast.name(namedBindings);
    matched = name !== undefined && ast.text(name) === receiverName;
  });
  return matched;
}
