import type {
  ProviderExportDeclaration,
  ProviderParameterDeclaration,
  TargetMember,
} from "@tsonic/tsts";
import {
  targetParameter,
} from "../../../surfaces/js/source-library.js";
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
  nodeFsPromisesModuleSpecifier,
} from "./identities.js";
import {
  boolProviderType,
  boolTargetType,
  bufferProviderType,
  bufferTargetType,
  fsPromisesTargetType,
  intTargetType,
  longTargetType,
  numberProviderType,
  promiseProviderType,
  statsProviderType,
  statsTargetType,
  stringProviderType,
  stringTargetType,
  taskTargetType,
  voidProviderType,
  voidTargetType,
} from "./types.js";
import type {
  NodeFsCallTargetMember,
} from "./types.js";

type NodeFsPromisesCallTargetMetadataRow = Omit<NodejsModuleCallTargetMetadataRow, "declaringType">;

export function getNodeFsPromisesCallTargetMember(
  exportName: string | undefined,
  signatureId: string | undefined,
): TargetMember | undefined {
  return getNodejsProviderExportSignatureDeclarationTargetMember(
    nodeFsPromisesCallTargetMemberByProviderDeclarationIdentity,
    nodeFsPromisesModuleSpecifier,
    exportName,
    signatureId,
  );
}

export function nodeFsPromisesExportDeclarations(): readonly ProviderExportDeclaration[] {
  const membersByExportName = new Map<string, readonly NodeFsCallTargetMember[]>();
  for (const member of nodeFsPromisesCallTargetMembers()) {
    membersByExportName.set(member.exportName, [...membersByExportName.get(member.exportName) ?? [], member]);
  }
  return [...membersByExportName.entries()].map(([exportName, members]) => ({
    id: `${nodeFsPromisesModuleSpecifier}.${exportName}`,
    name: exportName,
    kind: "function" as const,
    signatures: members.map(({ signatureId, providerParameters, providerReturnType }) => ({
      id: signatureId,
      parameters: providerParameters,
      returnType: providerReturnType,
    })),
  }));
}

