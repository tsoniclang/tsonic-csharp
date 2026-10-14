import type { Node, SourceFile } from "@tsonic/tsts";
import {
  AsExpressionStatement,
  sourceClassFieldIsTypeOnly,
  sourceObjectMemberDeclarations,
  sourceFileIdentity,
  sourceParameterIsProperty,
} from "@tsonic/target-api/source";
import type { CsharpAttributeApplicationIndex } from "../../target-model/records/attributes.js";
import type { CsharpSafetyApplicationFactIndex } from "../../target-model/records/safety.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpLanguageDialect, CsharpMemorySafetyRules } from "../../target-model/configuration/model.js";
import { isCsharpUnplannedSubtree, isCsharpUnusedTupleDefault } from "../control-flow/binding-patterns.js";
import type { CsharpPlannedSubtreeInput } from "../control-flow/binding-patterns.js";
import type { CsharpBindingPatternClassifications } from "../../target-model/records/value-projections.js";

export interface CsharpSafetyAdmissionInput extends CsharpPlannedSubtreeInput {
  readonly sourceFiles: readonly SourceFile[];
  readonly languageDialect: CsharpLanguageDialect;
  readonly memorySafetyRules: CsharpMemorySafetyRules;
  readonly safety: Pick<CsharpSafetyApplicationFactIndex, "safetyApplication" | "safetyOperation" | "findings">;
  readonly erasedAttribute: CsharpAttributeApplicationIndex["erasedAttribute"];
  readonly bindingPatternProjection: CsharpBindingPatternClassifications["bindingPatternProjection"];
  readonly evidence: Pick<CsharpSourceEvidenceIndex, "compileTimeMetadata" | "sourceField">;
  readonly operations: Pick<CsharpTargetOperationClassifications, "nativeUnreachable" | "classPropertyStorage">;
}

export interface CsharpSafetyAdmissionIssue {
  readonly code: string;
  readonly message: string;
}

