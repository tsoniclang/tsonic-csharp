import type {
  ProviderExportDeclaration,
  TargetMember,
} from "@tsonic/tsts";
import {
  csharpNullableValueTargetType,
  targetParameter,
} from "../../js/source-library.js";
import {
  nodejsModuleCallTargetMetadata,
} from "../members/target-member-metadata.js";
import type {
  NodejsModuleCallTargetMetadataRow,
} from "../members/target-member-metadata.js";
import {
  getNodejsProviderExportSignatureDeclarationTargetMember,
  nodejsProviderExportSignatureDeclarationTargetMemberIndex,
} from "../metadata-indexes.js";
import {
  nodeFsExistsSyncExportName,
  nodeFsExistsSyncSignatureId,
  nodeFsModuleSpecifier,
  nodeFsStatSyncExportName,
  nodeFsStatSyncSignatureId,
} from "./identities.js";
import {
  boolProviderType,
  boolTargetType,
  bufferProviderType,
  bufferTargetType,
  fsTargetType,
  intTargetType,
  longTargetType,
  numberProviderType,
  statsProviderType,
  statsTargetType,
  stringProviderType,
  stringTargetType,
  voidProviderType,
  voidTargetType,
} from "./types.js";
import type {
  NodeFsCallTargetMember,
} from "./types.js";

type NodeFsCallTargetMetadataRow = Omit<NodejsModuleCallTargetMetadataRow, "declaringType">;

export function getNodeFsExistsSyncTargetMember(): TargetMember {
  const member = getNodeFsCallTargetMember(nodeFsExistsSyncExportName, nodeFsExistsSyncSignatureId);
  if (member === undefined) {
    throw new Error("Missing C# NodeJS fs.existsSync target member.");
  }
  return member;
}

export function getNodeFsCallTargetMember(
  exportName: string | undefined,
  signatureId: string | undefined,
): TargetMember | undefined {
  return getNodejsProviderExportSignatureDeclarationTargetMember(
    nodeFsCallTargetMemberByProviderDeclarationIdentity,
    nodeFsModuleSpecifier,
    exportName,
    signatureId,
  );
}

export function nodeFsCallExportDeclarations(): readonly ProviderExportDeclaration[] {
  const membersByExportName = new Map<string, readonly NodeFsCallTargetMember[]>();
  for (const member of nodeFsCallTargetMembers()) {
    membersByExportName.set(member.exportName, [...membersByExportName.get(member.exportName) ?? [], member]);
  }
  return [
    ...[...membersByExportName.entries()].map(([exportName, members]) => ({
      id: `node:fs.${exportName}`,
      name: exportName,
      kind: "function" as const,
      signatures: members.map(({ signatureId, providerParameters, providerReturnType }) => ({
        id: signatureId,
        parameters: providerParameters,
        returnType: providerReturnType,
      })),
    })),
    ...nodeFsUnsupportedCallDeclarations(),
  ];
}

