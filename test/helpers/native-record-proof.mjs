import { createSourceSemanticsVirtualModuleProvider } from "@tsonic/source-core/extension";
import { csharpProviderPolicyContribution, csharpQualifiedTypeRenderShape, csharpTargetNamedType } from "../../dist/public/provider.js";

export function nativeRecordProvider({ missingField = false, wrongField = false, missingContract = false } = {}) {
  const providerId = "test.native-record";
  const moduleSpecifier = "test:records";
  const byte = { kind: "source-primitive", name: "uint8" };
  const word = { kind: "source-primitive", name: "uint32" };
  const reference = name => ({ kind: "provider-ref", moduleSpecifier, exportName: name });
  const native = name => csharpTargetNamedType(`NativeMemoryProof.${name}`, undefined,
    csharpQualifiedTypeRenderShape("NativeMemoryProof", name), { valueType: true });
  const header = native("Header");
  const envelope = native("Envelope");
  const records = [["Header", header, [["tag", "TagByte", byte, byte], ["count", "Units", word, word]]],
    ["Envelope", envelope, [["prefix", "Lead", byte, byte], ["header", "Record", reference("Header"), header]]]];
  const source = name => ({ providerId, providerVersion: "1", providerModuleId: moduleSpecifier,
    moduleSpecifier, exportId: `source.${name}`, exportName: name });
  const bindings = records.map(([name, csharpType, fields]) => ({ id: csharpType.id, sourceName: name,
    targetName: csharpType.id, target: "csharp", kind: "struct", csharpType,
    members: fields.map(([field, targetName, , returnType]) => ({ id: `native.${name}.${targetName}`, sourceName: field,
      targetName, kind: "field", parameters: [], declaringType: csharpType, returnType: wrongField && field === "count" ? byte : returnType })),
    ...(missingContract ? {} : { csharpNativeMemoryFieldIds: fields.filter(([field]) => !missingField || field !== "count")
      .map(([, targetName]) => `native.${name}.${targetName}`) }),
  }));
  const owner = csharpTargetNamedType("NativeMemoryProof.Provider", undefined, csharpQualifiedTypeRenderShape("NativeMemoryProof", "Provider"));
  const parameters = [{ name: "prefix", type: byte }, { name: "tag", type: byte }, { name: "count", type: word }];
  const relations = records.flatMap(([name, , fields], index) => [
    { kind: "type", source: { kind: "type", ...source(name) }, targetBinding: bindings[index], bindingTypeParameters: [] },
    ...fields.map(([field], fieldIndex) => ({ kind: "member", source: { kind: "member", ...source(name), memberId: `source.${name}.${field}`,
      memberStatic: false, memberKey: { kind: "property-key", name: field } }, targetBinding: bindings[index],
      targetMember: bindings[index].members[fieldIndex], receiver: { kind: "instance" }, bindingTypeParameters: [], bindingTypeArgumentSource: "receiver" })),
  ]);
  relations.push({ kind: "signature", source: { kind: "signature", ...source("create"), signatureId: "source.create.signature" },
    targetBinding: { id: owner.id, sourceName: "Provider", targetName: owner.id, target: "csharp", kind: "class", csharpType: owner },
    targetMember: { id: "native.CreateEnvelope", sourceName: "create", targetName: "CreateEnvelope", kind: "method", static: true,
      declaringType: owner, parameters: parameters.map(parameter => ({ ...parameter, passingMode: "by-value" })), returnType: envelope },
    receiver: { kind: "none" }, parameters: parameters.map((_parameter, index) => ({ sourceParameterIndex: index, targetParameterIndex: index,
      sourcePassingMode: "by-value", targetPassingMode: "by-value", sourceAcceptsOmission: false, targetAcceptsOmission: false, sourceRest: false, targetParamsArray: false })),
    bindingTypeParameters: [], bindingTypeArgumentSource: "result", methodTypeParameters: [], invocationTypeParameters: [], selectedTypeParameterCount: 0 });
  const provider = createSourceSemanticsVirtualModuleProvider({ id: providerId, version: "1", displayName: "Native records",
    virtualDirectory: "native-records", modules: [{ moduleSpecifier, exports: [] }], evidenceMessage: "Exact native value field contracts",
    exportsForModule: () => [...records.map(([name, , fields]) => ({ id: `source.${name}`, name, kind: "interface",
      members: fields.map(([field, , type]) => ({ id: `source.${name}.${field}`, name: field, kind: "property", type })) })),
      { id: "source.create", name: "create", kind: "function", signatures: [{ id: "source.create.signature", parameters, returnType: reference("Envelope") }] }] });
  return { kind: "target-capability", id: providerId, targetId: "csharp", displayName: "Native record proof",
    moduleOwnership: [{ specifierPrefix: moduleSpecifier, providerId }],
    sourceCompilerContributions: () => ({ extensions: [{ identity: { id: providerId, version: "1" }, initialize(context) { context.registerSourceDeclarationProvider(provider); } }] }),
    createTargetContributions: () => [csharpProviderPolicyContribution(providerId, "1", relations, [])],
  };
}

