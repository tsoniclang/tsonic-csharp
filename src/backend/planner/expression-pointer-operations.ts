import {
  pointerOperationFactKey,
  type Node,
  type PointerOperationFact,
  type SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import {
  csharpRuntimeLocationTargetType,
  isCsharpValueTypeTargetType,
  targetTypeRefEquals,
  type TargetTypeRef,
} from "../../policy/types/index.js";
import {
  selectCsharpTargetProperty,
} from "../../policy/members/index.js";
import type {
  CsharpTranslationContext,
} from "../../translate/context/index.js";
import type {
  CsharpArgument,
  CsharpExpression,
  CsharpLambdaParameter,
  CsharpTypeNode,
} from "../roslyn/syntax.js";
import {
  allocateSyntheticParameter,
  createDestructuringPlannerState,
  type DestructuringPlannerState,
} from "./bindings.js";
import {
  HasSyntacticModifier,
  ModifierFlagsStatic,
} from "./source-ast.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import type {
  ExpectedExpressionPlanner,
  ExpressionPlanner,
} from "./expression-planner-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

export type CsharpPointerOperationPlan =
  | { readonly handled: false }
  | { readonly handled: true; readonly expression?: CsharpExpression };

export function tryPlanCsharpPointerOperation(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  state?: DestructuringPlannerState,
): CsharpPointerOperationPlan {
  const operation = input.sourceFacts?.getFact(node, pointerOperationFactKey);
  if (operation === undefined) {
    return { handled: false };
  }
  const pointee = input.types.resolvePointerOperationPointee(
    operation,
    sourceFile,
  );
  const pointeeType = pointee === undefined
    ? undefined
    : csharpTypeFromTargetTypeRef(pointee);
  if (pointee === undefined || pointeeType === undefined) {
    diagnostics.push(pointerDiagnostic(
      node,
      operation.operation,
      "The exact selected pointee type has no closed C# representation.",
    ));
    return { handled: true };
  }
  const location = csharpRuntimeLocationTargetType(pointee);
  const locationType = csharpTypeFromTargetTypeRef(location);
  if (locationType === undefined) {
    diagnostics.push(pointerDiagnostic(
      node,
      operation.operation,
      "The C# typed-location carrier is not renderable.",
    ));
    return { handled: true };
  }
  switch (operation.operation) {
    case "address-of": {
      const storageType = input.types.resolveSelectedValue(
        operation.storageExpression,
        operation.storageType,
        sourceFile,
      );
      if (
        storageType === undefined ||
        !targetTypeRefEquals(storageType, pointee)
      ) {
        diagnostics.push(pointerDiagnostic(
          node,
          operation.operation,
          "The selected storage and pointee do not have one exact C# target type.",
        ));
        return { handled: true };
      }
      const plannerState = state ?? createDestructuringPlannerState(sourceFile, input.ast);
      return {
        handled: true,
        expression: planCsharpStorageLocation(
          operation.storageExpression,
          pointee,
          locationType,
          sourceFile,
          input,
          diagnostics,
          planExpression,
          plannerState,
        ),
      };
    }
    case "allocate": {
      const initial = planExpressionWithExpectedType(
        operation.initialExpression,
        sourceFile,
        input,
        diagnostics,
        pointeeType,
        undefined,
        pointee,
      );
      return {
        handled: true,
        ...(initial === undefined
          ? {}
          : {
              expression: invokeMember(
                locationType,
                "Allocate",
                [initial],
              ),
            }),
      };
    }
    case "load": {
      const pointer = planPointerOperand(
        operation,
        location,
        sourceFile,
        input,
        diagnostics,
        planExpression,
      );
      return {
        handled: true,
        ...(pointer === undefined
          ? {}
          : { expression: invokeMember(pointer, "Load", []) }),
      };
    }
    case "store": {
      const pointer = planPointerOperand(
        operation,
        location,
        sourceFile,
        input,
        diagnostics,
        planExpression,
      );
      const value = planExpressionWithExpectedType(
        operation.valueExpression,
        sourceFile,
        input,
        diagnostics,
        pointeeType,
        undefined,
        pointee,
      );
      return {
        handled: true,
        ...(pointer === undefined || value === undefined
          ? {}
          : { expression: invokeMember(pointer, "Store", [value]) }),
      };
    }
  }
}

