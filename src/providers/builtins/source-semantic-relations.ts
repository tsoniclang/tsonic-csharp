import {
  tsonicCoreProviderVersion,
  tsonicCoreTypesModule,
  tsonicCoreVirtualModulesProviderId,
} from "@tsonic/source-core/facts";
import {
  csharpLangModule,
  csharpProviderVersion,
  csharpSourceVirtualModulesProviderId,
} from "../../target-model/identities/source.js";
import {
  csharpNativePointerExport,
} from "../../source/extension/explicit-safety.js";
import type {
  CsharpTargetBindingFact,
  TargetTypeRef,
} from "../../target-model/types/model.js";
import type {
  CsharpProviderTargetRelation,
} from "../relations/index.js";
import { csharpRankedArrayDescriptors } from "../../source/profiles/ranked-arrays.js";

export interface CsharpBuiltInProviderPolicy {
  readonly providerId: string;
  readonly providerVersion: string;
  readonly relations: readonly CsharpProviderTargetRelation[];
}

const nativePointerType: TargetTypeRef = Object.freeze({
  kind: "pointer",
  pointee: Object.freeze({ kind: "type-parameter", name: "T" }),
});

const nativePointerBinding: CsharpTargetBindingFact = Object.freeze({
  id: "tsonic.csharp.native-pointer",
  sourceName: "NativePointer",
  targetName: "pointer",
  target: "csharp",
  kind: "opaque",
  typeParameters: [{ name: "T" }],
  csharpType: nativePointerType,
});

export function csharpBuiltInProviderPolicies(): readonly CsharpBuiltInProviderPolicy[] {
  return Object.freeze([
    pointerPolicy(
      tsonicCoreVirtualModulesProviderId,
      tsonicCoreProviderVersion,
      tsonicCoreTypesModule,
      "NativePointer",
    ),
    csharpLangPolicy(),
  ]);
}

function csharpLangPolicy(): CsharpBuiltInProviderPolicy {
  return Object.freeze({
    providerId: csharpSourceVirtualModulesProviderId,
    providerVersion: csharpProviderVersion,
    relations: Object.freeze([
      pointerRelation(
        csharpSourceVirtualModulesProviderId,
        csharpProviderVersion,
        csharpLangModule,
        csharpNativePointerExport,
      ),
      ...csharpRankedArrayDescriptors.flatMap(rankedArrayRelations),
    ]),
  });
}

function rankedArrayRelations(
  descriptor: (typeof csharpRankedArrayDescriptors)[number],
): readonly CsharpProviderTargetRelation[] {
  const elementType: TargetTypeRef = Object.freeze({
    kind: "type-parameter",
    name: "T",
  });
  const arrayType: TargetTypeRef = Object.freeze({
    kind: "array",
    element: elementType,
    rank: descriptor.rank,
  });
  const int32Type: TargetTypeRef = Object.freeze({
    kind: "source-primitive",
    name: "int32",
  });
  const voidType: TargetTypeRef = Object.freeze({
    kind: "target-named",
    id: "System.Void",
    csharpRender: { kind: "predefined", name: "void" },
  });
  const binding: CsharpTargetBindingFact = Object.freeze({
    id: `tsonic.csharp.ranked-array.${descriptor.rank}`,
    sourceName: descriptor.exportName,
    targetName: `${descriptor.exportName}<T>`,
    target: "csharp",
    kind: "opaque",
    typeParameters: [{ name: "T" }],
    csharpType: arrayType,
  });
  const indexParameters = descriptor.indexParameterNames.map((name) =>
    Object.freeze({
      name,
      type: int32Type,
      passingMode: "by-value" as const,
    }));
  const getMember = Object.freeze({
    id: `tsonic.csharp.ranked-array.${descriptor.rank}.get`,
    sourceName: "get",
    targetName: "Item",
    kind: "method" as const,
    static: false,
    declaringType: arrayType,
    parameters: indexParameters,
    returnType: elementType,
    csharpInvocation: Object.freeze({
      kind: "native-indexer-get" as const,
      indexParameterIndexes: Object.freeze(
        descriptor.indexParameterNames.map((_name, index) => index),
      ),
    }),
  });
  const setParameters = Object.freeze([
    ...indexParameters,
    Object.freeze({
      name: "value",
      type: elementType,
      passingMode: "by-value" as const,
    }),
  ]);
  const setMember = Object.freeze({
    id: `tsonic.csharp.ranked-array.${descriptor.rank}.set`,
    sourceName: "set",
    targetName: "Item",
    kind: "method" as const,
    static: false,
    declaringType: arrayType,
    parameters: setParameters,
    returnType: voidType,
    csharpInvocation: Object.freeze({
      kind: "native-indexer-set" as const,
      indexParameterIndexes: Object.freeze(
        descriptor.indexParameterNames.map((_name, index) => index),
      ),
      valueParameterIndex: descriptor.rank,
    }),
  });
  const sourceBase = Object.freeze({
    providerId: csharpSourceVirtualModulesProviderId,
    providerVersion: csharpProviderVersion,
    providerModuleId: csharpLangModule,
    moduleSpecifier: csharpLangModule,
    exportId: descriptor.exportName,
    exportName: descriptor.exportName,
  });
  return Object.freeze([
    {
      kind: "type",
      source: { kind: "type", ...sourceBase },
      targetBinding: binding,
      bindingTypeParameters: [{
        sourceTypeParameterIndex: 0,
        targetTypeParameterIndex: 0,
      }],
    },
    rankedArraySignatureRelation(
      sourceBase,
      descriptor.getMemberId,
      "get",
      descriptor.getSignatureId,
      binding,
      getMember,
    ),
    rankedArraySignatureRelation(
      sourceBase,
      descriptor.setMemberId,
      "set",
      descriptor.setSignatureId,
      binding,
      setMember,
    ),
  ]);
}

