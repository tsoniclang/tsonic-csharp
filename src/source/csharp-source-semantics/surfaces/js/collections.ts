import {
  acceptObservation,
  deferObservation,
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  ExtensionObservation,
  RuntimeCarrierFactRequest,
  RuntimeCarrierFactResult,
  SourceFile,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import {
  asType,
  type CsharpTargetNamedTypeRef,
  csharpDelegateTargetType,
  csharpEnumerableTargetType,
  csharpNullableTargetType,
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
  isSourceLibraryType,
  targetMethod,
  targetParameter,
  targetProperty,
} from "./source-library.js";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "./source-library.js";
import {
  getSymbolForDeclarationLookup,
} from "../../symbol-utils.js";

const csharpJsMapTypeId = "Tsonic.CSharp.Js.Map`2";
const csharpJsSetTypeId = "Tsonic.CSharp.Js.Set`1";

type CsharpJsMapTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpJsSurfaceKind: "map";
};

type CsharpJsSetTargetTypeRef = CsharpTargetNamedTypeRef & {
  readonly csharpJsSurfaceKind: "set";
};

export function csharpJsMapTargetType(keyType: TargetTypeRef, valueType: TargetTypeRef): CsharpJsMapTargetTypeRef {
  return {
    ...csharpTargetNamedType(
      csharpJsMapTypeId,
      [keyType, valueType],
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Map"),
    ),
    csharpJsSurfaceKind: "map",
  } satisfies CsharpJsMapTargetTypeRef;
}

export function csharpJsSetTargetType(elementType: TargetTypeRef): CsharpJsSetTargetTypeRef {
  return {
    ...csharpTargetNamedType(
      csharpJsSetTypeId,
      [elementType],
      csharpQualifiedTypeRenderShape("Tsonic.CSharp.Js", "Set"),
    ),
    csharpJsSurfaceKind: "set",
  } satisfies CsharpJsSetTargetTypeRef;
}

export function isCsharpJsMapTargetType(type: TargetTypeRef | undefined): type is CsharpJsMapTargetTypeRef {
  return type?.kind === "target-named" && type.id === csharpJsMapTypeId;
}

export function isCsharpJsSetTargetType(type: TargetTypeRef | undefined): type is CsharpJsSetTargetTypeRef {
  return type?.kind === "target-named" && type.id === csharpJsSetTypeId;
}

export function getCsharpJsIterableElementType(type: TargetTypeRef | undefined): TargetTypeRef | undefined {
  if (type?.kind !== "target-named") {
    return undefined;
  }
  if (isCsharpJsMapTargetType(type)) {
    const [keyType, valueType] = type.typeArguments ?? [];
    return keyType === undefined || valueType === undefined
      ? undefined
      : { kind: "tuple", elements: [keyType, valueType] };
  }
  if (isCsharpJsSetTargetType(type)) {
    return type.typeArguments?.[0];
  }
  return undefined;
}