function planPointerOperand(
  operation: Extract<PointerOperationFact, { readonly operation: "load" | "store" }>,
  expectedLocation: TargetTypeRef,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
): CsharpExpression | undefined {
  const pointerType = input.types.resolveSelectedValue(
    operation.pointerExpression,
    operation.pointerType,
    sourceFile,
  );
  if (
    pointerType === undefined ||
    !targetTypeRefEquals(pointerType, expectedLocation)
  ) {
    diagnostics.push(pointerDiagnostic(
      operation.call,
      operation.operation,
      "The selected pointer operand does not have the exact typed-location carrier.",
    ));
    return undefined;
  }
  return planExpression(
    operation.pointerExpression,
    sourceFile,
    input,
    diagnostics,
  );
}

function planCsharpStorageLocation(
  storageNode: Node,
  storageType: TargetTypeRef,
  locationType: CsharpTypeNode,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  state: DestructuringPlannerState,
): CsharpExpression | undefined {
  const storage = input.semantics(sourceFile).getResolvedStorageInfo(storageNode);
  if (storage === undefined || !storage.writable) {
    diagnostics.push(pointerDiagnostic(
      storageNode,
      "address-of",
      "TSTS did not prove this expression to be writable storage.",
    ));
    return undefined;
  }
  const planned = planExpression(storageNode, sourceFile, input, diagnostics);
  if (planned === undefined) {
    return undefined;
  }
  if (input.ast.is.IsIdentifier(storage.storageExpression)) {
    return createDirectLocation(locationType, planned, state);
  }
  if (input.ast.is.IsPropertyAccessExpression(storage.storageExpression)) {
    return planPropertyLocation(
      storage.storageExpression,
      storageType,
      locationType,
      planned,
      sourceFile,
      input,
      diagnostics,
      planExpression,
      state,
    );
  }
  if (input.ast.is.IsElementAccessExpression(storage.storageExpression)) {
    return planElementLocation(
      storage.storageExpression,
      locationType,
      planned,
      sourceFile,
      input,
      diagnostics,
      planExpression,
      state,
    );
  }
  diagnostics.push(pointerDiagnostic(
    storageNode,
    "address-of",
    `Writable source storage kind '${input.ast.kindName(storage.storageExpression)}' has no C# location plan.`,
  ));
  return undefined;
}

