import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceResult, TargetSourceProgram } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpSafetyApplication, CsharpSafetyApplicationFactIndex, CsharpSafetyOperation } from "../../target-model/records/storage/safety.js";

export function createCsharpSafetyApplicationFactIndex(
  source: TargetSourceProgram,
): SourceResult<CsharpSafetyApplicationFactIndex> {
  const { ast } = source;
  const navigation = source.facts.navigation;
  const all: CsharpSafetyApplication[] = [];
  const bySourceFile = new Map<SourceFile, CsharpSafetyApplication[]>();
  const byDeclaration = new Map<Node, CsharpSafetyApplication[]>();
  const byExpression = new Map<Node, CsharpSafetyOperation>();
  const wrappers: Node[] = [];
  for (const node of navigation.nodesForFiles(source.sourceFiles)) {
    const publication = source.facts.protocols.safety(node);
    if (publication.kind === "refused") return publication;
    if (publication.value.kind === "present") {
      const operation = publication.value.value;
      byExpression.set(node, operation);
      if (operation.kind === "safety-builder" && operation.fact.kind === "application") {
        const fact = operation.fact;
        const sourceFile = ast.getSourceFile(node);
        if (sourceFile === undefined) failTargetAnalysisInvariant("tsonic-csharp",
          "A published safety application requires its original Source file.", node);
        const resolvedRootDeclaration = navigation.referenceFor(fact.applicationTarget)?.declaration ??
          navigation.declarationFor(fact.applicationTarget) ??
          (navigation.isProjectDeclaration(fact.applicationTarget) ? fact.applicationTarget : undefined);
        const selected = Object.freeze([...new Set([...fact.selectedDeclarations,
          ...(fact.selectedDeclaration.kind === "present" ? [fact.selectedDeclaration.value] : [])])]);
        const targets = declarations(fact.placement, selected, resolvedRootDeclaration);
        const application: CsharpSafetyApplication = Object.freeze({ ...fact, sourceSubject: node, sourceFile,
          resolvedRootDeclaration, targetDeclarations: targets });
        all.push(application);
        const applications = bySourceFile.get(sourceFile) ?? [];
        applications.push(application);
        bySourceFile.set(sourceFile, applications);
        for (const declaration of targets) {
          const applications = byDeclaration.get(declaration) ?? [];
          applications.push(application);
          byDeclaration.set(declaration, applications);
        }
      }
    }
    if (ast.is.IsParenthesizedExpression(node)) wrappers.push(node);
  }
  for (let index = wrappers.length - 1; index >= 0; index -= 1) {
    const wrapper = wrappers[index]!;
    if (byExpression.has(wrapper)) continue;
    const operand = ast.as.AsParenthesizedExpression(wrapper)?.Expression;
    const operation = operand === undefined ? undefined : byExpression.get(operand);
    if (operation !== undefined) byExpression.set(wrapper, operation);
  }
  for (const applications of bySourceFile.values()) Object.freeze(applications);
  for (const applications of byDeclaration.values()) Object.freeze(applications);
  const empty: readonly CsharpSafetyApplication[] = Object.freeze([]);
  return Object.freeze({ kind: "resolved", value: Object.freeze({ all: Object.freeze(all),
    sourceSafetyApplication: Object.freeze({ get: (sourceFile: SourceFile) => bySourceFile.get(sourceFile) ?? empty }),
    safetyApplication: Object.freeze({ get: (declaration: Node) => byDeclaration.get(declaration) ?? empty }),
    safetyOperation: Object.freeze({ get: (node: Node) => byExpression.get(node) }),
  }) });

  function declarations(placement: CsharpSafetyApplication["placement"], selected: readonly Node[],
    root: Node | undefined): readonly Node[] {
    const bothAccessors = (node: Node): boolean => ast.is.IsIndexSignatureDeclaration(node) ||
      ast.is.IsPropertyDeclaration(node) || ast.is.IsPropertySignatureDeclaration(node);
    if (placement === "getter") return Object.freeze(selected.filter(node => ast.is.IsGetAccessorDeclaration(node) || bothAccessors(node)));
    if (placement === "setter") return Object.freeze(selected.filter(node => ast.is.IsSetAccessorDeclaration(node) || bothAccessors(node)));
    if (placement === "constructor") return root === undefined || !ast.is.IsClassDeclaration(root) && !ast.is.IsClassExpression(root)
      ? Object.freeze([]) : Object.freeze([root, ...ast.members(root).filter((member): member is Node =>
        member !== undefined && ast.is.IsConstructorDeclaration(member))]);
    return Object.freeze([...new Set([...selected, ...(root === undefined ? [] : [root])])]);
  }
}
