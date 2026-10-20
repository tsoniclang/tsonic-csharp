import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import { asSourceNode, ObjectLiteralProperty_SourceName, sourceCallableUsesLexicalThis } from "@tsonic/target-api/source";
import type { SourcePropertyNameIndex } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant, rejectedTargetStage, resolvedTargetStage } from "@tsonic/target-api/artifacts";
import type { TargetDiagnostic, TargetStageResult } from "@tsonic/target-api/artifacts";
import type { TargetUseSiteRef } from "@tsonic/target-api/analysis";
import { targetUseSiteIdentity } from "@tsonic/target-api/analysis";
import type { CsharpNativeDemandAnalysis } from "../operations/native-demand-model.js";
import type { CsharpCallableContractIndex } from "../../target-model/records/callable-values.js";
import type { CsharpCaptureFrame, CsharpCaptureStorage } from "../../target-model/records/capture-storage.js";
import type { CsharpValueReadClassifications, CsharpConversionClassifications } from "../../target-model/records/conversions.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpAdmittedIteration } from "../../target-model/records/selection.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import type { CsharpBindingPatternClassifications } from "../../target-model/records/value-projections.js";
import type { CsharpNativeValueCarriers } from "../../target-model/records/native-value-carriers.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import type { CsharpFlowReadClassifications } from "../../target-model/records/source-evidence.js";
import type { CsharpNativeDiscardedPresence, CsharpNativeParticipationInput, CsharpNativeUse } from "../../target-model/records/native-demand.js";
import type { CsharpCallableParameterAdapter, CsharpCallableValueAdapter, CsharpProjectCallableAdapters } from "../../target-model/records/callable-adapters.js";
import type { CsharpFinalStructuralInterfaceImplementation } from "../../target-model/records/heritage.js";
import type { CsharpDefaultValueContract } from "../../target-model/records/value-projections.js";
import type { CsharpTargetCallSelection } from "../../target-model/records/member-selections.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeCapability, CsharpRuntimeUnionTargetTypeRef, TargetTypeRef } from "../../target-model/types/model.js";
import { csharpObjectShapeMethodDeclaration } from "../../target-model/types/method-values.js";
import { getCsharpDelegateSignature } from "../../target-model/types/carriers/delegates.js";
import { csharpPropertySourceMemberKey, csharpWellKnownSymbolSourceMemberKey } from "../../target-model/types/source-member-keys.js";
import { resolveCsharpObjectShapeMemberBySourceKey } from "../../target-model/types/object-shape-members.js";
import { csharpTargetTypeComponents } from "../../target-model/types/components.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import {
  csharpObjectShapeAssignmentMembers, csharpObjectShapeProjectionMembers, csharpTsValueTargetType,
  getCsharpArrayLiteralElementTargetType, getCsharpCollectionElementTargetType, getCsharpGeneratorProtocol,
  getCsharpJsArrayElementTargetType, getCsharpNullableElementTargetType,
  isCsharpEmptyObjectTargetType, isCsharpJsValueObjectShapeTargetType, isCsharpJsValueTargetType, isCsharpValueTypeTargetType,
} from "../../target-model/types/index.js";
import { csharpUnionLeaves } from "../../target-model/types/union-relations.js";
import { objectShapeArtifactKey } from "../program/records/object-shape-keys.js";
import { objectShapeMaterialization } from "../../policy/objects/object-shape-materialization.js";
import { csharpTargetTypeRenderingRejection, csharpTargetTypeRendersAsUnqualifiedIdentifier } from "../../policy/types/model/renderability.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/required-records.js";
import { createCsharpObjectShapeDemandEngine } from "./native-demand-requests.js";
import type { CsharpArtifactRequestResult, CsharpObjectShapeDemandHost } from "./native-demand-batches.js";
import type { CsharpObjectShapeDemandClosure } from "../../target-model/records/object-shape-demand.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";