function planPropertyLocation(
  storageNode: Node,
  storageType: TargetTypeRef,
  locationType: CsharpTypeNode,
  planned: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  state: DestructuringPlannerState,
): CsharpExpression | undefined {
  const source = input.semantics(sourceFile).getResolvedPropertyAccessInfo(storageNode);
  if (
    source === undefined ||
    !source.writable ||
    source.optionalChain ||
    planned.kind !== "SimpleMemberAccessExpression"
  ) {
    diagnostics.push(pointerDiagnostic(
      storageNode,
      "address-of",
      "The selected property is not an exact writable C# member location.",
    ));
    return undefined;
  }
  if (selectedPropertyIsStatic(storageNode, sourceFile, input)) {
    return createDirectLocation(locationType, planned, state);
  }
  const receiverType = input.types.resolveSelectedValue(
    source.receiver.expression,
    source.receiver.type,
    sourceFile,
  );
  const receiverKind = classifyStorageReceiver(receiverType);
  if (receiverType === undefined || receiverKind === "unknown") {
    diagnostics.push(pointerDiagnostic(
      storageNode,
      "address-of",
      "The selected property receiver is neither a proven C# reference nor value type.",
    ));
    return undefined;
  }
  if (receiverKind === "reference") {
    const receiverName = allocateSyntheticParameter(state);
    const valueName = allocateSyntheticParameter(state);
    const receiver = identifier(receiverName);
    const access = member(receiver, planned.name);
    return invokeMember(locationType, "Create", [
      planned.receiver,
      lambda([receiverName], access),
      lambda([receiverName, valueName], assignment(access, identifier(valueName))),
    ]);
  }
  const receiverTargetType = receiverType;
  const receiverLocationType = csharpTypeFromTargetTypeRef(
    csharpRuntimeLocationTargetType(receiverTargetType),
  );
  if (receiverLocationType === undefined) {
    diagnostics.push(pointerDiagnostic(
      storageNode,
      "address-of",
      "The selected value-type receiver location is not renderable.",
    ));
    return undefined;
  }
  const owner = planCsharpStorageLocation(
    source.receiver.expression,
    receiverTargetType,
    receiverLocationType,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    state,
  );
  if (owner === undefined) {
    return undefined;
  }
  const receiverName = allocateSyntheticParameter(state);
  const valueName = allocateSyntheticParameter(state);
  const receiver = identifier(receiverName);
  const access = member(receiver, planned.name);
  const projectedType = csharpTypeFromTargetTypeRef(storageType);
  if (projectedType === undefined) {
    diagnostics.push(pointerDiagnostic(
      storageNode,
      "address-of",
      "The selected projected property type is not renderable.",
    ));
    return undefined;
  }
  return invokeMember(
    owner,
    "Project",
    [
      lambda([receiverName], access),
      updatingLambda(
        receiverName,
        valueName,
        assignment(access, identifier(valueName)),
      ),
    ],
    [projectedType],
  );
}

function planElementLocation(
  storageNode: Node,
  locationType: CsharpTypeNode,
  planned: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  state: DestructuringPlannerState,
): CsharpExpression | undefined {
  const source = input.semantics(sourceFile).getResolvedElementAccessInfo(storageNode);
  if (
    source === undefined ||
    !source.writable ||
    source.optionalChain ||
    planned.kind !== "ElementAccessExpression"
  ) {
    diagnostics.push(pointerDiagnostic(
      storageNode,
      "address-of",
      "The selected element is not an exact writable C# index location.",
    ));
    return undefined;
  }
  const receiverType = input.types.resolveSelectedValue(
    source.receiver.expression,
    source.receiver.type,
    sourceFile,
  );
  const receiverKind = classifyStorageReceiver(receiverType);
  if (receiverType === undefined || receiverKind === "unknown") {
    diagnostics.push(pointerDiagnostic(
      storageNode,
      "address-of",
      "The selected element receiver is neither a proven C# reference nor value type.",
    ));
    return undefined;
  }
  if (receiverKind === "reference") {
    const receiverName = allocateSyntheticParameter(state);
    const indexName = allocateSyntheticParameter(state);
    const valueName = allocateSyntheticParameter(state);
    const access = element(identifier(receiverName), identifier(indexName));
    return invokeMember(locationType, "Create", [
      planned.receiver,
      planned.argument,
      lambda([receiverName, indexName], access),
      lambda(
        [receiverName, indexName, valueName],
        assignment(access, identifier(valueName)),
      ),
    ]);
  }
  const receiverTargetType = receiverType;
  const receiverLocationType = csharpTypeFromTargetTypeRef(
    csharpRuntimeLocationTargetType(receiverTargetType),
  );
  if (receiverLocationType === undefined) {
    diagnostics.push(pointerDiagnostic(
      storageNode,
      "address-of",
      "The selected value-type element receiver location is not renderable.",
    ));
    return undefined;
  }
  const owner = planCsharpStorageLocation(
    source.receiver.expression,
    receiverTargetType,
    receiverLocationType,
    sourceFile,
    input,
    diagnostics,
    planExpression,
    state,
  );
  if (owner === undefined) {
    return undefined;
  }
  const receiverName = allocateSyntheticParameter(state);
  const indexName = allocateSyntheticParameter(state);
  const valueName = allocateSyntheticParameter(state);
  const access = element(identifier(receiverName), identifier(indexName));
  return invokeMember(owner, "Project", [
    planned.argument,
    lambda([receiverName, indexName], access),
    updatingLambda(
      receiverName,
      valueName,
      assignment(access, identifier(valueName)),
      indexName,
    ),
  ]);
}

