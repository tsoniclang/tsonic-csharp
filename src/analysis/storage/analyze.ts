import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpMemoryAnalysisHost } from "../../policy/model/memory.js";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpTargetNamedTypeRef } from "../../target-model/types/model.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/program/declarations.js";
import type { CsharpCallableContractIndex } from "../../target-model/records/callables/callable-values.js";
import type { CsharpConversionClassifications } from "../../target-model/records/operations/conversions.js";
import type { CsharpExpectedTypeClassifications } from "../../target-model/records/types/expected-types.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import type { CsharpStorageClassifications, CsharpStorageRepresentationClassifications, CsharpStorageIssue } from "../../target-model/records/storage/storage.js";
import { requireCsharpRecord, type CsharpRequiredRecord } from "../program/records/objects/required-records.js";
import { csharpArrayInputDomainsEqual } from "../../policy/types/collections/array-input-layout.js";
import { csharpConversionIsApplicable } from "../../policy/conversions/applicability.js";
import { getCsharpCallableValueSignature, csharpDelegateSignaturesMatchNativeBinding } from "../../target-model/types/carriers/delegates.js";
import { getCsharpNullableElementTargetType, csharpNullableReferenceTargetType } from "../../target-model/types/carriers/nullable.js";
import { csharpTargetStorageIdentityEquals } from "../../policy/types/storage/storage-identity.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import { represented, sourceOutcome } from "../../policy/types/source-type-flow/representation-results.js";
import { selectCsharpSourceArgument } from "../../source/extension/arguments.js";

interface MutableStorageContract {
  readonly declaration: Node;
  targetType?: TargetTypeRef;
  lambdaParameterType?: TargetTypeRef;
  nullableWrittenType?: TargetTypeRef;
  typedLocationIdentity: boolean;
}

const maximumStorageContracts = 131_072;

