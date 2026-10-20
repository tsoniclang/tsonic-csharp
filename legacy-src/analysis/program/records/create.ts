import type { CsharpAttributeApplicationIndex } from "../../../target-model/records/attributes.js";
import type { CsharpProjectCallableAdapters } from "../../../target-model/records/callable-adapters.js";
import type { CsharpCaptureStorage } from "../../../target-model/records/capture-storage.js";
import type { CsharpClassFactoryIndex } from "../../../target-model/records/class-factories.js";
import type { CsharpClassInitializationIndex } from "../../../target-model/records/class-initialization.js";
import type { CsharpClassFieldInitializationRecords } from "../../../target-model/records/class-initialization.js";
import type { CsharpConversionClassifications, CsharpValueReadClassifications } from "../../../target-model/records/conversions.js";
import type { CsharpExactLiteralSelectionIndex } from "../../../target-model/conversions/exact-literals.js";
import type { CsharpDeclarationClassifications } from "../../../target-model/records/declarations.js";
import type { CsharpExpectedTypeClassifications } from "../../../target-model/records/expected-types.js";
import type { CsharpModuleInitializationIndex } from "../../../target-model/records/module-initialization.js";
import type { CsharpNativeParticipationInput, CsharpNativeUseClassifications } from "../../../target-model/records/native-demand.js";
import type { CsharpBindingPatternClassifications } from "../../../target-model/records/value-projections.js";
import type { CsharpNumericRepresentations } from "../../../target-model/records/numeric.js";
import type { CsharpTargetOperationClassifications } from "../../../target-model/records/operations.js";
import type { CsharpSafetyApplicationFactIndex } from "../../../target-model/records/safety.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/source-evidence.js";
import type { CsharpFlowReadClassifications } from "../../../target-model/records/source-evidence.js";
import type { CsharpSourceModuleConstructionIndex } from "../../../target-model/records/source-modules.js";
import type { CsharpStorageClassifications } from "../../../target-model/records/storage.js";
import type { CsharpGenericProjectionIndex } from "../../../target-model/records/type-projections.js";
import type { CsharpProgramRecords } from "../../../target-model/records/program.js";
import type { CsharpNativeValueCarriers } from "../../../target-model/records/native-value-carriers.js";
import { assertCsharpRequiredRecords, type CsharpRequiredRecord } from "./required-records.js";
import type { CsharpCallableCreationIndex } from "../../callables/model.js";
import type { CsharpObjectShapeDemand } from "../../../target-model/records/object-shape-demand.js";
import type { CsharpAdmittedIteration } from "../../../target-model/records/selection.js";
import type { CsharpStatementExitRecords } from "../../../target-model/records/statement-exits.js";
import type { CsharpStatementCompletionRecords } from "../../../target-model/records/statement-completion.js";
import type { CsharpResourceScopeRecords } from "../../../target-model/records/resource-scopes.js";
import type { CsharpGeneratorRecords } from "../../../target-model/records/generators.js";
import type { CsharpDeclarationModifierRecords } from "../../../target-model/records/declaration-modifiers.js";
import type { CsharpNativeDeclarationRecords } from "../../../target-model/records/native-declaration-forms.js";
import type { CsharpStructuralInterfaceRecords } from "../../../target-model/records/structural-interfaces.js";
import type { CsharpLexicalValueRecords } from "../../../target-model/records/lexical-values.js";
import type { CsharpCallableParameterRecords } from "../../../target-model/records/parameter-emission.js";
import type { CsharpCallableDeclarationRecords } from "../../../target-model/records/callable-emission.js";
import type { CsharpNativeMemberNames } from "../../../target-model/names/model.js";
import { createCsharpNativeMemberHidingRecords } from "./native-member-names.js";
import type { CsharpMethodEmissionRecords } from "../../../target-model/records/method-emission.js";
import type { CsharpClassEmissionRecords } from "../../../target-model/records/class-emission.js";
import type { CsharpBindingIdentityRecords } from "../../../target-model/records/binding-identities.js";
import type { CsharpSourceFileRecords } from "../../../target-model/records/source-files.js";
import type { CsharpObjectShapeRecords } from "../../../target-model/records/object-shapes.js";
import type { CsharpObjectShapeEmissionRecords } from "../../../target-model/records/object-shape-emission.js";
import type { CsharpStructuralObjectEmissionRecords } from "../../../target-model/records/structural-object-emission.js";
import type { CsharpCompilationEmission } from "../../../target-model/records/compilation.js";
import type { CsharpSourceUnionEmissionRecords } from "../../../target-model/records/source-unions.js";
import { createCsharpCompilationRecords } from "./compilation.js";
import { createCsharpJsonObjectShapeRecords } from "./json-object-shapes.js";
import type { CsharpObjectMethodRecords } from "../../../target-model/records/object-methods.js";
import type { CsharpObjectMemberRecords } from "../../../target-model/records/object-members.js";
import type { CsharpObjectLiteralRecords } from "../../../target-model/records/object-literals.js";
import type { CsharpIndexedRecordRecords } from "../../../target-model/records/indexed-records.js";
import type { CsharpFrozenDataPropertyRecords } from "../../../target-model/records/frozen-data-properties.js";
import type { CsharpCaptureMethodRecords } from "../../../target-model/records/capture-methods.js";