function selectedPropertyIsStatic(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): boolean {
  const selection = selectCsharpTargetProperty(input, node, sourceFile);
  if (selection.kind === "resolved") {
    return selection.receiver.kind === "none";
  }
  return selection.kind === "source-owned" &&
    selection.source.selectedDeclaration !== undefined &&
    HasSyntacticModifier(
      input.ast,
      selection.source.selectedDeclaration,
      ModifierFlagsStatic,
    );
}

function classifyStorageReceiver(
  type: TargetTypeRef | undefined,
): "reference" | "value" | "unknown" {
  if (type === undefined) {
    return "unknown";
  }
  if (isCsharpValueTypeTargetType(type)) {
    return "value";
  }
  switch (type.kind) {
    case "array":
    case "target-named":
      return "reference";
    case "source-primitive":
    case "tuple":
    case "pointer":
    case "function-pointer":
      return "value";
    case "source-global":
    case "type-parameter":
    case "opaque":
    case "associated-type":
    case "lifetime":
    case "target-specific":
      return "unknown";
  }
}

function createDirectLocation(
  locationType: CsharpTypeNode,
  storage: CsharpExpression,
  state: DestructuringPlannerState,
): CsharpExpression {
  const valueName = allocateSyntheticParameter(state);
  return invokeMember(locationType, "Create", [
    lambda([], storage),
    lambda([valueName], assignment(storage, identifier(valueName))),
  ]);
}

function invokeMember(
  receiver: CsharpExpression,
  name: string,
  args: readonly CsharpExpression[],
  typeArguments?: readonly CsharpTypeNode[],
): CsharpExpression {
  return {
    kind: "InvocationExpression",
    callee: {
      kind: "SimpleMemberAccessExpression",
      receiver,
      name,
      ...(typeArguments === undefined ? {} : { typeArguments }),
    },
    arguments: args.map(argument),
  };
}

function argument(expression: CsharpExpression): CsharpArgument {
  return { kind: "Argument", expression };
}

function lambda(
  parameterNames: readonly string[],
  body: CsharpExpression,
): CsharpExpression {
  return {
    kind: "LambdaExpression",
    parameters: parameterNames.map(lambdaParameter),
    body,
  };
}

function updatingLambda(
  ownerName: string,
  valueName: string,
  update: CsharpExpression,
  stateName?: string,
): CsharpExpression {
  return {
    kind: "LambdaExpression",
    parameters: [
      lambdaParameter(ownerName),
      ...(stateName === undefined ? [] : [lambdaParameter(stateName)]),
      lambdaParameter(valueName),
    ],
    body: {
      kind: "Block",
      statements: [
        { kind: "ExpressionStatement", expression: update },
        { kind: "ReturnStatement", expression: identifier(ownerName) },
      ],
    },
  };
}

function lambdaParameter(name: string): CsharpLambdaParameter {
  return { kind: "Parameter", name };
}

function identifier(name: string): CsharpExpression {
  return { kind: "IdentifierName", name };
}

function member(receiver: CsharpExpression, name: string): CsharpExpression {
  return { kind: "SimpleMemberAccessExpression", receiver, name };
}

function element(
  receiver: CsharpExpression,
  index: CsharpExpression,
): CsharpExpression {
  return { kind: "ElementAccessExpression", receiver, argument: index };
}

function assignment(
  left: CsharpExpression,
  right: CsharpExpression,
): CsharpExpression {
  return {
    kind: "AssignmentExpression",
    left,
    operatorToken: { kind: "EqualsToken" },
    right,
  };
}

function pointerDiagnostic(
  node: Node,
  operation: PointerOperationFact["operation"],
  reason: string,
): TargetDiagnostic {
  return unsupportedNodeDiagnostic(
    node,
    `C# '${operation}' pointer lowering requires exact finalized typed-location evidence. ${reason}`,
  );
}
