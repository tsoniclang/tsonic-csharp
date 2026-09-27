import { createSourceSemanticsVirtualModuleProvider } from "@tsonic/source-core/extension";

export const nativeArrayProofSource = `
import { abi } from "test:abi";
import { addressof, memorylayout, torawptr, reinterpretrawptr, offsetrawptr,
  loadptr, storeptr, equalptr, unsafecontext } from "@tsonic/core/lang.js";
import type { Pointer, uint32, int32 } from "@tsonic/core/types.js";
const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 8, fields: [] });
function replace(pointer: Pointer<uint32>): uint32 { storeptr(pointer, 20); return 2; }
function retained(index: int32): Pointer<uint32> {
  unsafecontext();
  let values: uint32[] = [7, 8];
  const alias = values;
  const pointer = addressof(values[index]);
  const raw = torawptr(pointer, word);
  let position: int32 = index;
  const same = addressof(alias[position++]);
  if (position !== index + 1) throw new Error("index evaluated more than once");
  if (!equalptr(pointer, same)) throw new Error("element identity");
  storeptr(pointer, 9);
  if (alias[index] !== 9) throw new Error("element was copied");
  alias[index] = 11;
  (alias[index]) += 2;
  const previous = alias[index]++;
  if (previous !== 13) throw new Error("postfix value");
  if (loadptr(pointer) !== 14) throw new Error("element writes were lost");
  alias[index] += replace(pointer);
  if (alias[index] !== 16) throw new Error("compound read occurred after rhs");
  alias[index] = 14;
  const neighbor = reinterpretrawptr(offsetrawptr(raw, 8, abi), word);
  if (neighbor === undefined || loadptr(neighbor) !== 8) throw new Error("element stride");
  values = [99];
  if (loadptr(pointer) !== 14 || values[0] !== 99) throw new Error("element retargeted");
  return same;
}
export function run(): boolean {
  unsafecontext();
  const pointer = retained(0);
  const restored = reinterpretrawptr(torawptr(pointer, word), word);
  if (restored === undefined || !equalptr(restored, pointer)) return false;
  storeptr(restored, 21);
  return loadptr(pointer) === 21;
}
`;
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
import { struct, field, defaultvalue, memorylayout, memoryfield, allocateptr,
  torawptr, reinterpretrawptr, loadptr, storeptr, offsetrawptr,
  equalptr, unsafecontext } from "@tsonic/core/lang.js";
import type { uint8, uint32 } from "@tsonic/core/types.js";
const Header = struct({ tag: field<uint8>(), count: field<uint32>() });
const Envelope = struct({ prefix: field<uint8>(), header: field<typeof Header>() });
const byte = memorylayout<uint8>({ datalayout: abi, bytesize: 1, bytealignment: 1, stride: 1, fields: [] });
const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
const packedWord = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 1, stride: 4, fields: [] });
const header = memorylayout<typeof Header>({ datalayout: abi, bytesize: 8, bytealignment: 4, stride: 8, fields: [
  memoryfield({ select: (value: typeof Header) => value.tag, byteoffset: 0, bytealignment: 1, fieldlayout: byte }),
  memoryfield({ select: (value: typeof Header) => value.count, byteoffset: 4, bytealignment: 4, fieldlayout: word })] });
const envelope = memorylayout<typeof Envelope>({ datalayout: abi, bytesize: 9, bytealignment: 1, stride: 9, fields: [
  memoryfield({ select: (value: typeof Envelope) => value.prefix, byteoffset: 0, bytealignment: 1, fieldlayout: byte }),
  memoryfield({ select: (value: typeof Envelope) => value.header, byteoffset: 1, bytealignment: 1, fieldlayout: header })] });