export function nodeFsPromisesCallTargetMembers(): readonly NodeFsCallTargetMember[] {
  const stringParameter = (name: string): ProviderParameterDeclaration => ({ name, type: stringProviderType });
  const optionalStringParameter = (name: string): ProviderParameterDeclaration => ({ name, type: stringProviderType, optional: true });
  const optionalNumberParameter = (name: string): ProviderParameterDeclaration => ({ name, type: numberProviderType, optional: true });
  const optionalBoolParameter = (name: string): ProviderParameterDeclaration => ({ name, type: boolProviderType, optional: true });
  return [
    fsPromiseCall({ exportName: "access", signatureId: "node:fs/promises.access(System.String,System.Int32)", targetMemberId: "Tsonic.CSharp.Node.fs_promises.access(System.String,System.Int32)", sourceName: "access", targetName: "access", providerParameters: [stringParameter("path"), optionalNumberParameter("mode")], providerReturnType: promiseProviderType(voidProviderType), targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("mode", intTargetType, { optional: true }),
    ], targetReturnType: taskTargetType(voidTargetType) }),
    fsPromiseCall({ exportName: "appendFile", signatureId: "node:fs/promises.appendFile(System.String,System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.fs_promises.appendFile(System.String,System.String,System.String)", sourceName: "appendFile", targetName: "appendFile", providerParameters: [stringParameter("path"), stringParameter("data"), optionalStringParameter("encoding")], providerReturnType: promiseProviderType(voidProviderType), targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("data", stringTargetType),
      targetParameter("encoding", stringTargetType, { optional: true }),
    ], targetReturnType: taskTargetType(voidTargetType) }),
    fsPromiseCall({ exportName: "copyFile", signatureId: "node:fs/promises.copyFile(System.String,System.String,System.Int32)", targetMemberId: "Tsonic.CSharp.Node.fs_promises.copyFile(System.String,System.String,System.Int32)", sourceName: "copyFile", targetName: "copyFile", providerParameters: [stringParameter("src"), stringParameter("dest"), optionalNumberParameter("mode")], providerReturnType: promiseProviderType(voidProviderType), targetParameters: [
      targetParameter("src", stringTargetType),
      targetParameter("dest", stringTargetType),
      targetParameter("mode", intTargetType, { optional: true }),
    ], targetReturnType: taskTargetType(voidTargetType) }),
    fsPromiseCall({ exportName: "mkdir", signatureId: "node:fs/promises.mkdir(System.String,System.Boolean)", targetMemberId: "Tsonic.CSharp.Node.fs_promises.mkdir(System.String,System.Boolean)", sourceName: "mkdir", targetName: "mkdir", providerParameters: [stringParameter("path"), optionalBoolParameter("recursive")], providerReturnType: promiseProviderType(voidProviderType), targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("recursive", boolTargetType, { optional: true }),
    ], targetReturnType: taskTargetType(voidTargetType) }),
    fsPromiseCall({ exportName: "readFile", signatureId: "node:fs/promises.readFile(System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.fs_promises.readFile(System.String,System.String)", sourceName: "readFile", targetName: "readFile", providerParameters: [stringParameter("path"), optionalStringParameter("encoding")], providerReturnType: promiseProviderType(stringProviderType), targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("encoding", stringTargetType, { optional: true }),
    ], targetReturnType: taskTargetType(stringTargetType) }),
    fsPromiseCall({ exportName: "readFile", signatureId: "node:fs/promises.readFile(System.String)", targetMemberId: "Tsonic.CSharp.Node.fs_promises.readFileBytes(System.String)", sourceName: "readFile", targetName: "readFileBytes", providerParameters: [stringParameter("path")], providerReturnType: promiseProviderType(bufferProviderType), targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: taskTargetType(bufferTargetType) }),
    fsPromiseCall({ exportName: "readdir", signatureId: "node:fs/promises.readdir(System.String,System.Boolean)", targetMemberId: "Tsonic.CSharp.Node.fs_promises.readdir(System.String,System.Boolean)", sourceName: "readdir", targetName: "readdir", providerParameters: [stringParameter("path"), optionalBoolParameter("withFileTypes")], providerReturnType: promiseProviderType({ kind: "array", elementType: stringProviderType }), targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("withFileTypes", boolTargetType, { optional: true }),
    ], targetReturnType: taskTargetType({ kind: "array", element: stringTargetType }) }),
    fsPromiseCall({ exportName: "rename", signatureId: "node:fs/promises.rename(System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.fs_promises.rename(System.String,System.String)", sourceName: "rename", targetName: "rename", providerParameters: [stringParameter("oldPath"), stringParameter("newPath")], providerReturnType: promiseProviderType(voidProviderType), targetParameters: [
      targetParameter("oldPath", stringTargetType),
      targetParameter("newPath", stringTargetType),
    ], targetReturnType: taskTargetType(voidTargetType) }),
    fsPromiseCall({ exportName: "rm", signatureId: "node:fs/promises.rm(System.String,System.Boolean)", targetMemberId: "Tsonic.CSharp.Node.fs_promises.rm(System.String,System.Boolean)", sourceName: "rm", targetName: "rm", providerParameters: [stringParameter("path"), optionalBoolParameter("recursive")], providerReturnType: promiseProviderType(voidProviderType), targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("recursive", boolTargetType, { optional: true }),
    ], targetReturnType: taskTargetType(voidTargetType) }),
    fsPromiseCall({ exportName: "stat", signatureId: "node:fs/promises.stat(System.String)", targetMemberId: "Tsonic.CSharp.Node.fs_promises.stat(System.String)", sourceName: "stat", targetName: "stat", providerParameters: [stringParameter("path")], providerReturnType: promiseProviderType(statsProviderType), targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: taskTargetType(statsTargetType) }),
    fsPromiseCall({ exportName: "truncate", signatureId: "node:fs/promises.truncate(System.String,System.Int64)", targetMemberId: "Tsonic.CSharp.Node.fs_promises.truncate(System.String,System.Int64)", sourceName: "truncate", targetName: "truncate", providerParameters: [stringParameter("path"), optionalNumberParameter("len")], providerReturnType: promiseProviderType(voidProviderType), targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("len", longTargetType, { optional: true }),
    ], targetReturnType: taskTargetType(voidTargetType) }),
    fsPromiseCall({ exportName: "unlink", signatureId: "node:fs/promises.unlink(System.String)", targetMemberId: "Tsonic.CSharp.Node.fs_promises.unlink(System.String)", sourceName: "unlink", targetName: "unlink", providerParameters: [stringParameter("path")], providerReturnType: promiseProviderType(voidProviderType), targetParameters: [
      targetParameter("path", stringTargetType),
    ], targetReturnType: taskTargetType(voidTargetType) }),
    fsPromiseCall({ exportName: "writeFile", signatureId: "node:fs/promises.writeFile(System.String,System.String,System.String)", targetMemberId: "Tsonic.CSharp.Node.fs_promises.writeFile(System.String,System.String,System.String)", sourceName: "writeFile", targetName: "writeFile", providerParameters: [stringParameter("path"), stringParameter("data"), optionalStringParameter("encoding")], providerReturnType: promiseProviderType(voidProviderType), targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("data", stringTargetType),
      targetParameter("encoding", stringTargetType, { optional: true }),
    ], targetReturnType: taskTargetType(voidTargetType) }),
    fsPromiseCall({ exportName: "writeFile", signatureId: "node:fs/promises.writeFile(System.String,Tsonic.CSharp.Node.Buffer)", targetMemberId: "Tsonic.CSharp.Node.fs_promises.writeFileBytes(System.String,Tsonic.CSharp.Node.Buffer)", sourceName: "writeFile", targetName: "writeFileBytes", providerParameters: [stringParameter("path"), { name: "data", type: bufferProviderType }], providerReturnType: promiseProviderType(voidProviderType), targetParameters: [
      targetParameter("path", stringTargetType),
      targetParameter("data", bufferTargetType),
    ], targetReturnType: taskTargetType(voidTargetType) }),
  ];
}

function fsPromiseCall(row: NodeFsPromisesCallTargetMetadataRow): NodeFsCallTargetMember {
  return nodejsModuleCallTargetMetadata({
    ...row,
    declaringType: fsPromisesTargetType,
  });
}

const nodeFsPromisesCallTargetMemberByProviderDeclarationIdentity =
  nodejsProviderExportSignatureDeclarationTargetMemberIndex(nodeFsPromisesModuleSpecifier, nodeFsPromisesCallTargetMembers());
