import type {
  AstReader,
  Node,
  ReadonlySourceFactResolver,
  SourceFile,
} from "@tsonic/tsts";
import type {
  TsonicSafetyApplicationFact,
  TsonicSafetyBuilderFact,
  TsonicUnsafeContextFact,
} from "@tsonic/source-core";
import type {
  SourceProgramNavigation,
} from "@tsonic/target-api";
import {
  isAstNode,
} from "../../backend/planner/source-ast.js";
import {
  readCsharpSourceSafetyBuilder,
  readCsharpSourceUnsafeContext,
} from "../../policy/operations/source-explicit-safety.js";

export interface CsharpSafetyApplicationFactIndex {
  readonly all: readonly CsharpSafetyApplication[];
  forSourceFile(sourceFile: SourceFile): readonly CsharpSafetyApplication[];
  forDeclaration(declaration: Node): readonly CsharpSafetyApplication[];
  operationForSubject(subject: Node): CsharpSafetyOperation | undefined;
}

export interface CsharpSafetyApplication extends TsonicSafetyApplicationFact {
  readonly sourceSubject: Node;
  readonly sourceFile: SourceFile;
  readonly selectedMemberDeclarations: readonly Node[];
  readonly resolvedRootDeclaration?: Node;
  readonly targetDeclarations: readonly Node[];
}

export type CsharpSafetyOperation =
  | { readonly kind: "unsafe-context"; readonly fact: TsonicUnsafeContextFact }
  | { readonly kind: "safety-builder"; readonly fact: TsonicSafetyBuilderFact };

export interface CsharpSafetyApplicationFactIndexInput {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly navigation: SourceProgramNavigation;
}

export function createCsharpSafetyApplicationFactIndex(
  input: CsharpSafetyApplicationFactIndexInput,
): CsharpSafetyApplicationFactIndex {
  if (input.sourceFacts === undefined) {
    return emptyIndex;
  }
  const all: CsharpSafetyApplication[] = [];
  const bySourceFile = new Map<SourceFile, readonly CsharpSafetyApplication[]>();
  const byDeclaration = new Map<Node, CsharpSafetyApplication[]>();
  const bySubject = new Map<Node, CsharpSafetyOperation>();
  for (const sourceFile of input.sourceFiles) {
    const applications: CsharpSafetyApplication[] = [];
    walkSourceFile(sourceFile, input.ast, (node) => {
      const unsafeContext = readCsharpSourceUnsafeContext(
        input.sourceFacts,
        node,
      );
      if (unsafeContext !== undefined) {
        bySubject.set(node, { kind: "unsafe-context", fact: unsafeContext });
      }
      const builder = readCsharpSourceSafetyBuilder(input.sourceFacts, node);
      if (builder === undefined) {
        return;
      }
      bySubject.set(node, { kind: "safety-builder", fact: builder });
      if (builder.kind !== "application") {
        return;
      }
      const application = resolveApplication(
        node,
        sourceFile,
        builder,
        input,
      );
      applications.push(application);
      all.push(application);
      for (const declaration of application.targetDeclarations) {
        const existing = byDeclaration.get(declaration) ?? [];
        existing.push(application);
        byDeclaration.set(declaration, existing);
      }
    });
    bySourceFile.set(sourceFile, Object.freeze(applications));
  }
  return Object.freeze({
    all: Object.freeze(all),
    forSourceFile(sourceFile: SourceFile): readonly CsharpSafetyApplication[] {
      return bySourceFile.get(sourceFile) ?? emptyApplications;
    },
    forDeclaration(declaration: Node): readonly CsharpSafetyApplication[] {
      return byDeclaration.get(declaration) ?? emptyApplications;
    },
    operationForSubject(subject: Node): CsharpSafetyOperation | undefined {
      return bySubject.get(subject);
    },
  });
}

function resolveApplication(
  sourceSubject: Node,
  sourceFile: SourceFile,
  fact: TsonicSafetyApplicationFact,
  input: CsharpSafetyApplicationFactIndexInput,
): CsharpSafetyApplication {
  const selectedMemberDeclarations = Object.freeze(
    [
      ...(fact.selectedMemberDeclarations ?? []),
      fact.selectedMemberDeclaration,
      fact.selectedMember,
    ].filter((subject): subject is Node => isAstNode(input.ast, subject)),
  );
  const applicationTarget = isAstNode(input.ast, fact.applicationTarget)
    ? fact.applicationTarget
    : undefined;
  const resolvedRootDeclaration = applicationTarget === undefined
    ? undefined
    : projectDeclaration(applicationTarget, input);
  const application: Omit<CsharpSafetyApplication, "targetDeclarations"> = {
    ...fact,
    sourceSubject,
    sourceFile,
    selectedMemberDeclarations,
    ...(resolvedRootDeclaration === undefined
      ? {}
      : { resolvedRootDeclaration }),
  };
  return Object.freeze({
    ...application,
    targetDeclarations: applicationDeclarations(application, input.ast),
  });
}

function projectDeclaration(
  subject: Node,
  input: CsharpSafetyApplicationFactIndexInput,
): Node | undefined {
  return input.navigation.referenceFor(subject)?.declaration ??
    input.navigation.declarationFor(subject) ??
    (input.navigation.isProjectDeclaration(subject) ? subject : undefined);
}

function applicationDeclarations(
  application: Omit<CsharpSafetyApplication, "targetDeclarations">,
  ast: AstReader,
): readonly Node[] {
  switch (application.applicationPlacement) {
    case "declaration":
      return uniqueNodes([
        ...application.selectedMemberDeclarations,
        application.resolvedRootDeclaration,
      ]);
    case "constructor": {
      const owner = application.resolvedRootDeclaration;
      return owner === undefined || !ast.is.IsClassDeclaration(owner)
        ? []
        : uniqueNodes([
            owner,
            ...ast.members(owner).filter(
              (member): member is Node =>
                member !== undefined && ast.is.IsConstructorDeclaration(member),
            ),
          ]);
    }
    case "getter":
      return application.selectedMemberDeclarations.filter((declaration) =>
        ast.is.IsGetAccessorDeclaration(declaration) ||
        ast.is.IsIndexSignatureDeclaration(declaration) ||
        ast.is.IsPropertyDeclaration(declaration) ||
        ast.is.IsPropertySignatureDeclaration(declaration));
    case "setter":
      return application.selectedMemberDeclarations.filter((declaration) =>
        ast.is.IsSetAccessorDeclaration(declaration) ||
        ast.is.IsIndexSignatureDeclaration(declaration) ||
        ast.is.IsPropertyDeclaration(declaration) ||
        ast.is.IsPropertySignatureDeclaration(declaration));
  }
}

function uniqueNodes(
  nodes: readonly (Node | undefined)[],
): readonly Node[] {
  return Object.freeze([...new Set(nodes.filter(
    (node): node is Node => node !== undefined,
  ))]);
}

function walkSourceFile(
  sourceFile: SourceFile,
  ast: AstReader,
  visit: (node: Node) => void,
): void {
  const pending: Node[] = [sourceFile];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) {
      continue;
    }
    visit(node);
    const children = ast.children(node).filter(
      (child): child is Node => child !== undefined,
    );
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(children[index]!);
    }
  }
}

const emptyApplications = Object.freeze([]) as readonly CsharpSafetyApplication[];
const emptyIndex: CsharpSafetyApplicationFactIndex = Object.freeze({
  all: emptyApplications,
  forSourceFile: () => emptyApplications,
  forDeclaration: () => emptyApplications,
  operationForSubject: () => undefined,
});
