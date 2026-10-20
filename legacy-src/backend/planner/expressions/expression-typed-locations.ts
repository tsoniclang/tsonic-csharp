import type {
  Node,
  SourceFile,
} from "@tsonic/tsts";
import { planCsharpNativeMemoryCall } from "./native-memory.js";
import { planCsharpIndexedLocation } from "./indexed-locations.js";
import { objectShapeBoundStorageMemberName } from "../../../target-model/names/object-members.js";
import { objectShapeBoundStorageTargetType } from "../objects/object-shape-storage.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTypedLocationOperationKind } from "../../../target-model/records/typed-locations.js";
import type { CsharpTypedLocationStorage } from "../../../target-model/records/typed-location-storage.js";
import {
  csharpRuntimeLocationTargetType,
} from "../../../target-model/types/index.js";
import type {
  CsharpPlanningContext,
} from "../context.js";
import type {
  CsharpArgument,
  CsharpExpression,
  CsharpLambdaParameter,
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import {
  allocateSyntheticParameter,
  createDestructuringPlannerState,
  getCsharpTypedLocationIdentityName,
  type DestructuringPlannerState,
} from "../bindings/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../diagnostics.js";
import type { ExpressionPlanner } from "./expression-planner-types.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import { csharpPlannedValue, type CsharpPlannedValue } from "./planned-values.js";
import { buildCsharpPlannedValue, projectCsharpPlannedValue, planCsharpExpressionCompletion } from "./planned-value-composition.js";
import { readCsharpNativeExpressionCarrier } from "./native-uses.js";
import { captureCsharpPlannedLocation } from "./planned-locations.js";
import { translateCsharpPropertyAccess } from "./target-members/selected-property.js";
import { sourceNodesEqual } from "@tsonic/target-api/source";
import type { CsharpNativeHandler } from "../../../target-model/records/native-handlers.js";

export function planCsharpTypedLocationOperation(node: Node, operation: Extract<CsharpNativeHandler, { readonly kind: "typed-location" }>["selection"], sourceFile: SourceFile, input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], planExpression: ExpressionPlanner, state?: DestructuringPlannerState
): CsharpPlannedValue | undefined {
  if (operation.kind === "rejected") {
    diagnostics.push(typedLocationDiagnostic(
      node,
      operation.operation,
      operation.reason,
    ));
    return undefined;
  }
  const pointeeType = csharpTypeFromTargetTypeRef(operation.pointeeType, input.scope.typeParameterNames);
  const locationType = csharpTypeFromTargetTypeRef(operation.locationType, input.scope.typeParameterNames);
  if (pointeeType === undefined || locationType === undefined) {
    diagnostics.push(typedLocationDiagnostic(
      node,
      operation.kind,
      "The selected C# typed-location operation is not renderable.",
    ));
    return undefined;
  }
  switch (operation.kind) {
    case "location-hash": {
      const parameterType = csharpTypeFromTargetTypeRef(operation.parameterType, input.scope.typeParameterNames);
      if (parameterType === undefined) return undefined;
      const pointer = planExpression(operation.locationExpression, sourceFile, input, diagnostics
      );
      return pointer === undefined ? undefined : projectCsharpPlannedValue(node, sourceFile, input, diagnostics, pointer,
        value => invokeMember(locationType, "Hash", [value]));
    }
    case "location-bind":
    case "location-view":
    case "location-project": {
      const args = operation.arguments.map(argument => {
        const type = csharpTypeFromTargetTypeRef(argument.type, input.scope.typeParameterNames);
        return type === undefined ? undefined : planExpression(argument.expression, sourceFile, input, diagnostics
        );
      });
      const typeArguments = operation.typeArguments.map(type => csharpTypeFromTargetTypeRef(type, input.scope.typeParameterNames));
      return args.some(value => value === undefined) || typeArguments.some(value => value === undefined) ? undefined
        : buildCsharpPlannedValue(node, sourceFile, input, diagnostics, args,
          values => invokeMember(locationType, operation.method, values, typeArguments as CsharpTypeNode[]));
    }
    case "location-address": {
      if (input.program.records.nativeArray.get(operation.storage.expression)?.kind === "element") {
        const value = planExpression(operation.storage.expression, sourceFile, input, diagnostics);
        if (value?.completion.kind === "value" && value.completion.expression.kind === "ElementAccessExpression" && value.completion.expression.arguments.length === 1) {
          return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, value,
            selected => selected.kind === "ElementAccessExpression" ? invokeMember(selected.receiver, "LocationAt", selected.arguments) : undefined);
        }
        diagnostics.push(typedLocationDiagnostic(node, operation.kind, "Native array backing did not produce its sealed element access."));
        return undefined;
      }
      if (operation.storage.kind === "reference-property-storage") {
        const source = input.program.records.sourceMember.get(operation.storage.expression);
        const shape = source?.objectShape;
        const member = source?.shapeMember?.kind === "resolved" ? source.shapeMember.member : undefined;
        const backing = shape === undefined || member === undefined ? undefined
          : input.program.records.nativeField.get(shape.targetType, member.targetName);
        if (backing !== undefined) {
          const value = planExpression(operation.storage.expression, sourceFile, input, diagnostics);
          if (value?.completion.kind === "value" && value.completion.expression.kind === "SimpleMemberAccessExpression") {
            return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, value,
              selected => selected.kind === "SimpleMemberAccessExpression" ? { kind: "SimpleMemberAccessExpression", receiver: selected.receiver, name: backing.storageName } : undefined);
          }
          diagnostics.push(typedLocationDiagnostic(node, operation.kind, "Native field backing did not produce its sealed field access."));
          return undefined;
        }
      }
      if (operation.storage.kind === "direct-storage" && operation.storage.identity.kind === "local-storage" &&
        input.program.records.nativeBacking.get(operation.storage.identity.declaration) !== undefined) {
        const value = planExpression(operation.storage.expression, sourceFile, input, diagnostics);
        if (value?.completion.kind === "value" && value.completion.expression.kind === "SimpleMemberAccessExpression" && value.completion.expression.name === "Value") {
          return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, value,
            selected => selected.kind === "SimpleMemberAccessExpression" ? selected.receiver : undefined);
        }
        diagnostics.push(typedLocationDiagnostic(node, operation.kind, "Native local backing did not produce its sealed location access."));
        return undefined;
      }
      const plannerState = state ??
        createDestructuringPlannerState(sourceFile, input.program.source.ast);
      return planCsharpTypedLocationStorage(
          operation.storage,
          locationType,
          sourceFile,
          input,
          diagnostics,
          planExpression,
          plannerState,
        );
    }
    case "location-allocate": {
      const initial = planExpression(operation.initialExpression, sourceFile, input, diagnostics
      );
      const backing = input.program.records.nativeBacking.get(node);
      if (backing !== undefined) return initial === undefined
        ? undefined : projectCsharpPlannedValue(node, sourceFile, input, diagnostics, initial,
          value => planCsharpNativeMemoryCall(input.scope.typeParameterNames, "Allocate", value, backing));
      return initial === undefined ? undefined : projectCsharpPlannedValue(node, sourceFile, input, diagnostics, initial,
        value => invokeMember(locationType, "Allocate", [value]));
    }
    case "location-load": {
      const location = planExpression(
        operation.location.expression,
        sourceFile,
        input,
        diagnostics,
      );
      return location === undefined ? undefined : projectCsharpPlannedValue(node, sourceFile, input, diagnostics, location,
        value => operation.location.kind === "runtime-location" ? invokeMember(value, "Load", []) : value);
    }
    case "location-store": {
      const location = planExpression(
        operation.location.expression,
        sourceFile,
        operation.location.kind === "runtime-location" ? input
          : { ...input, storageExpression: operation.location.expression },
        diagnostics,
      );
      const value = planExpression(operation.valueExpression, sourceFile, input, diagnostics
      );
      if (operation.location.kind === "native-ref-return" && location !== undefined && value !== undefined &&
        (value.prelude.length !== 0 || value.completion.kind !== "value")) {
        const fact = input.program.records.nativeLocation.get(operation.location.expression);
        if (fact?.kind !== "resolved" || !fact.writable || fact.address?.passing !== "byref-readwrite") {
          diagnostics.push(typedLocationDiagnostic(node, operation.kind, fact?.kind === "rejected" ? fact.reason
            : "A native ref-return store requires its sealed writable managed address."));
          return undefined;
        }
        const captured = captureCsharpPlannedLocation(node, sourceFile, input, diagnostics, location, fact,
          input.program.sourceNavigation.expressionEffects(operation.valueExpression).suspends);
        if (captured === undefined || captured.completion.kind !== "value") return captured;
        const prelude = [...captured.prelude, ...value.prelude];
        return value.completion.kind === "never" ? { prelude, completion: value.completion }
          : value.completion.kind === "void" ? undefined : planCsharpExpressionCompletion(node, sourceFile, input, diagnostics,
            assignment(captured.completion.expression, value.completion.expression), readCsharpNativeExpressionCarrier(input, node), prelude);
      }
      return location === undefined || value === undefined ? undefined
        : buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [location, value],
                values => operation.location.kind === "runtime-location" ? invokeMember(values[0]!, "Store", [values[1]!])
                  : assignment(values[0]!, values[1]!));
    }
    case "location-equal": {
      const parameterType = csharpTypeFromTargetTypeRef(operation.parameterType, input.scope.typeParameterNames);
      if (parameterType === undefined) return undefined;
      const left = planExpression(operation.leftExpression, sourceFile, input, diagnostics
      );
      const right = planExpression(operation.rightExpression, sourceFile, input, diagnostics
      );
      return left === undefined || right === undefined ? undefined
        : buildCsharpPlannedValue(node, sourceFile, input, diagnostics, [left, right],
          values => invokeMember(locationType, "Same", values));
    }
  }
}

