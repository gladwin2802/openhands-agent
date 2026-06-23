import { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
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
