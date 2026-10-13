import type { CsharpCaptureFrame, CsharpCaptureStorage, CsharpCapturedBinding, CsharpLambdaCreation } from "../../target-model/records/capture-storage.js";
import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { sourceCallableDefinitionIsDiscarded, sourceBindingScope, sourceBindingHasSingleCaptureOwner, sourceNodeIdentity, sourceBindingCapturedBeforeInitialization,
  sourceLexicalFunctionValueCreation, sourceLexicalFunctionValueOrder } from "@tsonic/target-api/source";
import { sourceClosedCallableArguments, sourceExpressionCallArgument } from "@tsonic/target-api/source";
import type { SourceLexicalValueCreation } from "@tsonic/target-api/source";
import { createHash } from "node:crypto";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpObjectShapeClassifications } from "../objects/model.js";
import type { CsharpStorageClassifications, CsharpStorageIssue } from "../../target-model/records/storage.js";
import { createStructuralObjectShapeTarget } from "../../policy/types/objects/object-shape-policy/construction.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeNativeArrayTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import { selectCsharpFrameClosures } from "./capture-closures.js";
import { type CsharpFrameClosure } from "../../target-model/records/capture-storage.js";
import { csharpTargetNamedType } from "../../target-model/types/factories.js";
import { selectCsharpGenericFrameClosures } from "./generic-closures.js";
import { getCsharpMethodValue, csharpObjectShapeMethodDeclaration } from "../../target-model/types/method-values.js";
import type { CsharpSourceNameResolver } from "../names/source-names.js";
import { createCsharpTypeParameterEnvironment } from "../../policy/constraints/type-parameter-environment.js";

import { csharpCapturedMemberAccess } from "./captured-member-access.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/expected-types.js";
import { getCsharpExpressionTreeDelegateType } from "../../target-model/types/carriers/delegates.js";
import { HasSyntacticModifier, ModifierFlagsAsync } from "@tsonic/target-api/source";

const unknownLambdaCreation: CsharpLambdaCreation = Object.freeze({ kind: "fresh", staticBody: false });

