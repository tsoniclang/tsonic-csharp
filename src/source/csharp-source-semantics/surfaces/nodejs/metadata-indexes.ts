import type {
  CsharpTargetMember,
} from "../../target-types.js";
import {
  nodejsExportDeclarationIdentity,
  nodejsExportSignatureDeclarationIdentity,
  nodejsProviderDeclarationIdentityKey,
} from "./identity.js";

interface NodejsExportMetadataRow {
  readonly exportName: string;
}

interface NodejsExportSignatureMetadataRow extends NodejsExportMetadataRow {
  readonly signatureId: string;
}

interface NodejsTargetMemberMetadataRow {
  readonly member: CsharpTargetMember;
}

export function nodejsProviderExportDeclarationMetadataIndex<TRow extends NodejsExportMetadataRow>(
  moduleSpecifier: string,
  rows: readonly TRow[],
): ReadonlyMap<string, TRow> {
  return nodejsProviderMetadataIndex(rows, (row) =>
    nodejsProviderDeclarationIdentityKey(nodejsExportDeclarationIdentity(moduleSpecifier, row.exportName))
  );
}

export function nodejsProviderExportSignatureDeclarationMetadataIndex<TRow extends NodejsExportSignatureMetadataRow>(
  moduleSpecifier: string,
  rows: readonly TRow[],
): ReadonlyMap<string, TRow> {
  return nodejsProviderMetadataIndex(rows, (row) =>
    nodejsProviderDeclarationIdentityKey(nodejsExportSignatureDeclarationIdentity(moduleSpecifier, row.exportName, row.signatureId))
  );
}

export function nodejsProviderExportDeclarationTargetMemberIndex<TRow extends NodejsExportMetadataRow & NodejsTargetMemberMetadataRow>(
  moduleSpecifier: string,
  rows: readonly TRow[],
): ReadonlyMap<string, CsharpTargetMember> {
  return targetMemberIndex(nodejsProviderExportDeclarationMetadataIndex(moduleSpecifier, rows));
}

export function nodejsProviderExportSignatureDeclarationTargetMemberIndex<TRow extends NodejsExportSignatureMetadataRow & NodejsTargetMemberMetadataRow>(
  moduleSpecifier: string,
  rows: readonly TRow[],
): ReadonlyMap<string, CsharpTargetMember> {
  return targetMemberIndex(nodejsProviderExportSignatureDeclarationMetadataIndex(moduleSpecifier, rows));
}

export function getNodejsProviderExportDeclarationMetadata<TRow>(
  index: ReadonlyMap<string, TRow>,
  moduleSpecifier: string,
  exportName: string | undefined,
): TRow | undefined {
  if (exportName === undefined) {
    return undefined;
  }
  return index.get(nodejsProviderDeclarationIdentityKey(nodejsExportDeclarationIdentity(moduleSpecifier, exportName)));
}

export function getNodejsProviderExportSignatureDeclarationMetadata<TRow>(
  index: ReadonlyMap<string, TRow>,
  moduleSpecifier: string,
  exportName: string | undefined,
  signatureId: string | undefined,
): TRow | undefined {
  if (exportName === undefined || signatureId === undefined) {
    return undefined;
  }
  return index.get(nodejsProviderDeclarationIdentityKey(nodejsExportSignatureDeclarationIdentity(moduleSpecifier, exportName, signatureId)));
}

export function getNodejsProviderExportDeclarationTargetMember(
  index: ReadonlyMap<string, CsharpTargetMember>,
  moduleSpecifier: string,
  exportName: string | undefined,
): CsharpTargetMember | undefined {
  return getNodejsProviderExportDeclarationMetadata(index, moduleSpecifier, exportName);
}

export function getNodejsProviderExportSignatureDeclarationTargetMember(
  index: ReadonlyMap<string, CsharpTargetMember>,
  moduleSpecifier: string,
  exportName: string | undefined,
  signatureId: string | undefined,
): CsharpTargetMember | undefined {
  return getNodejsProviderExportSignatureDeclarationMetadata(index, moduleSpecifier, exportName, signatureId);
}

function targetMemberIndex<TRow extends NodejsTargetMemberMetadataRow>(
  metadataIndex: ReadonlyMap<string, TRow>,
): ReadonlyMap<string, CsharpTargetMember> {
  return new Map([...metadataIndex.entries()].map(([key, row]) => [key, row.member] as const));
}

function nodejsProviderMetadataIndex<TRow>(
  rows: readonly TRow[],
  rowIdentityKey: (row: TRow) => string,
): ReadonlyMap<string, TRow> {
  const index = new Map<string, TRow>();
  for (const row of rows) {
    const identityKey = rowIdentityKey(row);
    if (index.has(identityKey)) {
      throw new Error(`Duplicate C# NodeJS provider metadata identity '${identityKey}'.`);
    }
    index.set(identityKey, row);
  }
  return index;
}
