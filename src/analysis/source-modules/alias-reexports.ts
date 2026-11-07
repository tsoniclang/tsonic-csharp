import type { AstReader, ExtensionDiagnostic, Node } from "@tsonic/tsts";
import { csharpLangModule, csharpSourceSemanticsExtensionId } from "../../target-model/identities/source.js";
import { csharpSourceSemanticsModules } from "../../source/profiles/source-modules.js";
import { csharpProviderExportsForModule } from "../../source/profiles/source-virtual-modules.js";

type CsharpSourceAliasIssue = ExtensionDiagnostic & { readonly nodeOrSpan: Node; readonly publicCode: string };

export function analyzeCsharpSourceAliasReexports(ast: AstReader, sourceFiles: readonly NonNullable<Parameters<AstReader["getFileName"]>[0]>[]): readonly CsharpSourceAliasIssue[] {
  const diagnostics: CsharpSourceAliasIssue[] = [];
  for (const sourceFile of sourceFiles) {
    if (ast.getFileName(sourceFile).endsWith(".d.ts")) continue;
    recordUnsupportedCsharpLangReExportDiagnostics(sourceFile, ast, diagnostics);
  }
  return diagnostics;
}

// A C# target refusal (R5/I7: a CSHARP_ code for a .NET reason). @tsonic/csharp/lang.js is the C# target's own marker
// module (out / ref / inref parameter modes, struct, field, attribute, defaultof, fnptr; source/profiles/source-modules.ts).
// The C# source-semantics extension binds each marker to its .NET form (a by-reference parameter mode, a struct or field
// declaration, an attribute, default(T), a function pointer) only where it is imported from that module. A local barrel
// re-export carries no binding, so the re-exported marker has no proven .NET form. The Host does not own this rule: the
// marker module and its meanings exist only in the C# target.
const csharpLangMarkerReexportCode = "CSHARP_LANG_MARKER_REEXPORT";

const unsupportedCsharpLangReExportDiagnostic = {
  extensionCode: csharpLangMarkerReexportCode,
  numericCode: 9100170,
  message: "Re-exporting @tsonic/csharp/lang.js markers through a local barrel is unsupported: the C# target binds each marker to its .NET form only where it is imported from @tsonic/csharp/lang.js, and a re-export carries no binding. Import C# markers directly.",
} as const;

const langModule = csharpSourceSemanticsModules().find(module => module.moduleSpecifier === csharpLangModule);
const csharpLangExportNames = new Set(langModule === undefined ? [] : csharpProviderExportsForModule(langModule).map(entry => entry.name));

function recordUnsupportedCsharpLangReExportDiagnostics(
  sourceFile: Node,
  ast: AstReader,
  diagnostics: CsharpSourceAliasIssue[],
): void {
  let exportDeclarationIndex = 0;
  for (const statement of ast.statements(sourceFile)) {
    if (statement === undefined || !ast.is.IsExportDeclaration(statement)) {
      continue;
    }
    const statementIdentity = exportDeclarationIndex;
    exportDeclarationIndex += 1;
    const moduleSpecifier = ast.as.AsExportDeclaration(statement)?.ModuleSpecifier;
    if (moduleSpecifier === undefined || ast.text(moduleSpecifier) !== csharpLangModule) {
      continue;
    }
    const exportedNames = exportedCsharpLangAliasNames(statement, ast);
    if (exportedNames.length === 0) {
      continue;
    }
    diagnostics.push({
      extensionId: csharpSourceSemanticsExtensionId,
      extensionCode: unsupportedCsharpLangReExportDiagnostic.extensionCode,
      numericCode: unsupportedCsharpLangReExportDiagnostic.numericCode,
      publicCode: csharpLangMarkerReexportCode,
      category: "error",
      message: unsupportedCsharpLangReExportDiagnostic.message,
      nodeOrSpan: statement,
      evidence: [{
        message: "C# source alias ownership does not flow through local re-export barrels.",
        details: {
          moduleSpecifier: csharpLangModule,
          exportedNames,
        },
      }],
      identity: `csharp-source-lang-reexport:${statementIdentity}:${exportedNames.join(",")}`,
    });
  }
}

function exportedCsharpLangAliasNames(exportDeclaration: Node, ast: AstReader): readonly string[] {
  const exportClause = ast.as.AsExportDeclaration(exportDeclaration)?.ExportClause;
  if (exportClause === undefined) {
    return ["*"];
  }
  if (!ast.is.IsNamedExports(exportClause)) {
    return ["*"];
  }
  const exportedNames: string[] = [];
  for (const specifier of ast.elements(exportClause)) {
    if (specifier === undefined || !ast.is.IsExportSpecifier(specifier)) {
      continue;
    }
    const exportNameNode = ast.as.AsExportSpecifier(specifier)?.PropertyName ??
      ast.name(specifier);
    const exportName = exportNameNode === undefined ? undefined : ast.text(exportNameNode);
    if (exportName !== undefined && csharpLangExportNames.has(exportName)) {
      exportedNames.push(exportName);
    }
  }
  return exportedNames;
}
