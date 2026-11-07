import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgramFacts, SourceDeclarationTarget } from "@tsonic/target-api/source";
import { AsPropertyAccessExpression, sourceTypeDescriptorStructure } from "@tsonic/target-api/source";
import { sourceValueType } from "../program/source-facts.js";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpIdentifierEmission } from "../../target-model/records/program/source-references.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpClassFactoryIndex } from "../../target-model/records/objects/class-factories.js";
import type { CsharpCaptureStorage } from "../../target-model/records/callables/capture-storage.js";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native/native-demand.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpSourceFileRecords } from "../../target-model/records/program/source-files.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage/storage.js";
import type { CsharpConversionClassifications } from "../../target-model/records/operations/conversions.js";
import type { CsharpJsCallRecords } from "../../target-model/records/calls/js-value-calls.js";
import { getCsharpDelegateSignature } from "../../target-model/types/carriers/delegates.js";
import { selectCsharpTypeEmission } from "../../policy/types/resolution/type-emission.js";
import { createCsharpSourceReferenceRecords } from "../program/records/program/source-references.js";
import { selectCsharpEmittedExpressions } from "./emitted-expressions.js";

export function analyzeCsharpSourceReferences(input: { readonly source: TargetSourceProgramFacts; readonly nodes: readonly Node[];
  readonly admitted: (node: Node) => boolean; readonly evidence: CsharpSourceEvidenceIndex;
  readonly factories: CsharpClassFactoryIndex; readonly captures: CsharpCaptureStorage;
  readonly demand: CsharpNativeDemandAnalysis; readonly operations: CsharpTargetOperationClassifications;
  readonly receivers: import("../../target-model/records/objects/member-receivers.js").CsharpMemberReceiverRecords["memberReceiver"];
  readonly files: CsharpSourceFileRecords; readonly backing: CsharpStorageClassifications["nativeBacking"];
  readonly delegateAdapters: CsharpConversionClassifications["delegateAdapters"]; readonly jsCalls: CsharpJsCallRecords }) {
  const ast = input.source.syntax;
  const { navigation } = input.source.facts;
  const identifiers = new Map<Node, CsharpIdentifierEmission>();
  const modules = new Map<Node, SourceDeclarationTarget>();
  const references = new Map<Node, { readonly value: SourceDeclarationTarget | undefined; readonly declaration: SourceDeclarationTarget | undefined }>();
  // A value reference names a project declaration; a declaration reference names any declaration (identity.target).
  const projectTarget = (node: Node | undefined): SourceDeclarationTarget | undefined => {
    const target = node === undefined ? undefined : navigation.identity.target(node);
    return target?.project === true ? target : undefined;
  };
  const issues: TargetDiagnostic[] = [];
  const moduleStatic = (node: Node): boolean => (ast.is.IsFunctionDeclaration(node) || ast.is.IsExportAssignment(node) ||
    ast.is.IsVariableDeclaration(node) || ast.is.IsBindingElement(node)) && navigation.scopes.isModuleScoped(node);
  for (const node of input.nodes) {
    const value = projectTarget(node);
    const declarationReference = navigation.identity.target(node);
    references.set(node, { value, declaration: declarationReference });
    const sourceFile = ast.getSourceFile(node);
    if (sourceFile === undefined) failTargetAnalysisInvariant("tsonic-csharp", "Checked source reference requires its original source module.", node);
    const name = AsPropertyAccessExpression(ast, node)?.name;
    const memberReference = value ?? projectTarget(name);
    const external = (reference: SourceDeclarationTarget | undefined): boolean => reference !== undefined && reference.sourceFile !== sourceFile &&
      (reference.sourceFile.IsDeclarationFile || input.files.providerSourceFile.get(reference.sourceFile) === true);
    if (memberReference !== undefined && !external(memberReference) && moduleStatic(memberReference.declaration)) modules.set(node, memberReference);
  }
  const required = selectCsharpEmittedExpressions({ ...input, ast, modules: { get: node => modules.get(node) } });
  for (const node of input.nodes) {
    if (!required.has(node) || !ast.is.IsIdentifier(node)) continue;
    const reference = references.get(node);
    if (reference === undefined) failTargetAnalysisInvariant("tsonic-csharp", "Identifier admission requires its collected checked source reference.", node);
    const { value, declaration: declarationReference } = reference;
    const sourceFile = ast.getSourceFile(node);
    if (sourceFile === undefined) failTargetAnalysisInvariant("tsonic-csharp", "Identifier admission requires its original source module.", node);
    const memberReference = value;
    const external = (selected: SourceDeclarationTarget | undefined): boolean => selected !== undefined && selected.sourceFile !== sourceFile &&
      (selected.sourceFile.IsDeclarationFile || input.files.providerSourceFile.get(selected.sourceFile) === true);
    const parent = ast.parent(node);
    if (parent !== undefined && ast.is.IsNewExpression(parent) && ast.as.AsNewExpression(parent)?.Expression === node &&
      input.operations.selectedConstruction.get(parent)?.target?.kind === "resolved") continue;
    if (parent !== undefined && ast.is.IsPropertyAccessExpression(parent) && ast.as.AsPropertyAccessExpression(parent)?.Expression === node) {
      const property = input.operations.selectedProperty.get(parent)?.selection;
      if (property?.kind === "resolved" && property.receiver.kind === "none") continue;
      const owner = ast.parent(parent);
      const call = owner !== undefined && ast.is.IsCallExpression(owner) && ast.as.AsCallExpression(owner)?.Expression === parent
        ? input.operations.selectedCall.get(owner)?.target : undefined;
      if (call?.kind === "resolved" && call.call.receiver.kind === "none") continue;
    }
    const refuse = (code: `CSHARP_${string}`, message: string): void => { issues.push({ code, category: "error", source: "tsonic-csharp", sourceNode: node, message }); };
    const declaration = declarationReference?.declaration;
    if (declaration !== undefined && input.captures.captureClosure.get(declaration) !== undefined) {
      identifiers.set(node, { kind: "frame", declaration }); continue;
    }
    if (declaration !== undefined && navigation.identity.isProjectDeclaration(declaration) &&
      (input.factories.classFactory.get(declaration) !== undefined || ast.is.IsClassDeclaration(declaration))) {
      const use = input.demand.nativeUse.expression(node)?.use;
      const signature = use === undefined || use.kind === "erased" ? undefined : getCsharpDelegateSignature(use.carrier);
      if (signature !== undefined && (!selectCsharpTypeEmission({ carrier: signature.returnType }) ||
        signature.parameters.some(carrier => !selectCsharpTypeEmission({ carrier })))) {
        refuse("CSHARP_CONSTRUCTOR_VALUE_NOT_REPRESENTABLE", "The selected constructor value has no closed native factory signature."); continue;
      }
      identifiers.set(node, { kind: "class", declaration, factory: input.factories.classFactory.get(declaration) !== undefined, constructor: signature }); continue;
    }
    const sourceType = sourceTypeDescriptorStructure(sourceValueType(input.source.facts, node));
    if (value === undefined && sourceType?.kind === "intrinsic" && sourceType.intrinsic === "absence") {
      identifiers.set(node, { kind: "absence" }); continue;
    }
    const provider = input.operations.providerValue.get(node);
    if (provider === undefined) failTargetAnalysisInvariant("tsonic-csharp", "C# planning received a provider value without a sealed operation classification.", node);
    if (provider.kind !== "not-provider") {
      if (provider.kind !== "resolved") { refuse("CSHARP_PROVIDER_VALUE_NOT_MAPPED", provider.reason); continue; }
      const member = provider.relation.targetMember;
      if (!member.static || member.kind !== "property" && member.kind !== "field" || member.declaringType === undefined) {
        refuse("CSHARP_PROVIDER_VALUE_NOT_STATIC_MEMBER", `Selected provider value relation '${member.id}' is not a static C# property or field.`); continue;
      }
      if (!selectCsharpTypeEmission({ carrier: member.declaringType })) { refuse("CSHARP_PROVIDER_DECLARING_TYPE_NOT_RENDERABLE", `Selected provider value relation '${member.id}' has no renderable C# declaring type.`); continue; }
      identifiers.set(node, { kind: "provider", owner: member.declaringType, name: member.targetName }); continue;
    }
    const sourceName = ast.text(node);
    if (external(declarationReference)) { refuse("CSHARP_DECLARATION_VALUE_NOT_BOUND", `Declaration/provider identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`); continue; }
    const providerDeclaration = value?.declaration ?? declarationReference?.declaration;
    const providerFile = providerDeclaration === undefined ? undefined : ast.getSourceFile(providerDeclaration);
    if (providerDeclaration !== undefined && (input.evidence.providerVirtualDeclaration.get(providerDeclaration) ||
      providerFile !== undefined && input.files.providerSourceFile.get(providerFile) === true)) {
      refuse("CSHARP_DECLARATION_VALUE_NOT_BOUND", `Provider-owned identifier '${sourceName}' requires a selected target operation or type-position usage before C# emission.`); continue;
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
        refuse("CSHARP_CROSS_MODULE_REFERENCE_NOT_STATIC", "Project source reference requires a top-level function or variable declaration resolved by TSTS."); continue;
      }
    }
    identifiers.set(node, { kind: "local", declaration, backing: declaration !== undefined && input.backing.get(declaration) !== undefined });
  }
  // A retained delegate adapter calls its stable binding by the binding declaration's own name, so that name is a
  // reference to the binding: the same frame or local emission an ordinary read of the binding selects.
  for (const node of input.nodes) if (ast.is.IsBlock(node)) for (const identity of input.delegateAdapters.get(node)) {
    const name = ast.name(identity.declaration);
    if (name === undefined || !ast.is.IsIdentifier(name) || identifiers.has(name)) continue;
    identifiers.set(name, input.captures.captureClosure.get(identity.declaration) !== undefined
      ? { kind: "frame", declaration: identity.declaration }
      : { kind: "local", declaration: identity.declaration, backing: input.backing.get(identity.declaration) !== undefined });
  }
  return Object.freeze({ records: createCsharpSourceReferenceRecords({ identifiers, modules, references }), issues: Object.freeze(issues) });
}
