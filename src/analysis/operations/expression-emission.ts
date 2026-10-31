import type { Node } from "@tsonic/tsts";
import type { TargetUseSiteRef } from "@tsonic/target-api/analysis";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native/native-demand.js";
import type { CsharpNativeExpressionRecord, CsharpNativeDiscardEmission } from "../../target-model/records/native/native-demand.js";
import type { CsharpSourceReferenceRecords } from "../../target-model/records/program/source-references.js";
import type { CsharpPropertyAdmissionRecords } from "../../target-model/records/objects/property-admission.js";
import type { CsharpTypeEmissionRecords } from "../../target-model/records/types/type-emission.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { sourceTransparentExpressionOperand } from "@tsonic/target-api/source";
import type { CsharpConversionClassifications } from "../../target-model/records/operations/conversions.js";
import { KindEqualsToken, type TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpClassFactoryIndex } from "../../target-model/records/objects/class-factories.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import { createCsharpExpressionEmissionRecords } from "../program/records/operations/expression-emission.js";
import { directCsharpSourceYieldExpression } from "../../target-model/syntax/yield-expression.js";

export function analyzeCsharpExpressionEmission(input: { readonly source: TargetSourceProgram; readonly nodes: readonly Node[];
  readonly demand: CsharpNativeDemandAnalysis; readonly conversions: CsharpConversionClassifications;
  readonly evidence: CsharpSourceEvidenceIndex; readonly factories: CsharpClassFactoryIndex; readonly operations: CsharpTargetOperationClassifications;
  readonly references: Pick<CsharpSourceReferenceRecords, "identifierEmission">;
  readonly properties: Pick<CsharpPropertyAdmissionRecords, "selectedProperty" | "sourceMemberEmission">;
  readonly types: CsharpTypeEmissionRecords }) {
  const { source, nodes, demand, conversions } = input;
  const expressions = new Map<Node, CsharpNativeExpressionRecord>();
  const discards = new Map<TargetUseSiteRef, CsharpNativeDiscardEmission>();
  const issues: TargetDiagnostic[] = [];
  for (const { site, use } of demand.entries) discards.set(site, use.kind === "erased" ? { kind: "sequence", steps: Object.freeze([]) }
    : use.kind === "location" ? { kind: "sequence", steps: Object.freeze([...use.children]) } : { kind: "effect", expression: use.expression });
  const { owned: statementYields, resumedOperands } = statementOwnedYields(source.ast, nodes);
  for (const node of new Set([...nodes, ...demand.entries.map(({ use }) => use.expression)])) {
    if (statementYields.has(node)) continue;
    const selected = demand.nativeUse.expression(node);
    if (selected === undefined) continue;
    const use = selected.use;
    if (use.kind === "erased") { expressions.set(node, { ...selected, discardEvaluation: "omit", physical: undefined, conversion: undefined, bottom: undefined, storage: undefined }); continue; }
    const construction = use.kind === "converted" && use.children.length === 1 && use.children[0]!.subject === node && use.children[0]!.role === "constructed-result"
      ? demand.nativeUse.get(use.children[0]!) ?? failTargetAnalysisInvariant("tsonic-csharp", "An admitted converted expression requires its physical construction use.", node) : use;
    if (construction.kind === "erased") failTargetAnalysisInvariant("tsonic-csharp", "An admitted native construction cannot have an erased physical use.", node);
    let bottom: CsharpNativeExpressionRecord["bottom"];
    if (construction.completion.kind === "never" && construction.evaluation.kind === "sequence") {
      const steps = construction.evaluation.steps;
      const index = steps.findIndex(step => {
        const child = demand.nativeUse.get(step.site)
          ?? failTargetAnalysisInvariant("tsonic-csharp", "An admitted native evaluation sequence requires its exact child use.", node);
        return step.guard === undefined && child.kind !== "erased" && child.completion.kind === "never";
      });
      if (index >= 0) bottom = Object.freeze({ effects: Object.freeze(steps.slice(0, index).map(step => step.site)),
        expression: demand.nativeUse.get(steps[index]!.site)!.expression });
    }
    const conversionRequired = use.kind === "converted" && use.completion.kind !== "void" && construction.completion.kind !== "never";
    const conversion = use.kind === "converted" && conversionRequired ? conversions.expressionConversion.get(node, use.carrier, use.target, use.mode)?.selection : undefined;
    if (conversionRequired && conversion === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted converted expression requires its exact native conversion selection.", node);
    if (conversion?.kind === "rejected") {
      issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message: conversion.reason }); continue;
    }
    const ast = source.ast;
    const core = bottom === undefined && construction.literal === undefined && construction.binary === undefined && construction.discardedPresence === undefined &&
      !forwarded.has(ast.kindName(node));
    let storage: Node | undefined;
    if (core) {
      const handler = input.operations.nativeHandler.get(node);
      if (!sourceKinds.has(ast.kindName(node)) && !resumedOperands.has(node) && handler === undefined &&
        input.evidence.sourceDefaultValue.get(node) === undefined) {
        issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message: "Expression is outside the current C# planning surface." }); continue;
      }
      if (ast.is.IsClassExpression(node) && input.factories.classFactory.get(node) === undefined) {
        issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message: "A class expression requires its sealed native factory." }); continue;
      }
      if (ast.is.IsClassExpression(node) || input.evidence.sourceDefaultValue.get(node) !== undefined) storage = node;
      else {
        const argument = input.evidence.sourceArgument.get(node)
          ?? failTargetAnalysisInvariant("tsonic-csharp", "An admitted source expression requires its checked argument-passing evidence.", node);
        if (argument.kind === "rejected") {
          issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message: argument.reason }); continue;
        }
        storage = argument.argument.storageExpression;
      }
    }
    const integerTruncation = conversion?.kind === "integer-truncation" && use.kind === "converted"
      ? Object.freeze({ target: use.target, signed: conversion.signed }) : undefined;
    if (integerTruncation !== undefined) {
      const target = input.operations.selectedCall.get(node)?.target;
      if (target?.kind !== "resolved" || target.source.sourceArguments.length !== 2)
        failTargetAnalysisInvariant("tsonic-csharp", "An admitted native integer truncation requires its exact two-argument target call.", node);
    }
    expressions.set(node, { ...selected, discardEvaluation: discardEvaluation(node), physical: construction, conversion, bottom, storage, integerTruncation });
  }
  function discardEvaluation(expression: Node): "evaluate" | "omit" {
    const seen = new Set<Node>();
    let current = expression;
    for (;;) {
      if (seen.has(current)) return "evaluate";
      seen.add(current);
      const native = demand.nativeUse.expression(current)?.use;
      if (native === undefined || native.kind === "erased") return "evaluate";
      if (native.completion.kind === "never") return "evaluate";
      if (native.kind === "converted" && native.input.kind === "value") {
        const selected = conversions.expressionConversion.get(current, native.input.type, native.target, native.mode)?.selection;
        if (selected === undefined || !effectFreeConversion(selected)) return "evaluate";
      }
      const transparent = sourceTransparentExpressionOperand(source.ast, current);
      if (transparent !== undefined) { current = transparent; continue; }
      const effects = source.navigation.expressionEffects(current);
      if (!effects.invokes && !effects.mutates && !effects.suspends && !effects.mayThrow) {
        const reference = input.references.identifierEmission.get(current);
        const kind = source.ast.kindName(current);
        if (reference?.kind === "absence" || reference?.kind === "local" && !reference.backing ||
          native.literal !== undefined || kind === "KindThisKeyword" || kind === "KindNullKeyword" ||
          kind === "KindTrueKeyword" || kind === "KindFalseKeyword" || kind === "KindStringLiteral" ||
          kind === "KindNumericLiteral" || kind === "KindBigIntLiteral" || kind === "KindNoSubstitutionTemplateLiteral" ||
          source.ast.is.IsArrowFunction(current) || source.ast.is.IsFunctionExpression(current)) return "omit";
      }
      const property = input.properties.selectedProperty.get(current);
      const selection = property?.selection;
      let receiver: Node | undefined;
      if (selection?.kind === "resolved" && selection.targetMember.kind === "field" && selection.targetMember.readonly === true &&
        selection.receiver.kind === "instance") receiver = selection.source.receiver.expression;
      if (selection?.kind === "source-owned") {
        const member = property?.sourceOwned?.shapeMember;
        const emission = input.properties.sourceMemberEmission.get(current);
        const declaration = selection.source.selectedDeclaration;
        if (member?.kind === "resolved" && member.member.memberKind === "property" && member.member.readonly === true &&
          member.member.accessor === undefined && emission?.kind === "member" && !emission.methodValue && !emission.static &&
          declaration !== undefined && source.ast.is.IsPropertyDeclaration(declaration) && source.navigation.isProjectDeclaration(declaration))
          receiver = selection.source.receiver.expression;
      }
      if (receiver === undefined) return "evaluate";
      if (source.ast.kindName(receiver) === "KindThisKeyword") return "omit";
      const receiverUse = demand.nativeUse.expression(receiver)?.use;
      const receiverType = receiverUse === undefined || receiverUse.kind === "erased" || receiverUse.completion.kind !== "value"
        ? undefined : input.types.typeEmission.get(receiverUse.completion.type);
      if (receiverType?.valueType !== true || receiverType.nullable) return "evaluate";
      current = receiver;
    }
  }

  function effectFreeConversion(selection: CsharpConversionSelection): boolean {
    const pending = [selection];
    const seen = new Set<CsharpConversionSelection>();
    for (const selected of pending) {
      if (seen.has(selected)) return false;
      seen.add(selected);
      if (selected.kind === "identity" || selected.kind === "nullable-reference") continue;
      if (selected.kind !== "implicit" || selected.proof === "provider-operator") return false;
      if (selected.proof === "runtime-union-arm") pending.push(selected.sourceToArm);
    }
    return true;
  }

  const complete = new Set<Node>();
  for (const node of expressions.keys()) {
    const path = new Set<Node>();
    let current = node;
    while (!complete.has(current)) {
      if (path.has(current)) failTargetAnalysisInvariant("tsonic-csharp", "Source expression storage forwarding must be acyclic.", current);
      path.add(current);
      const storage = expressions.get(current)?.storage;
      if (storage === undefined || storage === current) break;
      current = storage;
    }
    for (const visited of path) complete.add(visited);
  }
  return Object.freeze({ records: createCsharpExpressionEmissionRecords(expressions, discards), issues: Object.freeze(issues) });
}

