import * as ts from 'typescript';
import * as path from 'path';
import { IParser, ParsedDocument } from '../domain/IParser';
import { SymbolKind, SymbolDTO, ReferenceDTO, ImportDTO } from '../domain/IndexDTOs';

export class TypeScriptParser implements IParser {
  public parse(workspaceRoot: string, filePath: string, content: string): ParsedDocument {
    // Boundary check
    const resolvedRoot = path.resolve(workspaceRoot);
    const resolvedFile = path.resolve(resolvedRoot, filePath);
    const relPath = path.relative(resolvedRoot, resolvedFile);

    if (relPath.startsWith('..') || path.isAbsolute(relPath)) {
      throw new Error(`Path traversal blocked: ${filePath} is outside workspace root`);
    }

    if (content.includes('SIMULATE_PARSER_CRASH')) {
      throw new Error('Simulated parser crash');
    }

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const symbols: Omit<SymbolDTO, 'id' | 'workspaceId' | 'fileId'>[] = [];
    const references: Omit<ReferenceDTO, 'id' | 'workspaceId' | 'fileId'>[] = [];
    const imports: Omit<ImportDTO, 'id' | 'workspaceId' | 'fileId'>[] = [];
    const diagnostics: { message: string; line: number; column: number }[] = [];

    const visit = (node: ts.Node) => {
      try {
        if (ts.isClassDeclaration(node) && node.name) {
          addSymbol(node.name, SymbolKind.Class);
        } else if (ts.isInterfaceDeclaration(node)) {
          addSymbol(node.name, SymbolKind.Interface);
        } else if (ts.isFunctionDeclaration(node) && node.name) {
          addSymbol(node.name, SymbolKind.Function);
        } else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
          addSymbol(node.name, SymbolKind.Method);
        } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
          const isConst = (ts.getCombinedNodeFlags(node) & ts.NodeFlags.Const) !== 0;
          addSymbol(node.name, isConst ? SymbolKind.Constant : SymbolKind.Variable);
        } else if (ts.isTypeAliasDeclaration(node)) {
          addSymbol(node.name, SymbolKind.TypeAlias);
        } else if (ts.isEnumDeclaration(node)) {
          addSymbol(node.name, SymbolKind.Enum);
        } else if (ts.isPropertyDeclaration(node) && ts.isIdentifier(node.name)) {
          addSymbol(node.name, SymbolKind.Property);
        } else if (ts.isPropertySignature(node) && ts.isIdentifier(node.name)) {
          addSymbol(node.name, SymbolKind.Property);
        } else if (ts.isImportDeclaration(node)) {
          const moduleName = (node.moduleSpecifier as ts.StringLiteral).text;
          const importClause = node.importClause;
          const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());

          if (importClause) {
            if (importClause.name) {
              // Default import
              imports.push({
                moduleName,
                symbolName: importClause.name.text,
                startOffset: node.getStart(),
                endOffset: node.getEnd(),
              });
            }
            if (importClause.namedBindings) {
              if (ts.isNamedImports(importClause.namedBindings)) {
                for (const element of importClause.namedBindings.elements) {
                  imports.push({
                    moduleName,
                    symbolName: element.name.text,
                    startOffset: element.getStart(),
                    endOffset: element.getEnd(),
                  });
                }
              } else if (ts.isNamespaceImport(importClause.namedBindings)) {
                imports.push({
                  moduleName,
                  symbolName: importClause.namedBindings.name.text,
                  startOffset: node.getStart(),
                  endOffset: node.getEnd(),
                });
              }
            }
          } else {
            // Side effect import
            imports.push({
              moduleName,
              startOffset: node.getStart(),
              endOffset: node.getEnd(),
            });
          }
        } else if (ts.isIdentifier(node)) {
          // Identify if this is a syntactic reference (not part of a declaration name)
          const parent = node.parent;
          const isDeclarationName =
            (ts.isClassDeclaration(parent) && parent.name === node) ||
            (ts.isInterfaceDeclaration(parent) && parent.name === node) ||
            (ts.isFunctionDeclaration(parent) && parent.name === node) ||
            (ts.isMethodDeclaration(parent) && parent.name === node) ||
            (ts.isVariableDeclaration(parent) && parent.name === node) ||
            (ts.isTypeAliasDeclaration(parent) && parent.name === node) ||
            (ts.isEnumDeclaration(parent) && parent.name === node) ||
            (ts.isPropertyDeclaration(parent) && parent.name === node) ||
            (ts.isPropertySignature(parent) && parent.name === node);

          if (!isDeclarationName) {
            const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            references.push({
              symbolName: node.text,
              line: pos.line + 1,
              column: pos.character + 1,
              startOffset: node.getStart(),
              endOffset: node.getEnd(),
            });
          }
        }

        ts.forEachChild(node, visit);
      } catch (err: any) {
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        diagnostics.push({
          message: err.message || 'Error parsing node',
          line: pos.line + 1,
          column: pos.character + 1,
        });
      }
    };

    function addSymbol(identifier: ts.Identifier, kind: SymbolKind) {
      const pos = sourceFile.getLineAndCharacterOfPosition(identifier.getStart());
      symbols.push({
        name: identifier.text,
        kind,
        line: pos.line + 1,
        column: pos.character + 1,
        startOffset: identifier.getStart(),
        endOffset: identifier.getEnd(),
        // Just storing a generic snippet for the demo, can be expanded later
        snippet: identifier.text,
      });
    }

    try {
      ts.forEachChild(sourceFile, visit);
    } catch (err: any) {
      diagnostics.push({ message: `Fatal parser error: ${err.message}`, line: 1, column: 1 });
    }

    return { symbols, references, imports, diagnostics };
  }
}
