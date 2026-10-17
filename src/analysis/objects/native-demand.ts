import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import { ObjectLiteralProperty_SourceName, sourceCallableUsesLexicalThis } from "@tsonic/target-api/source";
import type { SourcePropertyNameIndex } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant, rejectedTargetStage, resolvedTargetStage } from "@tsonic/target-api/artifacts";
import type { TargetDiagnostic, TargetStageResult } from "@tsonic/target-api/artifacts";
import type { TargetUseSiteRef } from "@tsonic/target-api/analysis";
import { targetUseSiteIdentity } from "@tsonic/target-api/analysis";
import type { CsharpNativeDemandAnalysis } from "../operations/native-demand-model.js";
import type { CsharpCallableContractIndex } from "../callables/model.js";
import type { CsharpCaptureFrame, CsharpCaptureStorage } from "../../target-model/records/capture-storage.js";
import type { CsharpValueReadClassifications, CsharpConversionClassifications } from "../../target-model/records/conversions.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import type { CsharpBindingPatternClassifications } from "../../target-model/records/value-projections.js";
import type { CsharpNativeValueCarriers } from "../../target-model/records/native-value-carriers.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpNativeParticipationInput, CsharpNativeUse } from "../../target-model/records/native-demand.js";
import type { CsharpTargetCallSelection } from "../../target-model/records/member-selections.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeCapability, CsharpRuntimeUnionTargetTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import { csharpObjectShapeMethodDeclaration } from "../../target-model/types/method-values.js";
import { getCsharpDelegateSignature } from "../../target-model/types/carriers/delegates.js";
import { csharpPropertySourceMemberKey, csharpWellKnownSymbolSourceMemberKey } from "../../target-model/types/source-member-keys.js";
import { resolveCsharpObjectShapeMemberBySourceKey } from "../../target-model/types/object-shape-members.js";
import { csharpTargetTypeComponents } from "../../target-model/types/components.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import { isCsharpEmptyObjectTargetType, isCsharpJsValueObjectShapeTargetType, isCsharpValueTypeTargetType } from "../../target-model/types/index.js";
import { objectShapeArtifactKey, objectShapeMaterialization } from "../../target-model/records/object-shape-demand.js";
import type { CsharpObjectShapeDemand } from "../../target-model/records/object-shape-demand.js";
import { csharpTargetTypeRenderingRejection, csharpTargetTypeRendersAsUnqualifiedIdentifier } from "../../policy/types/model/renderability.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";
import { createCsharpObjectShapeDemandEngine } from "./native-demand-requests.js";
import type { CsharpArtifactRequestResult, CsharpObjectShapeDemandHost } from "./native-demand-batches.js";

export interface CsharpNativeArtifactDemandInput extends CsharpObjectShapeDemandHost, CsharpNativeParticipationInput {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly propertyNames: Pick<SourcePropertyNameIndex, "get">;
  readonly nativeDemand: CsharpNativeDemandAnalysis;
  readonly valueReads: CsharpValueReadClassifications;
  readonly operations: CsharpTargetOperationClassifications;
  readonly storage: CsharpStorageClassifications;
  readonly callables: CsharpCallableContractIndex;
  readonly captureStorage: CsharpCaptureStorage;
  readonly declarations: CsharpDeclarationClassifications;
  readonly bindingPatterns: CsharpBindingPatternClassifications;
  readonly conversions: CsharpConversionClassifications;
  readonly nativeValueCarriers: CsharpNativeValueCarriers;
  readonly sourceEvidence: Pick<CsharpSourceEvidenceIndex, "compileTimeMetadata">;
}