export function planCsharpProjectedFieldWrite(
  node: Node,
  planned: CsharpPlannedValue,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  state?: DestructuringPlannerState,
): CsharpPlannedValue | undefined {
  const selection = input.program.records.sourceMember.get(node)?.projectedWrite;
  if (selection === undefined) return planned;
  if (selection.kind === "rejected") {
    diagnostics.push(unsupportedNodeDiagnostic(node, selection.reason));
    return undefined;
  }
  const type = csharpTypeFromTargetTypeRef(csharpRuntimeLocationTargetType(selection.storage.valueType), input.scope.typeParameterNames);
  if (type === undefined || state === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "A bound value-field write requires its exact location type and owner identity scope."));
    return undefined;
  }
  const location = planCsharpTypedLocationStorage(selection.storage, type, sourceFile,
    input, diagnostics, planExpression, state);
  return projectCsharpPlannedValue(node, sourceFile, input, diagnostics, location, value => member(value, "Value"));
}

function planCsharpTypedLocationStorage(
  storage: CsharpTypedLocationStorage,
  locationType: CsharpTypeNode,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  state: DestructuringPlannerState,
): CsharpPlannedValue | undefined {
  if (storage.kind === "value-property-storage") return planValuePropertyLocation(storage,
    sourceFile, input, diagnostics, planExpression, state);
  if (storage.kind === "reference-indexed-storage") {
    return buildCsharpPlannedValue(storage.expression, sourceFile, input, diagnostics, [
      planExpression(storage.receiver, sourceFile, input, diagnostics),
      planExpression(storage.index, sourceFile, input, diagnostics),
    ], values => planCsharpIndexedLocation(storage, values[0]!, values[1]!));
  }
  const planned = planExpression(
    storage.expression,
    sourceFile,
    input,
    diagnostics,
  );
  if (planned === undefined) {
    return undefined;
  }
  return projectCsharpPlannedValue(storage.expression, sourceFile, input, diagnostics, planned, value => {
  switch (storage.kind) {
    case "direct-storage":
      return planDirectLocation(
        storage,
        locationType,
        value,
        input,
        diagnostics,
        state,
      );
    case "reference-property-storage":
      return planReferencePropertyLocation(
        value,
        locationType,
        storage.expression,
        storage.memberIdentity,
        diagnostics,
        state,
        boundRecordStorage(storage.expression, input),
      );
    case "reference-element-storage":
      return planReferenceElementLocation(
        value,
        locationType,
        storage.expression,
        diagnostics,
      );
  }
  }, csharpRuntimeLocationTargetType(storage.valueType));
}