export function analyzeCsharpCaptureStorage(
  source: TargetSourceProgram,
  shapes: CsharpObjectShapeClassifications,
  storage: CsharpStorageClassifications,
  evidence: CsharpSourceEvidenceIndex,
  classCaptures: readonly import("../../target-model/records/class-factories.js").CsharpClassCapture[],
  names: CsharpSourceNameResolver,
  declarations: CsharpDeclarationClassifications,
  operations: CsharpTargetOperationClassifications,
  expectedTypes: Pick<CsharpExpectedTypeClassifications, "callableTarget">,
): CsharpCaptureStorage {
  const environment = createCsharpTypeParameterEnvironment(source.ast, declaration => evidence.typeParameterConstraints.get(declaration));
  const groups = new Map<Node, Map<Node, TargetTypeRef>>();
  const issues: CsharpStorageIssue[] = [];
  const physicalType = (declaration: Node, logicalType: TargetTypeRef): TargetTypeRef => {
    const backing = storage.nativeBacking.get(declaration);
    if (backing !== undefined) return csharpRuntimeLocationTargetType(backing.pointeeType);
    const array = storage.nativeArray.get(declaration);
    return array === undefined ? storage.storageType.get(declaration) ?? logicalType : csharpRuntimeNativeArrayTargetType(array.layout.pointeeType);
  };
  for (const shape of shapes.knownShapes()) {
    for (const capture of (shape.declarationTemplate ?? shape).methodImplementation?.captures ?? []) {
      if (!capture.mutable || storage.nativeBacking.get(capture.declaration) !== undefined) continue;
      if (!shapes.methodImplementationHasCopies(shape) && hasSingleCaptureOwner(source, capture.declaration, shape.declarationTemplate ?? shape)) continue;
      const scope = sourceBindingScope(capture.declaration, source.ast);
      if (scope === undefined || source.ast.is.IsSourceFile(scope)) {
        issues.push({ node: capture.declaration, code: "CSHARP_CAPTURE_SCOPE_NOT_CLOSED",
          message: "A captured binding requires its exact retained lexical activation scope." });
        continue;
      }
      const bindings = groups.get(scope) ?? new Map<Node, TargetTypeRef>();
      const type = physicalType(capture.declaration, capture.type);
      const existing = bindings.get(capture.declaration);
      if (existing !== undefined && !targetTypeRefEquals(existing, type)) {
        issues.push({ node: capture.declaration, code: "CSHARP_CAPTURE_STORAGE_CONFLICT",
          message: "One captured binding cannot have incompatible physical storage contracts." });
      }
      bindings.set(capture.declaration, type);
      groups.set(scope, bindings);
    }
  }
  for (const capture of classCaptures) {
    if (!capture.mutable || storage.nativeBacking.get(capture.declaration) !== undefined) continue;
    const scope = sourceBindingScope(capture.declaration, source.ast);
    if (scope === undefined || source.ast.is.IsSourceFile(scope)) {
      issues.push({ node: capture.declaration, code: "CSHARP_CAPTURE_SCOPE_NOT_CLOSED",
        message: "A mutable class capture requires its exact lexical activation scope." });
      continue;
    }
    const bindings = groups.get(scope) ?? new Map<Node, TargetTypeRef>();
    const type = physicalType(capture.declaration, capture.type);
    const existing = bindings.get(capture.declaration);
    if (existing !== undefined && !targetTypeRefEquals(existing, type)) {
      issues.push({ node: capture.declaration, code: "CSHARP_CAPTURE_STORAGE_CONFLICT",
        message: "One class capture cannot have incompatible native storage contracts." });
    }
    bindings.set(capture.declaration, type);
    groups.set(scope, bindings);
  }
  const genericClosures = selectCsharpGenericFrameClosures(source, evidence, groups, physicalType, issues);
  const genericDeclarations = new Set(genericClosures.map(closure => closure.declaration));
  const frameClosures = selectCsharpFrameClosures(source, evidence, groups, physicalType, issues, genericDeclarations,
    { declarations, storage, expectedTypes });
  const namedSelfBindings = new Map(frameClosures.namedSelfBindings.map(binding => [binding.declaration, binding]));
  const captureFreeDeclarations = new Set(frameClosures.captureFreeDeclarations);
  const lambdaCreations = new Map<Node, CsharpLambdaCreation>();
  const closures = [...frameClosures.closures,
    ...genericClosures.filter(closure => closure.scope !== closure.declaration)];
  const byScope = new Map<Node, CsharpCaptureFrame>();
  const byBinding = new Map<Node, CsharpCapturedBinding>();
  const byClosure = new Map<Node, { readonly frame: CsharpCaptureFrame; readonly method: CsharpFrameClosure }>();
  const byShape = new Map<string, CsharpCaptureFrame>();
  const buildFrame = (scope: Node): CsharpCaptureFrame => {
    const previous = byScope.get(scope);
    if (previous !== undefined) return previous;
    const group = groups.get(scope)!;
    const methods = Object.freeze(closures.filter(closure => closure.scope === scope));
    const parentScopes = new Set(methods.flatMap(method => method.captures.flatMap(declaration => {
      const parentScope = sourceBindingScope(declaration, source.ast);
      return parentScope === undefined || parentScope === scope ? [] : [parentScope];
    })));
    const parents = Object.freeze([...parentScopes].map((parent, index) => Object.freeze({ frame: buildFrame(parent), fieldName: `parent${index}` })));
    const receiverMap = new Map<Node, CsharpFrameClosure["receivers"][number]>();
    for (const method of methods) for (const receiver of method.receivers) {
      const previous = receiverMap.get(receiver.owner);
      receiverMap.set(receiver.owner, { ...receiver, references: Object.freeze([
        ...new Set([...(previous?.references ?? []), ...receiver.references]),
      ]) });
    }
    const receivers = Object.freeze([...receiverMap.values()].map((receiver, index) => Object.freeze({ ...receiver, fieldName: `receiver${index}` })));
    const bindings = Object.freeze([...group].map(([declaration, type], index) => Object.freeze({
      declaration, type, fieldName: `value${index}`,
      ...(sourceBindingCapturedBeforeInitialization(declaration, source.ast, source.navigation) ? { initialization: "deferred" as const } : {}),
    })));
    const fields = [...bindings, ...parents.map(parent => ({ fieldName: parent.fieldName, type: parent.frame.shape.targetType })), ...receivers];
    const members: readonly CsharpObjectShapeMemberFact[] = Object.freeze(fields.map(field => Object.freeze({
      sourceKey: { kind: "property" as const, name: field.fieldName }, sourceName: field.fieldName,
      targetName: field.fieldName, type: field.type, memberKind: "property" as const,
    })));
    const implementations = Object.freeze(methods.flatMap(method => {
      const protocol = getCsharpMethodValue(method.type);
      return protocol === undefined ? [] : [protocol.owner];
    }));
    const selectedType = createStructuralObjectShapeTarget(members, implementations, environment);
    const identity = sourceNodeIdentity(source.ast, scope);
    if (identity === undefined || selectedType.kind !== "target-named") throw new Error("A native capture frame requires an exact named source identity.");
    const digest = createHash("sha256").update(identity).digest("hex");
    const type = csharpTargetNamedType(`tsonic.shape:capture_${digest}`, selectedType.typeArguments,
      { kind: "named", name: `__TsonicCapture_${digest}` });
    const frame: CsharpCaptureFrame = Object.freeze({ scope, ownership: "activation", bindings, parents, methods, receivers, shape: Object.freeze({
      targetType: type, members,
      implements: implementations,
    }) });
    byScope.set(scope, frame);
    byShape.set(targetTypeRefKey(type), frame);
    for (const binding of bindings) byBinding.set(binding.declaration, Object.freeze({ frame, fieldName: binding.fieldName }));
    for (const method of methods) byClosure.set(method.declaration, Object.freeze({ frame, method }));
    return frame;
  };
  for (const scope of groups.keys()) buildFrame(scope);
  const valueFrames: CsharpCaptureFrame[] = [];
  const valueMethods = genericClosures.filter(method => method.scope === method.declaration);
  for (const method of valueMethods) {
    const captured = method.captures.map(declaration => {
      const type = evidence.storageTargetType.get(declaration) ?? evidence.nodeTargetType.get(declaration);
      return type === undefined ? undefined : { declaration, type: physicalType(declaration, type), shared: byBinding.get(declaration) };
    });
    const contract = getCsharpMethodValue(method.type)?.owner;
    const identity = sourceNodeIdentity(source.ast, method.declaration);
    if (contract === undefined || identity === undefined || captured.some(binding => binding === undefined)) {
      issues.push({ node: method.declaration, code: "CSHARP_GENERIC_CALLABLE_OWNER_NOT_CLOSED",
        message: "A generic callable value requires its exact invocation protocol and captured owner fields." });
      continue;
    }
    const bindings = Object.freeze(captured.filter(binding => binding!.shared === undefined).map((binding, index) =>
      Object.freeze({ declaration: binding!.declaration, type: binding!.type, fieldName: `value${index}` })));
    const parents = Object.freeze([...new Set(captured.flatMap(binding => binding!.shared === undefined ? [] : [binding!.shared.frame]))]
      .map((frame, index) => Object.freeze({ frame, fieldName: `parent${index}` })));
    const receivers = Object.freeze(method.receivers.map((receiver, index) => Object.freeze({ ...receiver, fieldName: `receiver${index}` })));
    const fields = [...bindings, ...parents.map(parent => ({ fieldName: parent.fieldName, type: parent.frame.shape.targetType })), ...receivers];
    const members: readonly CsharpObjectShapeMemberFact[] = Object.freeze(fields.map(field => Object.freeze({
      sourceKey: { kind: "property" as const, name: field.fieldName }, sourceName: field.fieldName,
      targetName: field.fieldName, type: field.type, memberKind: "property" as const,
    })));
    const selectedType = createStructuralObjectShapeTarget(members, [contract], environment);
    const digest = createHash("sha256").update(identity).digest("hex");
    const type = csharpTargetNamedType(`tsonic.shape:callable_${digest}`, selectedType.kind === "target-named" ? selectedType.typeArguments : undefined,
      { kind: "named", name: `__TsonicCallable_${digest}` }, { typeofRuntimeKind: "function" });
    const frame: CsharpCaptureFrame = Object.freeze({ scope: method.declaration, ownership: "value", bindings, parents, methods: Object.freeze([method]), receivers,
      shape: Object.freeze({ targetType: type, members, implements: Object.freeze([contract]) }),
    });
    byClosure.set(method.declaration, Object.freeze({ frame, method }));
    byShape.set(targetTypeRefKey(type), frame);
    valueFrames.push(frame);
  }
  const valueDeclarations = new Map<Node, Node[]>();
  const valueCreations = new Map<Node, SourceLexicalValueCreation>();
  const valueNames = new Map<Node, string>();
  const visitValues = (node: Node): void => {
    if (evidence.compileTimeMetadata.get(node)) return;
    if (source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node)) {
      if (sourceCallableDefinitionIsDiscarded(node, source.ast)) {
        lambdaCreations.set(node, Object.freeze({ kind: "discarded", staticBody: true }));
        return;
      }
      if (getCsharpExpressionTreeDelegateType(expectedTypes.callableTarget.get(node)) !== undefined) {
        if (HasSyntacticModifier(source.ast, node, ModifierFlagsAsync)) {
          issues.push({ node, code: "CSHARP_EXPRESSION_TREE_ASYNC_UNSUPPORTED",
            message: "A native expression-tree quotation cannot contain an asynchronous lambda." });
        }
        lambdaCreations.set(node, Object.freeze({ kind: "quotation", staticBody: false }));
      } else {
        const flow = source.navigation.expressionValueFlow(node);
        const invocationOnly = flow.passedAsArgument && hasOnlyInvocationArguments(node, source, operations);
        const selfIdentityObserved = (namedSelfBindings.get(node)?.values.length ?? 0) > 0;
        const fresh = flow.identityCompared || flow.captured || flow.returned || flow.yielded ||
          flow.storedOutsideBinding || flow.exported || flow.hasUnclassifiedUse || flow.memberWritten ||
          flow.receiverUsed || flow.passedAsArgument && !invocationOnly || selfIdentityObserved;
        const staticBody = captureFreeDeclarations.has(node) && !selfIdentityObserved;
        const directlyInvoked = !fresh && flow.aliasDeclarations.length === 0 && flow.uses.length > 0 &&
          flow.uses.every(use => use.kind === "direct-call" && use.role === "call-target");
        const creation: CsharpLambdaCreation = fresh ? { kind: "fresh", staticBody }
          : directlyInvoked ? { kind: "direct", staticBody }
          : invocationOnly && staticBody ? { kind: "cached", staticBody: true } : { kind: "inline", staticBody };
        lambdaCreations.set(node, Object.freeze(creation));
      }
    }
    if (source.ast.is.IsFunctionDeclaration(node) && source.ast.body(node) !== undefined &&
      !evidence.compileTimeMetadata.get(node)) {
      const quantifiedUse = source.ast.typeParameters(node).length === 0 ? undefined
        : source.navigation.declarationUseSummary(node).uses.find(use => use.kind === "first-class" &&
          !evidence.compileTimeMetadata.get(use.reference) &&
          (getCsharpMethodValue(evidence.nodeTargetType.get(use.reference))?.typeParameters.length ?? 0) > 0);
      if (quantifiedUse !== undefined) {
        issues.push({ node: quantifiedUse.reference, code: "CSHARP_QUANTIFIED_NAMED_CALLABLE_NOT_SUPPORTED",
          message: "A named quantified function has no supported native callable-value owner." });
      }
      if (source.ast.is.IsSourceFile(source.ast.parent(node))) {
        source.ast.forEachChild(node, child => { if (child !== undefined) visitValues(child); });
        return;
      }
      const creation = sourceLexicalFunctionValueCreation(node, source.ast, source.navigation,
        use => !evidence.compileTimeMetadata.get(use.reference));
      valueCreations.set(node, creation);
      if (creation.kind === "unresolved") issues.push({ node, code: "CSHARP_LEXICAL_VALUE_ACTIVATION_NOT_CLOSED", message: creation.reason });
      if (creation.kind === "resolved") {
        if (creation.inlineReference === undefined) {
          const selectedName = names.resolve(source.ast.name(node), node);
          if (selectedName.kind !== "resolved") {
            issues.push({ node, code: "CSHARP_LEXICAL_VALUE_ACTIVATION_NOT_CLOSED",
              message: "A lexical function value requires an exact stable declaration identity." });
          } else valueNames.set(node, names.temporaryName(`${selectedName.name}Callable`));
        }
        const values = valueDeclarations.get(creation.statement) ?? [];
        values.push(node);
        valueDeclarations.set(creation.statement, values);
      }
    }
    source.ast.forEachChild(node, child => { if (child !== undefined) visitValues(child); });
  };
  source.navigation.sourceFiles.forEach(visitValues);
  const empty: readonly Node[] = Object.freeze([]);
  const scheduledValues = new Map<Node, readonly Node[]>();
  for (const [statement, values] of valueDeclarations) {
    const ordered = sourceLexicalFunctionValueOrder(values, source.ast, source.navigation,
      use => !evidence.compileTimeMetadata.get(use.reference));
    if (ordered.kind === "resolved") scheduledValues.set(statement, ordered.declarations);
    else issues.push({ node: statement, code: "CSHARP_LEXICAL_VALUE_ACTIVATION_NOT_CLOSED", message: ordered.reason });
  }
  const frames = Object.freeze([...byScope.values(), ...valueFrames]);
  const helperMembers = csharpCapturedMemberAccess(source, frames);
  return Object.freeze({ issues: Object.freeze(issues), frames,
    captureFrame: Object.freeze({ get: (scope: Node) => byScope.get(scope) }), capturedBinding: Object.freeze({ get: (declaration: Node) => byBinding.get(declaration) }), physicalStorageType: Object.freeze({ get: physicalType }),
    captureClosure: Object.freeze({ get: (declaration: Node) => byClosure.get(declaration) }), captureFrameShape: Object.freeze({ get: (type: TargetTypeRef) => byShape.get(targetTypeRefKey(type)) }),
    namedSelf: Object.freeze({ get: (declaration: Node) => namedSelfBindings.get(declaration) }),
    lambdaCreation: Object.freeze({ get: (declaration: Node) => lambdaCreations.get(declaration) ?? unknownLambdaCreation }),
    helperAccess: Object.freeze({ get: (declaration: Node) => helperMembers.has(declaration) }),
    lexicalValueDeclarations: Object.freeze({ get: (statement: Node) => scheduledValues.get(statement) ?? empty }),
    lexicalValueCreation: Object.freeze({ get: (declaration: Node) => valueCreations.get(declaration) }),
    lexicalValueName: Object.freeze({ get: (declaration: Node) => valueNames.get(declaration) }),
  });
}