export const nativeRecordProofSource = `
import { abi } from "test:abi";
import { struct, field, defaultValue, memoryLayout, memoryField, allocatePointer,
  toRawPointer, reinterpretRawPointer, loadPointer, storePointer, offsetRawPointer,
  equalPointer, unsafeContext } from "@tsonic/core/lang.js";
import type { uint8, uint32 } from "@tsonic/core/types.js";
const Header = struct({ tag: field<uint8>(), count: field<uint32>() });
const Envelope = struct({ prefix: field<uint8>(), header: field<typeof Header>() });
const byte = memoryLayout<uint8>(abi, 1, 1, 1);
const word = memoryLayout<uint32>(abi, 4, 4, 4);
const packedWord = memoryLayout<uint32>(abi, 4, 1, 4);
const header = memoryLayout<typeof Header>(abi, 8, 4, 8,
  memoryField((value: typeof Header) => value.tag, 0, 1, byte),
  memoryField((value: typeof Header) => value.count, 4, 4, word));
const envelope = memoryLayout<typeof Envelope>(abi, 9, 1, 9,
  memoryField((value: typeof Envelope) => value.prefix, 0, 1, byte),
  memoryField((value: typeof Envelope) => value.header, 1, 1, header));
export function run(): boolean {
  unsafeContext();
  let value: typeof Envelope = defaultValue<typeof Envelope>();
  value.prefix = 1;
  let initial: typeof Header = defaultValue<typeof Header>();
  initial.tag = 2;
  initial.count = 7;
  value.header = initial;
  const pointer = allocatePointer<typeof Envelope>(value);
  const raw = toRawPointer(pointer, envelope);
  const saved = loadPointer(pointer);
  const alias = reinterpretRawPointer(raw, envelope);
  const count = reinterpretRawPointer(offsetRawPointer(raw, 5, abi), packedWord);
  if (alias === undefined || count === undefined) return false;
  storePointer(count, 9);
  if (loadPointer(pointer).header.count !== 9) return false;
  initial.count = 11;
  value.header = initial;
  value.prefix = 3;
  storePointer(alias, value);
  return saved.header.count === 7 && loadPointer(count) === 11 &&
    loadPointer(pointer).prefix === 3 && equalPointer(pointer, alias);
}
`;

export const nativeProviderRecordProofSource = `
import { abi } from "test:abi";
import { create } from "test:records";
import type { Header, Envelope } from "test:records";
import { memoryLayout, memoryField, allocatePointer, toRawPointer, reinterpretRawPointer,
  loadPointer, storePointer, offsetRawPointer, equalPointer, unsafeContext } from "@tsonic/core/lang.js";
import type { uint8, uint32 } from "@tsonic/core/types.js";
const byte = memoryLayout<uint8>(abi, 1, 1, 1);
const word = memoryLayout<uint32>(abi, 4, 4, 4);
const packedWord = memoryLayout<uint32>(abi, 4, 1, 4);
const header = memoryLayout<Header>(abi, 8, 4, 8,
  memoryField((value: Header) => value.tag, 0, 1, byte),
  memoryField((value: Header) => value.count, 4, 4, word));
const envelope = memoryLayout<Envelope>(abi, 9, 1, 9,
  memoryField((value: Envelope) => value.prefix, 0, 1, byte),
  memoryField((value: Envelope) => value.header, 1, 1, header));
export function run(): boolean {
  unsafeContext();
  const pointer = allocatePointer<Envelope>(create(1, 2, 7));
  const raw = toRawPointer(pointer, envelope);
  const saved = loadPointer(pointer);
  const alias = reinterpretRawPointer(raw, envelope);
  const count = reinterpretRawPointer(offsetRawPointer(raw, 5, abi), packedWord);
  if (alias === undefined || count === undefined) return false;
  storePointer(count, 9);
  if (loadPointer(pointer).header.count !== 9) return false;
  storePointer(alias, create(3, 4, 11));
  return saved.header.count === 7 && loadPointer(count) === 11 &&
    loadPointer(pointer).prefix === 3 && equalPointer(pointer, alias);
}
`;

export const nativeFieldProofSource = `
import { abi } from "test:abi";
import { addressOf, memoryLayout, toRawPointer, reinterpretRawPointer,
  loadPointer, storePointer, equalPointer, unsafeContext } from "@tsonic/core/lang.js";
import type { Pointer, uint32 } from "@tsonic/core/types.js";
const word = memoryLayout<uint32>(abi, 4, 4, 4);
function retained(): Pointer<uint32> {
  let cell: { value: uint32 } = { value: 7 };
  const alias = cell;
  const pointer = addressOf(cell.value);
  toRawPointer(pointer, word);
  const same = addressOf(alias.value);
  if (!equalPointer(pointer, same)) throw new Error("field identity");
  storePointer(pointer, 9);
  if (alias.value !== 9) throw new Error("field was copied");
  alias.value = 11;
  const fieldValue: uint32 = 2;
  alias.value += fieldValue;
  alias.value++;
  if (loadPointer(pointer) !== 14) throw new Error("field writes were lost");
  cell = { value: 99 };
  if (loadPointer(pointer) !== 14 || cell.value !== 99) throw new Error("field retargeted");
  return same;
}
export function run(): boolean {
  unsafeContext();
  const pointer = retained();
  const restored = reinterpretRawPointer(toRawPointer(pointer, word), word);
  if (restored === undefined || !equalPointer(restored, pointer)) return false;
  storePointer(restored, 21);
  return loadPointer(pointer) === 21;
}
`;
