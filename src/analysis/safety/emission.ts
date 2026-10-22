import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { AsExpressionStatement } from "@tsonic/target-api/source";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSafetyApplicationFactIndex } from "../../target-model/records/safety.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpAdmittedIteration } from "../../target-model/records/selection.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import type { CsharpObjectShapeDemand } from "../../target-model/records/object-shape-demand.js";
import type { CsharpSourceUnionEmissionRecords } from "../../target-model/records/source-unions.js";
import type { CsharpUnsafeEmission, CsharpSafetyPlacement } from "../../target-model/records/safety-emission.js";
import type { CsharpTargetConfiguration } from "../../target-model/configuration/model.js";
import { selectCsharpTypeUnsafeContext } from "../../policy/operations/pointers/native-type-safety.js";
import { createCsharpSafetyEmissionRecords } from "../program/records/safety-emission.js";
import { sourceSafetyPositionIssue, createSourceExplicitUnsafeContextIndex } from "@tsonic/target-api/analysis";
import type { CsharpObjectShapeFact } from "../../target-model/types/model.js";

export function analyzeCsharpSafetyEmission(input: {
  readonly source: TargetSourceProgram;
  readonly configuration: CsharpTargetConfiguration;
  readonly safety: CsharpSafetyApplicationFactIndex;
  readonly evidence: CsharpSourceEvidenceIndex;
  readonly operations: CsharpTargetOperationClassifications<CsharpAdmittedIteration>;
  readonly storage: CsharpStorageClassifications;
  readonly shapes: CsharpObjectShapeDemand;
  readonly unions: CsharpSourceUnionEmissionRecords;
  readonly admitted: (node: Node) => boolean;
}) {
  const subjects = new Map<Node, CsharpUnsafeEmission>();
  const compilations = new Map<Node | "object-shapes" | "source-unions", boolean>();
  const declarations = new Map<Node, ReadonlyMap<CsharpSafetyPlacement, readonly "unsafe"[]>>();
  const shapes = new Map<CsharpObjectShapeFact, boolean>();
  const issues: TargetDiagnostic[] = [];
  const { ast } = input.source;
  const explicit = createSourceExplicitUnsafeContextIndex(ast, input.source.sourceFiles, node => input.safety.safetyOperation.get(node));
  const refuse = (code: string, message: string): void => {
    issues.push(Object.freeze({ code, category: "error", source: "tsonic-csharp", message }));
  };
  const preview = input.configuration.languageDialect === "csharp15-preview";
  const contractPreview = preview && input.configuration.memorySafetyRules === "preview";
  const conflicts = new Set<Node>();
  for (const application of input.safety.all) {
    if (application.targetDeclarations.length === 0) {
      refuse("CSHARP_SAFETY_APPLICATION_TARGET_NOT_RESOLVED", "The finalized safety application has no exact emitted C# declaration target.");
      continue;
    }
    for (const declaration of application.targetDeclarations) {
      if (conflicts.has(declaration)) continue;
      const related = input.safety.safetyApplication.get(declaration).filter(candidate => candidate.applicationPlacement === application.applicationPlacement);
      if (new Set(related.map(candidate => candidate.contract)).size > 1) {
        conflicts.add(declaration);
        refuse("CSHARP_SAFETY_CONTRACT_CONFLICT", "One exact C# declaration received conflicting finalized safe and requires-unsafe contracts.");
      }
      if (contractPreview && application.contract === "requires-unsafe" &&
        (application.applicationPlacement === "getter" || application.applicationPlacement === "setter")) {
        const field = input.evidence.sourceField.get([declaration]);
        const property = input.operations.classPropertyStorage.get(declaration);
        const signature = ast.kindName(declaration) === "KindPropertySignature" || ast.is.IsIndexSignatureDeclaration(declaration);
        const hasAccessors = field === undefined && property?.kind !== "field";
        const writable = signature ? !ast.hasModifierKind(declaration, "readonly") : property?.readonly !== true;
        if ((ast.is.IsPropertyDeclaration(declaration) || signature || ast.is.IsParameterDeclaration(declaration)) &&
          (!hasAccessors || application.applicationPlacement === "setter" && !writable))
          refuse("CSHARP_SAFETY_ACCESSOR_TARGET_NOT_EMITTED",
            `The selected source ${application.applicationPlacement} has no corresponding emitted C# accessor for its explicit safety contract.`);
      }
    }
    if (application.targetDeclarations.some(declaration => conflicts.has(declaration))) continue;
    if (!preview) refuse("CSHARP_SAFETY_CONTRACT_DIALECT_UNSUPPORTED", "C# declaration caller-safety contracts require target option languageDialect='csharp15-preview'.");
    else if (application.contract === "safe") refuse("CSHARP_SAFE_DECLARATION_TARGET_UNSUPPORTED",
      "C# 'safe' is only legal on target declarations that require an explicit safe-or-unsafe choice; current Tsonic source declarations do not represent such a boundary.");
    else if (!contractPreview) refuse("CSHARP_SAFETY_CONTRACT_RULES_UNSUPPORTED",
      "C# declaration caller-safety contracts require target option memorySafetyRules='preview'; selecting preview syntax alone does not opt the assembly into updated memory-safety rules.");
  }
  const runtimeStatement = (node: Node): boolean => !ast.is.IsFunctionDeclaration(node) && !ast.is.IsClassDeclaration(node) &&
    !ast.is.IsInterfaceDeclaration(node) && !ast.is.IsEnumDeclaration(node) && !ast.is.IsTypeAliasDeclaration(node) &&
    !ast.is.IsImportDeclaration(node) && !ast.is.IsExportDeclaration(node);
  const visit = (node: Node): CsharpUnsafeEmission => {
    const previous = subjects.get(node);
    if (previous !== undefined) return previous;
    const children: { readonly node: Node; readonly selection: CsharpUnsafeEmission }[] = [];
    ast.forEachChild(node, child => { if (child !== undefined) children.push({ node: child, selection: visit(child) }); });
    const carrier = input.storage.storageType.get(node) ?? input.evidence.nodeTargetType.get(node);
    let context = input.admitted(node) && carrier !== undefined && selectCsharpTypeUnsafeContext(carrier);
    let permission = children.some(child => child.selection.permission);
    permission ||= contractPreview && input.safety.safetyApplication.get(node).some(application => application.contract === "requires-unsafe");
    context ||= children.some(child => child.selection.context);
    const operation = input.operations.nativePointer.get(node);
    if (input.admitted(node) && operation?.kind === "raw-location" && operation.method === "Reinterpret" && !explicit.has(node))
      issues.push({ code: "CSHARP_NATIVE_POINTER_UNSAFE_CONTEXT_REQUIRED", category: "error", source: "tsonic-csharp", sourceNode: node,
        message: "Raw memory reinterpretation requires an explicit unsafecontext() source region." });
    if (input.admitted(node) && (operation?.kind === "load" || operation?.kind === "store" || operation?.kind === "offset") && !explicit.has(node))
      issues.push({ code: "CSHARP_NATIVE_POINTER_UNSAFE_CONTEXT_REQUIRED", category: "error", source: "tsonic-csharp", sourceNode: node,
        message: `C# native-pointer '${operation.kind}' requires an explicit unsafecontext()/unsafe() source region.` });
    // Layout queries fold to constants and raw pointer identity (RawPointer.Same/Hash) is a managed call; neither emits
    // pointer syntax, so neither needs a C# unsafe context.
    if (input.admitted(node) && operation !== undefined && operation.kind !== "not-native-pointer" && operation.kind !== "rejected" &&
      operation.kind !== "layout-query" && operation.kind !== "raw-identity") {
      context = true;
      if (operation.kind === "load" || operation.kind === "store") permission = true;
    }
    const selected = input.safety.safetyOperation.get(node);
    if (selected !== undefined && input.admitted(node)) {
      const issue = sourceSafetyPositionIssue(ast, node, selected, subject => input.safety.safetyOperation.get(subject));
      if (issue === "marker-runtime") refuse("CSHARP_SAFETY_MARKER_RUNTIME_POSITION_UNSUPPORTED",
        "C# declaration safety markers must be complete standalone expression statements.");
      if (issue === "block-position") refuse("CSHARP_UNSAFE_CONTEXT_BLOCK_POSITION_INVALID",
        "The no-argument unsafe-context marker must be handled as the first direct statement of a source block.");
    }
    if (selected?.kind === "unsafe-context") {
      permission = true;
      context = false;
      if (selected.fact.kind === "expression" && !preview) refuse("CSHARP_UNSAFE_EXPRESSION_DIALECT_UNSUPPORTED",
        "C# unsafe expressions require target option languageDialect='csharp15-preview'.");
    }
    if (ast.is.IsBlock(node)) {
      const first = ast.statements(node)[0];
      const expression = AsExpressionStatement(ast, first)?.Expression;
      const marker = expression === undefined ? undefined : input.safety.safetyOperation.get(expression);
      if (marker?.kind === "unsafe-context" && marker.fact.kind === "remaining-block") { context = false; permission = true; }
    }
    // An erased statement (a safety builder, an attribute application or a block marker) emits nothing, so nothing in
    // it can require an unsafe context or unsafe permission from its enclosing declaration or compilation.
    const erased = input.operations.erasedStatement.get(node) === true;
    const value = Object.freeze({ context: !erased && context, permission: !erased && (permission || !preview && context),
      moduleContext: ast.is.IsSourceFile(node) && children.some(child => runtimeStatement(child.node) && child.selection.context) });
    subjects.set(node, value);
    const placements = new Map<CsharpSafetyPlacement, readonly "unsafe"[]>();
    const typeDeclaration = ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node) || ast.is.IsInterfaceDeclaration(node);
    const headerContext = children.some(child => !ast.is.IsMethodDeclaration(child.node) && ast.kindName(child.node) !== "KindMethodSignature" &&
      !ast.is.IsPropertyDeclaration(child.node) && ast.kindName(child.node) !== "KindPropertySignature" &&
      !ast.is.IsGetAccessorDeclaration(child.node) && !ast.is.IsSetAccessorDeclaration(child.node) &&
      !ast.is.IsConstructorDeclaration(child.node) && child.selection.context);
    const constructorContext = children.some(child => (ast.is.IsConstructorDeclaration(child.node) ||
      ast.is.IsPropertyDeclaration(child.node) && !ast.hasModifierKind(child.node, "static")) && child.selection.context);
    for (const placement of ["declaration", "constructor", "getter", "setter"] as const) {
      const applications = input.safety.safetyApplication.get(node).filter(application => application.applicationPlacement === placement);
      const contracts = new Set(applications.map(application => application.contract));
      const explicit = contractPreview && contracts.size === 1 && contracts.has("requires-unsafe");
      const lexicalContext = ast.is.IsSourceFile(node) ? value.moduleContext
        : typeDeclaration ? placement === "constructor" ? constructorContext : headerContext : context;
      const lexical = !preview && lexicalContext && (placement === "declaration" || placement === "constructor");
      placements.set(placement, Object.freeze(explicit || lexical ? ["unsafe" as const] : []));
    }
    declarations.set(node, placements);
    return value;
  };
  for (const file of input.source.sourceFiles) compilations.set(file, visit(file).permission);
  for (const artifact of input.shapes.artifacts) shapes.set(artifact.fact, !preview && (
    artifact.fact.members.some(member => selectCsharpTypeUnsafeContext(member.methodStorageType ?? member.type)) ||
    (artifact.fact.implements ?? []).some(selectCsharpTypeUnsafeContext)));
  compilations.set("object-shapes", [...shapes.values()].some(required => required));
  compilations.set("source-unions", !preview && input.unions.sourceUnions.get().some(union => selectCsharpTypeUnsafeContext(union.storage)));
  return Object.freeze({ records: createCsharpSafetyEmissionRecords(subjects, compilations, declarations, shapes), issues: Object.freeze(issues) });
}