export function admitCsharpSafetyApplications(input: CsharpSafetyAdmissionInput): readonly CsharpSafetyAdmissionIssue[] {
  const { ast } = input;
  const issues: CsharpSafetyAdmissionIssue[] = [];
  const contractsEmitted = input.languageDialect === "csharp15-preview" && input.memorySafetyRules === "preview";
  const sourceFiles = [...input.sourceFiles].sort((left, right) =>
    (sourceFileIdentity(ast, left) ?? "").localeCompare(sourceFileIdentity(ast, right) ?? ""));
  for (const sourceFile of sourceFiles) {
    visit(sourceFile);
    admitApplications(sourceFile);
  }
  return Object.freeze(issues);

  function admitApplications(sourceFile: SourceFile): void {
    const findings = input.safety.findings.get(sourceFile);
    for (let index = 0; index < findings.conflicts.length; index += 1) {
      issue("CSHARP_SAFETY_CONTRACT_CONFLICT", "One exact C# declaration received conflicting finalized safe and requires-unsafe contracts.");
    }
    for (const { application, status } of findings.applications) {
      if (status === "target-not-resolved") {
        issue("CSHARP_SAFETY_APPLICATION_TARGET_NOT_RESOLVED", "The finalized safety application has no exact emitted C# declaration target.");
      } else if (status === "candidate") {
        admitContract(application.contract);
      }
    }
  }

  function admitContract(contract: string): void {
    if (input.languageDialect !== "csharp15-preview") {
      issue("CSHARP_SAFETY_CONTRACT_DIALECT_UNSUPPORTED", "C# declaration caller-safety contracts require target option languageDialect='csharp15-preview'.");
    } else if (contract === "safe") {
      issue("CSHARP_SAFE_DECLARATION_TARGET_UNSUPPORTED",
        "C# 'safe' is only legal on target declarations that require an explicit safe-or-unsafe choice; current Tsonic source declarations do not represent such a boundary.");
    } else if (input.memorySafetyRules !== "preview") {
      issue("CSHARP_SAFETY_CONTRACT_RULES_UNSUPPORTED",
        "C# declaration caller-safety contracts require target option memorySafetyRules='preview'; selecting preview syntax alone does not opt the assembly into updated memory-safety rules.");
    }
  }

  function visit(node: Node): void {
    if (isCsharpUnplannedSubtree(input, node) || isCsharpUnusedTupleDefault(ast, input.bindingPatternProjection, node) ||
      isErasedStatement(node)) return;
    const operation = input.safety.safetyOperation.get(node);
    if (operation?.kind === "safety-builder") {
      issue("CSHARP_SAFETY_MARKER_RUNTIME_POSITION_UNSUPPORTED", "C# declaration safety markers must be complete standalone expression statements.");
      return;
    }
    if (operation?.kind === "unsafe-context") {
      if (operation.fact.kind !== "expression") {
        issue("CSHARP_UNSAFE_CONTEXT_BLOCK_POSITION_INVALID", "The no-argument unsafe-context marker must be handled as the first direct statement of a source block.");
      } else if (input.languageDialect !== "csharp15-preview") {
        issue("CSHARP_UNSAFE_EXPRESSION_DIALECT_UNSUPPORTED", "C# unsafe expressions require target option languageDialect='csharp15-preview'.");
      } else {
        visit(operation.fact.expression);
      }
      return;
    }
    if (contractsEmitted) admitDeclarationAccessors(node);
    ast.forEachChild(node, (child) => { if (child !== undefined) visit(child); });
  }

  function isErasedStatement(node: Node): boolean {
    const expression = AsExpressionStatement(ast, node)?.Expression;
    if (expression === undefined) return false;
    if (input.erasedAttribute.get(expression)) return true;
    const operation = input.safety.safetyOperation.get(expression);
    return operation?.kind === "safety-builder" ||
      (operation?.kind === "unsafe-context" && operation.fact.kind === "remaining-block");
  }

  function admitDeclarationAccessors(node: Node): void {
    if (ast.is.IsInterfaceDeclaration(node)) {
      const owner = ast.parent(node);
      if (owner === undefined || !ast.is.IsSourceFile(owner)) return;
      for (const member of ast.members(node)) {
        if (member === undefined || (!ast.is.IsPropertySignatureDeclaration(member) && !ast.is.IsIndexSignatureDeclaration(member))) continue;
        admitAccessors(member, ast.hasModifierKind(member, "readonly") ? ["getter"] : ["getter", "setter"]);
      }
      return;
    }
    if (!ast.is.IsClassDeclaration(node) && !ast.is.IsClassExpression(node)) return;
    for (const member of sourceObjectMemberDeclarations(ast, node)) {
      if (member === undefined || sourceClassFieldIsTypeOnly(ast, member)) continue;
      const parameterProperty = sourceParameterIsProperty(ast, member);
      if (!parameterProperty && !ast.is.IsPropertyDeclaration(member)) continue;
      const declaration = parameterProperty ? ast.as.AsParameterDeclaration(member) : ast.as.AsPropertyDeclaration(member);
      if (declaration === undefined) continue;
      const sourceField = input.evidence.sourceField.get([member, declaration.name, declaration.Type,
        ...(parameterProperty ? [] : [ast.as.AsPropertyDeclaration(member)?.Initializer])]);
      if (sourceField !== undefined) {
        admitAccessors(member, []);
      } else if (!ast.hasModifierKind(member, "abstract") && input.operations.classPropertyStorage.get(member)?.kind === "field") {
        admitAccessors(member, []);
      }
    }
  }

  function admitAccessors(declaration: Node, available: readonly ("getter" | "setter")[]): void {
    for (const application of new Set(input.safety.safetyApplication.get(declaration))) {
      if (application.contract !== "requires-unsafe" ||
        (application.applicationPlacement !== "getter" && application.applicationPlacement !== "setter") ||
        available.includes(application.applicationPlacement)) continue;
      issue("CSHARP_SAFETY_ACCESSOR_TARGET_NOT_EMITTED",
        `The selected source ${application.applicationPlacement} has no corresponding emitted C# accessor for its explicit safety contract.`);
    }
  }

  function issue(code: string, message: string): void {
    issues.push(Object.freeze({ code, message }));
  }
}