export interface CsharpProgramRecordInput {
  readonly propertyValueProjection: import("../../../target-model/records/property-value-projection.js").CsharpPropertyValueProjectionRecords;
  readonly arrayLiterals: import("../../../target-model/records/array-literals.js").CsharpArrayLiteralRecords;
  readonly literalEmission: import("../../../target-model/records/literal-emission.js").CsharpLiteralEmissionRecords;
  readonly templateStrings: import("../../../target-model/records/template-strings.js").CsharpTemplateStringRecords;
  readonly sourceArtifacts: import("../../../target-model/records/artifacts.js").CsharpSourceArtifactRecords;
  readonly safetyEmission: import("../../../target-model/records/safety-emission.js").CsharpSafetyEmissionRecords;
  readonly startup: import("../../../target-model/records/startup.js").CsharpStartupRecords;
  readonly sourceFileEmission: import("../../../target-model/records/source-file-emission.js").CsharpSourceFileEmissionRecords;
  readonly projectEmission: import("../../../target-model/records/project-emission.js").CsharpProjectEmissionRecords;
  readonly typeParameterEmission: import("../../../target-model/records/type-parameters.js").CsharpTypeParameterEmissionRecords;
  readonly typeEmission: import("../../../target-model/records/type-emission.js").CsharpTypeEmissionRecords;
  readonly nativeLayouts: import("../../../target-model/records/native-layout-emission.js").CsharpNativeLayoutRecords;
  readonly unionEquality: import("../../../target-model/records/union-equality.js").CsharpUnionEqualityRecords;
  readonly captureMethods: CsharpCaptureMethodRecords;
  readonly frozenDataProperties: CsharpFrozenDataPropertyRecords;
  readonly indexedRecords: CsharpIndexedRecordRecords;
  readonly objectLiterals: CsharpObjectLiteralRecords;
  readonly objectMembers: CsharpObjectMemberRecords;
  readonly objectMethods: CsharpObjectMethodRecords;
  readonly bindingIdentities: CsharpBindingIdentityRecords;
  readonly sourceFiles: CsharpSourceFileRecords;
  readonly objectShapes: CsharpObjectShapeRecords;
  readonly objectShapeEmission: CsharpObjectShapeEmissionRecords;
  readonly structuralObjectEmission: CsharpStructuralObjectEmissionRecords;
  readonly compilation: CsharpCompilationEmission;
  readonly sourceUnions: CsharpSourceUnionEmissionRecords;
  readonly classEmission: CsharpClassEmissionRecords;
  readonly nativeMemberNames: CsharpNativeMemberNames;
  readonly methods: CsharpMethodEmissionRecords;
  readonly callableDeclarations: CsharpCallableDeclarationRecords;
  readonly callableParameters: CsharpCallableParameterRecords;
  readonly classFields: CsharpClassFieldInitializationRecords;
  readonly lexicalValues: CsharpLexicalValueRecords;
  readonly structuralInterfaces: CsharpStructuralInterfaceRecords;
  readonly nativeDeclarations: CsharpNativeDeclarationRecords;
  readonly declarationModifiers: CsharpDeclarationModifierRecords;
  readonly statementExits: CsharpStatementExitRecords;
  readonly statementCompletions: CsharpStatementCompletionRecords;
  readonly resourceScopes: CsharpResourceScopeRecords;
  readonly localBindings: Pick<CsharpProgramRecords, "localBinding">;
  readonly generators: CsharpGeneratorRecords;
  readonly objectShapeDemand: CsharpObjectShapeDemand;
  readonly nativeValueCarriers: CsharpNativeValueCarriers;
  readonly literalValues: import("@tsonic/target-api/source").SourceLiteralIndex;
  readonly nativeParticipation: CsharpNativeParticipationInput;
  readonly nativeDemand: CsharpNativeUseClassifications;
  readonly bindingPatterns: CsharpBindingPatternClassifications;
  readonly sourceEvidence: CsharpSourceEvidenceIndex;
  readonly flowReads: CsharpFlowReadClassifications;
  readonly valueReads: CsharpValueReadClassifications;
  readonly operations: CsharpTargetOperationClassifications<CsharpAdmittedIteration>;
  readonly expectedTypes: CsharpExpectedTypeClassifications;
  readonly declarations: CsharpDeclarationClassifications;
  readonly storage: CsharpStorageClassifications;
  readonly conversions: CsharpConversionClassifications;
  readonly exactLiterals: CsharpExactLiteralSelectionIndex;
  readonly classFactories: CsharpClassFactoryIndex;
  readonly classInitialization: CsharpClassInitializationIndex;
  readonly captureStorage: CsharpCaptureStorage;
  readonly callableCreations: CsharpCallableCreationIndex;
  readonly numericRepresentations: CsharpNumericRepresentations;
  readonly typeProjections: CsharpGenericProjectionIndex;
  readonly callableAdapters: CsharpProjectCallableAdapters;
  readonly attributeApplications: CsharpAttributeApplicationIndex;
  readonly safetyApplications: CsharpSafetyApplicationFactIndex;
  readonly sourceModuleConstructions: CsharpSourceModuleConstructionIndex;
  readonly moduleInitialization: CsharpModuleInitializationIndex;
}

