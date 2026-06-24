import type {
  DotnetModuleModel,
  DotnetTypeDeclaration,
  DotnetTypeRef,
} from "./model-types.js";
import {
  createDotnetModuleSpecifier,
} from "./module-specifier.js";

export const dotnetNativeArrayTypeId = "tsonic.dotnet.System.Array`1";
export const dotnetNativeArrayFactoryNamespaceId = "tsonic.dotnet.System.Array";
export const dotnetNativeArrayCreateMemberId = `${dotnetNativeArrayTypeId}.create(System.Int32)`;
export const dotnetNativeArrayLengthMemberId = `${dotnetNativeArrayTypeId}.Length`;
export const dotnetNativeArrayIndexerMemberId = `${dotnetNativeArrayTypeId}.Item(System.Int32)`;

const systemModuleSpecifier = createDotnetModuleSpecifier("System");
const typeParameter = { kind: "type-parameter", name: "T" } satisfies DotnetTypeRef;
const int32Type = { kind: "source-primitive", name: "int32" } satisfies DotnetTypeRef;
const nativeArrayType = {
  kind: "array",
  elementType: typeParameter,
} satisfies DotnetTypeRef;
const nativeArraySourceType = {
  kind: "provider-ref",
  name: "Array",
  moduleSpecifier: systemModuleSpecifier,
  typeArguments: [typeParameter],
} satisfies DotnetTypeRef;

export function augmentDotnetModuleWithNativeArray(module: DotnetModuleModel): DotnetModuleModel {
  if (module.moduleSpecifier !== systemModuleSpecifier) {
    return module;
  }
  return {
    ...module,
    exports: [
      ...module.exports.filter((declaration) =>
        !(declaration.kind === "type" && declaration.sourceName === "Array") &&
        !(declaration.kind === "namespace" && declaration.sourceName === "Array" && declaration.namespaceName === dotnetNativeArrayFactoryNamespaceId)
      ),
      dotnetNativeArrayFactoryNamespace(),
      dotnetNativeArrayDeclaration(),
    ],
  };
}

export function isDotnetNativeArrayCreateMemberId(memberId: string): boolean {
  return memberId === dotnetNativeArrayCreateMemberId;
}

function dotnetNativeArrayDeclaration(): DotnetTypeDeclaration {
  return {
    kind: "type",
    typeKind: "interface",
    sourceName: "Array",
    namespaceName: "System",
    targetId: dotnetNativeArrayTypeId,
    metadataName: "System.Array`1",
    displayName: "System.Array<T>",
    typeParameters: [{ name: "T", defaultType: { kind: "unknown" } }],
    targetType: nativeArrayType,
    members: [
      {
        kind: "property",
        sourceName: "length",
        targetName: "Length",
        targetId: dotnetNativeArrayLengthMemberId,
        metadataName: "System.Array`1.Length",
        readable: true,
        writable: false,
        type: int32Type,
      },
      {
        kind: "indexer",
        sourceName: "item",
        targetName: "Item",
        targetId: dotnetNativeArrayIndexerMemberId,
        metadataName: "System.Array`1.Item(System.Int32)",
        readable: true,
        writable: true,
        signatures: [
          {
            id: dotnetNativeArrayIndexerMemberId,
            parameters: [
              {
                name: "index",
                type: int32Type,
                passingMode: "by-value",
              },
            ],
            returnType: typeParameter,
          },
        ],
      },
    ],
  };
}

function dotnetNativeArrayFactoryNamespace(): DotnetModuleModel["exports"][number] {
  return {
    kind: "namespace",
    sourceName: "Array",
    namespaceName: dotnetNativeArrayFactoryNamespaceId,
    exports: [
      {
        kind: "function",
        sourceName: "create",
        targetId: dotnetNativeArrayCreateMemberId,
        metadataName: "System.Array`1.create(System.Int32)",
        signatures: [
          {
            id: dotnetNativeArrayCreateMemberId,
            typeParameters: [{ name: "T" }],
            parameters: [
              {
                name: "length",
                type: int32Type,
                passingMode: "by-value",
              },
            ],
            returnType: nativeArraySourceType,
            targetReturnType: nativeArrayType,
          },
        ],
      },
    ],
  };
}
