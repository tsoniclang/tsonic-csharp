import type { CsharpTypeResolutionScope } from "./engine.js";
import type { CsharpTypeResolutionState } from "./model.js";
import type { ExtensionFactSubject, SourceFile, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import {
  csharpAnyTargetType,
  csharpRuntimeLocationTargetType,
  csharpRuntimeRawPointerTargetType,
  csharpRuntimeNullTargetType,
  csharpRuntimeUndefinedTargetType,
  isCsharpRuntimeUndefinedTargetType,
  csharpTsValueTargetType,
} from "../../../target-model/types/runtime-carriers.js";
import {
  csharpBigIntegerTargetType,
  csharpJsStringTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpNeverTargetType,
  csharpVoidTargetType,
} from "../../../target-model/types/scalar-types.js";
import { csharpJsSymbolTargetType } from "./surface-types.js";
import {
  readCsharpSourceDefaultValue,
  readCsharpSourceFixedArrayType,
  readCsharpSourceFunctionPointerType,
  readCsharpSourceJsStringMarker,
  readCsharpSourcePointerType,
  isCsharpSourceRawPointer,
} from "./source-markers.js";
import { classifyCsharpSourceProfileType } from "./source-profile.js";
import { csharpTargetTypeFromBinding } from "../storage/bindings.js";
import { readCsharpSourceKeepAlive } from "../../operations/flow/source-flow.js";
import { csharpNullableReferenceTargetType, isCsharpNullableReferenceTargetType } from "../../../target-model/types/nullable.js";
import { maximumTypeResolutionDepth } from "./model.js";
import { nextState } from "./state.js";
import { providerVirtualDeclarationFactKey, sourcePrimitiveFactKey } from "@tsonic/tsts";
import { readCsharpSourceNativePointerOperation } from "../../operations/pointers/source-native-pointers.js";
import { readCsharpSourceTypedLocationOperation } from "../../operations/typed-locations/source-typed-locations.js";
import { readCsharpSourceUnsafeContext } from "../../operations/safety/explicit.js";
import { relateTypeArguments } from "./generic-arguments.js";
import { readCsharpSourceRawAddress, csharpRawAddressResultType } from "../../operations/pointers/raw-addresses.js";
import { selectCsharpLayoutObservation } from "../../operations/pointers/layout-observations.js";
import { readCsharpRawLocation } from "../../operations/pointers/native-memory.js";
import { resolveTypeParameter, definedValues, isUndefinedType } from "./source-evidence.js";

export function resolveTypeWithState(
  { host, resolveCallableType, resolveDirectSourceFacts, resolveProjectSourceSemanticType, resolveProviderType, resolveSemanticTypeArguments, resolveSourceProfileType, resolveTypeWithState, resolveUnionType }: CsharpTypeResolutionScope,
  type: Type | undefined,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  if (type === undefined || state.depth > maximumTypeResolutionDepth) {
    return undefined;
  }
  const queries = host.semantics(sourceFile);
  const subjects = queries.facts.typeSubjects(type);
  const direct = resolveDirectSourceFacts(subjects, sourceFile, state);
  if (direct !== undefined) {
    return direct;
  }
  const substitutionBase = queries.types.substitutionBaseType(type);
  if (substitutionBase !== undefined) {
    return resolveTypeWithState(
      substitutionBase,
      sourceFile,
      nextState(state),
    );
  }
  const targetTypeArguments = resolveSemanticTypeArguments(type, queries, state);
  if (targetTypeArguments === undefined) {
    return undefined;
  }
  const providerType = resolveProviderType(subjects, targetTypeArguments);
  if (providerType !== undefined) {
    return providerType;
  }
  const typeParameter = resolveTypeParameter(type, queries, host.ast);
  if (typeParameter !== undefined) {
    return typeParameter;
  }
  if (queries.types.isAny(type)) {
    return csharpAnyTargetType();
  }
  if (queries.types.isUnknown(type)) {
    return csharpTsValueTargetType();
  }
  if (queries.types.isNever(type)) {
    return csharpNeverTargetType();
  }
  if (queries.types.isNullish(type)) {
    return isUndefinedType(type, queries)
      ? csharpRuntimeUndefinedTargetType()
      : csharpRuntimeNullTargetType();
  }
  if (queries.types.isUnion(type)) {
    return resolveUnionType(type, queries, state);
  }
  if (queries.types.isTuple(type)) {
    const rawSourceElements = queries.types.tupleElementTypes(type);
    const sourceElements = definedValues(
      rawSourceElements,
    );
    if (sourceElements.length !== rawSourceElements.length) {
      return undefined;
    }
    const elements = sourceElements.map((element) =>
      resolveTypeWithState(element, sourceFile, nextState(state))
    );
    return elements.some((element) => element === undefined)
      ? undefined
      : {
          kind: "tuple",
          elements: elements as readonly TargetTypeRef[],
        };
  }
  const profileType = classifyCsharpSourceProfileType(type, queries, host.ast);
  if (profileType !== undefined) {
    const resolvedProfileType = resolveSourceProfileType(
      profileType,
      targetTypeArguments,
    );
    if (resolvedProfileType !== undefined) {
      return resolvedProfileType;
    }
  }
  const projectType = resolveProjectSourceSemanticType(
    type,
    queries,
    targetTypeArguments,
  );
  if (projectType !== undefined) {
    return projectType;
  }
  const callable = resolveCallableType(type, queries, state);
  if (callable !== undefined) {
    return callable;
  }
  if (queries.types.isBooleanLike(type)) {
    return csharpSourcePrimitiveTargetType("bool");
  }
  if (queries.types.isNumberLike(type)) {
    return csharpSourcePrimitiveTargetType("float64");
  }
  if (queries.types.isStringLike(type)) {
    return csharpStringTargetType();
  }
  if (queries.types.isBigIntLike(type)) {
    return csharpBigIntegerTargetType();
  }
  if (host.target.surfaces?.includes("js") === true && queries.types.isSymbolLike(type)) {
    return csharpJsSymbolTargetType();
  }
  if (queries.types.isVoidLike(type)) {
    return csharpVoidTargetType();
  }
  return host.structuralTypes.resolveType(
    type,
    sourceFile,
    nextState(state),
  );
}


export function resolveDirectSourceFacts(
  { host, resolveNodeWithState, resolveTypeWithState, resolveSelectedValueWithState, resolveTypedLocationOperationPointeeWithState }: CsharpTypeResolutionScope,
  subjects: readonly ExtensionFactSubject[],
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  for (const subject of subjects) {
    const rawLocation = readCsharpRawLocation(host.ast, host.sourceFacts, subject);
    if (rawLocation?.kind === "resolved") {
      if (rawLocation.operation.operation === "to-raw") return csharpNullableReferenceTargetType(csharpRuntimeRawPointerTargetType());
      const typeNode = rawLocation.operation.explicitPointeeTypeNode ?? rawLocation.layout.explicitTypeNode;
      const pointee = typeNode === undefined
        ? resolveTypeWithState(rawLocation.operation.pointeeType, sourceFile, nextState(state))
        : resolveNodeWithState(typeNode, sourceFile, nextState(state));
      if (pointee !== undefined) return csharpNullableReferenceTargetType(csharpRuntimeLocationTargetType(pointee));
    }
    if (selectCsharpLayoutObservation(host.sourceFacts, subject)?.kind === "layout-query") {
      return csharpSourcePrimitiveTargetType("native-uint");
    }
    const rawAddress = readCsharpSourceRawAddress(host.sourceFacts, subject);
    if (rawAddress !== undefined) return csharpRawAddressResultType(rawAddress);
    if (readCsharpSourceKeepAlive(host.sourceFacts, subject) !== undefined) {
      return csharpVoidTargetType();
    }
    if (readCsharpSourceJsStringMarker(host.sourceFacts, subject)) {
      return csharpJsStringTargetType();
    }
    const defaultValue = readCsharpSourceDefaultValue(
      host.sourceFacts,
      subject,
    );
    if (defaultValue !== undefined) {
      const type = resolveNodeWithState(
        defaultValue.sourceType,
        sourceFile,
        nextState(state),
      );
      if (type !== undefined) {
        return type;
      }
    }
    const primitive = host.sourceFacts?.getFact(subject, sourcePrimitiveFactKey);
    if (primitive !== undefined) {
      return csharpSourcePrimitiveTargetType(primitive.kind);
    }
    const fixedArray = readCsharpSourceFixedArrayType(
      host.sourceFacts,
      subject,
    );
    if (fixedArray !== undefined) {
      const element = resolveNodeWithState(
        fixedArray.sourceElementType,
        sourceFile,
        nextState(state),
      );
      if (element !== undefined) {
        return { kind: "array", element };
      }
    }
    const unsafeContext = readCsharpSourceUnsafeContext(
      host.sourceFacts,
      subject,
    );
    if (unsafeContext?.kind === "expression") {
      const type = resolveNodeWithState(
        unsafeContext.expression,
        sourceFile,
        nextState(state),
      );
      if (type !== undefined) {
        return type;
      }
    }
    if (isCsharpSourceRawPointer(host.sourceFacts, subject)) return csharpRuntimeRawPointerTargetType();
    const pointer = readCsharpSourcePointerType(host.sourceFacts, subject);
    if (pointer !== undefined) {
      const pointee = resolveNodeWithState(
        pointer.sourcePointee,
        sourceFile,
        nextState(state),
      );
      if (pointee !== undefined) {
        return csharpRuntimeLocationTargetType(pointee);
      }
    }
    const pointerOperation = readCsharpSourceTypedLocationOperation(
      host.sourceFacts,
      subject,
    );
    if (pointerOperation !== undefined) {
      const pointee = resolveTypedLocationOperationPointeeWithState(
        pointerOperation,
        sourceFile,
        nextState(state),
      );
      if (pointee !== undefined) {
        switch (pointerOperation.kind) {
          case "location-address":
          case "location-allocate":
          case "location-bind":
            return csharpRuntimeLocationTargetType(pointee);
          case "location-load":
            return pointee;
          case "location-store":
            return csharpVoidTargetType();
          case "location-equal":
            return csharpSourcePrimitiveTargetType("bool");
          case "location-hash":
            return csharpSourcePrimitiveTargetType("float64");
          case "location-project": {
            const sourceLocation = resolveSelectedValueWithState(
              pointerOperation.locationExpression,
              pointerOperation.locationType,
              sourceFile,
              nextState(state),
            );
            const location = csharpRuntimeLocationTargetType(pointee);
            return isCsharpNullableReferenceTargetType(sourceLocation) || isCsharpRuntimeUndefinedTargetType(sourceLocation)
              ? csharpNullableReferenceTargetType(location)
              : location;
          }
        }
      }
    }
    const nativePointerOperation = readCsharpSourceNativePointerOperation(
      host.sourceFacts,
      subject,
    );
    if (nativePointerOperation !== undefined) {
      const pointerType = resolveSelectedValueWithState(
        nativePointerOperation.pointerExpression,
        nativePointerOperation.pointerType,
        sourceFile,
        nextState(state),
      );
      if (pointerType?.kind === "pointer") {
        switch (nativePointerOperation.operation) {
          case "load":
            return pointerType.pointee;
          case "store":
            return csharpVoidTargetType();
          case "offset":
            return pointerType;
        }
      }
    }
    const functionPointer = readCsharpSourceFunctionPointerType(
      host.sourceFacts,
      subject,
    );
    if (functionPointer !== undefined) {
      const parameters = functionPointer.sourceParameters.map((parameter) =>
        resolveNodeWithState(parameter, sourceFile, nextState(state))
      );
      const result = resolveNodeWithState(
        functionPointer.sourceResult,
        sourceFile,
        nextState(state),
      );
      if (
        result !== undefined &&
        parameters.every((parameter) => parameter !== undefined)
      ) {
        return {
          kind: "function-pointer",
          args: parameters as readonly TargetTypeRef[],
          result,
          ...(functionPointer.abi.length === 0
            ? {}
            : { abi: functionPointer.abi }),
        };
      }
    }
  }
  return undefined;
}


export function resolveProviderType(
  { host }: CsharpTypeResolutionScope,
  subjects: readonly ExtensionFactSubject[],
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  for (const subject of subjects) {
    const declaration = host.sourceFacts?.getFact(
      subject,
      providerVirtualDeclarationFactKey,
    );
    if (declaration === undefined) {
      continue;
    }
    const resolution = host.providers.resolveType(declaration);
    if (resolution.kind !== "resolved") {
      continue;
    }
    const typeRelations = resolution.relations.filter(
      (relation) => relation.kind === "type",
    );
    if (typeRelations.length !== 1) {
      continue;
    }
    const relation = typeRelations[0]!;
    const targetArguments = relateTypeArguments(
      typeArguments,
      relation.bindingTypeParameters,
      relation.targetBinding.typeParameters?.length ?? 0,
    );
    if (targetArguments === undefined) {
      continue;
    }
    const targetType = csharpTargetTypeFromBinding(
      relation.targetBinding,
      targetArguments,
    );
    if (targetType !== undefined) {
      return targetType;
    }
  }
  return undefined;
}


export function resolveSemanticTypeArguments(
  { resolveTypeWithState }: CsharpTypeResolutionScope,
  type: Type,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): readonly TargetTypeRef[] | undefined {
  if (!queries.types.isTypeReference(type)) {
    return [];
  }
  const sourceArguments = queries.types.effectiveTypeArguments(type);
  if (sourceArguments === undefined) {
    return undefined;
  }
  const resolved = sourceArguments.map((argument) =>
    resolveTypeWithState(argument, queries.sourceFile, nextState(state))
  );
  return resolved.some((argument) => argument === undefined)
    ? undefined
    : resolved as readonly TargetTypeRef[];
}
