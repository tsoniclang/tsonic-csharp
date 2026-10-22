import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram, SourceDeclarationReference, SourceProjectReference } from "@tsonic/target-api/source";
import { AsPropertyAccessExpression, sourceDeclarationIsModuleScoped } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpIdentifierEmission } from "../../target-model/records/source-references.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpClassFactoryIndex } from "../../target-model/records/class-factories.js";
import type { CsharpCaptureStorage } from "../../target-model/records/capture-storage.js";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native-demand.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpSourceFileRecords } from "../../target-model/records/source-files.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import { getCsharpDelegateSignature } from "../../target-model/types/carriers/delegates.js";
import { selectCsharpTypeEmission } from "../../policy/types/type-emission.js";
import { createCsharpSourceReferenceRecords } from "../program/records/source-references.js";

export function analyzeCsharpSourceReferences(input: { readonly source: TargetSourceProgram; readonly nodes: readonly Node[];
  readonly admitted: (node: Node) => boolean; readonly evidence: CsharpSourceEvidenceIndex;
  readonly factories: CsharpClassFactoryIndex; readonly captures: CsharpCaptureStorage;
  readonly demand: CsharpNativeDemandAnalysis; readonly operations: CsharpTargetOperationClassifications;
  readonly files: CsharpSourceFileRecords; readonly backing: CsharpStorageClassifications["nativeBacking"] }) {
  const { ast } = input.source;
  const identifiers = new Map<Node, CsharpIdentifierEmission>();
  const modules = new Map<Node, SourceProjectReference>();
  const references = new Map<Node, { readonly value: SourceProjectReference | undefined; readonly declaration: SourceDeclarationReference | undefined }>();
  const issues: TargetDiagnostic[] = [];
  const required = new Set<Node>();
  for (const node of input.nodes) if (input.admitted(node)) {
    required.add(node);
    const callee = input.operations.selectedCall.get(node)?.source?.sourceCallee.expression;
    if (callee !== undefined) required.add(callee);
  }
  const moduleStatic = (node: Node): boolean => (ast.is.IsFunctionDeclaration(node) || ast.is.IsExportAssignment(node) ||
    ast.is.IsVariableDeclaration(node) || ast.is.IsBindingElement(node)) && sourceDeclarationIsModuleScoped(node, ast);
  for (const node of input.nodes) {
    const value = input.source.navigation.referenceFor(node);
    const declarationReference = input.source.navigation.sourceReferenceFor(node);
    references.set(node, { value, declaration: declarationReference });
    const sourceFile = ast.getSourceFile(node);
    if (sourceFile === undefined) failTargetAnalysisInvariant("tsonic-csharp", "Checked source reference requires its original source module.", node);
    const name = AsPropertyAccessExpression(ast, node)?.name;
    const memberReference = value ?? (name === undefined ? undefined : input.source.navigation.referenceFor(name));
    const external = (reference: SourceProjectReference | SourceDeclarationReference | undefined): boolean => reference !== undefined && reference.sourceFile !== sourceFile &&
      (reference.sourceFile.IsDeclarationFile || input.files.providerSourceFile.get(reference.sourceFile) === true);
    if (memberReference !== undefined && !external(memberReference) && moduleStatic(memberReference.declaration)) modules.set(node, memberReference);
    if (!required.has(node) || !ast.is.IsIdentifier(node)) continue;
    const refuse = (message: string): void => { issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message }); };
    const declaration = declarationReference?.declaration;
    if (declaration !== undefined && input.captures.captureClosure.get(declaration) !== undefined) {
      identifiers.set(node, { kind: "frame", declaration }); continue;
    }
    if (declaration !== undefined && (input.factories.classFactory.get(declaration) !== undefined || ast.is.IsClassDeclaration(declaration))) {
      const use = input.demand.nativeUse.expression(node)?.use;
      const signature = use === undefined || use.kind === "erased" ? undefined : getCsharpDelegateSignature(use.carrier);
      if (signature !== undefined && (!selectCsharpTypeEmission({ carrier: signature.returnType }) ||
        signature.parameters.some(carrier => !selectCsharpTypeEmission({ carrier })))) {
        refuse("The selected constructor value has no closed native factory signature."); continue;
      }
      identifiers.set(node, { kind: "class", declaration, factory: input.factories.classFactory.get(declaration) !== undefined, constructor: signature }); continue;
    }
    const sourceType = input.evidence.expressionType.get(node);
    if (value === undefined && sourceType !== undefined && input.evidence.semanticType.get(sourceType, sourceFile)?.nullish === true) {
      identifiers.set(node, { kind: "absence" }); continue;
    }
    const provider = input.operations.providerValue.get(node);
    if (provider === undefined) { refuse("C# planning received a provider value without a sealed operation classification."); continue; }
    if (provider.kind !== "not-provider") {
      if (provider.kind !== "resolved") { refuse(provider.reason); continue; }
      const member = provider.relation.targetMember;
      if (!member.static || member.kind !== "property" && member.kind !== "field" || member.declaringType === undefined) {
        refuse(`Selected provider value relation '${member.id}' is not a static C# property or field.`); continue;
      }
      if (!selectCsharpTypeEmission({ carrier: member.declaringType })) { refuse(`Selected provider value relation '${member.id}' has no renderable C# declaring type.`); continue; }
      identifiers.set(node, { kind: "provider", owner: member.declaringType, name: member.targetName }); continue;
    }
    const sourceName = ast.text(node);
    if (external(declarationReference)) { refuse(`Declaration/provider identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`); continue; }
    const providerDeclaration = value?.declaration ?? input.source.navigation.declarationFor(node);
    const providerFile = providerDeclaration === undefined ? undefined : ast.getSourceFile(providerDeclaration);
    if (providerDeclaration !== undefined && (input.evidence.providerVirtualDeclaration.get(providerDeclaration) ||
      providerFile !== undefined && input.files.providerSourceFile.get(providerFile) === true)) {
      refuse(`Provider-owned identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`); continue;
    }
    const module = modules.get(node);
    if (module !== undefined) { identifiers.set(node, { kind: "module", reference: module }); continue; }
    if (memberReference !== undefined && !external(memberReference)) {
      const owner = memberReference.declaration;
      if (ast.is.IsClassDeclaration(owner) || ast.is.IsEnumDeclaration(owner)) { identifiers.set(node, { kind: "type", reference: memberReference }); continue; }
      const parent = ast.parent(owner);
      const nested = (ast.is.IsEnumMember(owner) || ast.is.IsGetAccessorDeclaration(owner) || ast.is.IsMethodDeclaration(owner) ||
        ast.is.IsPropertyDeclaration(owner) || ast.is.IsSetAccessorDeclaration(owner)) &&
        (ast.is.IsClassDeclaration(parent) || ast.is.IsEnumDeclaration(parent) || ast.is.IsInterfaceDeclaration(parent));
      if (!nested && memberReference.sourceFile !== sourceFile && !moduleStatic(owner)) {
        refuse("Project source reference requires a top-level function or variable declaration resolved by TSTS."); continue;
      }
    }
    identifiers.set(node, { kind: "local", declaration, backing: declaration !== undefined && input.backing.get(declaration) !== undefined });
  }
  return Object.freeze({ records: createCsharpSourceReferenceRecords({ identifiers, modules, references }), issues: Object.freeze(issues) });
}
