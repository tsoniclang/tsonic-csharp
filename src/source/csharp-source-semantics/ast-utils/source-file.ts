import type {
  AstReader,
  SourceFile,
} from "@tsonic/tsts";

export function isDeclarationOrVirtualSourceFile(
  sourceFile: SourceFile | undefined,
  ast: Pick<AstReader, "getFileName">,
): boolean {
  if (sourceFile === undefined) {
    return false;
  }
  if ((sourceFile as { readonly IsDeclarationFile?: boolean }).IsDeclarationFile === true) {
    return true;
  }
  const fileName = ast.getFileName(sourceFile);
  return fileName.endsWith(".d.ts") ||
    fileName.includes(".d.ts#") ||
    fileName.startsWith("bundled:") ||
    fileName.startsWith("tsts-provider:");
}

export function isCsharpUserSourceFile(
  sourceFile: SourceFile | undefined,
  ast: Pick<AstReader, "getFileName">,
): sourceFile is SourceFile {
  return sourceFile !== undefined && !isDeclarationOrVirtualSourceFile(sourceFile, ast);
}
