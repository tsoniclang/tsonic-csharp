import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpOutputType } from "../../target-model/configuration/model.js";
import type { CsharpTargetOperationClassifications } from "../operations/index.js";
import type {
  CsharpSourceModuleAnalysis,
  CsharpSourceModuleAnalysisIssue,
  CsharpSourceModuleConstruction,
  CsharpSourceModuleConstructionIndex,
} from "./model.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";

export function analyzeCsharpSourceModuleConstructions(input: {
  readonly source: TargetSourceProgram;
  readonly sourceFiles: readonly SourceFile[];
  readonly operations: CsharpTargetOperationClassifications;
  readonly outputType: CsharpOutputType;
}): CsharpSourceModuleAnalysis {
  const entries: CsharpSourceModuleConstruction[] = [];
  const issues: CsharpSourceModuleAnalysisIssue[] = [];
  for (const sourceFile of input.sourceFiles) {
    if (sourceFile.IsDeclarationFile) continue;
    visit(sourceFile, (node) => {
      if (input.source.ast.kindName(node) !== "KindNewExpression") return;
      const classification = input.operations.construction(node);
      const selection = classification?.target;
      if (selection?.kind !== "resolved") return;
      const invocation = selection.call.targetMember.csharpInvocation;
      if (invocation?.kind !== "source-module-construction") return;
      if (input.outputType !== "Exe") {
        issues.push(issue(
          "CSHARP_SOURCE_MODULE_CONSTRUCTION_REQUIRES_EXECUTABLE",
          node,
          "A source-module construction requires executable output so the compiler can emit a closed module-entry dispatcher.",
        ));
        return;
      }
      const argumentSlots = input.source.ast.arguments(node);
      const moduleArgument = argumentSlots[invocation.sourceArgumentIndex];
      if (
        moduleArgument === undefined ||
        (
          input.source.ast.kindName(moduleArgument) !== "KindStringLiteral" &&
          input.source.ast.kindName(moduleArgument) !==
            "KindNoSubstitutionTemplateLiteral"
        )
      ) {
        issues.push(issue(
          "CSHARP_SOURCE_MODULE_ARGUMENT_NOT_STATIC",
          node,
          "A source-module construction requires one exact authored string-literal module argument.",
        ));
        return;
      }
      const resolution = input.source.navigation.moduleSpecifierResolution(
        moduleArgument,
      );
      if (resolution.kind !== "project") {
        issues.push(issue(
          resolution.kind === "unresolved"
            ? "CSHARP_SOURCE_MODULE_ARGUMENT_UNRESOLVED"
            : "CSHARP_SOURCE_MODULE_ARGUMENT_NOT_PROJECT_SOURCE",
          moduleArgument,
          resolution.kind === "unresolved"
            ? "The selected source-module argument does not resolve to an exact checked module."
            : "The selected source-module argument resolves outside the checked project source graph.",
        ));
        return;
      }
      entries.push(Object.freeze({
        expression: node,
        sourceFile,
        targetSourceFile: resolution.sourceFile,
        moduleArgument,
        sourceArgumentIndex: invocation.sourceArgumentIndex,
        targetParameterIndex: invocation.targetParameterIndex,
        bootstrap: Object.freeze({ ...invocation.bootstrap }),
      }));
    });
  }
  const bootstrapById = new Map<string, CsharpSourceModuleConstruction>();
  for (const entry of entries) {
    const existing = bootstrapById.get(entry.bootstrap.id);
    if (existing === undefined) {
      bootstrapById.set(entry.bootstrap.id, entry);
    } else if (!bootstrapEquals(existing.bootstrap, entry.bootstrap)) {
      issues.push(issue(
        "CSHARP_SOURCE_MODULE_BOOTSTRAP_CONFLICT",
        entry.expression,
        `Source-module constructions share provider bootstrap identity '${entry.bootstrap.id}' but carry contradictory target contracts.`,
      ));
    }
  }
  return Object.freeze({
    index: createIndex(entries),
    issues: Object.freeze(issues),
  });

  function visit(node: Node, selected: (node: Node) => void): void {
    selected(node);
    input.source.ast.forEachChild(node, (child) => {
      if (child !== undefined) visit(child, selected);
    });
  }
}

function createIndex(
  values: readonly CsharpSourceModuleConstruction[],
): CsharpSourceModuleConstructionIndex {
  const entries = Object.freeze([...values]);
  const byExpression = new WeakMap<Node, CsharpSourceModuleConstruction>();
  const bySourceFile = new Map<SourceFile, CsharpSourceModuleConstruction[]>();
  const targetSourceFiles = new Set<SourceFile>();
  const bootstrapById = new Map<string, CsharpSourceModuleConstruction["bootstrap"]>();
  for (const entry of entries) {
    byExpression.set(entry.expression, entry);
    const sourceEntries = bySourceFile.get(entry.sourceFile) ?? [];
    sourceEntries.push(entry);
    bySourceFile.set(entry.sourceFile, sourceEntries);
    targetSourceFiles.add(entry.targetSourceFile);
    if (!bootstrapById.has(entry.bootstrap.id)) {
      bootstrapById.set(entry.bootstrap.id, entry.bootstrap);
    }
  }
  const frozenBySourceFile = new Map(
    [...bySourceFile].map(([sourceFile, sourceEntries]) =>
      [sourceFile, Object.freeze(sourceEntries)] as const),
  );
  const targets = Object.freeze([...targetSourceFiles]);
  return Object.freeze({
    construction: (node: Node) => byExpression.get(node),
    entries: () => entries,
    from: (sourceFile: SourceFile) =>
      frozenBySourceFile.get(sourceFile) ?? emptyEntries,
    targets: () => targets,
    bootstraps: () => Object.freeze([...bootstrapById.values()]),
  });
}

function bootstrapEquals(
  left: CsharpSourceModuleConstruction["bootstrap"],
  right: CsharpSourceModuleConstruction["bootstrap"],
): boolean {
  return left.id === right.id && left.methodName === right.methodName &&
    targetTypeRefEquals(left.declaringType, right.declaringType);
}

const emptyEntries: readonly CsharpSourceModuleConstruction[] = Object.freeze(
  [],
);

function issue(
  code: string,
  node: Node,
  message: string,
): CsharpSourceModuleAnalysisIssue {
  return Object.freeze({ code, node, message });
}
