import type {
  DotnetModuleModel,
  DotnetTypeDeclaration,
  DotnetTypeRef,
} from "./model-types.js";
import type {
  ProviderDeclarationMaterialization,
} from "@tsonic/tsts";
import {
  createDotnetModuleSpecifier,
} from "./module-specifier.js";

export const dotnetNativeArrayTypeId = "tsonic.dotnet.System.Array`1";
export const dotnetNativeArrayCreateMemberId = `${dotnetNativeArrayTypeId}.Create(System.Int32)`;
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
  moduleSpecifier: systemModuleSpecifier,
  exportName: "Array",
  typeArguments: [typeParameter],
} satisfies DotnetTypeRef;
const dotnetNativeArrayProviderExportNames = new Set(["Array"]);

export interface DotnetNativeArrayAugmentationOptions {
  readonly materialization: ProviderDeclarationMaterialization;
  readonly broadImport?: boolean;
  readonly requestedExports?: readonly string[];
  readonly requestedTargetIds?: readonly string[];
  readonly requestedMetadataNames?: readonly string[];
}

export function augmentDotnetModuleWithNativeArray(
  module: DotnetModuleModel,
  options: DotnetNativeArrayAugmentationOptions,
): DotnetModuleModel {
  if (module.moduleSpecifier !== systemModuleSpecifier || !shouldAugmentNativeArray(options)) {
    return module;
  }
  return {
    ...module,
    exports: [
      ...module.exports.filter((declaration) =>
        !(declaration.kind === "type" && dotnetNativeArrayProviderExportNames.has(declaration.sourceName))
      ),
      dotnetNativeArrayDeclaration(nativeArrayIsComplete(options.materialization)),
    ],
  };
}

function shouldAugmentNativeArray(options: DotnetNativeArrayAugmentationOptions): boolean {
  return options.broadImport === true
    || options.requestedExports?.includes("Array") === true
    || options.requestedTargetIds?.some(isDotnetNativeArrayTargetId) === true
    || options.requestedMetadataNames?.includes("System.Array`1") === true;
}

function isDotnetNativeArrayTargetId(targetId: string): boolean {
  return targetId === dotnetNativeArrayTypeId
    || targetId === dotnetNativeArrayCreateMemberId
    || targetId === dotnetNativeArrayLengthMemberId
    || targetId === dotnetNativeArrayIndexerMemberId;
}

function nativeArrayIsComplete(materialization: ProviderDeclarationMaterialization): boolean {
  return materialization.kind === "complete" || materialization.completeExports.some((request) =>
    request.exportName === "Array" &&
    (request.exportId === undefined || request.exportId === dotnetNativeArrayTypeId)
  );
}

function dotnetNativeArrayDeclaration(complete: boolean): DotnetTypeDeclaration {
  return {
    kind: "type",
    typeKind: "class",
    sourceName: "Array",
    namespaceName: "System",
    targetId: dotnetNativeArrayTypeId,
    metadataName: "System.Array`1",
    displayName: "System.Array<T>",
    typeParameters: [{ name: "T", defaultType: { kind: "unknown" } }],
    targetType: nativeArrayType,
    ...(complete ? { members: [
      {
        kind: "method",
        sourceName: "Create",
        targetName: "Create",
        targetId: dotnetNativeArrayCreateMemberId,
        metadataName: "System.Array`1.Create(System.Int32)",
        static: true,
        signatures: [
          {
            id: dotnetNativeArrayCreateMemberId,
            sourceId: dotnetNativeArrayCreateMemberId,
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
            targetInvocation: {
              kind: "array-creation",
              lengthParameterIndex: 0,
            },
          },
        ],
      },
      {
        kind: "property",
        sourceName: "Length",
        targetName: "Length",
        targetId: dotnetNativeArrayLengthMemberId,
        metadataName: "System.Array`1.Length",
        readable: true,
        writable: false,
        type: int32Type,
      },
      {
        kind: "indexer",
        sourceName: "Item",
        targetName: "Item",
        targetId: dotnetNativeArrayIndexerMemberId,
        metadataName: "System.Array`1.Item(System.Int32)",
        readable: true,
        writable: true,
        signatures: [
          {
            id: dotnetNativeArrayIndexerMemberId,
            sourceId: dotnetNativeArrayIndexerMemberId,
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
    ] } : {}),
  };
}