export function nodeFsCallTargetMembers(): readonly NodeFsCallTargetMember[] {
  const stringParameter = (name: string) => ({ name, type: stringProviderType });
  const optionalStringParameter = (name: string) => ({ name, type: stringProviderType, optional: true });
  const numberParameter = (name: string) => ({ name, type: numberProviderType });
  const optionalNumberParameter = (name: string) => ({ name, type: numberProviderType, optional: true });
  const optionalBoolParameter = (name: string) => ({ name, type: boolProviderType, optional: true });
  return [
    fsCall({ exportName: "accessSync", signatureId: "node:fs.accessSync(System.String,System.Int32)", targetMemberId: "Tsonic.CSharp.Node.fs.accessSync(System.String,System.Int32)", sourceName: "accessSync", targetName: "accessSync", providerParameters: [stringParameter("path"), optionalNumberParameter("mode")], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("mode", intTargetType, { optional: true }),
    ], targetReturnType: voidTargetType }),
    fsCall({ exportName: "appendFileSync", signatureId: "node:fs.appendFileSync(System.String,System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.fs.appendFileSync(System.String,System.String,System.String)", sourceName: "appendFileSync", targetName: "appendFileSync", providerParameters: [stringParameter("path"), stringParameter("data"), optionalStringParameter("encoding")], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("data", stringTargetType),
      targetParameter("encoding", stringTargetType, { optional: true }),
    ], targetReturnType: voidTargetType }),
    fsCall({ exportName: "appendFileSync", signatureId: "node:fs.appendFileSync(System.String,Tsonic.CSharp.Node.Buffer)", targetMemberId: "Tsonic.CSharp.Node.fs.appendFileSync(System.String,Tsonic.CSharp.Node.Buffer)", sourceName: "appendFileSync", targetName: "appendFileSync", providerParameters: [stringParameter("path"), { name: "data", type: bufferProviderType }], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("data", bufferTargetType),
    ], targetReturnType: voidTargetType }),
    fsCall({ exportName: "chmodSync", signatureId: "node:fs.chmodSync(System.String,System.Int32)", targetMemberId: "Tsonic.CSharp.Node.fs.chmodSync(System.String,System.Int32)", sourceName: "chmodSync", targetName: "chmodSync", providerParameters: [stringParameter("path"), numberParameter("mode")], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("mode", intTargetType),
    ], targetReturnType: voidTargetType }),
    fsCall({ exportName: "closeSync", signatureId: "node:fs.closeSync(System.Int32)", targetMemberId: "Tsonic.CSharp.Node.fs.closeSync(System.Int32)", sourceName: "closeSync", targetName: "closeSync", providerParameters: [numberParameter("fd")], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("fd", intTargetType),
    ], targetReturnType: voidTargetType }),
    fsCall({ exportName: "copyFileSync", signatureId: "node:fs.copyFileSync(System.String,System.String,System.Int32)", targetMemberId: "Tsonic.CSharp.Node.fs.copyFileSync(System.String,System.String,System.Int32)", sourceName: "copyFileSync", targetName: "copyFileSync", providerParameters: [stringParameter("src"), stringParameter("dest"), optionalNumberParameter("mode")], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("src", stringTargetType),
      targetParameter("dest", stringTargetType),
      targetParameter("mode", intTargetType, { optional: true }),
    ], targetReturnType: voidTargetType }),
    fsCall({ exportName: "cpSync", signatureId: "node:fs.cpSync(System.String,System.String,System.Boolean)", targetMemberId: "Tsonic.CSharp.Node.fs.cpSync(System.String,System.String,System.Boolean)", sourceName: "cpSync", targetName: "cpSync", providerParameters: [stringParameter("src"), stringParameter("dest"), optionalBoolParameter("recursive")], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("src", stringTargetType),
      targetParameter("dest", stringTargetType),
      targetParameter("recursive", boolTargetType, { optional: true }),
    ], targetReturnType: voidTargetType }),
    fsCall({ exportName: nodeFsExistsSyncExportName, signatureId: nodeFsExistsSyncSignatureId, targetMemberId: "Tsonic.CSharp.Node.fs.existsSync(System.String)", sourceName: "existsSync", targetName: "existsSync", providerParameters: [stringParameter("path")], providerReturnType: boolProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: boolTargetType }),
    fsCall({ exportName: nodeFsStatSyncExportName, signatureId: nodeFsStatSyncSignatureId, targetMemberId: "Tsonic.CSharp.Node.fs.statSync(System.String)", sourceName: "statSync", targetName: "statSync", providerParameters: [stringParameter("path")], providerReturnType: statsProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: statsTargetType }),
    fsCall({ exportName: "fstatSync", signatureId: "node:fs.fstatSync(System.Int32)", targetMemberId: "Tsonic.CSharp.Node.fs.fstatSync(System.Int32)", sourceName: "fstatSync", targetName: "fstatSync", providerParameters: [numberParameter("fd")], providerReturnType: statsProviderType, targetParameters: [
      targetParameter("fd", intTargetType),
    ], targetReturnType: statsTargetType }),
    fsCall({ exportName: "mkdirSync", signatureId: "node:fs.mkdirSync(System.String,System.Boolean)", targetMemberId: "Tsonic.CSharp.Node.fs.mkdirSync(System.String,System.Boolean)", sourceName: "mkdirSync", targetName: "mkdirSync", providerParameters: [stringParameter("path"), optionalBoolParameter("recursive")], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("recursive", boolTargetType, { optional: true }),
    ], targetReturnType: voidTargetType }),
    fsCall({ exportName: "openSync", signatureId: "node:fs.openSync(System.String,System.String,System.Int32)", targetMemberId: "Tsonic.CSharp.Node.fs.openSync(System.String,System.String,System.Int32)", sourceName: "openSync", targetName: "openSync", providerParameters: [stringParameter("path"), stringParameter("flags"), optionalNumberParameter("mode")], providerReturnType: numberProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("flags", stringTargetType),
      targetParameter("mode", intTargetType, { optional: true }),
    ], targetReturnType: intTargetType }),
    fsCall({ exportName: "readFileSync", signatureId: "node:fs.readFileSync(System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.fs.readFileSync(System.String,System.String)", sourceName: "readFileSync", targetName: "readFileSync", providerParameters: [stringParameter("path"), stringParameter("encoding")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("encoding", stringTargetType),
    ], targetReturnType: stringTargetType }),
    fsCall({ exportName: "readFileSync", signatureId: "node:fs.readFileSync(System.String)", targetMemberId: "Tsonic.CSharp.Node.fs.readFileSync(System.String)", sourceName: "readFileSync", targetName: "readFileSync", providerParameters: [stringParameter("path")], providerReturnType: bufferProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: bufferTargetType }),
    fsCall({ exportName: "readSync", signatureId: "node:fs.readSync(System.Int32,Tsonic.CSharp.Node.Buffer,System.Int32,System.Int32,System.Nullable`1)", targetMemberId: "Tsonic.CSharp.Node.fs.readSync(System.Int32,Tsonic.CSharp.Node.Buffer,System.Int32,System.Int32,System.Nullable`1)", sourceName: "readSync", targetName: "readSync", providerParameters: [
      numberParameter("fd"),
      { name: "buffer", type: bufferProviderType },
      numberParameter("offset"),
      numberParameter("length"),
      optionalNumberParameter("position"),
    ], providerReturnType: numberProviderType, targetParameters: [
      targetParameter("fd", intTargetType),
      targetParameter("buffer", bufferTargetType),
      targetParameter("offset", intTargetType),
      targetParameter("length", intTargetType),
      targetParameter("position", csharpNullableValueTargetType(intTargetType), { optional: true }),
    ], targetReturnType: intTargetType }),
    fsCall({ exportName: "readdirSync", signatureId: "node:fs.readdirSync(System.String,System.Boolean)", targetMemberId: "Tsonic.CSharp.Node.fs.readdirSync(System.String,System.Boolean)", sourceName: "readdirSync", targetName: "readdirSync", providerParameters: [stringParameter("path"), optionalBoolParameter("withFileTypes")], providerReturnType: { kind: "array", elementType: stringProviderType }, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("withFileTypes", boolTargetType, { optional: true }),
    ], targetReturnType: { kind: "array", element: stringTargetType } }),
    fsCall({ exportName: "readlinkSync", signatureId: "node:fs.readlinkSync(System.String)", targetMemberId: "Tsonic.CSharp.Node.fs.readlinkSync(System.String)", sourceName: "readlinkSync", targetName: "readlinkSync", providerParameters: [stringParameter("path")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: stringTargetType }),
    fsCall({ exportName: "realpathSync", signatureId: "node:fs.realpathSync(System.String)", targetMemberId: "Tsonic.CSharp.Node.fs.realpathSync(System.String)", sourceName: "realpathSync", targetName: "realpathSync", providerParameters: [stringParameter("path")], providerReturnType: stringProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: stringTargetType }),
    fsCall({ exportName: "renameSync", signatureId: "node:fs.renameSync(System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.fs.renameSync(System.String,System.String)", sourceName: "renameSync", targetName: "renameSync", providerParameters: [stringParameter("oldPath"), stringParameter("newPath")], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("oldPath", stringTargetType),
      targetParameter("newPath", stringTargetType),
    ], targetReturnType: voidTargetType }),
    fsCall({ exportName: "rmSync", signatureId: "node:fs.rmSync(System.String,System.Boolean)", targetMemberId: "Tsonic.CSharp.Node.fs.rmSync(System.String,System.Boolean)", sourceName: "rmSync", targetName: "rmSync", providerParameters: [stringParameter("path"), optionalBoolParameter("recursive")], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("recursive", boolTargetType, { optional: true }),
    ], targetReturnType: voidTargetType }),
    fsCall({ exportName: "rmdirSync", signatureId: "node:fs.rmdirSync(System.String,System.Boolean)", targetMemberId: "Tsonic.CSharp.Node.fs.rmdirSync(System.String,System.Boolean)", sourceName: "rmdirSync", targetName: "rmdirSync", providerParameters: [stringParameter("path"), optionalBoolParameter("recursive")], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("recursive", boolTargetType, { optional: true }),
    ], targetReturnType: voidTargetType }),
    fsCall({ exportName: "symlinkSync", signatureId: "node:fs.symlinkSync(System.String,System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.fs.symlinkSync(System.String,System.String,System.String)", sourceName: "symlinkSync", targetName: "symlinkSync", providerParameters: [stringParameter("target"), stringParameter("path"), optionalStringParameter("type")], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("target", stringTargetType),
      targetParameter("path", stringTargetType),
      targetParameter("type", stringTargetType, { optional: true }),
    ], targetReturnType: voidTargetType }),
    fsCall({ exportName: "truncateSync", signatureId: "node:fs.truncateSync(System.String,System.Int64)", targetMemberId: "Tsonic.CSharp.Node.fs.truncateSync(System.String,System.Int64)", sourceName: "truncateSync", targetName: "truncateSync", providerParameters: [stringParameter("path"), optionalNumberParameter("len")], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("len", longTargetType, { optional: true }),
    ], targetReturnType: voidTargetType }),
    fsCall({ exportName: "unlinkSync", signatureId: "node:fs.unlinkSync(System.String)", targetMemberId: "Tsonic.CSharp.Node.fs.unlinkSync(System.String)", sourceName: "unlinkSync", targetName: "unlinkSync", providerParameters: [stringParameter("path")], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: voidTargetType }),
    fsCall({ exportName: "writeFileSync", signatureId: "node:fs.writeFileSync(System.String,System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.fs.writeFileSync(System.String,System.String,System.String)", sourceName: "writeFileSync", targetName: "writeFileSync", providerParameters: [stringParameter("path"), stringParameter("data"), optionalStringParameter("encoding")], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("data", stringTargetType),
      targetParameter("encoding", stringTargetType, { optional: true }),
    ], targetReturnType: voidTargetType }),
    fsCall({ exportName: "writeFileSync", signatureId: "node:fs.writeFileSync(System.String,Tsonic.CSharp.Node.Buffer)", targetMemberId: "Tsonic.CSharp.Node.fs.writeFileSync(System.String,Tsonic.CSharp.Node.Buffer)", sourceName: "writeFileSync", targetName: "writeFileSync", providerParameters: [stringParameter("path"), { name: "data", type: bufferProviderType }], providerReturnType: voidProviderType, targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("data", bufferTargetType),
    ], targetReturnType: voidTargetType }),
    fsCall({ exportName: "writeSync", signatureId: "node:fs.writeSync(System.Int32,Tsonic.CSharp.Node.Buffer,System.Int32,System.Int32,System.Nullable`1)", targetMemberId: "Tsonic.CSharp.Node.fs.writeSync(System.Int32,Tsonic.CSharp.Node.Buffer,System.Int32,System.Int32,System.Nullable`1)", sourceName: "writeSync", targetName: "writeSync", providerParameters: [
      numberParameter("fd"),
      { name: "buffer", type: bufferProviderType },
      numberParameter("offset"),
      numberParameter("length"),
      optionalNumberParameter("position"),
    ], providerReturnType: numberProviderType, targetParameters: [
      targetParameter("fd", intTargetType),
      targetParameter("buffer", bufferTargetType),
      targetParameter("offset", intTargetType),
      targetParameter("length", intTargetType),
      targetParameter("position", csharpNullableValueTargetType(intTargetType), { optional: true }),
    ], targetReturnType: intTargetType }),
    fsCall({ exportName: "writeSync", signatureId: "node:fs.writeSync(System.Int32,System.String,System.Nullable`1,System.String)", targetMemberId: "Tsonic.CSharp.Node.fs.writeSync(System.Int32,System.String,System.Nullable`1,System.String)", sourceName: "writeSync", targetName: "writeSync", providerParameters: [
      numberParameter("fd"),
      stringParameter("data"),
      optionalNumberParameter("position"),
      optionalStringParameter("encoding"),
    ], providerReturnType: numberProviderType, targetParameters: [
      targetParameter("fd", intTargetType),
      targetParameter("data", stringTargetType),
      targetParameter("position", csharpNullableValueTargetType(intTargetType), { optional: true }),
      targetParameter("encoding", stringTargetType, { optional: true }),
    ], targetReturnType: intTargetType }),
  ];
}

function nodeFsUnsupportedCallDeclarations(): readonly ProviderExportDeclaration[] {
  return [
    {
      id: "node:fs.watchFile",
      name: "watchFile",
      kind: "function",
      signatures: [{
        id: "node:fs.watchFile(System.String,Function)",
        parameters: [
          { name: "filename", type: stringProviderType },
          { name: "listener", type: { kind: "function", parameters: [], returnType: voidProviderType } },
        ],
        returnType: voidProviderType,
      }],
    },
  ];
}

function fsCall(row: NodeFsCallTargetMetadataRow): NodeFsCallTargetMember {
  return nodejsModuleCallTargetMetadata({
    ...row,
    declaringType: fsTargetType,
  });
}

const nodeFsCallTargetMemberByProviderDeclarationIdentity =
  nodejsProviderExportSignatureDeclarationTargetMemberIndex(nodeFsModuleSpecifier, nodeFsCallTargetMembers());
