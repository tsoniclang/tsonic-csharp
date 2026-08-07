import type {
  AstReader,
  ExtensionFactSubject,
  Node,
  ReadonlySourceFactResolver,
  SourceFile,
} from "@tsonic/tsts";
import {
  tsonicAttributeBuilderFactKey,
  type TsonicAttributeBuilderFact,
} from "@tsonic/source-core";

export interface CsharpAttributeApplicationFactIndex {
  readonly all: readonly CsharpAttributeApplication[];
  forSourceFile(sourceFile: SourceFile): readonly CsharpAttributeApplication[];
  forSubject(subject: Node): CsharpAttributeBuilderOperation | undefined;
}

export interface CsharpAttributeBuilderState {
  readonly kind: "csharp-attribute-builder-state";
  readonly applicationTarget: ExtensionFactSubject;
  readonly selectedMember?: ExtensionFactSubject;
  readonly applicationMemberKind?: "property" | "method";
  readonly applicationPlacement?: "declaration" | "constructor";
  readonly applicationParameterName?: string;
  readonly applicationTargetSpecifier?: string;
}

export interface CsharpAttributeApplication {
  readonly kind: "csharp-attribute-application";
  readonly attributeType: ExtensionFactSubject;
  readonly arguments: readonly ExtensionFactSubject[];
  readonly applicationTarget: ExtensionFactSubject;
  readonly selectedMember?: ExtensionFactSubject;
  readonly applicationMemberKind?: "property" | "method";
  readonly applicationPlacement?: "declaration" | "constructor";
  readonly applicationParameterName?: string;
  readonly applicationTargetSpecifier?: string;
}

export type CsharpAttributeBuilderOperation =
  | CsharpAttributeBuilderState
  | CsharpAttributeApplication;

export interface CsharpAttributeApplicationFactIndexInput {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceFacts?: ReadonlySourceFactResolver;
}

export function createCsharpAttributeApplicationFactIndex(
  input: CsharpAttributeApplicationFactIndexInput,
): CsharpAttributeApplicationFactIndex {
  if (input.sourceFacts === undefined) {
    return emptyAttributeApplicationFactIndex;
  }
  const all: CsharpAttributeApplication[] = [];
  const bySourceFile = new Map<SourceFile, readonly CsharpAttributeApplication[]>();
  const bySubject = new Map<Node, CsharpAttributeBuilderOperation>();
  for (const sourceFile of input.sourceFiles) {
    const indexed = collectSourceFileAttributeBuilderOperations(
      sourceFile,
      input.ast,
      input.sourceFacts,
    );
    const applications = Object.freeze(indexed.flatMap((entry) =>
      entry.operation.kind === "csharp-attribute-application"
        ? [entry.operation]
        : []
    ));
    bySourceFile.set(sourceFile, applications);
    all.push(...applications);
    for (const entry of indexed) {
      bySubject.set(entry.sourceSubject, entry.operation);
    }
  }
  const frozenAll = Object.freeze(all);
  return Object.freeze({
    all: frozenAll,
    forSourceFile(sourceFile: SourceFile): readonly CsharpAttributeApplication[] {
      return bySourceFile.get(sourceFile) ?? emptyAttributeApplications;
    },
    forSubject(subject: Node): CsharpAttributeBuilderOperation | undefined {
      return bySubject.get(subject);
    },
  });
}

interface IndexedCsharpAttributeBuilderOperation {
  readonly sourceSubject: Node;
  readonly operation: CsharpAttributeBuilderOperation;
}

function collectSourceFileAttributeBuilderOperations(
  sourceFile: SourceFile,
  ast: AstReader,
  sourceFacts: ReadonlySourceFactResolver,
): readonly IndexedCsharpAttributeBuilderOperation[] {
  const facts: IndexedCsharpAttributeBuilderOperation[] = [];
  const pending: Node[] = [sourceFile];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) {
      continue;
    }
    const fact = sourceFacts.getFact(node, tsonicAttributeBuilderFactKey);
    if (fact !== undefined) {
      facts.push({
        sourceSubject: node,
        operation: csharpAttributeBuilderOperation(fact),
      });
    }
    const children: Node[] = [];
    ast.forEachChild(node, (child) => {
      if (child !== undefined) {
        children.push(child);
      }
    });
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        pending.push(child);
      }
    }
  }
  return Object.freeze(facts);
}

function csharpAttributeBuilderOperation(
  fact: TsonicAttributeBuilderFact,
): CsharpAttributeBuilderOperation {
  const common = {
    applicationTarget: fact.applicationTarget,
    ...(fact.selectedMember === undefined
      ? {}
      : { selectedMember: fact.selectedMember }),
    ...(fact.applicationMemberKind === undefined
      ? {}
      : { applicationMemberKind: fact.applicationMemberKind }),
    ...(fact.applicationPlacement === undefined
      ? {}
      : { applicationPlacement: fact.applicationPlacement }),
    ...(fact.applicationParameterName === undefined
      ? {}
      : { applicationParameterName: fact.applicationParameterName }),
    ...(fact.applicationTargetSpecifier === undefined
      ? {}
      : { applicationTargetSpecifier: fact.applicationTargetSpecifier }),
  };
  return fact.kind === "builder-state"
    ? Object.freeze({
        kind: "csharp-attribute-builder-state",
        ...common,
      })
    : Object.freeze({
        kind: "csharp-attribute-application",
        attributeType: fact.attributeType,
        arguments: Object.freeze([...fact.arguments]),
        ...common,
      });
}

const emptyAttributeApplications = Object.freeze([]) as readonly CsharpAttributeApplication[];

const emptyAttributeApplicationFactIndex: CsharpAttributeApplicationFactIndex = Object.freeze({
  all: emptyAttributeApplications,
  forSourceFile(): readonly CsharpAttributeApplication[] {
    return emptyAttributeApplications;
  },
  forSubject(): CsharpAttributeBuilderOperation | undefined {
    return undefined;
  },
});