// The statement planners own a direct yield of an expression statement, a return statement, an identifier assignment's
// right side or a variable initializer: they plan its operand and its resume value through the yield record, never the
// yield as an expression. Those yields have no expression emission and are not refused as expression forms.
/** Statement-lowered yields. A plain assignment or statement owns its yield outright (no record); the yield of a compound
 * assignment is lowered by its statement too, but the operator reads the resumed value, so it keeps a record. */
function statementOwnedYields(ast: TargetSourceProgram["ast"], nodes: readonly Node[]):
  { readonly owned: ReadonlySet<Node>; readonly resumedOperands: ReadonlySet<Node> } {
  const owned = new Set<Node>();
  const resumedOperands = new Set<Node>();
  const direct = (expression: Node | undefined): void => {
    const selected = directCsharpSourceYieldExpression(ast, expression);
    if (selected !== undefined) owned.add(selected);
  };
  for (const node of nodes) {
    if (ast.is.IsExpressionStatement(node)) {
      const expression = ast.as.AsExpressionStatement(node)?.Expression;
      direct(expression);
      const binary = expression !== undefined && ast.is.IsBinaryExpression(expression) ? ast.as.AsBinaryExpression(expression) : undefined;
      if (binary?.Left !== undefined && ast.is.IsIdentifier(binary.Left)) {
        if (ast.operatorKindName(expression!) === KindEqualsToken) direct(binary.Right);
        else {
          const resumed = directCsharpSourceYieldExpression(ast, binary.Right);
          if (resumed !== undefined) resumedOperands.add(resumed);
        }
      }
    } else if (ast.is.IsReturnStatement(node)) direct(ast.as.AsReturnStatement(node)?.Expression);
    else if (ast.is.IsVariableDeclaration(node)) direct(ast.as.AsVariableDeclaration(node)?.Initializer);
  }
  return { owned, resumedOperands };
}

const forwarded = new Set(["KindVoidExpression", "KindAsExpression", "KindTypeAssertionExpression", "KindNonNullExpression",
  "KindParenthesizedExpression", "KindSatisfiesExpression", "KindConditionalExpression", "KindArrayLiteralExpression", "KindObjectLiteralExpression"]);

const sourceKinds = new Set(["KindClassExpression", "KindIdentifier", "KindRegularExpressionLiteral", "KindTypeOfExpression", "KindDeleteExpression",
  "KindTemplateExpression", "KindPropertyAccessExpression", "KindElementAccessExpression", "KindArrowFunction", "KindFunctionExpression",
  "KindCallExpression", "KindNewExpression", "KindPrefixUnaryExpression", "KindPostfixUnaryExpression", "KindBinaryExpression",
  "KindStringLiteral", "KindNoSubstitutionTemplateLiteral", "KindNumericLiteral", "KindBigIntLiteral", "KindTrueKeyword", "KindFalseKeyword",
  "KindNullKeyword", "KindThisKeyword", "KindSuperKeyword", "KindAwaitExpression"]);