export function analyzeCsharpStorage(input: CsharpMemoryAnalysisHost, evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications, objectShapes: CsharpObjectShapeClassifications,
  expectedTypes: CsharpExpectedTypeClassifications, conversions: CsharpConversionClassifications,
  declarations: CsharpDeclarationClassifications, callables: CsharpCallableContractIndex,
  previous: CsharpStorageClassifications | undefined, requiredRecords: CsharpRequiredRecord[]):
  CsharpRepresentationOutcome<CsharpStorageRepresentationClassifications> {
  const identity = input.typeIdentity;
  const contracts = new Map<Node, MutableStorageContract>();
  const issues: CsharpStorageIssue[] = [];
  const nodes = input.sourceStorage.nodes.filter(node => !evidence.compileTimeMetadata.get(node));
  for (const node of nodes) {
    const declaration = input.ast.is.IsVariableDeclaration(node) ? node
      : input.facts.navigation.sourceReferenceFor(node)?.declaration;
    const quotation = declaration === undefined ? undefined : expectedTypes.quotationBinding.get(declaration);
    if (quotation?.kind === "selected") requireTargetType(node, quotation.declaration, quotation.targetType);
    else if (quotation === undefined) {
      const callable = declaration === undefined ? undefined : callables.closedInputType(declaration);
      if (declaration !== undefined && callable !== undefined) requireTargetType(node, declaration, callable);
      else for (const target of expectedTypes.storageExpectedType.get(node)) recordPromotedRepresentation(node, target);
    }
    const projected = operations.selectedProperty.get(node)?.sourceOwned?.projectedWrite;
    if (projected?.kind === "resolved") recordLocation(projected.storage);
    const location = operations.typedLocation.get(node);
    if (location?.kind === "location-address") recordLocation(location.storage);
    const iteration = operations.iteration.get(node);
    if (iteration?.kind === "resolved") {
      const initializer = input.ast.as.AsForInOrOfStatement(node)?.Initializer;
      const bound = initializer === undefined ? [] : input.ast.children(initializer).filter(child => input.ast.is.IsVariableDeclaration(child));
      if (bound.length === 1) requireTargetType(bound[0]!, bound[0]!, iteration.elementType);
    }
    const call = operations.selectedCall.get(node)?.target;
    if (call?.kind !== "resolved" || call.source.argumentDisposition === "skip") continue;
    for (const argument of call.call.arguments) {
      if (argument.targetParameter.csharpOutputMayBeNull !== true) continue;
      const actual = call.source.sourceArguments[argument.sourceArgumentIndex];
      if (actual === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A selected Native output requires its original Source argument association.", node);
      if (actual.operand.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: actual.operand });
      const passing = selectCsharpSourceArgument(input.facts.protocols, actual.occurrence);
      if (passing.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: passing });
      const place = sourceOutcome(input.facts.protocols.storage(passing.argument.storageExpression));
      if (place.kind !== "represented") return place;
      if (place.value.kind === "none" || place.value.value.kind !== "binding") {
        issues.push(issue(actual.occurrence, "CSHARP_STORAGE_DECLARATION_MISSING",
          "A selected nullable Native output has no exact original binding storage declaration."));
        continue;
      }
      requireNullableWrite(actual.occurrence, place.value.value.declaration, argument.targetParameter.type);
    }
  }
  for (const callable of callables.declarationContracts) {
    const selected = callable.bodyInputs?.parameters ?? callable.nativeParameters;
    const groups = new Map<Node, { readonly incoming: TargetTypeRef[]; readonly body: TargetTypeRef[] }>();
    for (const [index, parameter] of selected.entries()) {
      const incoming = parameter.targetParameter.type;
      const adapter = callable.bodyInputs?.adapters[index];
      if (adapter !== undefined && !targetTypeRefEquals(identity, adapter.adapter.source, incoming)) failTargetAnalysisInvariant(
        "tsonic-csharp", "A Native body input adapter requires its identical completed physical parameter slot.", parameter.sourceParameter);
      const body = adapter?.adapter.target ?? incoming;
      if (adapter !== undefined && !csharpConversionIsApplicable(adapter.adapter.conversion, "implicit")) failTargetAnalysisInvariant(
        "tsonic-csharp", "A Native body input requires its already-admitted exact physical conversion.", parameter.sourceParameter);
      const group = groups.get(parameter.sourceParameter) ?? { incoming: [], body: [] };
      group.incoming.push(incoming);
      group.body.push(body);
      groups.set(parameter.sourceParameter, group);
    }
    for (const [parameter, group] of groups) {
      const incoming: TargetTypeRef = group.incoming.length === 1 ? group.incoming[0]!
        : Object.freeze({ kind: "tuple", elements: Object.freeze(group.incoming) });
      const body: TargetTypeRef = group.body.length === 1 ? group.body[0]!
        : Object.freeze({ kind: "tuple", elements: Object.freeze(group.body) });
      const runtimeDefault = declarations.runtimeDefault.get(parameter);
      const selectedBody = runtimeDefault?.valueType ?? body;
      requireTargetType(parameter, parameter, selectedBody);
      const contract = contracts.get(parameter);
      if (contract !== undefined && (callable.bodyInputs !== undefined || input.ast.is.IsArrowFunction(callable.sourceDeclaration) ||
        input.ast.is.IsFunctionExpression(callable.sourceDeclaration))) {
        contract.lambdaParameterType = incoming;
        requireCsharpRecord(requiredRecords, { family: "requiredStorageType", subject: parameter,
          construct: "adapted lambda parameter", producer: "analyzeCsharpStorage" });
      }
    }
    if (input.ast.is.IsSetAccessorDeclaration(callable.sourceDeclaration) && callable.parameters.length === 1) {
      const setter = callable.sourceDeclaration;
      const owner = input.ast.parent(setter);
      if (owner === undefined || !input.ast.is.IsObjectLiteralExpression(owner)) continue;
      const shapes = [objectShapes.resolveNode(owner), ...expectedTypes.expectedType.get(owner).flatMap(target => {
        const result = objectShapes.resolveObjectLiteralTargetShape(objectShapes.resolveTarget(target), owner);
        return result?.kind === "resolved" ? [result.shape] : [];
      })].filter(shape => shape !== undefined);
      for (const shape of shapes) {
        const members = shape.members.filter(member => member.sourceDeclarations?.includes(setter) === true);
        if (members.length > 1) {
          issues.push(issue(setter, "CSHARP_OBJECT_SETTER_MEMBER_AMBIGUOUS", "One object-literal setter belongs to multiple members in the same sealed Native object declaration."));
          continue;
        }
        if (members.length === 0) continue;
        const emission = input.objectMembers.objectMember.get(shape, members[0]!);
        if (emission === undefined || !("type" in emission.declaration)) failTargetAnalysisInvariant("tsonic-csharp",
          "An object setter requires its completed canonical physical member declaration.", setter);
        requireTargetType(callable.parameters[0]!, callable.parameters[0]!, emission.declaration.type);
      }
    }
  }
  const resolved = new Map<Node, TargetTypeRef>();
  for (const contract of contracts.values()) {
    const selected = contract.targetType ?? evidence.storageTargetType.get(contract.declaration);
    if (selected === undefined) failTargetAnalysisInvariant("tsonic-csharp", "Demanded Native declaration storage requires its completed canonical physical slot.", contract.declaration);
    if (contract.nullableWrittenType !== undefined && !csharpTargetStorageIdentityEquals(contract.nullableWrittenType, selected)) {
      issues.push(issue(contract.declaration, "CSHARP_STORAGE_NULLABLE_WRITE_CONFLICT",
        `Selected Native output writes '${key(contract.nullableWrittenType)}', but its declared storage resolves to '${key(selected)}'.`));
      continue;
    }
    resolved.set(contract.declaration, contract.nullableWrittenType === undefined ? selected : csharpNullableReferenceTargetType(selected));
  }
  const effective = new Map<Node, TargetTypeRef>();
  const required = new Map<Node, TargetTypeRef>();
  for (const node of nodes) {
    const declaration = input.facts.navigation.sourceReferenceFor(node)?.declaration;
    const selected = resolved.get(node) ?? (declaration === undefined ? undefined : resolved.get(declaration));
    if (selected !== undefined) { effective.set(node, selected); required.set(node, selected); }
    else {
      const completed = evidence.storageTargetType.get(node) ?? (declaration === undefined ? undefined : evidence.storageTargetType.get(declaration));
      if (completed !== undefined) effective.set(node, completed);
    }
  }
  return represented(Object.freeze({ issues: Object.freeze(issues),
    contracts: Object.freeze([...contracts.values()].flatMap(contract => {
      const type = resolved.get(contract.declaration);
      return type === undefined ? [] : [Object.freeze({ ...contract, type })];
    })),
    storageType: Object.freeze({ get: (node: Node) => effective.get(node) }),
    requiredStorageType: Object.freeze({ get: (node: Node) => required.get(node) }),
    lambdaParameterType: Object.freeze({ get: (node: Node) => contracts.get(node)?.lambdaParameterType }),
    typedLocationIdentity: Object.freeze({ get: (node: Node) => contracts.get(node)?.typedLocationIdentity === true }) }));

  function recordPromotedRepresentation(expression: Node, target: TargetTypeRef): void {
    if (!input.ast.is.IsIdentifier(expression)) return;
    const declaration = input.facts.navigation.sourceReferenceFor(expression)?.declaration;
    if (declaration === undefined || !input.ast.is.IsVariableDeclaration(declaration) ||
      input.ast.as.AsVariableDeclaration(declaration)?.Initializer === undefined) return;
    const principal = evidence.storageTargetType.get(declaration);
    const read = evidence.nodeTargetType.get(expression);
    if (csharpArrayInputDomainsEqual(identity, principal, target) && csharpArrayInputDomainsEqual(identity, principal, read)) {
      requireTargetType(expression, declaration, target);
      return;
    }
    const source = getCsharpCallableValueSignature(getCsharpNullableElementTargetType(principal) ?? principal);
    const destination = getCsharpCallableValueSignature(getCsharpNullableElementTargetType(target) ?? target);
    if (source === undefined || destination === undefined || !csharpDelegateSignaturesMatchNativeBinding(identity, source, destination)) return;
    const selected = principal !== undefined && getCsharpNullableElementTargetType(principal) === undefined
      ? getCsharpNullableElementTargetType(target) ?? target : target;
    const conversion = conversions.expressionConversion.get(expression, read, target, "implicit");
    const previousType = previous?.requiredStorageType.get(expression);
    if (conversion === undefined || conversion.selection.kind === "rejected" || previousType === undefined ||
      !targetTypeRefEquals(identity, previousType, selected)) return;
    const authored = evidence.storageTargetType.get(declaration);
    const present = getCsharpNullableElementTargetType(authored) ?? authored;
    const shape = objectShapes.resolveTarget(getCsharpNullableElementTargetType(selected) ?? selected);
    if (present?.kind === "target-named" && ((present as CsharpTargetNamedTypeRef).csharpStructuralContract === true ||
      (present as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface") &&
      shape?.implements?.some(base => targetTypeRefEquals(identity, base, present)) === true) requireTargetType(expression, declaration, selected);
    else if (authored !== undefined && targetTypeRefEquals(identity, authored, selected)) requireTargetType(expression, declaration, selected);
  }

  function recordLocation(storage: import("../../target-model/records/storage/typed-location-storage.js").CsharpTypedLocationStorage): void {
    if (storage.kind === "direct-storage" && storage.identity.kind === "local-storage") {
      const contract = contractFor(storage.expression, storage.identity.declaration);
      if (contract !== undefined) contract.typedLocationIdentity = true;
    } else if (storage.kind === "value-property-storage") recordLocation(storage.receiverStorage);
  }

  function requireTargetType(expression: Node, declaration: Node, target: TargetTypeRef): void {
    const contract = contractFor(expression, declaration);
    if (contract === undefined) return;
    if (contract.targetType !== undefined && !targetTypeRefEquals(identity, contract.targetType, target)) {
      issues.push(issue(expression, "CSHARP_STORAGE_TARGET_TYPE_CONFLICT", `One storage declaration requires incompatible Native representations '${key(contract.targetType)}' and '${key(target)}'.`));
    } else contract.targetType = target;
  }

  function requireNullableWrite(expression: Node, declaration: Node, target: TargetTypeRef): void {
    if (targetTypeRefEquals(identity, csharpNullableReferenceTargetType(target), target)) return;
    const contract = contractFor(expression, declaration);
    if (contract === undefined) return;
    if (contract.nullableWrittenType !== undefined && !csharpTargetStorageIdentityEquals(contract.nullableWrittenType, target)) {
      issues.push(issue(expression, "CSHARP_STORAGE_NULLABLE_TYPE_CONFLICT", `One declaration receives incompatible nullable Native output types '${key(contract.nullableWrittenType)}' and '${key(target)}'.`));
    } else contract.nullableWrittenType = target;
  }

  function contractFor(expression: Node, declaration: Node): MutableStorageContract | undefined {
    const previous = contracts.get(declaration);
    if (previous !== undefined) return previous;
    if (contracts.size >= maximumStorageContracts) {
      issues.push(issue(expression, "CSHARP_STORAGE_CONTRACT_BUDGET_EXCEEDED", `Native storage contracts exceed their finite ${maximumStorageContracts}-declaration budget.`));
      return undefined;
    }
    const contract = { declaration, typedLocationIdentity: false };
    contracts.set(declaration, contract);
    return contract;
  }

  function key(type: TargetTypeRef): string { return targetTypeRefKey(identity, type); }
}

function issue(node: Node, code: string, message: string): CsharpStorageIssue { return Object.freeze({ node, code, message }); }