export function mapCsharpJsCollectionRuntimeCarrier(
  request: RuntimeCarrierFactRequest,
  context: ExtensionObservationContext<"type.resolveRuntimeCarrier">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<RuntimeCarrierFactResult> {
  const carrier = getCsharpJsCollectionRuntimeCarrierForType(asType(request.type), context, host);
  return carrier === undefined
    ? deferObservation
    : acceptObservation<RuntimeCarrierFactResult>({
        carrier,
      }, [{ message: "C# JS surface collection runtime carrier mapped from checked JavaScript library type and resolved type arguments." }]);
}

export function getCsharpJsCollectionRuntimeCarrierForType(
  type: Type | undefined,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  if (type === undefined) {
    return undefined;
  }
  const typeArguments = getTypeArguments(type, context)
    .map((argument) => host.getTargetTypeRefForSubject(argument, context, {
      allowRuntimeCarrier: true,
      allowSemanticTypeQuery: true,
    }));
  if ((isSourceLibraryType(type, context, "Map") || isSourceLibraryType(type, context, "ReadonlyMap")) && typeArguments.length === 2) {
    const [keyType, valueType] = typeArguments;
    return keyType === undefined || valueType === undefined
      ? undefined
      : csharpJsMapTargetType(keyType, valueType);
  }
  if ((isSourceLibraryType(type, context, "Set") || isSourceLibraryType(type, context, "ReadonlySet")) && typeArguments.length === 1) {
    const [elementType] = typeArguments;
    return elementType === undefined
      ? undefined
      : csharpJsSetTargetType(elementType);
  }
  return undefined;
}

export function recordCsharpJsCollectionRuntimeCarrierFactForNode(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): void {
  const carrier = getCsharpJsCollectionRuntimeCarrierForNode(node, sourceFile, context, host);
  if (carrier !== undefined) {
    recordCollectionRuntimeCarrierFact(node, carrier, sourceFile, context);
  }
}

function getCsharpJsCollectionRuntimeCarrierForNode(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  const type = checkedTypeAtLocation(node, sourceFile, context);
  return getCsharpJsCollectionRuntimeCarrierForType(type, context, host);
}

function checkedTypeAtLocation(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): Type | undefined {
  try {
    return context.compiler?.checker.getTypeAtLocation(node, { sourceFile });
  } catch {
    return undefined;
  }
}

function recordCollectionRuntimeCarrierFact(
  node: Node,
  carrier: TargetTypeRef,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): void {
  const fact = { carrier };
  const evidence = [{ message: "C# JS surface collection runtime carrier recorded from checked TypeScript Map/Set library type." }];
  setCollectionRuntimeCarrierFactIfAbsent(node, fact, evidence, context);
  const symbol = context.compiler === undefined
    ? undefined
    : getSymbolForDeclarationLookup(context.compiler.ast, context.compiler.checker, node, sourceFile);
  setCollectionRuntimeCarrierFactIfAbsent(symbol, fact, evidence, context);
}

function setCollectionRuntimeCarrierFactIfAbsent(
  subject: ExtensionFactSubject | undefined,
  fact: { readonly carrier: TargetTypeRef },
  evidence: readonly { readonly message: string }[],
  context: ExtensionObservationContext,
): void {
  if (subject !== undefined && context.host.facts.get(subject, runtimeCarrierFactKey) === undefined) {
    context.host.facts.set(subject, runtimeCarrierFactKey, fact, evidence);
  }
}

export function getCollectionTargetMembers(
  sourceMember: SourceLibraryMember,
  receiverType: TargetTypeRef | undefined,
  resultType: TargetTypeRef | undefined,
): readonly TargetMember[] {
  if (sourceMember.declaringName === "Map" || sourceMember.declaringName === "ReadonlyMap") {
    return getMapTargetMembers(sourceMember.memberName, receiverType, resultType);
  }
  if (sourceMember.declaringName === "Set" || sourceMember.declaringName === "ReadonlySet") {
    return getSetTargetMembers(sourceMember.memberName, receiverType, resultType);
  }
  return [];
}

export function getCollectionPropertyTargetMember(sourceMember: SourceLibraryMember, receiverType: TargetTypeRef | undefined): TargetMember | undefined {
  if (sourceMember.memberName !== "size") {
    return undefined;
  }
  if (!isCsharpJsMapTargetType(receiverType) && !isCsharpJsSetTargetType(receiverType)) {
    return undefined;
  }
  return targetProperty(
    `Tsonic.CSharp.Js.${sourceMember.declaringName}.size`,
    "size",
    "size",
    csharpSourcePrimitiveTargetType("int32"),
    { declaringType: receiverType },
  );
}

function getMapTargetMembers(sourceName: string, receiverType: TargetTypeRef | undefined, resultType: TargetTypeRef | undefined): readonly TargetMember[] {
  const mapType = isCsharpJsMapTargetType(resultType)
    ? resultType
    : isCsharpJsMapTargetType(receiverType)
      ? receiverType
      : csharpJsMapTargetType({ kind: "type-parameter", name: "K" }, { kind: "type-parameter", name: "V" });
  const [keyType, valueType] = mapType.kind === "target-named" ? mapType.typeArguments ?? [] : [];
  if (keyType === undefined || valueType === undefined) {
    return [];
  }
  switch (sourceName) {
    case "constructor":
      return [
        collectionConstructor("Tsonic.CSharp.Js.Map..ctor()", mapType, []),
        collectionConstructor("Tsonic.CSharp.Js.Map..ctor(System.Collections.Generic.IEnumerable`1)", mapType, [
          targetParameter("entries", csharpEnumerableTargetType({ kind: "tuple", elements: [keyType, valueType] })),
        ]),
      ];
    case "get":
      return [collectionMethod("Map", sourceName, mapType, [targetParameter("key", keyType)], csharpNullableTargetType(valueType))];
    case "set":
      return [collectionMethod("Map", sourceName, mapType, [targetParameter("key", keyType), targetParameter("value", valueType)], mapType)];
    case "has":
    case "delete":
      return [collectionMethod("Map", sourceName, mapType, [targetParameter("key", keyType)], csharpSourcePrimitiveTargetType("bool"))];
    case "clear":
      return [collectionMethod("Map", sourceName, mapType, [], csharpVoidTargetType())];
    case "keys":
      return [collectionMethod("Map", sourceName, mapType, [], csharpEnumerableTargetType(keyType))];
    case "values":
      return [collectionMethod("Map", sourceName, mapType, [], csharpEnumerableTargetType(valueType))];
    case "entries":
      return [collectionMethod("Map", sourceName, mapType, [], csharpEnumerableTargetType({ kind: "tuple", elements: [keyType, valueType] }))];
    case "forEach":
      return mapForEachMembers(mapType, keyType, valueType);
    default:
      return [];
  }
}

function getSetTargetMembers(sourceName: string, receiverType: TargetTypeRef | undefined, resultType: TargetTypeRef | undefined): readonly TargetMember[] {
  const setType = isCsharpJsSetTargetType(resultType)
    ? resultType
    : isCsharpJsSetTargetType(receiverType)
      ? receiverType
      : csharpJsSetTargetType({ kind: "type-parameter", name: "T" });
  const elementType = setType.kind === "target-named" ? setType.typeArguments?.[0] : undefined;
  if (elementType === undefined) {
    return [];
  }
  switch (sourceName) {
    case "constructor":
      return [
        collectionConstructor("Tsonic.CSharp.Js.Set..ctor()", setType, []),
        collectionConstructor("Tsonic.CSharp.Js.Set..ctor(System.Collections.Generic.IEnumerable`1)", setType, [
          targetParameter("values", csharpEnumerableTargetType(elementType)),
        ]),
      ];
    case "add":
      return [collectionMethod("Set", sourceName, setType, [targetParameter("value", elementType)], setType)];
    case "has":
    case "delete":
      return [collectionMethod("Set", sourceName, setType, [targetParameter("value", elementType)], csharpSourcePrimitiveTargetType("bool"))];
    case "clear":
      return [collectionMethod("Set", sourceName, setType, [], csharpVoidTargetType())];
    case "keys":
    case "values":
      return [collectionMethod("Set", sourceName, setType, [], csharpEnumerableTargetType(elementType))];
    case "entries":
      return [collectionMethod("Set", sourceName, setType, [], csharpEnumerableTargetType({ kind: "tuple", elements: [elementType, elementType] }))];
    case "forEach":
      return setForEachMembers(setType, elementType);
    default:
      return [];
  }
}

function collectionConstructor(id: string, declaringType: TargetTypeRef, parameters: readonly TargetParameter[]): TargetMember {
  return {
    id,
    sourceName: "constructor",
    targetName: declaringType.kind === "target-named" && declaringType.id === csharpJsSetTypeId ? "Set" : "Map",
    kind: "constructor",
    parameters,
    returnType: declaringType,
    declaringType,
  };
}

function collectionMethod(
  declaringName: "Map" | "Set",
  sourceName: string,
  declaringType: TargetTypeRef,
  parameters: readonly TargetParameter[],
  returnType: TargetTypeRef,
): TargetMember {
  return targetMethod(`Tsonic.CSharp.Js.${declaringName}.${sourceName}`, sourceName, sourceName, parameters, returnType, {
    declaringType,
  });
}

function mapForEachMembers(mapType: TargetTypeRef, keyType: TargetTypeRef, valueType: TargetTypeRef): readonly TargetMember[] {
  return [
    collectionMethod("Map", "forEach", mapType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [valueType]))], csharpVoidTargetType()),
    collectionMethod("Map", "forEach", mapType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [valueType, keyType]))], csharpVoidTargetType()),
    collectionMethod("Map", "forEach", mapType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [valueType, keyType, mapType]))], csharpVoidTargetType()),
  ];
}

function setForEachMembers(setType: TargetTypeRef, elementType: TargetTypeRef): readonly TargetMember[] {
  return [
    collectionMethod("Set", "forEach", setType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [elementType]))], csharpVoidTargetType()),
    collectionMethod("Set", "forEach", setType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [elementType, elementType]))], csharpVoidTargetType()),
    collectionMethod("Set", "forEach", setType, [targetParameter("callback", csharpDelegateTargetType("System.Action", [elementType, elementType, setType]))], csharpVoidTargetType()),
  ];
}

function getTypeArguments(type: Type, context: ExtensionObservationContext): readonly Type[] {
  const types = context.compiler?.types;
  if (types === undefined || !types.isTypeReference(type)) {
    return [];
  }
  return types.getTypeArguments(type).filter((argument): argument is Type => argument !== undefined);
}
