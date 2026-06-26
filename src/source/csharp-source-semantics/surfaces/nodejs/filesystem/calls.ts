import type {
  ProviderExportDeclaration,
  TargetMember,
  TargetParameter,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  targetParameter,
} from "../../js/source-library.js";
import {
  nodeFsExistsSyncExportName,
  nodeFsExistsSyncSignatureId,
  nodeFsStatSyncExportName,
  nodeFsStatSyncSignatureId,
} from "./identities.js";
import {
  boolProviderType,
  boolTargetType,
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
  NodeFsProviderParameter,
  ProviderTypeExpression,
} from "./types.js";

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
  if (signatureId === undefined) {
    return undefined;
  }
  return nodeFsCallTargetMembers()
    .find((entry) => entry.exportName === exportName && entry.signatureId === signatureId)
    ?.member;
}

export function nodeFsCallExportDeclarations(): readonly ProviderExportDeclaration[] {
  return [
    ...nodeFsCallTargetMembers().map(({ exportName, signatureId, providerParameters, providerReturnType }) => ({
      id: `node:fs.${exportName}`,
      name: exportName,
      kind: "function" as const,
      signatures: [{
        id: signatureId,
        parameters: providerParameters,
        returnType: providerReturnType,
      }],
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
    fsCall("accessSync", "node:fs.accessSync(System.String,System.Int32)", [stringParameter("path"), optionalNumberParameter("mode")], voidProviderType, [
      targetParameter("path", stringTargetType),
      targetParameter("mode", intTargetType, { optional: true }),
    ], voidTargetType),
    fsCall("appendFileSync", "node:fs.appendFileSync(System.String,System.String,System.String)", [stringParameter("path"), stringParameter("data"), optionalStringParameter("encoding")], voidProviderType, [
      targetParameter("path", stringTargetType),
      targetParameter("data", stringTargetType),
      targetParameter("encoding", stringTargetType, { optional: true }),
    ], voidTargetType),
    fsCall("chmodSync", "node:fs.chmodSync(System.String,System.Int32)", [stringParameter("path"), numberParameter("mode")], voidProviderType, [
      targetParameter("path", stringTargetType),
      targetParameter("mode", intTargetType),
    ], voidTargetType),
    fsCall("closeSync", "node:fs.closeSync(System.Int32)", [numberParameter("fd")], voidProviderType, [
      targetParameter("fd", intTargetType),
    ], voidTargetType),
    fsCall("copyFileSync", "node:fs.copyFileSync(System.String,System.String,System.Int32)", [stringParameter("src"), stringParameter("dest"), optionalNumberParameter("mode")], voidProviderType, [
      targetParameter("src", stringTargetType),
      targetParameter("dest", stringTargetType),
      targetParameter("mode", intTargetType, { optional: true }),
    ], voidTargetType),
    fsCall("cpSync", "node:fs.cpSync(System.String,System.String,System.Boolean)", [stringParameter("src"), stringParameter("dest"), optionalBoolParameter("recursive")], voidProviderType, [
      targetParameter("src", stringTargetType),
      targetParameter("dest", stringTargetType),
      targetParameter("recursive", boolTargetType, { optional: true }),
    ], voidTargetType),
    fsCall(nodeFsExistsSyncExportName, nodeFsExistsSyncSignatureId, [stringParameter("path")], boolProviderType, [
      targetParameter("path", stringTargetType),
    ], boolTargetType),
    fsCall(nodeFsStatSyncExportName, nodeFsStatSyncSignatureId, [stringParameter("path")], statsProviderType, [
      targetParameter("path", stringTargetType),
    ], statsTargetType),
    fsCall("mkdirSync", "node:fs.mkdirSync(System.String,System.Boolean)", [stringParameter("path"), optionalBoolParameter("recursive")], voidProviderType, [
      targetParameter("path", stringTargetType),
      targetParameter("recursive", boolTargetType, { optional: true }),
    ], voidTargetType),
    fsCall("openSync", "node:fs.openSync(System.String,System.String,System.Int32)", [stringParameter("path"), stringParameter("flags"), optionalNumberParameter("mode")], numberProviderType, [
      targetParameter("path", stringTargetType),
      targetParameter("flags", stringTargetType),
      targetParameter("mode", intTargetType, { optional: true }),
    ], intTargetType),
    fsCall("readFileSync", "node:fs.readFileSync(System.String,System.String)", [stringParameter("path"), stringParameter("encoding")], stringProviderType, [
      targetParameter("path", stringTargetType),
      targetParameter("encoding", stringTargetType),
    ], stringTargetType),
    fsCall("readdirSync", "node:fs.readdirSync(System.String,System.Boolean)", [stringParameter("path"), optionalBoolParameter("withFileTypes")], { kind: "array", elementType: stringProviderType }, [
      targetParameter("path", stringTargetType),
      targetParameter("withFileTypes", boolTargetType, { optional: true }),
    ], { kind: "array", element: stringTargetType }),
    fsCall("readlinkSync", "node:fs.readlinkSync(System.String)", [stringParameter("path")], stringProviderType, [
      targetParameter("path", stringTargetType),
    ], stringTargetType),
    fsCall("realpathSync", "node:fs.realpathSync(System.String)", [stringParameter("path")], stringProviderType, [
      targetParameter("path", stringTargetType),
    ], stringTargetType),
    fsCall("renameSync", "node:fs.renameSync(System.String,System.String)", [stringParameter("oldPath"), stringParameter("newPath")], voidProviderType, [
      targetParameter("oldPath", stringTargetType),
      targetParameter("newPath", stringTargetType),
    ], voidTargetType),
    fsCall("rmSync", "node:fs.rmSync(System.String,System.Boolean)", [stringParameter("path"), optionalBoolParameter("recursive")], voidProviderType, [
      targetParameter("path", stringTargetType),
      targetParameter("recursive", boolTargetType, { optional: true }),
    ], voidTargetType),
    fsCall("rmdirSync", "node:fs.rmdirSync(System.String,System.Boolean)", [stringParameter("path"), optionalBoolParameter("recursive")], voidProviderType, [
      targetParameter("path", stringTargetType),
      targetParameter("recursive", boolTargetType, { optional: true }),
    ], voidTargetType),
    fsCall("symlinkSync", "node:fs.symlinkSync(System.String,System.String,System.String)", [stringParameter("target"), stringParameter("path"), optionalStringParameter("type")], voidProviderType, [
      targetParameter("target", stringTargetType),
      targetParameter("path", stringTargetType),
      targetParameter("type", stringTargetType, { optional: true }),
    ], voidTargetType),
    fsCall("truncateSync", "node:fs.truncateSync(System.String,System.Int64)", [stringParameter("path"), optionalNumberParameter("len")], voidProviderType, [
      targetParameter("path", stringTargetType),
      targetParameter("len", longTargetType, { optional: true }),
    ], voidTargetType),
    fsCall("unlinkSync", "node:fs.unlinkSync(System.String)", [stringParameter("path")], voidProviderType, [
      targetParameter("path", stringTargetType),
    ], voidTargetType),
    fsCall("writeFileSync", "node:fs.writeFileSync(System.String,System.String,System.String)", [stringParameter("path"), stringParameter("data"), optionalStringParameter("encoding")], voidProviderType, [
      targetParameter("path", stringTargetType),
      targetParameter("data", stringTargetType),
      targetParameter("encoding", stringTargetType, { optional: true }),
    ], voidTargetType),
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

function fsCall(
  exportName: string,
  signatureId: string,
  providerParameters: readonly NodeFsProviderParameter[],
  providerReturnType: ProviderTypeExpression,
  targetParameters: readonly TargetParameter[],
  targetReturnType: TargetTypeRef,
): NodeFsCallTargetMember {
  return {
    exportName,
    signatureId,
    providerParameters,
    providerReturnType,
    member: {
      id: `Tsonic.CSharp.Node.fs.${exportName}(${signatureId.slice("node:fs.".length + exportName.length + 1, -1)})`,
      sourceName: exportName,
      targetName: exportName,
      kind: "method",
      parameters: targetParameters,
      returnType: targetReturnType,
      declaringType: fsTargetType,
      static: true,
    },
  };
}