export interface CsharpNativeArtifactDemandInput extends CsharpObjectShapeDemandHost, CsharpNativeParticipationInput {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly propertyNames: Pick<SourcePropertyNameIndex, "get">;
  readonly nativeDemand: CsharpNativeDemandAnalysis;
  readonly valueReads: CsharpValueReadClassifications;
  readonly operations: CsharpTargetOperationClassifications<CsharpAdmittedIteration>;
  readonly storage: CsharpStorageClassifications;
  readonly callables: CsharpCallableContractIndex;
  readonly captureStorage: CsharpCaptureStorage;
  readonly callableAdapters: CsharpProjectCallableAdapters;
  readonly flowReads: CsharpFlowReadClassifications;
  readonly objectShapes: CsharpObjectShapeClassifications<CsharpFinalStructuralInterfaceImplementation> &
    Pick<CsharpObjectShapeDemandHost["objectShapes"], "targetShapes">;
  readonly declarations: CsharpDeclarationClassifications;
  readonly bindingPatterns: CsharpBindingPatternClassifications;
  readonly conversions: CsharpConversionClassifications;
  readonly nativeValueCarriers: CsharpNativeValueCarriers;
  readonly sourceEvidence: Pick<CsharpSourceEvidenceIndex, "compileTimeMetadata" | "generatorTargetType" | "yield" | "yieldTargetType">;
}

