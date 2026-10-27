import type { analyzeCsharpNativeValueCarriers } from "../objects/value-carriers.js";
import type { CsharpProgramRecordInput } from "./records/create.js";
import type { CsharpRepresentationAnalysis } from "./iteration.js";
import { analyzeCsharpConstructorEmission } from "../declarations/classes/constructors.js";
import { analyzeCsharpConstructorArguments } from "../declarations/classes/constructor-arguments.js";

import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpResolvedBinaryOperation } from "../../target-model/records/operations/operator-selection.js";

import { analyzeCsharpNativeConstants } from "../operations/native-constants.js";
import { analyzeCsharpBinaryEmission } from "../operations/binary-emission.js";
import { analyzeCsharpDictionaryLiterals } from "../objects/dictionary-literals.js";
import { analyzeCsharpExpressionEmission } from "../operations/expression-emission.js";
import { analyzeCsharpLambdaEmission } from "../callables/emission/lambda-emission.js";
import { analyzeCsharpTypedLocationEmission } from "../storage/typed-location-emission.js";
import { createCsharpPromiseResultRecords } from "./records/callables/promise-results.js";
import { admitCsharpLocationRetention } from "../storage/location-retention.js";

import { analyzeCsharpProjectCallableAdapters } from "../project-types/callable-adapters.js";

import { createCsharpProgramRecords } from "./records/create.js";
import { analyzeCsharpSourceArtifacts } from "../source-modules/artifacts.js";
import { analyzeCsharpArrayLiterals } from "../operations/array-literals.js";
import { analyzeCsharpPropertyAdmission } from "../objects/property-admission.js";
import { analyzeCsharpOptionalCallChains } from "../callables/calls/optional-call-chains.js";
import { analyzeCsharpElementAdmission } from "../objects/element-admission.js";
import { analyzeCsharpSourceReferences } from "../operations/source-references.js";
import { analyzeCsharpMemberReceivers } from "../objects/member-receivers.js";
import { analyzeCsharpSourceCallEmission } from "../callables/emission/source-call-emission.js";
import { analyzeCsharpTargetArguments } from "../callables/native/target-arguments.js";
import { analyzeCsharpArgumentPassing } from "../callables/values/argument-passing.js";
import { analyzeCsharpTargetCallEmission } from "../callables/emission/target-call-emission.js";
import { analyzeCsharpConstructionEmission } from "../project-types/construction-emission.js";
import { analyzeCsharpLiteralAdmission } from "../operations/literals.js";
import { analyzeCsharpAwaitAdmission } from "../callables/async/await-admission.js";
import { analyzeCsharpVoidAdmission } from "../operations/expression-void.js";
import { analyzeCsharpJsValueBoxing } from "../operations/js-value-boxing.js";
import { analyzeCsharpConditions } from "../control-flow/conditions.js";
import { analyzeCsharpTemplateStrings } from "../operations/template-strings.js";
import { analyzeCsharpPropertyValueProjection } from "../conversions/property-value-projection.js";
import { analyzeCsharpStructuralObjectEmission } from "../objects/structural-emission.js";
import { analyzeCsharpAuthoredObjectMethods } from "../objects/authored-methods.js";
import { analyzeCsharpObjectMemberEmission } from "../objects/member-emission.js";
import { analyzeCsharpObjectLiterals } from "../objects/object-literals.js";
import { analyzeCsharpIndexedRecords } from "../objects/indexed-records.js";
import { analyzeCsharpFrozenDataProperties } from "../objects/frozen-data-properties.js";
import { analyzeCsharpCaptureMethods } from "../objects/capture-methods.js";
import { analyzeCsharpDeclarationModifiers } from "../declarations/classes/modifiers.js";
import { analyzeCsharpNativeDeclarationForms } from "../declarations/native-forms.js";
import { analyzeCsharpStructuralInterfaceEmission } from "../declarations/structural-interfaces.js";
import { analyzeCsharpLexicalValues } from "../callables/values/lexical-values.js";
import { analyzeCsharpClassFieldInitialization } from "../project-types/class-initialization.js";
import { analyzeCsharpCallableParameterEmission } from "../callables/values/parameters.js";
import { analyzeCsharpCallableDeclarationEmission } from "../callables/emission/declaration-emission.js";
import { analyzeCsharpMethodEmission } from "../declarations/classes/methods.js";
import { analyzeCsharpClassEmission } from "../declarations/classes/planning.js";
import { analyzeCsharpProjectEmission } from "../project-types/emission.js";
import { analyzeCsharpTypeParameterEmission } from "../declarations/type-parameters.js";
import { analyzeCsharpTypeEmission } from "../source-evidence/types/emission.js";
import { analyzeCsharpNativeMemoryEmission } from "../operations/native-memory-emission.js";
import { admitCsharpUnionProjections } from "../operations/union-projections.js";
import { analyzeCsharpUnionEquality } from "../operations/union-equality.js";
import { analyzeCsharpClosedTypeTests } from "../operations/type-test-emission.js";
import { analyzeCsharpTypeofEmission } from "../operations/typeof-emission.js";
import { analyzeCsharpUnaryEmission } from "../operations/expression-unary.js";
import { analyzeCsharpThisEmission } from "../operations/expression-this.js";
import { analyzeCsharpSourceMemberNames } from "../objects/source-member-names.js";
import { analyzeCsharpReceiverCallProperties } from "../operations/receiver-call-property.js";
import { analyzeCsharpRestSequences } from "../callables/values/rest-sequences.js";
import { analyzeCsharpJsCalls } from "../operations/js-value-call-emission.js";
import { analyzeCsharpCallAdmission } from "../callables/calls/call-admission.js";
import { analyzeCsharpIdentifierEmission } from "../names/source-identifiers.js";
import { analyzeCsharpSourceFileEmission } from "../source-modules/emission.js";
import { analyzeCsharpStartup } from "../source-modules/startup.js";
import { analyzeCsharpSafetyEmission } from "../safety/emission.js";
import { analyzeCsharpStatementExits } from "../control-flow/statement-exits.js";
import { analyzeCsharpStatementCompletions } from "../control-flow/statement-completion.js";
import { analyzeCsharpResourceScopes } from "../control-flow/resource-scopes.js";
import { analyzeCsharpLocalBindings } from "../storage/local-bindings.js";
import { analyzeCsharpBindingIdentities } from "../storage/binding-identities.js";
import { analyzeCsharpSourceOutputIdentities } from "../names/source-output-identities.js";
import { createCsharpObjectShapeRecords } from "./records/objects/object-shapes.js";
import { analyzeCsharpObjectShapeEmission } from "../objects/declaration-emission.js";
import { analyzeCsharpSourceUnionEmission } from "../objects/source-union-emission.js";
import { analyzeCsharpGenerators } from "../callables/async/generators.js";

