import {
  tsonicCoreProviderVersion,
  tsonicCoreTypesModule,
  tsonicCoreVirtualModulesProviderId,
} from "@tsonic/source-core";
import {
  csharpLangModule,
  csharpProviderVersion,
  csharpSourceVirtualModulesProviderId,
} from "../../source/csharp-source-semantics/identity.js";
import {
  csharpNativePointerExport,
} from "../../source/csharp-source-semantics/explicit-safety.js";
import type {
  CsharpTargetBindingFact,
  TargetTypeRef,
} from "../../policy/types/index.js";
import type {
  CsharpProviderTargetRelation,
} from "./index.js";

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
    pointerPolicy(
      csharpSourceVirtualModulesProviderId,
      csharpProviderVersion,
      csharpLangModule,
      csharpNativePointerExport,
    ),
  ]);
}

function pointerPolicy(
  providerId: string,
  providerVersion: string,
  moduleSpecifier: string,
  exportName: string,
): CsharpBuiltInProviderPolicy {
  const relation: CsharpProviderTargetRelation = Object.freeze({
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
  return Object.freeze({
    providerId,
    providerVersion,
    relations: Object.freeze([relation]),
  });
}
