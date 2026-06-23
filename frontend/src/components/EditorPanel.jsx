import { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { readFile, writeFile } from '../api';

/**
 * Monaco code editor panel with file loading and save (Ctrl+S).
 */
export default function EditorPanel({ sessionId, workspacePath, selectedFile, refreshTrigger }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [modified, setModified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [originalContent, setOriginalContent] = useState('');

  // Load file content
  useEffect(() => {
    if (!selectedFile || (!sessionId && !workspacePath)) {
      setContent('');
      setOriginalContent('');
      setModified(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const data = await readFile(sessionId, selectedFile, workspacePath);
        setContent(data.content);
        setOriginalContent(data.content);
        setModified(false);
      } catch (err) {
        console.error('Failed to load file:', err);
        setContent(`// Error loading file: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [sessionId, workspacePath, selectedFile, refreshTrigger]);

  const handleEditorChange = (value) => {
    setContent(value || '');
    setModified(value !== originalContent);
  };

  const handleSave = useCallback(async () => {
    if (!selectedFile || (!sessionId && !workspacePath) || !modified) return;
    setSaving(true);
    try {
      await writeFile(sessionId, selectedFile, content, workspacePath);
      setOriginalContent(content);
      setModified(false);
    } catch (err) {
      console.error('Failed to save file:', err);
    } finally {
      setSaving(false);
    }
  }, [sessionId, workspacePath, selectedFile, content, modified]);

  // Ctrl+S handler
  const handleEditorMount = (editor) => {
    editor.addCommand(
      // Ctrl+S / Cmd+S
      2097 /* KeyMod.CtrlCmd | KeyCode.KeyS */,
      () => handleSave()
    );
  };

  // Detect file extension for language
  const getLanguage = (path) => {
    if (!path) return 'plaintext';
    const ext = path.split('.').pop()?.toLowerCase();
    const map = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      json: 'json',
      html: 'html',
      css: 'css',
      md: 'markdown',
      yaml: 'yaml',
      yml: 'yaml',
      sh: 'shell',
      bash: 'shell',
      sql: 'sql',
      xml: 'xml',
      txt: 'plaintext',
    };
    return map[ext] || 'plaintext';
  };

  return (
    <div className="editor-panel" id="editor-panel">
      <div className="editor-tabs">
        {selectedFile ? (
          <div className="editor-tab active">
            {selectedFile.split('/').pop() || selectedFile.split('\\').pop()}
            {modified && <span style={{ color: 'var(--status-warning)', marginLeft: '4px' }}>●</span>}
          </div>
        ) : (
          <div className="editor-tab" style={{ color: 'var(--text-muted)' }}>
            No file selected
          </div>
        )}
        {modified && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleSave}
            disabled={saving}
            style={{ marginLeft: 'auto' }}
          >
            {saving ? <span className="spinner" /> : '💾'} Save
          </button>
        )}
      </div>
      <div className="editor-container">
        {loading ? (
          <div className="empty-state">
            <span className="spinner" />
            <p>Loading file...</p>
          </div>
        ) : selectedFile ? (
          selectedFile.endsWith('.ipynb') ? (
            <NotebookViewer content={content} />
          ) : (
            <Editor
              height="100%"
              language={getLanguage(selectedFile)}
              value={content}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                lineNumbers: 'on',
                renderLineHighlight: 'all',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                padding: { top: 8 },
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
              }}
            />
          )
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <p>Select a file from the tree to edit it here.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function NotebookViewer({ content }) {
  let nb = null;
  try {
    nb = JSON.parse(content);
  } catch (e) {
    return <div style={{ color: 'var(--status-error)', padding: '20px' }}>Invalid notebook JSON</div>;
  }
  
  if (!nb || !nb.cells) {
    return <div style={{ color: 'var(--status-error)', padding: '20px' }}>No cells found in notebook</div>;
  }

  return (
    <div className="notebook-viewer" style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', overflowY: 'auto', height: '100%' }}>
      {nb.cells.map((cell, i) => {
        const sourceCode = Array.isArray(cell.source) ? cell.source.join('') : (cell.source || '');
        const lineCount = sourceCode.split('\n').length;
        // Dramatically increase padding and line height multiplier to ensure it NEVER clips.
        // 22px per line + 40px base padding buffer
        const editorHeight = Math.max(lineCount * 22 + 40, 70);

        return (
          <div key={i} style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
            <div style={{ width: '60px', flexShrink: 0, textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.85rem', paddingTop: cell.cell_type === 'code' ? '8px' : '0' }}>
              {cell.cell_type === 'code' ? `In [${cell.execution_count || ' '}]:` : ''}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {cell.cell_type === 'markdown' ? (
                <div className="markdown-body" style={{ background: 'transparent', padding: '4px 8px' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {sourceCode}
                  </ReactMarkdown>
                </div>
              ) : cell.cell_type === 'code' ? (
                <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '4px', overflow: 'hidden' }}>
                  <Editor
                    height={`${editorHeight}px`}
                    language="python"
                    value={sourceCode}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      lineNumbers: 'on',
                      renderLineHighlight: 'none',
                      folding: false,
                      matchBrackets: 'never',
                      scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
                      padding: { top: 16, bottom: 16 },
                      overviewRulerLanes: 0,
                      hideCursorInOverviewRuler: true,
                      fontSize: 13,
                      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                      lineHeight: 22,
                      wordWrap: 'on',
                      automaticLayout: true
                    }}
                  />
                </div>
              ) : null}

              {cell.outputs && cell.outputs.length > 0 && (
                <div style={{ marginTop: '8px', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', overflowX: 'auto', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
                  {cell.outputs.map((out, j) => {
                    if (out.output_type === 'stream') {
                      return Array.isArray(out.text) ? out.text.join('') : out.text;
                    } else if (out.output_type === 'execute_result' || out.output_type === 'display_data') {
                      if (out.data && out.data['text/plain']) {
                        return Array.isArray(out.data['text/plain']) ? out.data['text/plain'].join('') : out.data['text/plain'];
                      }
                    } else if (out.output_type === 'error') {
                      return (out.traceback || []).join('\\n');
                    }
                    return '';
                  }).join('\\n')}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
