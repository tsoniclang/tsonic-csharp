import type {
  ProviderExportDeclaration,
  ProviderTypeExpression,
  TargetMember,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpVoidTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
  targetMethod,
  targetParameter,
  targetProperty,
} from "../js/source-library.js";
import {
  csharpJsDateTargetType,
} from "../js/date.js";

const stringProviderType = { kind: "string" } satisfies ProviderTypeExpression;
const boolProviderType = { kind: "boolean" } satisfies ProviderTypeExpression;
const numberProviderType = { kind: "number" } satisfies ProviderTypeExpression;
const voidProviderType = { kind: "void" } satisfies ProviderTypeExpression;
const dateProviderType = {
  kind: "target-named",
  target: "csharp",
  id: "Tsonic.CSharp.Js.Date",
  displayName: "Date",
  sourceShape: { kind: "provider-ref", name: "Date" },
} satisfies ProviderTypeExpression;
const stringTargetType = csharpStringTargetType();
const boolTargetType = csharpSourcePrimitiveTargetType("bool");
const intTargetType = csharpSourcePrimitiveTargetType("int32");
const longTargetType = csharpSourcePrimitiveTargetType("int64");
const doubleTargetType = csharpSourcePrimitiveTargetType("float64");
const voidTargetType = csharpVoidTargetType();
const dateTargetType = csharpJsDateTargetType();
const fsTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.fs", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "fs"));
const statsProviderType = { kind: "provider-ref", name: "Stats" } satisfies ProviderTypeExpression;
const statsTargetType = csharpTargetNamedType("Tsonic.CSharp.Node.Stats", undefined, csharpQualifiedTypeRenderShape("Tsonic.CSharp.Node", "Stats"));

interface NodeFsProviderParameter {
  readonly name: string;
  readonly type: ProviderTypeExpression;
  readonly optional?: boolean;
}

interface NodeFsCallTargetMember {
  readonly exportName: string;
  readonly signatureId: string;
  readonly providerParameters: readonly NodeFsProviderParameter[];
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}

export const nodeFsModuleSpecifier = "node:fs";
export const nodeFsStatsExportName = "Stats";
export const nodeFsExistsSyncExportName = "existsSync";
export const nodeFsExistsSyncSignatureId = "node:fs.existsSync(System.String)";
export const nodeFsStatSyncExportName = "statSync";
export const nodeFsStatSyncSignatureId = "node:fs.statSync(System.String)";
export const nodeFsStatsSizeMemberId = "node:fs.Stats.size";
export const nodeFsStatsAtimeMemberId = "node:fs.Stats.atime";
export const nodeFsStatsAtimeMsMemberId = "node:fs.Stats.atimeMs";
export const nodeFsStatsMtimeMemberId = "node:fs.Stats.mtime";
export const nodeFsStatsMtimeMsMemberId = "node:fs.Stats.mtimeMs";
export const nodeFsStatsCtimeMemberId = "node:fs.Stats.ctime";
export const nodeFsStatsCtimeMsMemberId = "node:fs.Stats.ctimeMs";
export const nodeFsStatsBirthtimeMemberId = "node:fs.Stats.birthtime";
export const nodeFsStatsBirthtimeMsMemberId = "node:fs.Stats.birthtimeMs";
export const nodeFsStatsIsFileMemberId = "node:fs.Stats.isFile";
export const nodeFsStatsIsFileSignatureId = "node:fs.Stats.isFile()";
export const nodeFsStatsIsDirectoryMemberId = "node:fs.Stats.isDirectory";
export const nodeFsStatsIsDirectorySignatureId = "node:fs.Stats.isDirectory()";