function hasOnlyInvocationArguments(
  expression: Node,
  source: TargetSourceProgram,
  operations: CsharpTargetOperationClassifications,
): boolean {
  const flow = source.navigation.expressionValueFlow(expression);
  let arguments_ = sourceClosedCallableArguments(expression, source);
  if (arguments_ === undefined && flow.aliasDeclarations.length === 0 && flow.uses.length === 1) {
    const use = flow.uses[0]!;
    if (use.role !== "argument" || use.throughMember) return false;
    const argument = sourceExpressionCallArgument(use.reference, source);
    if (argument === undefined) return false;
    arguments_ = [argument];
  }
  return arguments_ !== undefined && arguments_.every(argument => {
    const selected = operations.selectedCall.get(argument.call)?.target;
    if (selected?.kind !== "resolved" || selected.call.origin !== "source-profile" ||
      !selected.call.invocationOnlyCallableArgumentIndexes?.includes(argument.argumentIndex)) return false;
    const bindings = selected.call.arguments.filter(binding => binding.sourceArgumentIndex === argument.argumentIndex);
    return bindings.length === 1 && bindings[0]?.sourceForm === "value";
  });
}

function hasSingleCaptureOwner(source: TargetSourceProgram, declaration: Node, shape: CsharpObjectShapeFact): boolean {
  const implementation = shape.methodImplementation;
  if (implementation === undefined) return false;
  const methods = shape.members.flatMap(member => member.memberKind !== "method" ||
    member.methodValueContract === undefined || member.methodStorageType !== undefined ? [] :
    csharpObjectShapeMethodDeclaration(shape, member) ?? []);
  return sourceBindingHasSingleCaptureOwner(declaration, implementation.declaration,
    methods, source.ast, source.navigation, use => use.role !== "value");
}