import { analyzeCsharpNativeControlFlow, admitCsharpStatementBindings, admitCsharpIterationBindings, admitCsharpNativeStorageBindings } from "../control-flow/native-control-flow.js";

import { isCsharpNeverTargetType } from "../../target-model/types/carriers/scalar-types.js";

import { analyzeCsharpNumericRepresentations } from "../numeric/representations.js";

import { rejectedTargetStage, resolvedTargetStage, failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { createSourceSwitchCoverage, targetSourceSyntaxProgram } from "@tsonic/target-api/analysis";
import type { TargetStageResult } from "@tsonic/target-api/artifacts";

import { createCsharpSafetyApplicationFactIndex } from "../safety/application-index.js";
import type { CsharpAnalysisProgram, CsharpTargetAnalysisRequest } from "./model.js";

import { admitCsharpNativeDeclarations, admitCsharpRawInterfaceDeclarations } from "../declarations/index.js";
import { analyzeCsharpNativeMemberNames } from "../names/index.js";

import { sealCsharpProjectTypeClassifications } from "../project-types/index.js";

import { analyzeCsharpSourceModuleConstructions } from "../source-modules/index.js";
import { composeCsharpBinaryExecutionDriver } from "../../target-model/metadata/binary-execution-drivers.js";
import { analyzeCsharpModuleInitialization } from "../module-initialization/index.js";

import { type SourceStorageQueries } from "@tsonic/target-api/analysis";

import { analyzeCsharpPromiseResults } from "../callables/async/promise-results.js";

import { csharpJsEventLoopBinaryExecutionDriver } from "../../target-model/project/binary-execution-drivers.js";
import { analyzeCsharpFlowReadProjections } from "../conversions/flow-read-projections.js";

import { analyzeCsharpNativeArtifactDemand } from "../objects/native-demand.js";
import { projectCsharpProviderIndexedStorageCarrier } from "../source-evidence/types/resolution/indexed-access.js";
import { selectCsharpObjectShapePublication } from "../names/object-shapes.js";
import { publishCsharpNativeArtifactDemand } from "./records/native/native-demand.js";
export function finalizeCsharpNativeEmission(
  request: CsharpTargetAnalysisRequest,
  analysis: CsharpRepresentationAnalysis,
  sourceStorage: SourceStorageQueries,
  safetyApplications: ReturnType<typeof createCsharpSafetyApplicationFactIndex>,
  callableAdapters: Extract<ReturnType<typeof analyzeCsharpProjectCallableAdapters>, { readonly kind: "resolved" }>["value"],
  sourceModuleConstructions: ReturnType<typeof analyzeCsharpSourceModuleConstructions>,
  moduleInitialization: ReturnType<typeof analyzeCsharpModuleInitialization>,
  flowReads: ReturnType<typeof analyzeCsharpFlowReadProjections>,
  promiseResults: ReturnType<typeof analyzeCsharpPromiseResults>,
  nativeValueCarriers: ReturnType<typeof analyzeCsharpNativeValueCarriers>,
  prerequisiteBinaryExecutionDriver: ReturnType<typeof composeCsharpBinaryExecutionDriver>,
): TargetStageResult<CsharpAnalysisProgram> {
  const { input, configuration } = request;
  const source = input.source;
  const sourceFiles = analysis.policy.sourceFiles;
  const literalValues = analysis.policy.literalValues;
  const { classFactories, captureStorage, callableCreations, nativeParticipation, classInitialization,
    exactLiterals, nativeDemand, bindingPatterns, conversions } = analysis;
  const attributeApplications = analysis.attributes.index;
  const numericRepresentations = analyzeCsharpNumericRepresentations({ source, sourceFiles,
    evidence: analysis.sourceEvidence, operations: analysis.operations });
  const typeDefinitions = analysis.typeDefinitions.seal();
  const projectTypes = sealCsharpProjectTypeClassifications(
    analysis.typeSystem.projectTypes, source.ast, sourceStorage.nodes, analysis.objectShapes,
  );
  const sourceSyntax = targetSourceSyntaxProgram(source);
  const admittedIterations = admitCsharpIterationBindings(analysis.policy, sourceStorage.nodes,
    nativeDemand.nativeUse, analysis.operations, analysis.storage,
    nativeParticipation.participation, analysis.sourceEvidence.compileTimeMetadata);
  const admittedOperations = admittedIterations.operations;
  const admittedControlNode = (node: Node): boolean => nativeDemand.nativeUse.order(node) !== undefined &&
    !analysis.sourceEvidence.compileTimeMetadata.get(node) &&
    !admittedOperations.nativeUnreachable.get(node) && nativeParticipation.participation.get(node) !== "erased";
  const literalEmission = analyzeCsharpLiteralAdmission({ ast: source.ast, demand: nativeDemand, literals: literalValues,
    exact: exactLiterals, values: analysis.valueReads });
  const templateStrings = analyzeCsharpTemplateStrings(source.ast, nativeDemand);
  const dictionaryLiterals = analyzeCsharpDictionaryLiterals(source.ast, nativeDemand);
  const unionEquality = analyzeCsharpUnionEquality(sourceStorage.nodes, admittedOperations);
  const closedTypeTests = analyzeCsharpClosedTypeTests(sourceStorage.nodes, admittedOperations, typeDefinitions);
  const unaryEmission = analyzeCsharpUnaryEmission({ ast: source.ast, nodes: sourceStorage.nodes, admitted: admittedControlNode,
    operations: admittedOperations, literals: literalValues, exact: exactLiterals });
  const typeofEmission = analyzeCsharpTypeofEmission({ ast: source.ast, nodes: sourceStorage.nodes, admitted: admittedControlNode,
    operations: admittedOperations, values: analysis.valueReads, factories: classFactories, definitions: typeDefinitions });
  const receiverCallProperties = analyzeCsharpReceiverCallProperties(sourceStorage.nodes, admittedOperations, admittedControlNode);
  const restSequences = analyzeCsharpRestSequences(sourceStorage.nodes, admittedOperations, analysis.valueReads, admittedControlNode);
  const jsCalls = analyzeCsharpJsCalls(source.ast, sourceStorage.nodes, admittedOperations, admittedControlNode);
  const callAdmission = analyzeCsharpCallAdmission(source.ast, sourceStorage.nodes, admittedOperations, analysis.valueReads, admittedControlNode);
  const optionalCallChains = analyzeCsharpOptionalCallChains(source.ast, sourceStorage.nodes, admittedOperations, nativeDemand, admittedControlNode);
  const nonCallableIssues = [
    ...admitCsharpUnionProjections(sourceStorage.nodes, admittedOperations, typeDefinitions),
    ...literalEmission.issues,
    ...dictionaryLiterals.issues,
    ...unionEquality.issues,
    ...closedTypeTests.issues,
    ...unaryEmission.issues,
    ...typeofEmission.issues,
    ...receiverCallProperties.issues,
    ...restSequences.issues,
    ...jsCalls.issues,
    ...callAdmission.issues,
    ...optionalCallChains.issues,
    ...analyzeCsharpConditions({ ast: source.ast, nodes: sourceStorage.nodes, demand: nativeDemand, operations: admittedOperations, values: analysis.valueReads }),
    ...analyzeCsharpVoidAdmission({ ast: source.ast, demand: nativeDemand, values: analysis.valueReads, operations: admittedOperations }),
    ...analyzeCsharpAwaitAdmission({ ast: source.ast, demand: nativeDemand, values: analysis.valueReads, operations: admittedOperations }),
    ...admittedIterations.issues,
    ...admitCsharpStatementBindings(source.ast, sourceStorage.nodes, nativeDemand.nativeUse,
      admittedOperations, analysis.storage, analysis.sourceEvidence.generator,
      nativeParticipation.participation, analysis.sourceEvidence.compileTimeMetadata,
      analysis.valueReads.valueRead),
    ...admitCsharpNativeDeclarations(source.ast, sourceStorage.nodes, nativeDemand.nativeUse,
      projectTypes, source.navigation, analysis.sourceEvidence, analysis.storage,
      nativeParticipation.participation, admittedOperations.nativeUnreachable,
      analysis.declarations, callableAdapters.callableDispatch, classFactories.classFactory, captureStorage),
    ...admitCsharpNativeStorageBindings(source.ast, sourceStorage.nodes, nativeDemand.nativeUse,
      analysis.storage, admittedOperations.nativeRefReturn, nativeParticipation.participation,
      analysis.sourceEvidence.compileTimeMetadata, admittedOperations.nativeUnreachable),
  ];
  if (nonCallableIssues.length > 0) return rejectedTargetStage(nonCallableIssues);
  const pendingUses = nativeDemand.unadmitted.filter(use => use.kind === "pending-use");
  if (pendingUses.length > 0) {
    const incomplete = pendingUses[0]!;
    return failTargetAnalysisInvariant("tsonic-csharp",
      `Native consumption '${incomplete.site.role}' requires completed '${incomplete.reason}' evidence before publication.`, incomplete.expression);
  }
  const generators = analyzeCsharpGenerators({ ast: source.ast, nodes: sourceStorage.nodes, evidence: analysis.sourceEvidence,
    admitted: admittedControlNode, erased: node => analysis.sourceEvidence.compileTimeMetadata.get(node) === true ||
      admittedOperations.nativeUnreachable.get(node) === true || nativeParticipation.participation.get(node) === "erased",
    required: analysis.requiredRecords });
  if (generators.issues.length !== 0) return rejectedTargetStage(generators.issues);
  const callableDeclarations = analyzeCsharpCallableDeclarationEmission({ ast: source.ast, nodes: sourceStorage.nodes,
    admitted: admittedControlNode, declarations: analysis.declarations, generators: generators.records, callables: analysis.callables });
  if (callableDeclarations.issues.length !== 0) return rejectedTargetStage(callableDeclarations.issues);
  const callableParameters = analyzeCsharpCallableParameterEmission({ ast: source.ast, callables: analysis.callables, nodes: sourceStorage.nodes,
    declarations: analysis.declarations, values: analysis.valueReads, storage: analysis.storage, conversions, literals: literalValues,
    exact: exactLiterals, admitted: admittedControlNode, required: analysis.requiredRecords });
  if (callableParameters.issues.length !== 0) return rejectedTargetStage(callableParameters.issues);
  const boxSites: { readonly node: Node; readonly carrier: TargetTypeRef }[] = [];
  const objectShapeClosure = analyzeCsharpNativeArtifactDemand({
    ast: source.ast, sourceFiles, propertyNames: sourceSyntax.propertyNames,
    nativeDemand, participation: nativeParticipation.participation,
    sourceStorage,
    projectIndexedCarrier: (component, owner) => {
      const declaration = component.index.declaration ?? component.index.components.find(node => node !== undefined);
      return declaration === undefined ? undefined : projectCsharpProviderIndexedStorageCarrier(component, owner,
        analysis.policy.providers, source.sourceFacts, analysis.policy.semanticsFor(declaration));
    },
    objectShapes: callableAdapters.objectShapes, projectTypes, typeDefinitions,
    valueReads: analysis.valueReads, operations: admittedOperations, storage: analysis.storage, parameterEntries: callableParameters.records.lambdaParameterEntry,
    callables: analysis.callables, captureStorage, callableAdapters, flowReads, declarations: analysis.declarations,
    bindingPatterns, conversions, nativeValueCarriers, sourceEvidence: analysis.sourceEvidence,
    boxSites: { add: (node, carrier) => { boxSites.push({ node, carrier }); } },
  }, analysis.requiredRecords);
  if (objectShapeClosure.kind === "rejected") return objectShapeClosure;
  // Boxing is planned after native demand: the demanded conversions name every value they box into the closed JS value.
  const jsValueBoxing = analyzeCsharpJsValueBoxing({ ast: source.ast, demand: nativeDemand, values: analysis.valueReads,
    exact: exactLiterals, boxSites });
  if (jsValueBoxing.issues.length > 0) return rejectedTargetStage(jsValueBoxing.issues);
  const nativeMemberNames = analyzeCsharpNativeMemberNames({
    ast: source.ast, nodes: sourceStorage.nodes, nativeUse: nativeDemand.nativeUse,
    metadata: analysis.sourceEvidence, participation: nativeParticipation.participation,
    unreachable: admittedOperations.nativeUnreachable, projectTypes, names: analysis.names,
    dispatch: callableAdapters.callableDispatch, writes: analysis.declarations.methodWrite,
    factories: classFactories.classFactory, helperAccess: captureStorage.helperAccess,
    requiredBindingRoots: nativeDemand.requiredBindingRoots, artifactClosure: objectShapeClosure.value,
    nativeValueCarriers, storage: analysis.storage, moduleInitialization: moduleInitialization.index,
    callables: analysis.callables, callableCreations, classPropertyStorage: admittedOperations.classPropertyStorage,
    captureFrameShape: captureStorage.captureFrameShape, capturedBinding: captureStorage.capturedBinding,
    providers: analysis.policy.providers,
  });
  if (nativeMemberNames.issues.length > 0) return rejectedTargetStage(nativeMemberNames.issues);
  const names = analysis.names.seal(nativeDemand.requiredBindingRoots, nativeMemberNames);
  if (names.issues.length > 0) return rejectedTargetStage(names.issues);
  const objectShapeDemand = publishCsharpNativeArtifactDemand(selectCsharpObjectShapePublication(objectShapeClosure.value, names));
  const rawInterfaceIssues = admitCsharpRawInterfaceDeclarations(source.ast, sourceStorage.nodes,
    nativeDemand.nativeUse, callableAdapters.objectShapes, objectShapeDemand, analysis.storage,
    analysis.sourceEvidence.compileTimeMetadata, nativeParticipation.participation,
    admittedOperations.nativeUnreachable);
  if (rawInterfaceIssues.length > 0) return rejectedTargetStage(rawInterfaceIssues);
  const switchCoversDiscriminant = createSourceSwitchCoverage(source);
  const statementCompletions = analyzeCsharpStatementCompletions({ ast: source.ast, nodes: sourceStorage.nodes,
    returnContexts: analysis.expectedTypes.returnContext, returnContracts: analysis.declarations.returnContract,
    values: analysis.valueReads.valueRead,
    nativeUse: nativeDemand.nativeUse, storage: analysis.storage.storageType,
    admitted: admittedControlNode, required: analysis.requiredRecords, facts: {
      erased: node => analysis.sourceEvidence.compileTimeMetadata.get(node) === true ||
        admittedOperations.nativeUnreachable.get(node) === true || admittedOperations.erasedStatement.get(node) === true ||
        nativeParticipation.participation.get(node) === "erased",
      expressionExits: node => isCsharpNeverTargetType(analysis.valueReads.valueRead.get(node)?.value),
      guardResult: node => admittedOperations.nativeGuardResult.get(node),
      switchCoversDiscriminant,
    } });
  const nativeControlIssues = analyzeCsharpNativeControlFlow(source, statementCompletions.controlExit, admittedControlNode);
  if (nativeControlIssues.length !== 0) return rejectedTargetStage(nativeControlIssues);
  const statementExits = analyzeCsharpStatementExits({ ast: source.ast, nodes: sourceStorage.nodes,
    operations: admittedOperations, metadata: analysis.sourceEvidence.compileTimeMetadata,
    participation: nativeParticipation.participation, values: analysis.valueReads.valueRead,
    switchCoversDiscriminant, required: analysis.requiredRecords });
  const lexicalValues = analyzeCsharpLexicalValues({ nodes: sourceStorage.nodes, navigation: source.navigation,
    captures: captureStorage, values: analysis.valueReads, metadata: analysis.sourceEvidence });
  if (lexicalValues.issues.length !== 0) return rejectedTargetStage(lexicalValues.issues);
  const sourceOutputIdentities = analyzeCsharpSourceOutputIdentities({ ast: source.ast, sourceFiles, paths: input.paths,
    namespace: request.project.namespace, sourceFacts: source.sourceFacts,
    generatedTypeNames: [...projectTypes.declarationScopeNames, ...classFactories.factories.flatMap(factory => [
      factory.instanceScope, factory.factoryName, ...(factory.identity === undefined ? [] : [factory.identity.name]),
    ])] });
  if (sourceOutputIdentities.kind === "rejected") return rejectedTargetStage(sourceOutputIdentities.diagnostics);
  const objectShapeEmission = analyzeCsharpObjectShapeEmission({ ast: source.ast, nodes: sourceStorage.nodes, nativeDemand, bindings: bindingPatterns,
    demand: objectShapeDemand, shapes: callableAdapters.objectShapes, names });
  if (objectShapeEmission.issues.length !== 0) return rejectedTargetStage(objectShapeEmission.issues);
  const captureMethods = analyzeCsharpCaptureMethods(source.ast, captureStorage, callableAdapters.objectShapes, analysis.callables);
  if (captureMethods.issues.length !== 0) return rejectedTargetStage(captureMethods.issues);
  const structuralObjectEmission = analyzeCsharpStructuralObjectEmission({ shapes: callableAdapters.objectShapes,
    demand: objectShapeDemand, storage: analysis.storage, captureMethods: captureMethods.records.captureMethods });
  if (structuralObjectEmission.issues.length !== 0) return rejectedTargetStage(structuralObjectEmission.issues);
  const objectMembers = analyzeCsharpObjectMemberEmission({ shapes: callableAdapters.objectShapes,
    demand: objectShapeDemand, storage: analysis.storage, captures: captureStorage });
  if (objectMembers.issues.length !== 0) return rejectedTargetStage(objectMembers.issues);
  const objectMethods = analyzeCsharpAuthoredObjectMethods({ ast: source.ast, shapes: callableAdapters.objectShapes,
    demand: objectShapeDemand, captures: captureStorage, members: objectMembers.records });
  if (objectMethods.issues.length !== 0) return rejectedTargetStage(objectMethods.issues);
  const objectLiterals = analyzeCsharpObjectLiterals({ source: sourceSyntax, demand: nativeDemand, shapes: callableAdapters.objectShapes,
    methods: objectMethods.records, members: objectMembers.records, storage: analysis.storage,
    callables: analysis.callables });
  if (objectLiterals.issues.length !== 0) return rejectedTargetStage(objectLiterals.issues);
  const thisEmission = analyzeCsharpThisEmission({ ast: source.ast, nodes: sourceStorage.nodes, admitted: admittedControlNode,
    captures: captureStorage, initialization: classInitialization, factories: classFactories, values: analysis.valueReads,
    shapes: callableAdapters.objectShapes, methods: objectMethods.records, literals: objectLiterals.records });
  if (thisEmission.issues.length !== 0) return rejectedTargetStage(thisEmission.issues);
  const indexedRecords = analyzeCsharpIndexedRecords(sourceStorage.nodes, admittedOperations);
  if (indexedRecords.issues.length !== 0) return rejectedTargetStage(indexedRecords.issues);
  const frozenDataProperties = analyzeCsharpFrozenDataProperties({ ast: source.ast, demand: objectShapeDemand, members: objectMembers.records,
    storage: analysis.storage, operations: admittedOperations, attributes: attributeApplications, methodWrites: analysis.declarations.methodWrite });
  if (frozenDataProperties.issues.length !== 0) return rejectedTargetStage(frozenDataProperties.issues);
  const projectEmission = analyzeCsharpProjectEmission({ source, nodes: sourceStorage.nodes, projectTypes,
    factories: classFactories, evidence: analysis.sourceEvidence, names, projections: analysis.typeProjections });
  if (projectEmission.issues.length !== 0) return rejectedTargetStage(projectEmission.issues);
  const sourceReferences = analyzeCsharpSourceReferences({ source, nodes: sourceStorage.nodes, admitted: admittedControlNode,
    evidence: analysis.sourceEvidence, factories: classFactories, captures: captureStorage, demand: nativeDemand,
    operations: admittedOperations, files: sourceOutputIdentities.records, backing: analysis.storage.nativeBacking,
    delegateAdapters: conversions.delegateAdapters, jsCalls: jsCalls.records });
  if (sourceReferences.issues.length !== 0) return rejectedTargetStage(sourceReferences.issues);
  const memberReceivers = analyzeCsharpMemberReceivers({ source, nodes: sourceStorage.nodes, operations: admittedOperations,
    references: sourceReferences.records, projects: projectEmission.records, factories: classFactories, admitted: admittedControlNode });
  if (memberReceivers.issues.length !== 0) return rejectedTargetStage(memberReceivers.issues);
  const propertyAdmission = analyzeCsharpPropertyAdmission({ ast: source.ast, nodes: sourceStorage.nodes,
    operations: admittedOperations, admitted: admittedControlNode, projectDeclaration: node => source.navigation.isProjectDeclaration(node), receivers: memberReceivers.records, jsCalls: jsCalls.records,
    modules: sourceReferences.records.sourceModuleReference, evidence: analysis.sourceEvidence });
  if (propertyAdmission.issues.length !== 0) return rejectedTargetStage(propertyAdmission.issues);
  // Native member names are selected only where the planner renders one: an admitted source member read and the
  // callee of an admitted native method call.
  const memberNames = analyzeCsharpSourceMemberNames({ ast: source.ast, nodes: sourceStorage.nodes, operations: admittedOperations, names,
    rendered: node => propertyAdmission.records.sourceMemberEmission.get(node)?.kind === "member" ||
      memberReceivers.records.nativeMethodCallee.get(node) !== undefined });
  if (memberNames.issues.length !== 0) return rejectedTargetStage(memberNames.issues);
  const elementAdmission = analyzeCsharpElementAdmission({ ast: source.ast, nodes: sourceStorage.nodes, operations: admittedOperations,
    demand: nativeDemand, admitted: admittedControlNode, receivers: memberReceivers.records, navigation: source.navigation });
  if (elementAdmission.issues.length !== 0) return rejectedTargetStage(elementAdmission.issues);
  const typeParameterEmission = analyzeCsharpTypeParameterEmission({ ast: source.ast, nodes: sourceStorage.nodes,
    evidence: analysis.sourceEvidence, admitted: admittedControlNode });
  if (typeParameterEmission.issues.length !== 0) return rejectedTargetStage(typeParameterEmission.issues);
  const identifierIssues = analyzeCsharpIdentifierEmission({ ast: source.ast, nodes: sourceStorage.nodes, names,
    factories: classFactories, projects: projectEmission.records, parameters: typeParameterEmission.records,
    operations: admittedOperations, admitted: admittedControlNode });
  if (identifierIssues.length !== 0) return rejectedTargetStage(identifierIssues);
  const classEmission = analyzeCsharpClassEmission({ ast: source.ast, nodes: sourceStorage.nodes, projectTypes, factories: classFactories,
    captures: captureStorage, storage: analysis.storage, names, admitted: admittedControlNode, callables: analysis.callables });
  if (classEmission.issues.length !== 0) return rejectedTargetStage(classEmission.issues);
  const sourceUnions = analyzeCsharpSourceUnionEmission(typeDefinitions);
  const nativeLayouts = analyzeCsharpNativeMemoryEmission({ nodes: sourceStorage.nodes, storage: analysis.storage, operations: admittedOperations });
  const typedLocationEmission = analyzeCsharpTypedLocationEmission({ source, nodes: sourceStorage.nodes,
    storage: analysis.storage, operations: admittedOperations, members: objectMembers.records, admitted: admittedControlNode });
  if (typedLocationEmission.issues.length !== 0) return rejectedTargetStage(typedLocationEmission.issues);
  const binaryCarriers = (selection: CsharpResolvedBinaryOperation): readonly TargetTypeRef[] => [
    selection.leftType, selection.rightType, selection.leftInputType, selection.rightInputType, selection.resultType,
  ];
  const operationCarriers = sourceStorage.nodes.flatMap(node => {
    if (!admittedControlNode(node)) return [];
    const binary = admittedOperations.binaryOperation.get(node);
    const unary = admittedOperations.unaryOperation.get(node)?.target;
    const mutation = admittedOperations.jsArrayMutation.get(node);
    const selectedSwitch = admittedOperations.switchStatement.get(node);
    return [
      ...binary?.target.kind === "resolved" ? binaryCarriers(binary.target) : [],
      ...binary?.destructuring.kind === "resolved" ? [binary.destructuring.sourceType, binary.destructuring.resultType] : [],
      ...unary?.kind === "resolved" ? [unary.operandType, unary.resultType] : [],
      ...mutation?.kind === "set-typed-element" && mutation.calculation !== undefined ? binaryCarriers(mutation.calculation) : [],
      ...selectedSwitch === undefined || selectedSwitch.kind === "rejected" ? [] : [selectedSwitch.type],
      ...selectedSwitch?.kind === "ordered" ? selectedSwitch.clauses.flatMap(clause =>
        clause.comparison === undefined ? [] : binaryCarriers(clause.comparison)) : [],
    ];
  });
  const typeEmission = analyzeCsharpTypeEmission({ ast: source.ast, nodes: sourceStorage.nodes, evidence: analysis.sourceEvidence,
    languageDialect: configuration.languageDialect,
    extraTypes: [...typedLocationEmission.carriers, ...nativeLayouts.carriers, ...restSequences.carriers, ...operationCarriers,
      ...nativeDemand.entries.flatMap(({ use }) => use.kind === "erased" ? []
      : [use.carrier, ...use.kind === "converted" ? [use.target] : [], ...use.binary === undefined ? [] : binaryCarriers(use.binary)]),
      ...sourceUnions.sourceUnions.get().flatMap(union => [union.carrier, union.storage, ...union.arms])],
    values: analysis.valueReads, storage: analysis.storage, shapes: objectShapeDemand, admitted: admittedControlNode });
  if (typeEmission.issues.length !== 0) return rejectedTargetStage(typeEmission.issues);
  const nativeConstants = analyzeCsharpNativeConstants({ ast: source.ast, demand: nativeDemand, literals: literalValues,
    exact: exactLiterals, values: analysis.valueReads, types: typeEmission.records, references: sourceReferences.records });
  const expressionEmission = analyzeCsharpExpressionEmission({ source, nodes: sourceStorage.nodes, demand: nativeDemand, conversions,
    evidence: analysis.sourceEvidence, factories: classFactories, operations: admittedOperations });
  if (expressionEmission.issues.length !== 0) return rejectedTargetStage(expressionEmission.issues);
  const binaryEmission = analyzeCsharpBinaryEmission({ source, nodes: sourceStorage.nodes, operations: admittedOperations,
    demand: nativeDemand, storage: analysis.storage, constants: nativeConstants, optionalLocals: analysis.optionalLocals,
    admitted: admittedControlNode });
  if (binaryEmission.issues.length !== 0) return rejectedTargetStage(binaryEmission.issues);
  const sourceFileEmission = analyzeCsharpSourceFileEmission({ source, identities: sourceOutputIdentities.records,
    factories: classFactories, evidence: analysis.sourceEvidence, operations: admittedOperations,
    moduleInitialization: moduleInitialization.index, expectedTypes: analysis.expectedTypes,
    declarations: callableDeclarations.records, names, storage: analysis.storage });
  if (sourceFileEmission.issues.length !== 0) return rejectedTargetStage(sourceFileEmission.issues);
  const binaryExecutionDriver = composeCsharpBinaryExecutionDriver(prerequisiteBinaryExecutionDriver,
    [...promiseResults.results.values()].some(result => result.discard !== undefined) ? csharpJsEventLoopBinaryExecutionDriver : undefined);
  const startup = analyzeCsharpStartup({ source, identities: sourceOutputIdentities.records, modules: moduleInitialization.index,
    constructions: sourceModuleConstructions.index, outputType: configuration.outputType, driver: binaryExecutionDriver });
  if (startup.issues.length !== 0) return rejectedTargetStage(startup.issues);
  const safetyEmission = analyzeCsharpSafetyEmission({ source, configuration, safety: safetyApplications,
    evidence: analysis.sourceEvidence, operations: admittedOperations, storage: analysis.storage,
    shapes: objectShapeDemand, unions: sourceUnions, admitted: admittedControlNode });
  if (safetyEmission.issues.length !== 0) return rejectedTargetStage(safetyEmission.issues);
  const sourceArtifacts = analyzeCsharpSourceArtifacts(source, sourceModuleConstructions.index);
  if (sourceArtifacts.issues.length !== 0) return rejectedTargetStage(sourceArtifacts.issues);
  const arrayLiterals = analyzeCsharpArrayLiterals({ source, demand: nativeDemand, conversions,
    values: analysis.valueReads, expected: analysis.expectedTypes, evidence: analysis.sourceEvidence, operations: admittedOperations });
  if (arrayLiterals.issues.length !== 0) return rejectedTargetStage(arrayLiterals.issues);
  const propertyValueProjection = analyzeCsharpPropertyValueProjection(conversions, callableAdapters.objectShapes, typeDefinitions,
    objectLiterals.records, source);
  if (propertyValueProjection.issues.length !== 0) return rejectedTargetStage(propertyValueProjection.issues);
  const sourceCallEmission = analyzeCsharpSourceCallEmission({ source, nodes: sourceStorage.nodes, operations: admittedOperations,
    evidence: analysis.sourceEvidence, declarations: analysis.declarations, conversions, captures: captureStorage,
    references: sourceReferences.records, admitted: admittedControlNode });
  if (sourceCallEmission.issues.length !== 0) return rejectedTargetStage(sourceCallEmission.issues);
  const targetArguments = analyzeCsharpTargetArguments({ ast: source.ast, nodes: sourceStorage.nodes, operations: admittedOperations,
    sources: sourceCallEmission.records, demand: nativeDemand, admitted: admittedControlNode });
  if (targetArguments.issues.length !== 0) return rejectedTargetStage(targetArguments.issues);
  const argumentPassing = analyzeCsharpArgumentPassing({ source, requests: targetArguments.requests, nodes: sourceStorage.nodes,
    evidence: analysis.sourceEvidence, storage: analysis.storage, operations: admittedOperations,
    elements: elementAdmission.records, admitted: admittedControlNode });
  if (argumentPassing.issues.length !== 0) return rejectedTargetStage(argumentPassing.issues);
  const lambdaEmission = analyzeCsharpLambdaEmission({ source, nodes: sourceStorage.nodes, captures: captureStorage,
    declarations: callableDeclarations.records, parameters: callableParameters.records,
    creations: callableCreations, storage: analysis.storage, values: analysis.valueReads,
    types: typeEmission.records, arguments: targetArguments.records, constants: nativeConstants, demand: nativeDemand, admitted: admittedControlNode });
  if (lambdaEmission.issues.length !== 0) return rejectedTargetStage(lambdaEmission.issues);
  const locationRetentionIssues = admitCsharpLocationRetention({ source, nodes: sourceStorage.nodes, operations: admittedOperations,
    storage: analysis.storage, elements: elementAdmission.records, arguments: argumentPassing.records, admitted: admittedControlNode });
  if (locationRetentionIssues.length !== 0) return rejectedTargetStage(locationRetentionIssues);
  const targetCallEmission = analyzeCsharpTargetCallEmission({ nodes: sourceStorage.nodes, admitted: admittedControlNode, operations: admittedOperations,
    arguments: targetArguments.records, sources: sourceCallEmission.records, optional: optionalCallChains.records,
    shapes: objectShapeDemand, demand: nativeDemand, expressions: expressionEmission.records });
  if (targetCallEmission.issues.length !== 0) return rejectedTargetStage(targetCallEmission.issues);
  const constructionEmission = analyzeCsharpConstructionEmission({ source, nodes: sourceStorage.nodes, admitted: admittedControlNode,
    operations: admittedOperations, values: analysis.valueReads, demand: nativeDemand, evidence: analysis.sourceEvidence,
    modules: sourceModuleConstructions.index.sourceModuleConstruction, files: sourceOutputIdentities.records, arguments: targetArguments.records });
  if (constructionEmission.issues.length !== 0) return rejectedTargetStage(constructionEmission.issues);
  const recordInput: Omit<CsharpProgramRecordInput, "constructors"> = {
    propertyValueProjection: propertyValueProjection.records,
    arrayLiterals: arrayLiterals.records,
    literalEmission: literalEmission.records,
    templateStrings,
    dictionaryLiterals: dictionaryLiterals.records,
    sourceArtifacts: sourceArtifacts.records,
    safetyEmission: safetyEmission.records,
    startup: startup.records,
    sourceFileEmission: sourceFileEmission.records,
    typeEmission: typeEmission.records,
    nativeConstants,
    expressionEmission: expressionEmission.records,
    lambdaEmission: lambdaEmission.records,
    typedLocationEmission: typedLocationEmission.records,
    promiseResults: createCsharpPromiseResultRecords(promiseResults.results),
    binaryEmission: binaryEmission.records,
    nativeLayouts: nativeLayouts.records,
    typeParameterEmission: typeParameterEmission.records,
    projectEmission: projectEmission.records,
    captureMethods: captureMethods.records,
    frozenDataProperties: frozenDataProperties.records,
    indexedRecords: indexedRecords.records,
    objectLiterals: objectLiterals.records,
    objectMembers: objectMembers.records,
    objectMethods: objectMethods.records,
    structuralObjectEmission: structuralObjectEmission.records,
    compilation: Object.freeze({ project: request.project, namespace: request.project.namespace, languageDialect: configuration.languageDialect }),
    names,
    sourceUnions,
    objectShapeEmission: objectShapeEmission.records,
    objectShapes: createCsharpObjectShapeRecords(callableAdapters.objectShapes),
    sourceFiles: sourceOutputIdentities.records,
    bindingIdentities: analyzeCsharpBindingIdentities(source, sourceStorage.nodes),
    classEmission: classEmission.records,
    callableParameters: callableParameters.records,
    callableDeclarations: callableDeclarations.records,
    nativeMemberNames,
    methods: analyzeCsharpMethodEmission(source.ast, nativeMemberNames),
    classFields: analyzeCsharpClassFieldInitialization({ ast: source.ast, nodes: sourceStorage.nodes, storage: analysis.storage }),
    lexicalValues: lexicalValues.records,
    structuralInterfaces: analyzeCsharpStructuralInterfaceEmission({ ast: source.ast,
      shapes: callableAdapters.objectShapes, names, projectTypes, projections: analysis.typeProjections, declarations: analysis.declarations }),
    nativeDeclarations: analyzeCsharpNativeDeclarationForms({ ast: source.ast, nodes: sourceStorage.nodes, projectTypes, required: analysis.requiredRecords }),
    declarationModifiers: analyzeCsharpDeclarationModifiers({ ast: source.ast, nodes: sourceStorage.nodes,
      dispatch: callableAdapters.callableDispatch, helperAccess: captureStorage.helperAccess, required: analysis.requiredRecords, generators: generators.records, factories: classFactories.classFactory }),
    generators: generators.records,
    localBindings: analyzeCsharpLocalBindings({ ast: source.ast, navigation: source.navigation, nodes: sourceStorage.nodes,
      admitted: admittedControlNode, nativeRefs: admittedOperations.nativeRefReturn, storage: analysis.storage.storageType,
      moduleInitialization: moduleInitialization.index.moduleBindingInitialization, required: analysis.requiredRecords,
      optionalLocals: analysis.optionalLocals }),
    resourceScopes: analyzeCsharpResourceScopes({ ast: source.ast, nodes: sourceStorage.nodes,
      erased: node => analysis.sourceEvidence.compileTimeMetadata.get(node) === true ||
        admittedOperations.nativeUnreachable.get(node) === true || nativeParticipation.participation.get(node) === "erased",
      required: analysis.requiredRecords }),
    statementCompletions,
    statementExits,
    objectShapeDemand,
    nativeValueCarriers,
    literalValues, exactLiterals, nativeParticipation, nativeDemand, bindingPatterns,
    unionEquality: unionEquality.records,
    closedTypeTests: closedTypeTests.records,
    jsValueBoxing: jsValueBoxing.records,
    unaryEmission: unaryEmission.records,
    thisEmission: thisEmission.records,
    memberNames: memberNames.records,
    receiverCallProperties: receiverCallProperties.records,
    restSequences: restSequences.records,
    jsCalls: jsCalls.records,
    callAdmission: callAdmission.records,
    propertyAdmission: propertyAdmission.records,
    optionalCallChains: optionalCallChains.records,
    elementAdmission: elementAdmission.records,
    sourceReferences: sourceReferences.records,
    memberReceivers: memberReceivers.records,
    sourceCallEmission: sourceCallEmission.records,
    targetArguments: targetArguments.records,
    argumentPassing: argumentPassing.records,
    targetCallEmission: targetCallEmission.records,
    constructionEmission: constructionEmission.records,
    typeofEmission: typeofEmission.records,
    flowReads, valueReads: analysis.valueReads,
    callableAdapters, callableCreations, typeProjections: analysis.typeProjections, classFactories, classInitialization, captureStorage,
    numericRepresentations, attributeApplications, safetyApplications, operations: admittedOperations,
    sourceEvidence: analysis.sourceEvidence, declarations: analysis.declarations, conversions,
    expectedTypes: analysis.expectedTypes, storage: analysis.storage,
    sourceModuleConstructions: sourceModuleConstructions.index, moduleInitialization: moduleInitialization.index,
  };
  const constructors = analyzeCsharpConstructorEmission({
    ast: source.ast, nodes: sourceStorage.nodes, declarations: analysis.declarations, storage: analysis.storage,
    captured: declaration => captureStorage.capturedBinding.get(declaration) !== undefined,
    admitted: admittedControlNode,
    arguments: analyzeCsharpConstructorArguments(source.ast, sourceStorage.nodes, recordInput, admittedControlNode),
  });
  if (constructors.issues.length !== 0) return rejectedTargetStage(constructors.issues);
  const records = createCsharpProgramRecords({ ...recordInput, constructors: constructors.records }, analysis.requiredRecords);
  sourceStorage.sealFormalMemberWriteDemands();

  return resolvedTargetStage(Object.freeze({
    records,
    host: Object.freeze({ paths: Object.freeze({ ...input.paths }), entryPoint: input.project.entryPoint }),
    source,
    sourceFiles,
    sourceNavigation: source.navigation,
    typeDefinitions,
    projectTypes,
    objectShapes: callableAdapters.objectShapes,
    names,
    classFactories: classFactories.factories,
    captureFrames: captureStorage.frames,
  }));
}
