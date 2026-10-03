import * as monaco from 'monaco-editor';
export function test(editor: monaco.editor.ICodeEditor) {
  const model = editor.getModel();
  if (model && (model as any).canUndo) {
    console.log((model as any).canUndo());
  }
}