export function nodeFsExports(): readonly ProviderExportDeclaration[] {
  return [
    nodeFsStatsExportDeclaration(),
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

export function getNodeFsTargetMember(memberId: string | undefined, signatureId: string | undefined): TargetMember | undefined {
  return nodeFsTargetMembersByIdentity.get(signatureId ?? memberId ?? "");
}

export function nodeFsCallTargetMembers(): readonly {
  readonly exportName: string;
  readonly signatureId: string;
  readonly providerParameters: readonly NodeFsProviderParameter[];
  readonly providerReturnType: ProviderTypeExpression;
  readonly member: TargetMember;
}[] {
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

function nodeFsStatsExportDeclaration(): ProviderExportDeclaration {
  return {
    id: `node:fs.${nodeFsStatsExportName}`,
    name: nodeFsStatsExportName,
    kind: "class",
    targetIdentity: {
      target: "csharp",
      id: statsTargetType.id,
      displayName: "Tsonic.CSharp.Node.Stats",
    },
    members: [
      {
        id: nodeFsStatsSizeMemberId,
        name: "size",
        kind: "property",
        readonly: true,
        type: numberProviderType,
      },
      ...nodeFsStatsTimestampProviderMembers(),
      {
        id: nodeFsStatsIsFileMemberId,
        name: "isFile",
        kind: "method",
        signatures: [{
          id: nodeFsStatsIsFileSignatureId,
          parameters: [],
          returnType: boolProviderType,
        }],
      },
      {
        id: nodeFsStatsIsDirectoryMemberId,
        name: "isDirectory",
        kind: "method",
        signatures: [{
          id: nodeFsStatsIsDirectorySignatureId,
          parameters: [],
          returnType: boolProviderType,
        }],
      },
    ],
  };
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

function nodeFsStatsTimestampProviderMembers(): readonly {
  readonly id: string;
  readonly name: string;
  readonly kind: "property";
  readonly readonly: true;
  readonly type: ProviderTypeExpression;
}[] {
  return [
    nodeFsStatsTimestampProviderMember("atime", nodeFsStatsAtimeMemberId, dateProviderType),
    nodeFsStatsTimestampProviderMember("atimeMs", nodeFsStatsAtimeMsMemberId, numberProviderType),
    nodeFsStatsTimestampProviderMember("mtime", nodeFsStatsMtimeMemberId, dateProviderType),
    nodeFsStatsTimestampProviderMember("mtimeMs", nodeFsStatsMtimeMsMemberId, numberProviderType),
    nodeFsStatsTimestampProviderMember("ctime", nodeFsStatsCtimeMemberId, dateProviderType),
    nodeFsStatsTimestampProviderMember("ctimeMs", nodeFsStatsCtimeMsMemberId, numberProviderType),
    nodeFsStatsTimestampProviderMember("birthtime", nodeFsStatsBirthtimeMemberId, dateProviderType),
    nodeFsStatsTimestampProviderMember("birthtimeMs", nodeFsStatsBirthtimeMsMemberId, numberProviderType),
  ];
}

function nodeFsStatsTimestampProviderMember(
  name: string,
  id: string,
  type: ProviderTypeExpression,
): {
  readonly id: string;
  readonly name: string;
  readonly kind: "property";
  readonly readonly: true;
  readonly type: ProviderTypeExpression;
} {
  return {
    id,
    name,
    kind: "property",
    readonly: true,
    type,
  };
}

function getNodeFsStatsSizeTargetMember(): TargetMember {
  return targetProperty("Tsonic.CSharp.Node.Stats.size", "size", "size", longTargetType, {
    declaringType: statsTargetType,
  });
}

function getNodeFsStatsDateTargetMember(sourceName: string): TargetMember {
  return targetProperty(`Tsonic.CSharp.Node.Stats.${sourceName}`, sourceName, sourceName, dateTargetType, {
    declaringType: statsTargetType,
  });
}

function getNodeFsStatsUnixMillisecondsTargetMember(sourceName: string): TargetMember {
  return targetProperty(`Tsonic.CSharp.Node.Stats.${sourceName}`, sourceName, sourceName, doubleTargetType, {
    declaringType: statsTargetType,
  });
}

function getNodeFsStatsIsFileTargetMember(): TargetMember {
  return nodeFsStatsBoolMethodTargetMember("isFile", "IsFile");
}

function getNodeFsStatsIsDirectoryTargetMember(): TargetMember {
  return nodeFsStatsBoolMethodTargetMember("isDirectory", "IsDirectory");
}

function nodeFsStatsBoolMethodTargetMember(sourceName: string, targetName: string): TargetMember {
  return targetMethod(
    `Tsonic.CSharp.Node.Stats.${targetName}()`,
    sourceName,
    targetName,
    [],
    boolTargetType,
    {
      declaringType: statsTargetType,
    },
  );
}

function fsCall(
  exportName: string,
  signatureId: string,
  providerParameters: readonly NodeFsProviderParameter[],
  providerReturnType: ProviderTypeExpression,
  targetParameters: readonly ReturnType<typeof targetParameter>[],
  targetReturnType: TargetTypeRef,
): NodeFsCallTargetMember {
  return {
    exportName,
    signatureId,
    providerParameters,
    providerReturnType,
    member: targetMethod(
      `Tsonic.CSharp.Node.fs.${exportName}(${signatureId.slice("node:fs.".length + exportName.length + 1, -1)})`,
      exportName,
      exportName,
      targetParameters,
      targetReturnType,
      {
        declaringType: fsTargetType,
        static: true,
      },
    ),
  };
}

const nodeFsTargetMembersByIdentity = new Map<string, TargetMember>([
  [nodeFsStatsSizeMemberId, getNodeFsStatsSizeTargetMember()],
  [nodeFsStatsAtimeMemberId, getNodeFsStatsDateTargetMember("atime")],
  [nodeFsStatsAtimeMsMemberId, getNodeFsStatsUnixMillisecondsTargetMember("atimeMs")],
  [nodeFsStatsMtimeMemberId, getNodeFsStatsDateTargetMember("mtime")],
  [nodeFsStatsMtimeMsMemberId, getNodeFsStatsUnixMillisecondsTargetMember("mtimeMs")],
  [nodeFsStatsCtimeMemberId, getNodeFsStatsDateTargetMember("ctime")],
  [nodeFsStatsCtimeMsMemberId, getNodeFsStatsUnixMillisecondsTargetMember("ctimeMs")],
  [nodeFsStatsBirthtimeMemberId, getNodeFsStatsDateTargetMember("birthtime")],
  [nodeFsStatsBirthtimeMsMemberId, getNodeFsStatsUnixMillisecondsTargetMember("birthtimeMs")],
  [nodeFsStatsIsFileMemberId, getNodeFsStatsIsFileTargetMember()],
  [nodeFsStatsIsFileSignatureId, getNodeFsStatsIsFileTargetMember()],
  [nodeFsStatsIsDirectoryMemberId, getNodeFsStatsIsDirectoryTargetMember()],
  [nodeFsStatsIsDirectorySignatureId, getNodeFsStatsIsDirectoryTargetMember()],
]);
