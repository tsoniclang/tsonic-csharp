import { createSourceSemanticsVirtualModuleProvider } from "@tsonic/source-core/extension";
import {
  csharpProviderPolicyContribution,
  csharpQualifiedTypeRenderShape,
  csharpSourcePrimitiveTargetType,
  csharpTargetNamedType,
  csharpVoidTargetType,
  targetParameter,
} from "../../dist/public/provider.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeRawPointerTargetType } from "../../dist/target-model/types/runtime-carriers.js";

export const nativeProviderInferredProofSource = `
import * as native from "test:memory";
import { abi } from "test:abi";
import type { uint32 } from "@tsonic/core/types.js";
import { memoryLayout, reinterpretRawPointer, loadPointer, storePointer, unsafeContext } from "@tsonic/core/lang.js";
const word = memoryLayout<uint32>(abi, 4, 4, 4);
export function run(): boolean {
  unsafeContext();
  const raw = native.identity(native.acquire(31));
  const pointer = reinterpretRawPointer(raw, word);
  if (pointer === undefined) return false;
  storePointer(native.relay(pointer), 52);
  return native.readOriginal() === 52 && loadPointer(pointer) === 52;
}
export function released(): boolean { native.collect(); return native.liveLeases() === 0; }
export function ordinaryLocation(): boolean {
  if (!ordinaryBounds()) return false;
  const pointer = native.identity(native.location(71));
  return loadPointer(native.relay<uint32>(pointer)) === 71;
}
export function ordinaryBounds(): boolean {
  const value: uint32 = 4;
  return native.choose(3, value, 3.5) === 3 &&
    native.choose(value, 3.5, 3) === 4 &&
    native.choose(value, value, value) === 4 &&
    native.choose<uint32>(value, value, value) === 4 &&
    native.choose<number>(value, value, value) === 4;
}
export function main(): void {
  if (!run() || !released() || !ordinaryLocation() || !released()) throw new Error("native inferred pointer lease");
}
`;


export function nativeMemoryProvider({ missingRelation = false, wrongCarrier = false, wrongPointee = false, wrongGenericPointee = false, wrongByRefPointee = false } = {}) {
  const providerId = "test.native-memory";
  const moduleSpecifier = "test:memory";
  const rawSource = { kind: "provider-ref", moduleSpecifier: "@tsonic/core/types.js", exportName: "RawPointer" };
  const wordSource = { kind: "source-primitive", name: "uint32" };
  const wordTarget = csharpSourcePrimitiveTargetType("uint32");
  const genericSource = { kind: "provider-ref", moduleSpecifier: "@tsonic/core/types.js", exportName: "Pointer",
    typeArguments: [{ kind: "type-parameter", name: "Value" }] };
  const genericCarrier = csharpRuntimeLocationTargetType({ kind: "type-parameter", name: "Value" });
  const owner = csharpTargetNamedType("NativeMemoryProof.Provider", undefined,
    csharpQualifiedTypeRenderShape("NativeMemoryProof", "Provider"));
  const definitions = [
    ["acquire", "Acquire", [{ name: "value", type: wordSource }], rawSource, csharpRuntimeRawPointerTargetType()],
    ["readOriginal", "ReadOriginal", [], wordSource, wordTarget],
    ["readSecond", "ReadSecond", [], wordSource, wordTarget],
    ["liveLeases", "LiveLeases", [], wordSource, wordTarget],
    ["collect", "Collect", [], { kind: "void" }, csharpVoidTargetType()],
    ["location", "Location", [{ name: "value", type: wordSource }],
      { kind: "provider-ref", moduleSpecifier: "@tsonic/core/types.js", exportName: "Pointer", typeArguments: [wordSource] },
      csharpRuntimeLocationTargetType(wordTarget)],
    ["relay", "Relay", [{ name: "pointer", type: genericSource }], genericSource, genericCarrier,
      [{ name: "Value" }], [genericCarrier]],
    ["identity", "Identity", [{ name: "value", type: { kind: "type-parameter", name: "Value" } }],
      { kind: "type-parameter", name: "Value" }, { kind: "type-parameter", name: "Value" },
      [{ name: "Value" }], [{ kind: "type-parameter", name: "Value" }]],
    ["choose", "Choose", ["first", "second", "third"].map(name => ({ name, type: { kind: "type-parameter", name: "Value" } })),
      { kind: "type-parameter", name: "Value" }, { kind: "type-parameter", name: "Value" },
      [{ name: "Value" }], [0, 1, 2].map(() => ({ kind: "type-parameter", name: "Value" }))],
  ];
  const exports = definitions.map(([name, , parameters, returnType, , typeParameters]) => ({
    id: `source.export.${name}`, name, kind: "function",
    signatures: [{ id: `source.signature.${name}`, parameters, returnType,
      ...(typeParameters === undefined ? {} : { typeParameters }) }],
  }));
  const provider = createSourceSemanticsVirtualModuleProvider({
    id: providerId, version: "1", displayName: "Native memory proof",
    virtualDirectory: "native-memory-proof", modules: [{ moduleSpecifier, exports: [] }],
    evidenceMessage: "Exact native lease provider result",
    importsForModule: () => [{ moduleSpecifier: "@tsonic/core/types.js",
      namedImports: [{ exportedName: "RawPointer", kind: "type" }, { exportedName: "Pointer", kind: "type" }], typeOnly: true }],
    exportsForModule: () => exports,
  });
  const relations = definitions.filter(([name]) => !missingRelation || name !== "acquire")
    .map(([name, targetName, parameters, , returnType, typeParameters, parameterCarriers]) => ({
      kind: "signature",
      source: { kind: "signature", providerId, providerVersion: "1", providerModuleId: moduleSpecifier,
        moduleSpecifier, exportId: `source.export.${name}`, exportName: name, signatureId: `source.signature.${name}` },
      targetBinding: { id: owner.id, sourceName: "Provider", targetName: owner.id,
        target: "csharp", kind: "class", csharpType: owner },
      targetMember: { id: `native.method.${targetName}`, sourceName: name, targetName,
        kind: "method", static: true, declaringType: owner,
        ...(typeParameters === undefined ? {} : { typeParameters }),
        parameters: parameters.map((parameter, index) => targetParameter(parameter.name, parameterCarriers?.[index] ?? wordTarget)),
        ...(wrongByRefPointee && name === "location" ? { csharpReturnPassing: "byref-readwrite" } : {}),
        returnType: wrongByRefPointee && name === "location" ? csharpSourcePrimitiveTargetType("int32") :
          wrongCarrier && name === "acquire" ? wordTarget : (wrongPointee && name === "location" || wrongGenericPointee && name === "relay")
          ? csharpRuntimeLocationTargetType(csharpSourcePrimitiveTargetType("int32")) : returnType },
      receiver: { kind: "none" },
      parameters: parameters.map((parameter, index) => ({ sourceParameterIndex: index, targetParameterIndex: index,
        sourcePassingMode: "by-value", targetPassingMode: "by-value", sourceAcceptsOmission: false,
        targetAcceptsOmission: false, sourceRest: false, targetParamsArray: false })),
      bindingTypeParameters: [], bindingTypeArgumentSource: "result",
      methodTypeParameters: (typeParameters ?? []).map((_parameter, index) => ({ sourceTypeParameterIndex: index, targetTypeParameterIndex: index })),
      invocationTypeParameters: [], selectedTypeParameterCount: typeParameters?.length ?? 0,
    }));
  return {
    kind: "target-capability", id: providerId, targetId: "csharp", displayName: "Native memory proof",
    moduleOwnership: [{ specifierPrefix: moduleSpecifier, providerId }],
    sourceCompilerContributions() {
      return { extensions: [{ identity: { id: providerId, version: "1" },
        initialize(context) { context.registerSourceDeclarationProvider(provider); } }] };
    },
    createTargetContributions() { return [csharpProviderPolicyContribution(providerId, "1", relations, [])]; },
  };
}

