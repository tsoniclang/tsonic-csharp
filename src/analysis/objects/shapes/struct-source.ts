import type { Node, Type } from "@tsonic/tsts";
import { Node_Initializer, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpCurrentProjectDeclaration } from "../../source-evidence/model.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import type { CsharpStructuralTypeSource } from "../../source-evidence/types/resolution/structural-applications.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import { readCsharpSourceField, readCsharpSourceStruct } from "../../../source/extension/markers.js";
import { csharpPropertySourceMemberKey } from "../../../target-model/types/source-member-keys.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpSourceMemberKey } from "../../../target-model/types/model.js";
import { objectShapeMemberTargetName } from "../../../policy/identities/source-member-names.js";
import type { CsharpObjectShapePolicyHost, CsharpRecursiveObjectShapePolicy } from "./model.js";
import type { CsharpObjectShapeMemberProofInput } from "./member-instantiation.js";
import type { CsharpCollectedObjectShapeMembers } from "./member-source.js";
import { sourceSubjects } from "./source-evidence.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

interface CsharpStructFieldSource {
  readonly field: NonNullable<ReturnType<typeof readCsharpSourceStruct>>["fields"][number];
  readonly sourceKey: CsharpSourceMemberKey;
  readonly state: CsharpTypeResolutionState;
  readonly selectedIndex: number | undefined;
  readonly targetName: string | undefined;
  readonly proof: CsharpObjectShapeMemberProofInput | undefined;
}

export interface CsharpStructShapeSource {
  readonly definition: CsharpCurrentProjectDeclaration;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
  readonly selectedType: Type;
  readonly members: CsharpStructuralTypeSource | undefined;
  readonly fields: readonly CsharpStructFieldSource[];
}

export function formCsharpStructShapeSource(
  host: CsharpObjectShapePolicyHost,
  collectMembers: (type: Type, queries: SourceFileSemantics, state: CsharpTypeResolutionState) =>
    CsharpCollectedObjectShapeMembers | undefined,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpStructShapeSource | undefined {
  const parent = host.ast.parent(node);
  const declaration = host.ast.is.IsVariableDeclaration(node) ? node
    : parent !== undefined && host.ast.is.IsVariableDeclaration(parent) && Node_Initializer(host.ast, parent) === node
      ? parent : undefined;
  const definition = host.projectDeclarations.declarationForNode(declaration);
  if (definition?.kind !== "struct") return undefined;
  for (const subject of sourceSubjects(node, queries)) {
    const fact = readCsharpSourceStruct(host.sourceFacts, subject);
    if (fact === undefined) continue;
    const selectedType = queries.types.expressionType(definition.declaration) ?? queries.types.authoredType(definition.declaration);
    if (selectedType === undefined) return undefined;
    const collection = collectMembers(selectedType, queries, state);
    const initializer = Node_Initializer(host.ast, definition.declaration);
    const shapeNode = initializer === undefined || readCsharpSourceStruct(host.sourceFacts, initializer) === undefined
      ? undefined : host.ast.arguments(initializer)[0];
    const shapeType = shapeNode === undefined ? undefined : queries.types.expressionType(shapeNode);
    const correspondence = shapeType === undefined ? undefined : queries.types.structuralMembers(shapeType, selectedType, "correspondence");
    if (correspondence?.kind !== "available") return undefined;
    const fields = fact.fields.map(field => {
      const sourceType = queries.types.authoredType(field.sourceType);
      const pairs = correspondence.members.filter(member => member.kind === "present" &&
        readCsharpSourceField(host.sourceFacts, [member.source.property.symbol,
          ...member.source.declarations])?.sourceType === field.sourceType);
      const destination = pairs.length === 1 ? pairs[0]!.destination : undefined;
      const subjects = destination === undefined ? [] : [destination.property.symbol, ...destination.declarations];
      const matches = collection?.members.map((member, index) => ({ member, index })).filter(({ member }) =>
        member.proofInput.sourceSubjects?.some(subject => subjects.includes(subject)) === true);
      const selected = matches?.length === 1 ? matches[0] : undefined;
      const input = selected?.member.proofInput;
      const proof = input === undefined ? undefined : Object.freeze({
        sourceSubjects: Object.freeze([field.sourceType, ...input.sourceSubjects ?? []]),
        sourceDeclarations: input.sourceDeclarations, sourceMemberEvidence: input.sourceMemberEvidence,
        sourceTypes: sourceType === undefined ? undefined : Object.freeze([sourceType]), optional: undefined,
      });
      return Object.freeze({ field, sourceKey: csharpPropertySourceMemberKey(field.sourceName),
        state: Object.freeze(nextState(state)), selectedIndex: selected?.index,
        targetName: objectShapeMemberTargetName(field.sourceName), proof });
    });
    return Object.freeze({ definition, queries, state, selectedType,
      members: collection === undefined ? undefined : host.structuralTypeApplication(collection), fields: Object.freeze(fields) });
  }
  return undefined;
}

export function completeCsharpStructShapeSource(
  host: CsharpObjectShapePolicyHost,
  source: CsharpStructShapeSource,
  header: import("./member-evidence.js").CsharpStructuralMembersHeader | undefined,
  completeSourceMembers: CsharpRecursiveObjectShapePolicy["completeSourceMembers"],
): CsharpObjectShapeFact | undefined {
  const targetType = host.projectTypeCatalog.targetTypeForDeclaration(source.definition.declaration, []);
  if (targetType === undefined) return undefined;
  if (header !== undefined && (header.source !== source.members || header.application.receiver !== undefined)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "Struct completion requires its exact current member headers.", source.definition.declaration);
  }
  const selectedMembers = header === undefined ? undefined : completeSourceMembers(header);
  const members = source.fields.map(({ field, sourceKey, state, selectedIndex, targetName, proof }) => {
    const type = host.typeResolver.resolveNode(field.sourceType, source.queries.sourceFile, state);
    const selected = selectedIndex === undefined ? undefined : selectedMembers?.[selectedIndex];
    if (type === undefined || selected === undefined || targetName === undefined || proof === undefined) return undefined;
    return {
      sourceKey, sourceName: field.sourceName,
      sourceSubjects: proof.sourceSubjects,
      ...(proof.sourceDeclarations === undefined ? {} : { sourceDeclarations: proof.sourceDeclarations }),
      ...(proof.sourceMemberEvidence === undefined ? {} : { sourceMemberEvidence: proof.sourceMemberEvidence }),
      ...(selected.bound === true ? { bound: true as const } : {}),
      ...(proof.sourceTypes === undefined ? {} : { sourceTypes: proof.sourceTypes }),
      targetName, memberKind: "property" as const, type,
      ...(field.readonly ? { readonly: true } : {}),
    };
  });
  return members.some(member => member === undefined) ? undefined : {
    targetType, sourceType: source.selectedType, members: members as readonly CsharpObjectShapeMemberFact[], constructible: true,
  };
}