export function analyzeCsharpNativeArtifactDemand(
  input: CsharpNativeArtifactDemandInput,
  required: CsharpRequiredRecord[],
): TargetStageResult<CsharpObjectShapeDemand> {
  const engine = createCsharpObjectShapeDemandEngine(input);
  const issues: TargetDiagnostic[] = [];
  const types = new Set<string>();
  const constructs = new Set<Node>();
  const uses = new Map<object, Set<string>>();
  const frames = new Set<CsharpCaptureFrame>();
  const requiredShapes = new Map<string, Node>();
  for (const sourceFile of input.sourceFiles) visitConstruct(sourceFile);
  if (issues.length > 0) return rejectedTargetStage(issues);
  const result = engine.seal();
  for (const [key, subject] of requiredShapes) requireCsharpRecord(required, {
    family: "objectShapeArtifact", key, subject, construct: "native object-shape artifact",
    producer: "analyzeCsharpNativeArtifactDemand",
  });
  return resolvedTargetStage(result);

  function refuse(node: Node, message: string): void {
    issues.push(Object.freeze({ source: "tsonic-csharp", category: "error", code: "CSHARP_UNSUPPORTED_AST", sourceNode: node, message }));
  }

  function accept(node: Node, result: CsharpArtifactRequestResult): boolean {
    if (result.kind === "accepted") return true;
    refuse(node, result.reason);
    return false;
  }

  function demandShape(shape: CsharpObjectShapeFact, subject: Node): void {
    if (isCsharpJsValueObjectShapeTargetType(shape.targetType)) return;
    if (csharpTargetTypeRenderingRejection(shape.targetType) !== undefined) {
      refuse(subject, "Object-shape fact must carry a renderable named target carrier type before C# emission.");
      return;
    }
    const materialization = objectShapeMaterialization(shape);
    if (materialization === "synthetic" && !isCsharpEmptyObjectTargetType(shape.targetType) &&
      !csharpTargetTypeRendersAsUnqualifiedIdentifier(shape.targetType)) {
      refuse(subject, "Generated object-shape declarations require one exact unqualified compiler-owned target type name.");
      return;
    }
    if (!accept(subject, engine.registerObjectShape(shape, materialization))) return;
    if (!isCsharpEmptyObjectTargetType(shape.targetType)) requiredShapes.set(objectShapeArtifactKey(shape), subject);
    for (const component of csharpTargetTypeComponents(shape.targetType, shape)) demandType(component, subject);
  }

  function demandType(type: TargetTypeRef | undefined, subject: Node): void {
    if (type === undefined) return;
    const key = targetTypeRefKey(type);
    if (types.has(key)) return;
    types.add(key);
    const shape = input.objectShapes.resolveTarget(type);
    if (shape !== undefined) demandShape(shape, subject);
    for (const component of csharpTargetTypeComponents(type)) demandType(component, subject);
    if (type.kind === "target-named") {
      for (const unionShape of (type as Partial<CsharpRuntimeUnionTargetTypeRef>).csharpRuntimeUnionObjectShapes ?? []) {
        if (unionShape !== undefined) demandShape(unionShape, subject);
      }
    }
  }

  function capability(subject: Node, type: TargetTypeRef, name: CsharpObjectShapeCapability,
    rootKind: "value" | "object-shape" = "object-shape", sourceValue: Node | undefined = undefined): void {
    const file = input.ast.getSourceFile(subject);
    if (file === undefined) failTargetAnalysisInvariant("tsonic-csharp", "Native artifact demand requires its checked source file.", subject);
    accept(subject, engine.requireObjectShapeCapability(sourceValue, type, file, name, rootKind));
  }

  function demandFrame(frame: CsharpCaptureFrame | undefined, subject: Node): void {
    if (frame === undefined || frames.has(frame)) return;
    frames.add(frame);
    demandShape(frame.shape, subject);
    for (const parent of frame.parents) demandFrame(parent.frame, subject);
    for (const binding of frame.bindings) demandType(binding.type, subject);
    for (const receiver of frame.receivers) demandType(receiver.type, subject);
    for (const method of frame.methods) demandType(method.type, subject);
  }

  function demandConversion(node: Node, source: TargetTypeRef, target: TargetTypeRef,
    selection: CsharpConversionSelection | undefined): void {
    if (selection === undefined) return;
    if (selection.kind === "js-value-box") {
      const shape = input.objectShapes.resolveTarget(source);
      if (shape !== undefined && !isCsharpValueTypeTargetType(shape.targetType) && !isCsharpEmptyObjectTargetType(shape.targetType)) {
        capability(node, shape.targetType, "reference-identity", "object-shape", node);
      }
    } else if (selection.kind === "nullable-map") {
      demandConversion(node, selection.sourceElement, selection.targetElement, selection.conversion);
    } else if (selection.kind === "implicit" && selection.proof === "runtime-union-arm") {
      demandType(selection.armType, node);
      demandConversion(node, source, selection.armType, selection.sourceToArm);
    } else if (selection.kind === "delegate-adapter") {
      const sourceSignature = getCsharpDelegateSignature(source);
      const targetSignature = getCsharpDelegateSignature(target);
      if (sourceSignature !== undefined && targetSignature !== undefined) {
        for (const [index, conversion] of selection.parameterConversions.entries()) {
          const from = targetSignature.parameters[index];
          const to = sourceSignature.parameters[index];
          if (from !== undefined && to !== undefined) demandConversion(node, from, to, conversion);
        }
        if (selection.returnConversion.kind !== "void-return") demandConversion(node,
          sourceSignature.returnType, targetSignature.returnType, selection.returnConversion);
      }
    }
  }

  function visitConstruct(node: Node): void {
    if (constructs.has(node) || input.participation.get(node) === "erased" ||
      input.sourceEvidence.compileTimeMetadata.get(node) || input.operations.nativeUnreachable.get(node)) return;
    const order = input.nativeDemand.nativeUse.order(node);
    if (order === undefined) return;
    constructs.add(node);
    const { ast } = input;
    if (ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node) || ast.is.IsInterfaceDeclaration(node)) {
      const shape = input.objectShapes.resolveNode(node, ast.getSourceFile(node));
      if (shape !== undefined) {
        demandShape(shape, node);
        if (ast.is.IsInterfaceDeclaration(node) && shape.members.some(member => member.memberKind === "method" && member.optional === true)) {
          capability(node, shape.targetType, "method-values");
        }
      }
    }
    const callable = input.callables.get({ kind: "declaration", declaration: node });
    if (callable !== undefined) {
      demandType(callable.returnType, node);
      for (const parameter of callable.parameters) demandType(parameter.targetParameter.type, parameter.sourceParameter);
    }
    const returned = input.declarations.returnContract.get(node);
    if (returned?.kind === "resolved") demandType(returned.type, node);
    demandType(input.storage.storageType.get(node), node);
    const defaulted = input.declarations.runtimeDefault.get(node);
    if (defaulted !== undefined) { demandType(defaulted.native.source, node); demandType(defaulted.native.target, node); }
    const nativeValue = input.nativeValueCarriers.nativeValueDeclaration.get(node);
    if (nativeValue !== undefined) for (const field of nativeValue.fields) {
      demandType(field.carrier, node);
      if (field.bound !== undefined) demandShape(field.bound.owner, node);
    }
    demandFrame(input.captureStorage.captureFrame.get(node), node);
    demandFrame(input.captureStorage.captureClosure.get(node)?.frame, node);
    demandBinding(node);
    const iteration = input.operations.iteration.get(node);
    if (iteration?.kind === "resolved" && iteration.lowering.kind === "object-shape-keys") {
      demandShape(iteration.lowering.objectShape, node);
      capability(node, iteration.lowering.objectShape.targetType, "enumerable-keys");
    }
    for (const step of order) {
      if (step.kind === "construct") visitConstruct(step.construct);
      else visitUse(step.site);
    }
  }

  function demandBinding(node: Node): void {
    const binding = input.bindingPatterns.bindingPatternProjection.get(node);
    if (binding?.source?.kind === "object-shape-source") demandShape(binding.source.shape, node);
    if (binding?.source?.kind === "array-source") demandType(binding.source.sourceCarrier, node);
    if (binding?.element?.kind === "object-shape-rest") {
      demandShape(binding.element.restShape, node);
      const parent = input.ast.parent(node);
      const source = parent === undefined ? undefined : input.bindingPatterns.bindingPatternProjection.get(parent)?.source;
      if (source?.kind === "object-shape-source" && binding.element.members.some(member => member.source.memberKind === "method")) {
        capability(node, source.shape.targetType, "method-values");
      }
    }
    if (binding?.defaultValue !== undefined) {
      demandType(binding.defaultValue.source, node); demandType(binding.defaultValue.target, node);
    }
  }

  function visitUse(site: TargetUseSiteRef): void {
    const identity = targetUseSiteIdentity(site);
    const seen = uses.get(site.subject) ?? new Set<string>();
    if (seen.has(identity)) return;
    seen.add(identity);
    uses.set(site.subject, seen);
    const use = input.nativeDemand.nativeUse.get(site);
    if (use === undefined) failTargetAnalysisInvariant("tsonic-csharp", "Artifact demand requires the exact admitted native use.");
    if (use.kind === "erased") return;
    demandType(use.carrier, use.expression);
    if (use.completion.kind === "value") demandType(use.completion.type, use.expression);
    if (use.objectShape !== undefined) demandShape(use.objectShape, use.expression);
    if (use.defaultValue !== undefined) { demandType(use.defaultValue.source, use.expression); demandType(use.defaultValue.target, use.expression); }
    if (use.kind === "converted" && use.input.kind === "value") {
      demandType(use.input.type, use.expression); demandType(use.target, use.expression);
      demandConversion(use.expression, use.input.type, use.target,
        input.conversions.expressionConversion.get(use.expression, use.input.type, use.target, use.mode));
    }
    demandUseArtifacts(use);
    visitConstruct(use.expression);
    for (const child of use.children) visitUse(child);
  }

  function demandUseArtifacts(use: Exclude<CsharpNativeUse, { readonly kind: "erased" }>): void {
    const node = use.expression;
    const file = input.ast.getSourceFile(node);
    if (file === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted native use requires its source file.", node);
    const property = input.operations.selectedProperty.get(node);
    const owned = property?.sourceOwned;
    if (property?.selection.kind === "source-owned" && owned?.objectShape !== undefined && owned.shapeMember?.kind === "resolved" &&
      owned.shapeMember.member.memberKind === "method" && (!property.selection.source.callCallee || owned.shapeMember.member.optional === true)) {
      capability(node, owned.objectShape.targetType, "method-values");
    }
    if (input.ast.is.IsObjectLiteralExpression(node) && use.objectShape !== undefined) demandLiteral(node, use.objectShape, file);
    const call = input.operations.selectedCall.get(node)?.target;
    if (call !== undefined) demandCall(node, call, file);
    const construction = input.operations.selectedConstruction.get(node)?.target;
    if (construction !== undefined) demandCall(node, construction, file);
    const binding = input.bindingPatterns.bindingPatternProjection.get(node);
    if (binding?.assignmentPattern !== undefined) visitAssignment(binding.assignmentPattern);
  }

  function visitAssignment(pattern: NonNullable<ReturnType<CsharpBindingPatternClassifications["bindingPatternProjection"]["get"]>>["assignmentPattern"]): void {
    if (pattern === undefined) return;
    demandBinding(pattern.sourceNode);
    for (const element of pattern.elements) {
      if (element === undefined) continue;
      demandBinding(element.sourceNode);
      if (element.target.kind === "pattern") visitAssignment(element.target.pattern);
    }
  }

  function demandLiteral(node: Node, shape: CsharpObjectShapeFact, file: SourceFile): void {
    for (const property of input.ast.children(node)) {
      if (property === undefined) continue;
      if (input.ast.is.IsSpreadAssignment(property)) {
        const expression = input.ast.as.AsSpreadAssignment(property)?.Expression;
        const source = input.objectShapes.resolveNode(expression, file);
        if (source === undefined) continue;
        const shared = source.methodImplementation !== undefined && source.methodImplementation.identity === shape.methodImplementation?.identity &&
          targetTypeRefEquals(source.targetType, shape.targetType);
        if (source.members.some(member => member.methodValueContract !== undefined &&
          !(shared && csharpObjectShapeMethodDeclaration(source, member) !== undefined))) capability(property, source.targetType, "method-values");
        continue;
      }
      if (!input.ast.is.IsMethodDeclaration(property) || !sourceCallableUsesLexicalThis(input.ast, property)) continue;
      const name = input.ast.name(property);
      const selectedName = name === undefined ? undefined : input.propertyNames.get(name);
      const ordinary = ObjectLiteralProperty_SourceName(input.ast, property);
      const key = selectedName?.kind === "resolved" ? csharpPropertySourceMemberKey(selectedName.name)
        : selectedName?.kind === "well-known-symbol" ? csharpWellKnownSymbolSourceMemberKey(selectedName.symbol)
          : ordinary.kind === "resolved" ? csharpPropertySourceMemberKey(ordinary.name) : undefined;
      const member = key === undefined ? undefined : resolveCsharpObjectShapeMemberBySourceKey(shape, key, "checked-object-literal-property");
      if (member?.kind === "resolved") {
        if (member.member.memberKind !== "method") {
          refuse(property, `Object literal callable property '${member.member.sourceName}' cannot bind lexical 'this' without an exact receiver-bearing method contract.`);
        } else accept(property, engine.requireObjectShapeMethodReceiver(shape, member.member));
      }
    }
  }

  function demandCall(node: Node, selection: CsharpTargetCallSelection, file: SourceFile): void {
    if (selection.kind !== "resolved") return;
    const member = selection.call.targetMember;
    const source = selection.source;
    let projectionCount = 0;
    for (const requirement of member.csharpArtifactRequirements ?? []) {
      const subject = requirement.source.kind === "receiver" ? source.sourceReceiver?.expression : source.sourceArguments[requirement.source.index]?.expression;
      const name = requirement.kind === "object-shape-capability" ? requirement.capability : requirement.projection;
      if (subject === undefined) { refuse(node, `Selected target call '${member.id}' requires exact '${name}' source-value evidence.`); continue; }
      const type = input.valueReads.valueRead.get(subject)?.value;
      if (type === undefined) { refuse(node, `Selected target call '${member.id}' requires exact '${name}' source-value type evidence.`); continue; }
      if (requirement.kind === "object-shape-capability") {
        capability(subject, type, requirement.capability, requirement.rootKind, subject);
        continue;
      }
      if (member.returnType === undefined) { refuse(subject, `Selected target call '${member.id}' has no result type for its exact '${requirement.projection}' object projection.`); continue; }
      const assignmentSubject = requirement.projection === "assign" ? source.sourceArguments[requirement.assignmentSource.index]?.expression : undefined;
      const assignmentType = assignmentSubject === undefined ? undefined : input.valueReads.valueRead.get(assignmentSubject)?.value;
      if (requirement.projection === "assign" && (assignmentSubject === undefined || assignmentType === undefined)) {
        refuse(subject, `Selected target call '${member.id}' requires exact assignment-source value and type evidence.`); continue;
      }
      const projection = engine.requireObjectShapeProjection(subject, requirement.projection === "assign" ? member.returnType : type,
        file, requirement.projection, member.returnType, requirement.rootKind,
        assignmentSubject === undefined || assignmentType === undefined ? undefined : { node: assignmentSubject, type: assignmentType });
      if (!accept(subject, projection)) continue;
      projectionCount += 1;
      if (projection.kind === "accepted" && (projection.projection === undefined || projectionCount > 1)) {
        refuse(subject, `Selected target call '${member.id}' does not have one exact object-shape projection artifact.`);
      }
    }
  }
}