function planReferencePropertyLocation(
  planned: CsharpExpression,
  locationType: CsharpTypeNode,
  sourceNode: Node,
  memberIdentity: string,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  bound?: { readonly name: string; readonly type: CsharpTypeNode },
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
  if (bound !== undefined) return invokeMember(bound.type, "FromReference", [
    planned.receiver, literal(memberIdentity), lambda([receiverName], member(receiver, bound.name)),
    lambda([receiverName, valueName], assignment(access, identifier(valueName))),
  ]);
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
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  planExpression: ExpressionPlanner,
  state: DestructuringPlannerState,
): CsharpPlannedValue | undefined {
  const ownerLocationType = csharpTypeFromTargetTypeRef(
    csharpRuntimeLocationTargetType(storage.receiverStorage.valueType), input.scope.typeParameterNames,
  );
  const projectedType = csharpTypeFromTargetTypeRef(storage.valueType, input.scope.typeParameterNames);
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
  const accessPlan = translateCsharpPropertyAccess(storage.expression, sourceFile, input, diagnostics,
    expression => sourceNodesEqual(input.program.source.ast, expression, storage.receiverStorage.expression)
      ? csharpPlannedValue(storage.receiverStorage.valueType, receiver) : undefined);
  if (accessPlan?.completion.kind !== "value" || accessPlan.prelude.length !== 0 ||
    accessPlan.completion.expression.kind !== "SimpleMemberAccessExpression") {
    diagnostics.push(typedLocationDiagnostic(storage.expression, "location-address",
      "The selected value-field accessor requires its exact sealed owner and native member location."));
    return undefined;
  }
  const access = accessPlan.completion.expression;
  const bound = boundRecordStorage(storage.expression, input);
  return projectCsharpPlannedValue(storage.expression, sourceFile, input, diagnostics, owner, value => {
  if (bound !== undefined) return invokeMember(bound.type, "FromValueLocation", [
    value, literal(storage.memberIdentity), lambda([receiverName], member(receiver, bound.name)),
    updatingLambda(receiverName, valueName, assignment(access, identifier(valueName))),
  ]);
  return invokeMember(
    value,
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
  }, csharpRuntimeLocationTargetType(storage.valueType));
}

function boundRecordStorage(node: Node, input: CsharpPlanningContext): { readonly name: string; readonly type: CsharpTypeNode } | undefined {
  const selected = input.program.records.sourceMember.get(node);
  const shape = selected?.objectShape;
  const field = selected?.shapeMember?.kind === "resolved" ? selected.shapeMember.member : undefined;
  if (shape === undefined || field?.bound !== true) return undefined;
  const type = csharpTypeFromTargetTypeRef(objectShapeBoundStorageTargetType(shape, field, input.program.records), input.scope.typeParameterNames);
  return type === undefined ? undefined : { type, name: objectShapeBoundStorageMemberName(shape, field) };
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
  if (planned.arguments.length !== 1) {
    diagnostics.push(typedLocationDiagnostic(
      sourceNode,
      "location-address",
      "A managed reference-element location requires exactly one selected C# array index.",
    ));
    return undefined;
  }
  return invokeMember(locationType, "CreateArrayElement", [
    planned.receiver,
    planned.arguments[0]!,
  ]);
}

function planDirectLocation(
  storage: Extract<CsharpTypedLocationStorage, {
    readonly kind: "direct-storage";
  }>,
  locationType: CsharpTypeNode,
  planned: CsharpExpression,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): CsharpExpression | undefined {
  const valueName = allocateSyntheticParameter(state);
  switch (storage.identity.kind) {
    case "local-storage": {
      const captured = input.program.records.capturedBinding.get(storage.identity.declaration);
      if (captured !== undefined) {
        if (planned.kind !== "SimpleMemberAccessExpression" || planned.name !== captured.fieldName) {
          diagnostics.push(typedLocationDiagnostic(storage.expression, "location-address",
            "The captured local did not emit its exact sealed native frame field."));
          return undefined;
        }
        return planReferencePropertyLocation(planned, locationType, storage.expression, captured.fieldName, diagnostics, state);
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
      return planReferencePropertyLocation(planned, locationType, storage.expression,
        storage.identity.memberIdentity, diagnostics, state);
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