export function createCsharpProgramRecords(
  input: CsharpProgramRecordInput,
  required: readonly CsharpRequiredRecord[],
): CsharpProgramRecords {
  const records: CsharpProgramRecords = Object.freeze({
    ...input.propertyValueProjection,
    ...input.arrayLiterals,
    ...input.literalEmission,
    ...input.templateStrings,
    ...input.sourceArtifacts,
    generatedHelpers: input.conversions.generatedHelpers,
    generatedHelper: input.conversions.generatedHelper,
    ...input.safetyEmission,
    ...input.startup,
    ...input.projectEmission,
    ...input.sourceFileEmission,
    ...input.typeParameterEmission,
    ...input.typeEmission,
    ...input.nativeLayouts,
    ...input.unionEquality,
    ...input.captureMethods,
    ...input.frozenDataProperties,
    ...input.indexedRecords,
    ...input.objectLiterals,
    ...input.objectMembers,
    ...input.objectMethods,
    ...input.bindingIdentities,
    ...input.sourceFiles,
    ...input.objectShapes,
    ...input.objectShapeEmission,
    ...createCsharpJsonObjectShapeRecords(input.objectShapeDemand),
    ...input.structuralObjectEmission,
    ...createCsharpCompilationRecords(input.compilation),
    ...input.sourceUnions,
    ...input.classEmission,
    ...input.callableParameters,
    ...input.callableDeclarations,
    nativeMemberHiding: createCsharpNativeMemberHidingRecords(input.nativeMemberNames),
    ...input.methods,
    ...input.classFields,
    ...input.lexicalValues,
    ...input.structuralInterfaces,
    ...input.nativeDeclarations,
    ...input.declarationModifiers,
    statementExit: input.statementExits.statementExit,
    ...input.statementCompletions,
    ...input.resourceScopes,
    ...input.localBindings,
    objectShapeArtifact: input.objectShapeDemand,
    nativeValueDeclaration: input.nativeValueCarriers.nativeValueDeclaration,
    literalValue: input.literalValues.literalValue,
    nativeParticipation: input.nativeParticipation.participation,
    nativeUse: Object.freeze({ get: input.nativeDemand.nativeUse.get }),
    nativeOrder: Object.freeze({ get: input.nativeDemand.nativeUse.order }),
    nativeExpression: Object.freeze({ get: input.nativeDemand.nativeUse.expression }),
    bindingPatternProjection: input.bindingPatterns.bindingPatternProjection,
    attributeApplication: input.attributeApplications.attributeApplication,
    callableDispatch: input.callableAdapters.callableDispatch,
    captureFrame: input.captureStorage.captureFrame,
    capturedBinding: input.captureStorage.capturedBinding,
    physicalStorageType: input.captureStorage.physicalStorageType,
    captureClosure: input.captureStorage.captureClosure,
    namedSelf: input.captureStorage.namedSelf,
    lambdaCreation: input.captureStorage.lambdaCreation,
    helperAccess: input.captureStorage.helperAccess,
    captureFrameShape: input.captureStorage.captureFrameShape,
    lexicalValueDeclarations: input.captureStorage.lexicalValueDeclarations,
    lexicalValueCreation: input.captureStorage.lexicalValueCreation,
    lexicalValueName: input.captureStorage.lexicalValueName,
    classFactory: input.classFactories.classFactory,
    requiresClassConstructor: input.classInitialization.requiresClassConstructor,
    relocatedClassField: input.classInitialization.relocatedClassField,
    classInitializationRegion: input.classInitialization.classInitializationRegion,
    propertyProjection: input.conversions.propertyProjection,
    delegateAdapters: input.conversions.delegateAdapters,
    delegateAdapter: input.conversions.delegateAdapter,
    directCallableReference: input.conversions.directCallableReference,
    conversion: input.conversions.conversion,
    expressionConversion: input.conversions.expressionConversion,
    exactLiteral: input.exactLiterals.exactLiteral,
    returnContract: input.declarations.returnContract,
    runtimeDefault: input.declarations.runtimeDefault,
    methodWrite: input.declarations.methodWrite,
    returnContext: input.expectedTypes.returnContext,
    callableTarget: input.callableCreations.callableTarget,
    moduleInitializationDependencies: input.moduleInitialization.moduleInitializationDependencies,
    requiresModuleInitializer: input.moduleInitialization.requiresModuleInitializer,
    asyncModuleInitializer: input.moduleInitialization.asyncModuleInitializer,
    callableVisibility: input.moduleInitialization.callableVisibility,
    moduleBindingInitialization: input.moduleInitialization.moduleBindingInitialization,
    int32Remainder: input.numericRepresentations.int32Remainder,
    awaitCompletion: input.operations.awaitCompletion,
    classPropertyStorage: input.operations.classPropertyStorage,
    borrowedSequence: input.operations.borrowedSequence,
    nativeGuardResult: input.operations.nativeGuardResult,
    nativeUnreachable: input.operations.nativeUnreachable,
    erasedStatement: input.operations.erasedStatement,
    nativeHandler: input.operations.nativeHandler,
    operatorForm: input.operations.operatorForm,
    operationResultType: input.operations.operationResultType,
    selectedCall: input.operations.selectedCall,
    selectedConstruction: input.operations.selectedConstruction,
    selectedProperty: input.operations.selectedProperty,
    sourceMember: input.operations.sourceMember,
    selectedElement: input.operations.selectedElement,
    binaryOperation: input.operations.binaryOperation,
    switchStatement: input.operations.switchStatement,
    unaryOperation: input.operations.unaryOperation,
    iteration: input.operations.iteration,
    resource: input.operations.resource,
    nativeRefReturn: input.operations.nativeRefReturn,
    jsCondition: input.operations.jsCondition,
    jsTypeof: input.operations.jsTypeof,
    typeofRuntimeKind: input.operations.typeofRuntimeKind,
    jsVoid: input.operations.jsVoid,
    jsObjectLiteral: input.operations.jsObjectLiteral,
    jsArrayMutation: input.operations.jsArrayMutation,
    elementDeletion: input.operations.elementDeletion,
    providerValue: input.operations.providerValue,
    regularExpression: input.operations.regularExpression,
    throwable: input.operations.throwable,
    throwValue: input.operations.throwValue,
    exactCatchRethrow: input.operations.exactCatchRethrow,
    sourceSafetyApplication: input.safetyApplications.sourceSafetyApplication,
    safetyApplication: input.safetyApplications.safetyApplication,
    safetyOperation: input.safetyApplications.safetyOperation,
    bindingProjection: input.sourceEvidence.bindingProjection,
    flowReadProjection: input.flowReads.flowReadProjection,
    valueRead: input.valueReads.valueRead,
    compileTimeMetadata: input.sourceEvidence.compileTimeMetadata,
    nodeTargetType: input.sourceEvidence.nodeTargetType,
    classConstructorType: input.sourceEvidence.classConstructorType,
    storageTargetType: input.sourceEvidence.storageTargetType,
    readStorageTargetType: input.sourceEvidence.readStorageTargetType,
    expressionType: input.sourceEvidence.expressionType,
    contextualType: input.sourceEvidence.contextualType,
    contextualTargetType: input.sourceEvidence.contextualTargetType,
    semanticTargetType: input.sourceEvidence.semanticTargetType,
    semanticType: input.sourceEvidence.semanticType,
    signatureDeclaration: input.sourceEvidence.signatureDeclaration,
    contextualTuple: input.sourceEvidence.contextualTuple,
    constantValue: input.sourceEvidence.constantValue,
    valueRefinement: input.sourceEvidence.valueRefinement,
    ...input.generators,
    wellKnownSymbol: input.sourceEvidence.wellKnownSymbol,
    inferredCallableReturnType: input.sourceEvidence.inferredCallableReturnType,
    pointerReturn: input.sourceEvidence.pointerReturn,
    sourceArgument: input.sourceEvidence.sourceArgument,
    sourceDefaultValue: input.sourceEvidence.sourceDefaultValue,
    sourceField: input.sourceEvidence.sourceField,
    sourceStruct: input.sourceEvidence.sourceStruct,
    providerVirtualDeclaration: input.sourceEvidence.providerVirtualDeclaration,
    typeParameterConstraints: input.sourceEvidence.typeParameterConstraints,
    sourceOwnedProjectShape: input.sourceEvidence.sourceOwnedProjectShape,
    sourceModuleConstruction: input.sourceModuleConstructions.sourceModuleConstruction,
    nativeModuleField: input.storage.nativeModuleField,
    nativeLocation: input.storage.nativeLocation,
    nativeArray: input.storage.nativeArray,
    nativeField: input.storage.nativeField,
    nativeBacking: input.storage.nativeBacking,
    storageType: input.storage.storageType,
    requiredStorageType: input.storage.requiredStorageType,
    lambdaParameterType: input.storage.lambdaParameterType,
    typedLocationIdentity: input.storage.typedLocationIdentity,
    genericProjection: input.typeProjections.genericProjection,
    outerGenericProjection: input.typeProjections.outerGenericProjection,
  });
  assertCsharpRequiredRecords(records, required);
  return records;
}
