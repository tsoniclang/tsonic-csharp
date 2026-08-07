import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpTypedLocationOperationKind,
  CsharpTypedLocationStorage,
} from "../../policy/operations/index.js";
import {
  selectCsharpTypedLocationOperation,
} from "../../policy/operations/index.js";
import {
  csharpRuntimeLocationTargetType,
} from "../../policy/types/index.js";
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
  getCsharpTypedLocationIdentityName,
  type DestructuringPlannerState,
} from "./bindings.js";
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

export type CsharpTypedLocationOperationPlan =
  | { readonly handled: false }
  | { readonly handled: true; readonly expression?: CsharpExpression };

export function tryPlanCsharpTypedLocationOperation(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  planExpressionWithExpectedType: ExpectedExpressionPlanner,
  state?: DestructuringPlannerState,
): CsharpTypedLocationOperationPlan {
  const operation = selectCsharpTypedLocationOperation(
    input,
    node,
    sourceFile,
  );
  if (operation.kind === "not-typed-location") {
    return { handled: false };
  }
  if (operation.kind === "rejected") {
    diagnostics.push(typedLocationDiagnostic(
      node,
      operation.operation,
      operation.reason,
    ));
    return { handled: true };
  }
  const pointeeType = csharpTypeFromTargetTypeRef(operation.pointeeType);
  const locationType = csharpTypeFromTargetTypeRef(operation.locationType);
  if (pointeeType === undefined || locationType === undefined) {
    diagnostics.push(typedLocationDiagnostic(
      node,
      operation.kind,
      "The selected C# typed-location operation is not renderable.",
    ));
    return { handled: true };
  }
  switch (operation.kind) {
    case "location-address": {
      const plannerState = state ??
        createDestructuringPlannerState(sourceFile, input.ast);
      return {
        handled: true,
        expression: planCsharpTypedLocationStorage(
          operation.storage,
          locationType,
          sourceFile,
          input,
          diagnostics,
          planExpression,
          plannerState,
        ),
      };
    }
    case "location-allocate": {
      const initial = planExpressionWithExpectedType(
        operation.initialExpression,
        sourceFile,
        input,
        diagnostics,
        pointeeType,
        undefined,
        operation.pointeeType,
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
    case "location-load": {
      const location = planExpression(
        operation.locationExpression,
        sourceFile,
        input,
        diagnostics,
      );
      return {
        handled: true,
        ...(location === undefined
          ? {}
          : { expression: invokeMember(location, "Load", []) }),
      };
    }
    case "location-store": {
      const location = planExpression(
        operation.locationExpression,
        sourceFile,
        input,
        diagnostics,
      );
      const value = planExpressionWithExpectedType(
        operation.valueExpression,
        sourceFile,
        input,
        diagnostics,
        pointeeType,
        undefined,
        operation.pointeeType,
      );
      return {
        handled: true,
        ...(location === undefined || value === undefined
          ? {}
          : { expression: invokeMember(location, "Store", [value]) }),
      };
    }
    case "location-equal": {
      const left = planExpression(
        operation.leftExpression,
        sourceFile,
        input,
        diagnostics,
      );
      const right = planExpression(
        operation.rightExpression,
        sourceFile,
        input,
        diagnostics,
      );
      return {
        handled: true,
        ...(left === undefined || right === undefined
          ? {}
          : {
              expression: invokeMember(
                locationType,
                "Same",
                [left, right],
              ),
            }),
      };
    }
  }
}

function planCsharpTypedLocationStorage(
  storage: CsharpTypedLocationStorage,
  locationType: CsharpTypeNode,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  state: DestructuringPlannerState,
): CsharpExpression | undefined {
  const planned = planExpression(
    storage.expression,
    sourceFile,
    input,
    diagnostics,
  );
  if (planned === undefined) {
    return undefined;
  }
  switch (storage.kind) {
    case "direct-storage":
      return planDirectLocation(
        storage,
        locationType,
        planned,
        input,
        diagnostics,
        state,
      );
    case "reference-property-storage":
      return planReferencePropertyLocation(
        planned,
        locationType,
        storage.expression,
        storage.memberIdentity,
        diagnostics,
        state,
      );
    case "value-property-storage":
      return planValuePropertyLocation(
        storage,
        planned,
        sourceFile,
        input,
        diagnostics,
        planExpression,
        state,
      );
    case "reference-element-storage":
      return planReferenceElementLocation(
        planned,
        locationType,
        storage.expression,
        diagnostics,
      );
  }
}

function planReferencePropertyLocation(
  planned: CsharpExpression,
  locationType: CsharpTypeNode,
  sourceNode: Node,
  memberIdentity: string,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpExpression | undefined {
  if (planned.kind !== "SimpleMemberAccessExpression") {
    diagnostics.push(typedLocationDiagnostic(
      sourceNode,
      "location-address",
      "The selected C# reference-property storage did not render as member access.",
    ));
    return undefined;
  }
  const receiverName = allocateSyntheticParameter(state);
  const valueName = allocateSyntheticParameter(state);
  const receiver = identifier(receiverName);
  const access = member(receiver, planned.name);
  return invokeMember(locationType, "CreateMember", [
    planned.receiver,
    literal(memberIdentity),
    lambda([receiverName], access),
    lambda(
      [receiverName, valueName],
      assignment(access, identifier(valueName)),
    ),
  ]);
}

function planValuePropertyLocation(
  storage: Extract<CsharpTypedLocationStorage, {
    readonly kind: "value-property-storage";
  }>,
  planned: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  state: DestructuringPlannerState,
): CsharpExpression | undefined {
  if (planned.kind !== "SimpleMemberAccessExpression") {
    diagnostics.push(typedLocationDiagnostic(
      storage.expression,
      "location-address",
      "The selected C# value-property storage did not render as member access.",
    ));
    return undefined;
  }
  const ownerLocationType = csharpTypeFromTargetTypeRef(
    csharpRuntimeLocationTargetType(storage.receiverStorage.valueType),
  );
  const projectedType = csharpTypeFromTargetTypeRef(storage.valueType);
  if (ownerLocationType === undefined || projectedType === undefined) {
    diagnostics.push(typedLocationDiagnostic(
      storage.expression,
      "location-address",
      "The selected C# value-property location types are not renderable.",
    ));
    return undefined;
  }
  const owner = planCsharpTypedLocationStorage(
    storage.receiverStorage,
    ownerLocationType,
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
  return invokeMember(
    owner,
    "ProjectMember",
    [
      literal(storage.memberIdentity),
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

function planReferenceElementLocation(
  planned: CsharpExpression,
  locationType: CsharpTypeNode,
  sourceNode: Node,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  if (planned.kind !== "ElementAccessExpression") {
    diagnostics.push(typedLocationDiagnostic(
      sourceNode,
      "location-address",
      "The selected C# reference-element storage did not render as element access.",
    ));
    return undefined;
  }
  return invokeMember(locationType, "CreateArrayElement", [
    planned.receiver,
    planned.argument,
  ]);
}

function planDirectLocation(
  storage: Extract<CsharpTypedLocationStorage, {
    readonly kind: "direct-storage";
  }>,
  locationType: CsharpTypeNode,
  planned: CsharpExpression,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpExpression | undefined {
  const valueName = allocateSyntheticParameter(state);
  switch (storage.identity.kind) {
    case "local-storage": {
      const revision = input.artifacts.revision;
      const requirement = input.artifacts.requireStorage(
        storage.expression,
        {
          kind: "typed-location-identity",
          declaration: storage.identity.declaration,
        },
      );
      if (requirement.kind === "rejected") {
        diagnostics.push(typedLocationDiagnostic(
          storage.expression,
          "location-address",
          requirement.reason,
        ));
        return undefined;
      }
      if (input.artifacts.revision !== revision) {
        return undefined;
      }
      const identityName = getCsharpTypedLocationIdentityName(
        storage.identity.declaration,
        state,
      );
      if (identityName === undefined) {
        diagnostics.push(typedLocationDiagnostic(
          storage.expression,
          "location-address",
          "The exact local storage declaration did not emit its required canonical identity.",
        ));
        return undefined;
      }
      return invokeMember(locationType, "CreateLocal", [
        identifier(identityName),
        lambda([], planned),
        lambda([valueName], assignment(planned, identifier(valueName))),
      ]);
    }
    case "static-storage":
      return invokeMember(locationType, "CreateStatic", [
        literal(storage.identity.identity),
        lambda([], planned),
        lambda([valueName], assignment(planned, identifier(valueName))),
      ]);
    case "instance-member-storage": {
      if (planned.kind !== "SimpleMemberAccessExpression") {
        diagnostics.push(typedLocationDiagnostic(
          storage.expression,
          "location-address",
          "The selected direct instance storage did not render as member access.",
        ));
        return undefined;
      }
      const receiverName = allocateSyntheticParameter(state);
      const receiver = identifier(receiverName);
      const access = member(receiver, planned.name);
      return invokeMember(locationType, "CreateMember", [
        planned.receiver,
        literal(storage.identity.memberIdentity),
        lambda([receiverName], access),
        lambda(
          [receiverName, valueName],
          assignment(access, identifier(valueName)),
        ),
      ]);
    }
  }
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

function literal(value: string): CsharpExpression {
  return { kind: "LiteralExpression", value };
}

function member(receiver: CsharpExpression, name: string): CsharpExpression {
  return { kind: "SimpleMemberAccessExpression", receiver, name };
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

function typedLocationDiagnostic(
  node: Node,
  operation: CsharpTypedLocationOperationKind,
  reason: string,
): TargetDiagnostic {
  return unsupportedNodeDiagnostic(
    node,
    `C# '${operation}' lowering requires one exact finalized typed-location operation. ${reason}`,
  );
}