export const nativeProviderProofSource = `
import { acquire as openRegion } from "test:memory";
import * as native from "test:memory";
import { abi } from "test:abi";
import { memoryLayout, reinterpretRawPointer, toRawPointer, loadPointer, storePointer,
  offsetRawPointer, equalPointer, keepAlive, unsafeContext } from "@tsonic/core/lang.js";
import type { Pointer, RawPointer, uint32 } from "@tsonic/core/types.js";
const word = memoryLayout<uint32>(abi, 4, 4, 4);
function acquire(): uint32 { return 99; }
function retained(): Pointer<uint32> {
  unsafeContext();
  const raw = openRegion(31);
  const saved: RawPointer[] = [raw];
  const holder: { pointer: RawPointer } = { pointer: saved[0] };
  const first = reinterpretRawPointer(holder.pointer, word);
  const second = reinterpretRawPointer(offsetRawPointer(raw, 4, abi), word);
  if (first === undefined || second === undefined) throw new Error("missing native view");
  storePointer(first, 39);
  storePointer(second, 44);
  native.collect();
  if (native.liveLeases() !== 1 || native.readOriginal() !== 39 || native.readSecond() !== 44) {
    throw new Error("provider storage was copied or released");
  }
  keepAlive(raw);
  return first;
}
export function run(): boolean {
  unsafeContext();
  const first = retained();
  native.collect();
  const roundTrip = reinterpretRawPointer(toRawPointer(first, word), word);
  if (roundTrip === undefined || !equalPointer(first, roundTrip)) return false;
  storePointer(roundTrip, 52);
  return acquire() === 99 && native.liveLeases() === 1 && native.readOriginal() === 52 && loadPointer(first) === 52;
}
export function released(): boolean { native.collect(); return native.liveLeases() === 0; }
export function ordinaryLocation(): boolean {
  const pointer = native.location(71);
  const inferred = native.relay(native.identity(pointer));
  const explicit = native.relay<uint32>(inferred);
  storePointer(explicit, 72);
  return loadPointer(pointer) === 72 && equalPointer(pointer, explicit);
}
`;
