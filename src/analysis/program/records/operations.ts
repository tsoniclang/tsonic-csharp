import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications, CsharpOperationIssue, CsharpOperatorFormClassification } from "../../../target-model/records/operations.js";
import type { CsharpMemoryBindingSelection } from "../../../target-model/records/memory-bindings.js";
import type { CsharpJsStringConversionSelection } from "../../../target-model/records/explicit-js-string.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTargetBinaryExecutionDriver } from "../../../target-model/metadata/provider-metadata.js";

export function createCsharpOperationProducer() {
  let closed = false;
  const resultSubjects = new Set<Node>();
  const family = <Value>(name: string, result = false) => {
    const values = new WeakMap<Node, Value>();
    return Object.freeze({ get: (node: Node) => values.get(node),
      selected(node: Node, value: Value | undefined): void {
        if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Operation records cannot change after sealing.", node);
        if (value === undefined) return;
        if (values.has(node)) failTargetAnalysisInvariant("tsonic-csharp", `Operation '${name}' has one pre-seal producer.`, node);
        values.set(node, Object.freeze(value));
        if (result) resultSubjects.add(node);
      },
    });
  };
  const call = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["selectedCall"]["get"]>>>("call", true);
  const awaitCompletion = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["awaitCompletion"]["get"]>>>("await");
  const elementDeletion = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["elementDeletion"]["get"]>>>("elementDeletion");
  const construction = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["selectedConstruction"]["get"]>>>("construction", true);
  const property = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["selectedProperty"]["get"]>>>("property", true);
  const element = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["selectedElement"]["get"]>>>("element", true);
  const binary = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["binaryOperation"]["get"]>>>("binary", true);
  const unary = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["unaryOperation"]["get"]>>>("unary", true);
  const iteration = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["iteration"]["get"]>>>("iteration");
  const resource = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["resource"]["get"]>>>("resource");
  const nativePointer = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["nativePointer"]["get"]>>>("nativePointer");
  const typedLocation = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["typedLocation"]["get"]>>>("typedLocation");
  const nativeRefReturn = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["nativeRefReturn"]["get"]>>>("nativeRefReturn");
  const jsCondition = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["jsCondition"]["get"]>>>("jsCondition");
  const jsTypeof = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["jsTypeof"]["get"]>>>("jsTypeof");
  const typeofRuntimeKind = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["typeofRuntimeKind"]["get"]>>>("typeofRuntimeKind");
  const jsVoid = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["jsVoid"]["get"]>>>("jsVoid");
  const jsObjectLiteral = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["jsObjectLiteral"]["get"]>>>("jsObjectLiteral");
  const jsArrayMutation = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["jsArrayMutation"]["get"]>>>("jsArrayMutation", true);
  const switchStatement = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["switchStatement"]["get"]>>>("switch");
  const providerValue = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["providerValue"]["get"]>>>("providerValue");
  const regularExpression = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["regularExpression"]["get"]>>>("regularExpression");
  const throwable = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["throwable"]["get"]>>>("throwable");
  const throwValue = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["throwValue"]["get"]>>>("throwValue");
  const exactCatchRethrow = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["exactCatchRethrow"]["get"]>>>("exactCatchRethrow");
  const nativeGuardResult = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["nativeGuardResult"]["get"]>>>("nativeGuardResult");
  const nativeUnreachable = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["nativeUnreachable"]["get"]>>>("nativeUnreachable");
  const erasedStatement = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["erasedStatement"]["get"]>>>("erasedStatement");
  const borrowedSequence = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["borrowedSequence"]["get"]>>>("borrowedSequence");
  const memoryBinding = family<CsharpMemoryBindingSelection>("memoryBinding", true);
  const jsStringConversion = family<CsharpJsStringConversionSelection>("jsStringConversion");
  const operatorForm = family<CsharpOperatorFormClassification>("operatorForm");
  const operationResult = family<TargetTypeRef>("operationResult");
  const sourceMember = family<NonNullable<ReturnType<CsharpTargetOperationClassifications["sourceMember"]["get"]>>>("sourceMember");
  return Object.freeze({ resultSubjects,
    call: call,
    await: awaitCompletion,
    elementDeletion: elementDeletion,
    construction: construction,
    property: property,
    element: element,
    binary: binary,
    unary: unary,
    iteration: iteration,
    resource: resource,
    nativePointer: nativePointer,
    typedLocation: typedLocation,
    nativeRefReturn: nativeRefReturn,
    jsCondition: jsCondition,
    jsTypeof: jsTypeof,
    typeofRuntimeKind: typeofRuntimeKind,
    jsVoid: jsVoid,
    jsObjectLiteral: jsObjectLiteral,
    jsArrayMutation: jsArrayMutation,
    switch: switchStatement,
    providerValue: providerValue,
    regularExpression: regularExpression,
    throwable: throwable,
    throwValue: throwValue,
    exactCatchRethrow: exactCatchRethrow,
    nativeGuardResult: nativeGuardResult,
    nativeUnreachable: nativeUnreachable,
    erasedStatement: erasedStatement,
    borrowedSequence: borrowedSequence,
    memoryBinding: memoryBinding,
    jsStringConversion: jsStringConversion,
    operatorForm: operatorForm,
    operationResult: operationResult,
    sourceMember: sourceMember,
    seal(input: {
      readonly issues: readonly CsharpOperationIssue[];
      readonly classPropertyStorage: CsharpTargetOperationClassifications["classPropertyStorage"]["get"];
      readonly nativeHandler: CsharpTargetOperationClassifications["nativeHandler"];
      readonly binaryExecutionDriver: CsharpTargetBinaryExecutionDriver | undefined;
    }): CsharpTargetOperationClassifications {
      if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Operation records seal exactly once.");
      closed = true;
      return Object.freeze({ issues: Object.freeze([...input.issues]),
        classPropertyStorage: Object.freeze({ get: input.classPropertyStorage }), nativeHandler: input.nativeHandler,
        binaryExecutionDriver: () => input.binaryExecutionDriver,
        operationResultType: Object.freeze({ get: operationResult.get }), sourceMember: Object.freeze({ get: sourceMember.get }),
        operatorForm: Object.freeze({ get: (node: Node) => operatorForm.get(node)?.form,
          usesExpectedResultType: (node: Node) => operatorForm.get(node)?.usesExpectedResultType }),
        selectedCall: Object.freeze({ get: call.get }),
        awaitCompletion: Object.freeze({ get: awaitCompletion.get }),
        elementDeletion: Object.freeze({ get: elementDeletion.get }),
        selectedConstruction: Object.freeze({ get: construction.get }),
        selectedProperty: Object.freeze({ get: property.get }),
        selectedElement: Object.freeze({ get: element.get }),
        binaryOperation: Object.freeze({ get: binary.get }),
        unaryOperation: Object.freeze({ get: unary.get }),
        iteration: Object.freeze({ get: iteration.get }),
        resource: Object.freeze({ get: resource.get }),
        nativePointer: Object.freeze({ get: nativePointer.get }),
        typedLocation: Object.freeze({ get: typedLocation.get }),
        nativeRefReturn: Object.freeze({ get: nativeRefReturn.get }),
        jsCondition: Object.freeze({ get: jsCondition.get }),
        jsTypeof: Object.freeze({ get: jsTypeof.get }),
        typeofRuntimeKind: Object.freeze({ get: typeofRuntimeKind.get }),
        jsVoid: Object.freeze({ get: jsVoid.get }),
        jsObjectLiteral: Object.freeze({ get: jsObjectLiteral.get }),
        jsArrayMutation: Object.freeze({ get: jsArrayMutation.get }),
        switchStatement: Object.freeze({ get: switchStatement.get }),
        providerValue: Object.freeze({ get: providerValue.get }),
        regularExpression: Object.freeze({ get: regularExpression.get }),
        throwable: Object.freeze({ get: throwable.get }),
        throwValue: Object.freeze({ get: throwValue.get }),
        exactCatchRethrow: Object.freeze({ get: (node: Node) => exactCatchRethrow.get(node) === true }),
        nativeGuardResult: Object.freeze({ get: nativeGuardResult.get }),
        nativeUnreachable: Object.freeze({ get: (node: Node) => nativeUnreachable.get(node) === true }),
        erasedStatement: Object.freeze({ get: (node: Node) => erasedStatement.get(node) === true }),
        borrowedSequence: Object.freeze({ get: borrowedSequence.get }),
      });
    },
  });
}

export type CsharpOperationProducer = ReturnType<typeof createCsharpOperationProducer>;
