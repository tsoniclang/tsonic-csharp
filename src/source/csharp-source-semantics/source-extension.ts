import {
  sourceSemanticsExtensionId,
} from "@tsonic/tsts";
import type {
  AstReader,
  CompilerExtension,
  ExtensionEvidence,
  Node,
} from "@tsonic/tsts";
import type {
  TargetProviderContext,
} from "@tsonic/target-api";
import {
  csharpLangModule,
  csharpProviderVersion,
  csharpSourceSemanticsExtensionId,
} from "./identity.js";
import {
  tsonicCoreSourceExtensionId,
} from "@tsonic/source-core";
import {
  csharpSourceSemanticsModules,
} from "./source-modules.js";
import {
  createCsharpSourceVirtualModulesProvider,
} from "./source-virtual-modules.js";
import {
  createDotnetReflectionTypeDataProvider,
  createDotnetSourceDeclarationProvider,
  dotnetModuleSpecifierPolicy,
} from "../../providers/dotnet/index.js";
import {
  readCsharpReflectionReferencePaths,
  readCsharpTargetFramework,
  validateCsharpTargetOptions,
} from "../../options/csharp-target-options.js";

export function createCsharpSourceSemanticsExtension(context: TargetProviderContext): CompilerExtension {
  validateCsharpTargetOptions(context.target);
  const references = readCsharpReflectionReferencePaths(context.target, context.projectDirectory);
  const targetFramework = readCsharpTargetFramework(context.target);
  const dotnetProvider = createDotnetReflectionTypeDataProvider({
    references,
    targetFramework,
  });
  return {
    identity: {
      id: csharpSourceSemanticsExtensionId,
      version: csharpProviderVersion,
      capabilityNamespace: "tsonic.csharp.source",
    },
    composition: {
      kind: "source",
    },
    dependencies: {
      dependsOn: [sourceSemanticsExtensionId, tsonicCoreSourceExtensionId],
      runsAfter: [sourceSemanticsExtensionId, tsonicCoreSourceExtensionId],
    },
    initialize(extensionContext): void {
      extensionContext.registerSourceDeclarationProvider(createCsharpSourceVirtualModulesProvider());
      extensionContext.registerSourceDeclarationProvider(createDotnetSourceDeclarationProvider({
        provider: dotnetProvider,
        moduleSpecifierPolicy: dotnetModuleSpecifierPolicy,
        references,
        targetFramework,
      }));
    },
    analyzeSource(context): void {
      for (const sourceFile of context.source.getSourceFiles()) {
        if (sourceFile === undefined || context.source.ast.getFileName(sourceFile).endsWith(".d.ts")) {
          continue;
        }
        recordUnsupportedCsharpLangReExportDiagnostics(
          sourceFile,
          context.source.ast,
          context.diagnostics,
        );
      }
    },
  };
}

const unsupportedCsharpLangReExportDiagnostic = {
  extensionCode: "CSHARP_SOURCE_LANG_REEXPORT_UNSUPPORTED",
  numericCode: 9100170,
  message: "Re-exporting @tsonic/csharp/lang.js aliases through a local barrel is unsupported; import C# source aliases directly so target ownership remains proven.",
} as const;

const csharpLangExportNames = new Set(
  csharpSourceSemanticsModules()
    .find((module) => module.moduleSpecifier === csharpLangModule)
    ?.exports.map((entry) => entry.exportName) ?? [],
);

type DiagnosticSink = {
  append(diagnostic: {
    readonly extensionId: string;
    readonly extensionCode: string;
    readonly numericCode: number;
    readonly publicCode?: string;
    readonly category: "error";
    readonly message: string;
    readonly nodeOrSpan?: unknown;
    readonly evidence?: readonly ExtensionEvidence[];
    readonly identity?: string;
  }): void;
};

function recordUnsupportedCsharpLangReExportDiagnostics(
  sourceFile: Node,
  ast: AstReader,
  diagnostics: DiagnosticSink,
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
    diagnostics.append({
      extensionId: csharpSourceSemanticsExtensionId,
      extensionCode: unsupportedCsharpLangReExportDiagnostic.extensionCode,
      numericCode: unsupportedCsharpLangReExportDiagnostic.numericCode,
      publicCode: `TSONIC_CSHARP_${unsupportedCsharpLangReExportDiagnostic.numericCode}`,
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