export function run(): boolean {
  unsafecontext();
  let value: typeof Envelope = defaultvalue<typeof Envelope>();
  value.prefix = 1;
  let initial: typeof Header = defaultvalue<typeof Header>();
  initial.tag = 2;
  initial.count = 7;
  value.header = initial;
  const pointer = allocateptr<typeof Envelope>(value);
  const raw = torawptr(pointer, envelope);
  const saved = loadptr(pointer);
  const alias = reinterpretrawptr(raw, envelope);
  const count = reinterpretrawptr(offsetrawptr(raw, 5, abi), packedWord);
  if (alias === undefined || count === undefined) return false;
  storeptr(count, 9);
  if (loadptr(pointer).header.count !== 9) return false;
  initial.count = 11;
  value.header = initial;
  value.prefix = 3;
  storeptr(alias, value);
  return saved.header.count === 7 && loadptr(count) === 11 &&
    loadptr(pointer).prefix === 3 && equalptr(pointer, alias);
}
`;

export const nativeProviderRecordProofSource = `
import { abi } from "test:abi";
import { create } from "test:records";
import type { Header, Envelope } from "test:records";
import { memorylayout, memoryfield, allocateptr, torawptr, reinterpretrawptr,
  loadptr, storeptr, offsetrawptr, equalptr, unsafecontext } from "@tsonic/core/lang.js";
import type { uint8, uint32 } from "@tsonic/core/types.js";
const byte = memorylayout<uint8>({ datalayout: abi, bytesize: 1, bytealignment: 1, stride: 1, fields: [] });
const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
const packedWord = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 1, stride: 4, fields: [] });
const header = memorylayout<Header>({ datalayout: abi, bytesize: 8, bytealignment: 4, stride: 8, fields: [
  memoryfield({ select: (value: Header) => value.tag, byteoffset: 0, bytealignment: 1, fieldlayout: byte }),
  memoryfield({ select: (value: Header) => value.count, byteoffset: 4, bytealignment: 4, fieldlayout: word })] });
const envelope = memorylayout<Envelope>({ datalayout: abi, bytesize: 9, bytealignment: 1, stride: 9, fields: [
  memoryfield({ select: (value: Envelope) => value.prefix, byteoffset: 0, bytealignment: 1, fieldlayout: byte }),
  memoryfield({ select: (value: Envelope) => value.header, byteoffset: 1, bytealignment: 1, fieldlayout: header })] });
export function run(): boolean {
  unsafecontext();
  const pointer = allocateptr<Envelope>(create(1, 2, 7));
  const raw = torawptr(pointer, envelope);
  const saved = loadptr(pointer);
  const alias = reinterpretrawptr(raw, envelope);
  const count = reinterpretrawptr(offsetrawptr(raw, 5, abi), packedWord);
  if (alias === undefined || count === undefined) return false;
  storeptr(count, 9);
  if (loadptr(pointer).header.count !== 9) return false;
  storeptr(alias, create(3, 4, 11));
  return saved.header.count === 7 && loadptr(count) === 11 &&
    loadptr(pointer).prefix === 3 && equalptr(pointer, alias);
}
`;

export const nativeFieldProofSource = `
import { abi } from "test:abi";
import { addressof, memorylayout, torawptr, reinterpretrawptr,
  loadptr, storeptr, equalptr, unsafecontext } from "@tsonic/core/lang.js";
import type { Pointer, uint32 } from "@tsonic/core/types.js";
const word = memorylayout<uint32>({ datalayout: abi, bytesize: 4, bytealignment: 4, stride: 4, fields: [] });
function retained(): Pointer<uint32> {
  let cell: { value: uint32 } = { value: 7 };
  const alias = cell;
  const pointer = addressof(cell.value);
  torawptr(pointer, word);
  const same = addressof(alias.value);
  if (!equalptr(pointer, same)) throw new Error("field identity");
  storeptr(pointer, 9);
  if (alias.value !== 9) throw new Error("field was copied");
  alias.value = 11;
  const fieldValue: uint32 = 2;
  alias.value += fieldValue;
  alias.value++;
  if (loadptr(pointer) !== 14) throw new Error("field writes were lost");
  cell = { value: 99 };
  if (loadptr(pointer) !== 14 || cell.value !== 99) throw new Error("field retargeted");
  return same;
}
export function run(): boolean {
  unsafecontext();
  const pointer = retained();
  const restored = reinterpretrawptr(torawptr(pointer, word), word);
  if (restored === undefined || !equalptr(restored, pointer)) return false;
  storeptr(restored, 21);
  return loadptr(pointer) === 21;
}
`;
