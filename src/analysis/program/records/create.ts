import type { CsharpAttributeApplicationIndex } from "../../../target-model/records/attributes.js";
import type { CsharpProjectCallableAdapters } from "../../../target-model/records/callable-adapters.js";
import type { CsharpCaptureStorage } from "../../../target-model/records/capture-storage.js";
import type { CsharpClassFactoryIndex } from "../../../target-model/records/class-factories.js";
import type { CsharpClassInitializationIndex } from "../../../target-model/records/class-initialization.js";
import type { CsharpConversionClassifications } from "../../../target-model/records/conversions.js";
import type { CsharpDeclarationClassifications } from "../../../target-model/records/declarations.js";
import type { CsharpExpectedTypeClassifications } from "../../../target-model/records/expected-types.js";
import type { CsharpModuleInitializationIndex } from "../../../target-model/records/module-initialization.js";
import type { CsharpNumericRepresentations } from "../../../target-model/records/numeric.js";
import type { CsharpTargetOperationClassifications } from "../../../target-model/records/operations.js";
import type { CsharpSafetyApplicationFactIndex } from "../../../target-model/records/safety.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/source-evidence.js";
import type { CsharpSourceModuleConstructionIndex } from "../../../target-model/records/source-modules.js";
import type { CsharpStorageClassifications } from "../../../target-model/records/storage.js";
import type { CsharpGenericProjectionIndex } from "../../../target-model/records/type-projections.js";
import type { CsharpProgramRecords } from "../../../target-model/records/program.js";

export interface CsharpProgramRecordInput {
  readonly sourceEvidence: CsharpSourceEvidenceIndex;
  readonly operations: CsharpTargetOperationClassifications;
  readonly expectedTypes: CsharpExpectedTypeClassifications;
  readonly declarations: CsharpDeclarationClassifications;
  readonly storage: CsharpStorageClassifications;
  readonly conversions: CsharpConversionClassifications;
  readonly classFactories: CsharpClassFactoryIndex;
  readonly classInitialization: CsharpClassInitializationIndex;
  readonly captureStorage: CsharpCaptureStorage;
  readonly numericRepresentations: CsharpNumericRepresentations;
  readonly typeProjections: CsharpGenericProjectionIndex;
  readonly callableAdapters: CsharpProjectCallableAdapters;
  readonly attributeApplications: CsharpAttributeApplicationIndex;
  readonly safetyApplications: CsharpSafetyApplicationFactIndex;
  readonly sourceModuleConstructions: CsharpSourceModuleConstructionIndex;
  readonly moduleInitialization: CsharpModuleInitializationIndex;
}

export function createCsharpProgramRecords(input: CsharpProgramRecordInput): CsharpProgramRecords {
  return Object.freeze({
    attributeApplication: input.attributeApplications.attributeApplication,
    erasedAttribute: input.attributeApplications.erasedAttribute,
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
    returnContract: input.declarations.returnContract,
    runtimeDefault: input.declarations.runtimeDefault,
    methodWrite: input.declarations.methodWrite,
    expectedType: input.expectedTypes.expectedType,
    requiredExpectedType: input.expectedTypes.requiredExpectedType,
    exactIntegerConversion: input.expectedTypes.exactIntegerConversion,
    storageExpectedType: input.expectedTypes.storageExpectedType,
    callableTarget: input.expectedTypes.callableTarget,
    arrayLiteralCarrier: input.expectedTypes.arrayLiteralCarrier,
    expectedBinary: input.expectedTypes.expectedBinary,
    moduleInitializationDependencies: input.moduleInitialization.moduleInitializationDependencies,
    requiresModuleInitializer: input.moduleInitialization.requiresModuleInitializer,
    asyncModuleInitializer: input.moduleInitialization.asyncModuleInitializer,
    callableVisibility: input.moduleInitialization.callableVisibility,
    int32Remainder: input.numericRepresentations.int32Remainder,
    awaitCompletion: input.operations.awaitCompletion,
    classPropertyStorage: input.operations.classPropertyStorage,
    borrowedSequence: input.operations.borrowedSequence,
    nativeGuardResult: input.operations.nativeGuardResult,
    nativeUnreachable: input.operations.nativeUnreachable,
    memoryBinding: input.operations.memoryBinding,
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
    nativePointer: input.operations.nativePointer,
    typedLocation: input.operations.typedLocation,
    nativeRefReturn: input.operations.nativeRefReturn,
    jsCondition: input.operations.jsCondition,
    jsTypeof: input.operations.jsTypeof,
    typeofRuntimeKind: input.operations.typeofRuntimeKind,
    jsVoid: input.operations.jsVoid,
    jsObjectLiteral: input.operations.jsObjectLiteral,
    jsArrayMutation: input.operations.jsArrayMutation,
    elementDeletion: input.operations.elementDeletion,
    jsStringConversion: input.operations.jsStringConversion,
    providerValue: input.operations.providerValue,
    regularExpression: input.operations.regularExpression,
    throwable: input.operations.throwable,
    throwValue: input.operations.throwValue,
    exactCatchRethrow: input.operations.exactCatchRethrow,
    sourceSafetyApplication: input.safetyApplications.sourceSafetyApplication,
    safetyApplication: input.safetyApplications.safetyApplication,
    safetyOperation: input.safetyApplications.safetyOperation,
    bindingProjection: input.sourceEvidence.bindingProjection,
    closedArrayStorage: input.sourceEvidence.closedArrayStorage,
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
    generator: input.sourceEvidence.generator,
    generatorTargetType: input.sourceEvidence.generatorTargetType,
    yield: input.sourceEvidence.yield,
    yieldTargetType: input.sourceEvidence.yieldTargetType,
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
}