function rankedArraySignatureRelation(
  sourceBase: Omit<
    Extract<CsharpProviderTargetRelation, { readonly kind: "signature" }>["source"],
    "kind" | "memberId" | "memberStatic" | "memberKey" | "signatureId"
  >,
  memberId: string,
  memberName: string,
  signatureId: string,
  targetBinding: CsharpTargetBindingFact,
  targetMember: Extract<CsharpProviderTargetRelation, { readonly kind: "signature" }>["targetMember"],
): Extract<CsharpProviderTargetRelation, { readonly kind: "signature" }> {
  return Object.freeze({
    kind: "signature",
    source: Object.freeze({
      kind: "signature",
      ...sourceBase,
      memberId,
      memberStatic: false,
      memberKey: { kind: "string", name: memberName },
      signatureId,
    }),
    targetBinding,
    targetMember,
    receiver: { kind: "instance" },
    parameters: Object.freeze(targetMember.parameters.map((parameter, index) => ({
      sourceParameterIndex: index,
      targetParameterIndex: index,
      sourcePassingMode: "by-value" as const,
      targetPassingMode: parameter.passingMode,
      sourceAcceptsOmission: false,
      targetAcceptsOmission: false,
      sourceRest: false,
      targetParamsArray: false,
    }))),
    bindingTypeParameters: [{
      sourceTypeParameterIndex: 0,
      targetTypeParameterIndex: 0,
    }],
    bindingTypeArgumentSource: "receiver",
    methodTypeParameters: [],
    invocationTypeParameters: [],
    selectedTypeParameterCount: 0,
  });
}

function pointerPolicy(
  providerId: string,
  providerVersion: string,
  moduleSpecifier: string,
  exportName: string,
): CsharpBuiltInProviderPolicy {
  return Object.freeze({
    providerId,
    providerVersion,
    relations: Object.freeze([
      pointerRelation(providerId, providerVersion, moduleSpecifier, exportName),
    ]),
  });
}

function pointerRelation(
  providerId: string,
  providerVersion: string,
  moduleSpecifier: string,
  exportName: string,
): CsharpProviderTargetRelation {
  return Object.freeze({
    kind: "type",
    source: Object.freeze({
      kind: "type",
      providerId,
      providerVersion,
      providerModuleId: moduleSpecifier,
      moduleSpecifier,
      exportId: exportName,
      exportName,
    }),
    targetBinding: nativePointerBinding,
    bindingTypeParameters: Object.freeze([{
      sourceTypeParameterIndex: 0,
      targetTypeParameterIndex: 0,
    }]),
  });
}
