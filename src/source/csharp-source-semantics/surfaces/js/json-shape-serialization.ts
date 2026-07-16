import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpJsonSerializableShapeFactKey,
} from "../../../csharp-facts.js";
import type {
  CsharpObjectShapeFact,
} from "../../../csharp-facts.js";
import type {
  CsharpOperationsProviderHost,
} from "../../operations-provider.js";
import {
  isCsharpRecordDictionaryTargetType,
} from "../../dictionaries.js";
import {
  isCsharpStringType,
  unwrapNullableTargetType,
} from "../../target-rules.js";
import {
  getRecordedCsharpObjectShapeFacts,
} from "../../object-shape-facts/recording.js";
import {
  targetTypeRefEquals,
  targetTypeRefKey,
} from "../../target-ref-utils.js";

type JsonShapeSerializationHost = Pick<CsharpOperationsProviderHost, "getCsharpObjectShapeFactForSubject">;

export function jsonSerializableObjectShapeForSubject(
  subject: ExtensionFactSubject | undefined,
  targetType: TargetTypeRef | undefined,
  context: ExtensionObservationContext,
  host: JsonShapeSerializationHost,
): CsharpObjectShapeFact | undefined {
  const shape = host.getCsharpObjectShapeFactForSubject(subject, context) ??
    host.getCsharpObjectShapeFactForSubject(targetType, context);
  return shape !== undefined && collectJsonObjectShapeClosure(shape, context, host, new Set(), new Map())
    ? shape
    : undefined;
}

export function recordJsonSerializableObjectShapes(
  subject: ExtensionFactSubject | undefined,
  targetType: TargetTypeRef | undefined,
  context: ExtensionObservationContext,
  host: JsonShapeSerializationHost,
): boolean {
  const shapes = new Map<string, CsharpObjectShapeFact>();
  if (!collectJsonTargetTypeClosure(subject, targetType, context, host, new Set(), shapes)) {
    return false;
  }
  for (const shape of shapes.values()) {
    context.facts.set(shape.targetType, csharpJsonSerializableShapeFactKey, {
      kind: "closed-object-shape",
    }, [{ message: "C# closed JSON object-shape serialization fact recorded from selected JSON.stringify source evidence." }]);
  }
  return true;
}

export function jsonTargetTypeHasClosedObjectShape(
  subject: ExtensionFactSubject | undefined,
  targetType: TargetTypeRef | undefined,
  context: ExtensionObservationContext,
  host: JsonShapeSerializationHost,
): boolean {
  return collectJsonTargetTypeClosure(subject, targetType, context, host, new Set(), new Map());
}

function collectJsonTargetTypeClosure(
  subject: ExtensionFactSubject | undefined,
  targetType: TargetTypeRef | undefined,
  context: ExtensionObservationContext,
  host: JsonShapeSerializationHost,
  visiting: Set<string>,
  shapes: Map<string, CsharpObjectShapeFact>,
): boolean {
  if (targetType === undefined) {
    return false;
  }
  const shape = host.getCsharpObjectShapeFactForSubject(subject, context) ??
    host.getCsharpObjectShapeFactForSubject(targetType, context);
  if (shape !== undefined) {
    return collectJsonObjectShapeClosure(shape, context, host, visiting, shapes);
  }
  if (targetType.kind === "array") {
    return collectJsonTargetTypeClosure(targetType.element, targetType.element, context, host, visiting, shapes) ||
      jsonTargetTypeIsClosedLeaf(targetType.element);
  }
  if (targetType.kind === "target-named" && targetType.id === "Tsonic.CSharp.Js.JSArray`1") {
    const elementType = targetType.typeArguments?.[0];
    return elementType !== undefined &&
      (collectJsonTargetTypeClosure(elementType, elementType, context, host, visiting, shapes) || jsonTargetTypeIsClosedLeaf(elementType));
  }
  if (isCsharpRecordDictionaryTargetType(targetType)) {
    const keyType = targetType.typeArguments?.[0];
    const valueType = targetType.typeArguments?.[1];
    return keyType !== undefined && valueType !== undefined && isCsharpStringType(keyType) &&
      (collectJsonTargetTypeClosure(valueType, valueType, context, host, visiting, shapes) || jsonTargetTypeIsClosedLeaf(valueType));
  }
  return jsonTargetTypeIsClosedLeaf(targetType);
}

function collectJsonObjectShapeClosure(
  shape: CsharpObjectShapeFact,
  context: ExtensionObservationContext,
  host: JsonShapeSerializationHost,
  visiting: Set<string>,
  shapes: Map<string, CsharpObjectShapeFact>,
): boolean {
  const identity = objectShapeIdentity(shape);
  if (shapes.has(identity)) {
    return true;
  }
  if (visiting.has(identity)) {
    return false;
  }
  visiting.add(identity);
  for (const member of shape.members) {
    if (member.targetName === "__tsonicWriteJson") {
      visiting.delete(identity);
      return false;
    }
    if (member.memberKind === "method") {
      continue;
    }
    if (member.optional === true) {
      visiting.delete(identity);
      return false;
    }
    const unwrapped = unwrapNullableTargetType(member.type) ?? member.type;
    if (
      !collectJsonTargetTypeClosure(member.type, unwrapped, context, host, visiting, shapes) &&
      !jsonTargetTypeIsClosedLeaf(unwrapped)
    ) {
      visiting.delete(identity);
      return false;
    }
  }
  visiting.delete(identity);
  shapes.set(identity, shape);
  for (const candidate of getRecordedCsharpObjectShapeFacts(context)) {
    if (
      (candidate.implements ?? []).some((contract) => targetTypeRefEquals(contract, shape.targetType)) &&
      !collectJsonObjectShapeClosure(candidate, context, host, visiting, shapes)
    ) {
      return false;
    }
  }
  return true;
}

function jsonTargetTypeIsClosedLeaf(type: TargetTypeRef): boolean {
  return isCsharpStringType(type) ||
    type.kind === "source-primitive" ||
    (type.kind === "target-named" && (
      type.id === "Tsonic.CSharp.Js.JSObject" ||
      type.id === "Tsonic.CSharp.Js.TsValue"
    ));
}

function objectShapeIdentity(shape: CsharpObjectShapeFact): string {
  return targetTypeRefKey(shape.targetType);
}