export function analyzeCsharpNativeArtifactDemand(
  input: CsharpNativeArtifactDemandInput,
  required: CsharpRequiredRecord[],
): TargetStageResult<CsharpObjectShapeDemandClosure> {
  const engine = createCsharpObjectShapeDemandEngine(input);
  const issues: TargetDiagnostic[] = [];
  const types = new Set<string>();
  const constructs = new Set<Node>();
  const uses = new Map<object, Set<string>>();
  const frames = new Set<CsharpCaptureFrame>();
  const requiredShapes = new Map<string, Node>();
  const forwarding = new Set<string>();
  for (const sourceFile of input.sourceFiles) visitConstruct(sourceFile);
  for (const binding of input.nativeDemand.requiredBindingRoots) {
    if (input.ast.is.IsVariableDeclaration(binding)) demandType(input.storage.storageType.get(binding), binding);
  }
  if (issues.length > 0) return rejectedTargetStage(issues);
  const result = engine.close();
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
    const key = targetTypeRefKey(shape.targetType);
    if (!forwarding.has(key)) {
      forwarding.add(key);
      for (const implementation of input.objectShapes.structuralImplementations(shape.targetType)) {
        demandType(implementation.interfaceType, implementation.sourceNode);
        for (const property of implementation.properties) demandAdapter(implementation.sourceNode, property.read);
        for (const method of implementation.methods) {
          demandParameters(method.declaration, method.forwarding.parameters);
          demandAdapter(method.declaration, method.forwarding.result);
        }
      }
    }
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
      demandBox(node, source);
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
    } else if (selection.kind === "provider-argument-adapter") {
      demandConversion(node, source, selection.adapter.inputType, selection.sourceToInput);
      demandConversion(node, selection.adapter.resultType, target, selection.resultToTarget);
    }
  }

  function demandBox(node: Node, source: TargetTypeRef): void {
    if (isCsharpJsValueTargetType(source)) return;
    const shape = input.objectShapes.resolveTarget(source);
    if (shape !== undefined && !isCsharpValueTypeTargetType(shape.targetType) &&
      !isCsharpEmptyObjectTargetType(shape.targetType) && !isCsharpJsValueObjectShapeTargetType(shape.targetType)) {
      demandShape(shape, node);
      capability(node, shape.targetType, "reference-identity");
    }
  }

  function demandAdapter(node: Node, adapter: CsharpCallableValueAdapter): void {
    demandType(adapter.source, node);
    demandType(adapter.target, node);
    demandConversion(node, adapter.source, adapter.target, adapter.conversion);
  }

  function demandParameters(node: Node, parameters: readonly CsharpCallableParameterAdapter[]): void {
    for (const parameter of parameters) {
      if (parameter.kind === "rest") {
        demandType(parameter.target, node);
        for (const segment of parameter.segments) demandAdapter(node, segment.adapter);
      } else if (parameter.kind !== "omitted") demandAdapter(node, parameter.adapter);
    }
  }

  function demandPair(node: Node, source: TargetTypeRef, target: TargetTypeRef, mode: "implicit" | "explicit" = "implicit"): void {
    if (targetTypeRefEquals(source, target)) return;
    demandConversion(node, source, target, input.conversions.conversion.get(source, target, mode));
  }

  function demandDefault(node: Node, contract: CsharpDefaultValueContract): void {
    if (contract.normalize) demandPair(node, contract.source, contract.storage);
    if (contract.kind === "value") demandPair(node, contract.storage, contract.target);
    else if (contract.kind !== "absence") demandPair(node, contract.present, contract.target);
  }

  function demandUseBox(site: TargetUseSiteRef): void {
    const use = input.nativeDemand.nativeUse.get(site);
    if (use === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A selected boxing edge requires its admitted operand.", asSourceNode(site.subject, input.ast));
    if (use.kind !== "erased" && use.completion.kind === "value") demandBox(use.expression, use.completion.type);
  }

  function demandDiscarded(recipe: CsharpNativeDiscardedPresence): void {
    switch (recipe.kind) {
      case "short-circuit":
        if (recipe.guard.kind === "js-value") demandUseBox(recipe.left);
        demandDiscarded(recipe.leftPresence);
        demandDiscarded(recipe.right);
        return;
      case "conditional": demandUseBox(recipe.condition); demandDiscarded(recipe.whenTrue); demandDiscarded(recipe.whenFalse); return;
      case "coalescing": demandDiscarded(recipe.left); demandDiscarded(recipe.right); return;
      case "sequence": demandDiscarded(recipe.result); return;
      case "constant": case "value": case "never": return;
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
      }
    }
    const callable = input.callables.get({ kind: "declaration", declaration: node });
    if (callable !== undefined) {
      demandType(callable.returnType, node);
      for (const parameter of callable.parameters) demandType(parameter.targetParameter.type, parameter.sourceParameter);
    }
    const returned = input.declarations.returnContract.get(node);
    if (returned?.kind === "resolved") demandType(returned.type, node);
    const defaulted = input.declarations.runtimeDefault.get(node);
    if (defaulted !== undefined) {
      demandType(defaulted.native.source, node); demandType(defaulted.native.target, node);
      demandDefault(node, defaulted.native);
    }
    const nativeParameter = input.storage.lambdaParameterType.get(node);
    const storedParameter = input.storage.requiredStorageType.get(node);
    demandType(storedParameter, node);
    if (nativeParameter !== undefined && storedParameter !== undefined && defaulted === undefined) demandPair(node, nativeParameter, storedParameter);
    const dispatch = input.callableAdapters.callableDispatch.get(node);
    for (const adapter of dispatch?.kind === "method" ? dispatch.adapters : []) {
      demandParameters(node, adapter.parameters);
      demandAdapter(node, adapter.result);
    }
    const nativeValue = input.nativeValueCarriers.nativeValueDeclaration.get(node);
    if (nativeValue !== undefined) for (const field of nativeValue.fields) {
      demandType(field.carrier, node);
      if (field.bound !== undefined) demandShape(field.bound.owner, node);
    }
    demandFrame(input.captureStorage.captureFrame.get(node), node);
    demandFrame(input.captureStorage.captureClosure.get(node)?.frame, node);
    demandBinding(node);
    const iteration = input.operations.iteration.get(node);
    if (iteration !== undefined) {
      demandType(iteration.binding.storageType, node);
      demandConversion(iteration.binding.node, iteration.elementType, iteration.binding.storageType,
        iteration.binding.conversion);
      if (iteration.lowering.kind === "object-shape-keys") {
        demandShape(iteration.lowering.objectShape, node);
        capability(node, iteration.lowering.objectShape.targetType, "enumerable-keys");
      }
    }
    for (const step of order) {
      if (step.kind === "construct") visitConstruct(step.construct);
      else visitUse(step.site);
    }
  }

  function demandBinding(node: Node): void {
    const binding = input.bindingPatterns.bindingPatternProjection.get(node);
    if (binding?.binding !== undefined) demandConversion(node, binding.binding.source,
      binding.binding.target, binding.binding.conversion);
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
      demandDefault(node, binding.defaultValue);
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
    if (use.discardedPresence !== undefined) demandDiscarded(use.discardedPresence);
    demandUseArtifacts(use);
    visitConstruct(use.expression);
    for (const child of use.children) visitUse(child);
  }

  function demandUseArtifacts(use: Exclude<CsharpNativeUse, { readonly kind: "erased" }>): void {
    const node = use.expression;
    const file = input.ast.getSourceFile(node);
    if (file === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted native use requires its source file.", node);
    const flow = use.kind === "location" ? undefined : input.flowReads.flowReadProjection.get(node);
    if (flow?.kind === "conversion") demandConversion(node, flow.source, flow.target, flow.selection);
    if (input.operations.jsCondition.get(node)?.kind === "resolved" && use.completion.kind === "value") demandBox(node, use.completion.type);
    const binary = input.operations.binaryOperation.get(node);
    if (use.discardedPresence === undefined && input.operations.operatorForm.get(node) === "js-value-operation" && binary?.jsValue.kind === "resolved") {
      const evaluation = use.evaluation;
      if (evaluation.kind === "short-circuit") { demandUseBox(evaluation.left); demandUseBox(evaluation.right); }
      else if (evaluation.kind === "sequence") for (const step of evaluation.steps) demandUseBox(step.site);
    }
    const element = input.operations.selectedElement.get(node);
    for (const projection of [input.operations.selectedProperty.get(node)?.receiverProjection, element?.receiverProjection]) {
      if (projection !== undefined) demandConversion(node, projection.source, projection.target, projection.conversion);
    }
    if (element?.target?.kind === "project-indexer" && element.target.selectedReadType !== undefined) {
      demandConversion(node, element.target.valueType, element.target.selectedReadType, element.flowReadConversion);
    }
    if (element?.target?.kind === "resolved" && element.target.invocation.kind === "array-like") {
      const projection = element.target.invocation.projection;
      demandConversion(node, projection.source, projection.target, projection.conversion);
    }
    const selectedProperty = input.operations.selectedProperty.get(node)?.selection;
    if (selectedProperty?.kind === "resolved" && selectedProperty.invocation.kind === "array-like") {
      const projection = selectedProperty.invocation.projection;
      demandConversion(node, projection.source, projection.target, projection.conversion);
    }
    const property = input.operations.selectedProperty.get(node);
    const owned = property?.sourceOwned;
    if (property?.selection.kind === "source-owned" && owned?.objectShape !== undefined && owned.shapeMember?.kind === "resolved" &&
      owned.shapeMember.member.memberKind === "method" && (!property.selection.source.callCallee || owned.shapeMember.member.optional === true)) {
      capability(node, owned.objectShape.targetType, "method-values");
    }
    if (input.ast.is.IsObjectLiteralExpression(node) && use.objectShape !== undefined) demandLiteral(node, use.objectShape, file);
    const selectedCall = input.operations.selectedCall.get(node);
    const call = selectedCall?.target;
    if (call !== undefined) demandCall(node, call, file);
    if (selectedCall?.sourceResult !== undefined) demandPair(node, selectedCall.sourceResult.nativeType, selectedCall.sourceResult.selectedType, "explicit");
    const receiver = selectedCall?.optionalReceiver;
    if (receiver?.conversion !== undefined && receiver.parameterType !== undefined) demandConversion(receiver.expression,
      receiver.type, receiver.parameterType, receiver.conversion);
    const construction = input.operations.selectedConstruction.get(node)?.target;
    if (construction !== undefined) demandCall(node, construction, file);
    const binding = input.bindingPatterns.bindingPatternProjection.get(node);
    if (binding?.assignmentPattern !== undefined) visitAssignment(binding.assignmentPattern);
    if (input.ast.is.IsArrayLiteralExpression(node)) {
      const target = getCsharpArrayLiteralElementTargetType(use.carrier) ?? getCsharpCollectionElementTargetType(use.carrier);
      if (target !== undefined) for (const child of input.ast.children(node)) {
        if (child === undefined || !input.ast.is.IsSpreadElement(child)) continue;
        const operand = input.ast.as.AsSpreadElement(child)?.Expression;
        const selected = operand === undefined ? undefined : input.nativeDemand.nativeUse.expression(operand)?.use;
        if (selected !== undefined && selected.kind !== "erased" && selected.completion.kind === "value") {
          const source = selected.completion.type;
          for (const type of source.kind === "tuple" ? source.elements : [getCsharpCollectionElementTargetType(source)]) {
            if (type !== undefined) demandPair(child, type, target);
          }
        }
      }
    }
    const yielded = input.sourceEvidence.yield.get(node);
    if (yielded !== undefined && use.completion.kind === "value") {
      const protocol = getCsharpGeneratorProtocol(yielded.yieldKind === "delegate" ? input.sourceEvidence.yieldTargetType.get(node)
        : input.sourceEvidence.generatorTargetType.get(yielded.generator.declaration));
      if (protocol !== undefined) demandPair(node, yielded.yieldKind === "delegate" ? protocol.returnType : protocol.nextType, use.completion.type);
    }
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
    if (selection.call.origin === "provider") for (const mapping of selection.call.argumentMappings) {
      if (mapping.kind === "by-value") demandConversion(node, mapping.sourceType, mapping.targetType, mapping.conversion);
    }
    for (const sequence of selection.call.sequenceArguments ?? []) for (const element of sequence.elements) {
      demandConversion(sequence.expression, element.type, sequence.targetElementType, element.conversion);
    }
    for (const argument of selection.call.arguments) if (argument.targetParameter.csharpValueProjection === "properties") {
      const subject = selection.source.sourceArguments[argument.sourceArgumentIndex]?.expression;
      const use = subject === undefined ? undefined : input.nativeDemand.nativeUse.expression(subject)?.use;
      if (subject !== undefined && use !== undefined && use.kind !== "erased" && use.completion.kind === "value") {
        demandProperties(subject, use.completion.type);
      }
    }
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
      if (projection.kind === "accepted" && projection.projection !== undefined) {
        const selected = projection.projection;
        const shape = input.objectShapes.resolveTarget(requirement.projection === "assign" ? member.returnType : type);
        if (shape !== undefined && selected.kind === "assign") {
          for (const pair of csharpObjectShapeAssignmentMembers(shape, selected) ?? []) demandPair(subject, pair.source.type, pair.target.type);
        } else if (shape !== undefined && (selected.kind === "values" || selected.kind === "entries")) {
          const element = getCsharpJsArrayElementTargetType(selected.resultType);
          const target = selected.kind === "entries" && element?.kind === "tuple" ? element.elements[1] : element;
          if (target !== undefined) for (const value of csharpObjectShapeProjectionMembers(shape, selected) ?? []) demandPair(subject, value.type, target);
        }
      }
    }
  }

  function demandProperties(node: Node, type: TargetTypeRef): void {
    if (isCsharpJsValueTargetType(type)) return;
    const present = getCsharpNullableElementTargetType(type);
    if (present !== undefined) { demandProperties(node, present); return; }
    const leaves = csharpUnionLeaves(type, input.typeDefinitions);
    if (leaves !== undefined) { for (const leaf of leaves) demandProperties(node, leaf.carrier); return; }
    for (const member of input.conversions.propertyProjection.get(node, type) ?? []) demandPair(node, member.member.type, csharpTsValueTargetType());
  }
}
