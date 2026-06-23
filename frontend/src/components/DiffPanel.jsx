import { useState, useEffect, useMemo } from 'react';
import { getSessionDiff } from '../api';

const getFileIcon = (filename) => {
  if (filename.endsWith('.js') || filename.endsWith('.jsx')) return '⚛️';
  if (filename.endsWith('.py')) return '🐍';
  if (filename.endsWith('.css')) return '🎨';
  if (filename.endsWith('.html')) return '🌐';
  if (filename.endsWith('.json')) return '📋';
  if (filename.endsWith('.md')) return '📝';
  return '📄';
};

export default function DiffPanel({ sessionId, refreshTrigger }) {
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);

  const loadDiff = async () => {
    if (!sessionId) {
      setDiff('');
      return;
    }
    setLoading(true);
    try {
      const data = await getSessionDiff(sessionId);
      setDiff(data.diff || '');
      setSelectedFile(null);
    } catch (err) {
      console.error('Failed to load diff:', err);
      setDiff('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiff();
  }, [sessionId, refreshTrigger]);

  const files = useMemo(() => {
    if (!diff) return [];
    const lines = diff.split('\n');
    const parsedFiles = [];
    let currentFile = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('--- ')) {
        const oldName = line.substring(4).split('\t')[0].trim();
        currentFile = { oldName, newName: '', additions: 0, deletions: 0, lines: [line] };
        parsedFiles.push(currentFile);
      } else if (line.startsWith('+++ ') && currentFile) {
        const newName = line.substring(4).split('\t')[0].trim();
        currentFile.newName = newName;
        currentFile.lines.push(line);
      } else if (currentFile) {
        currentFile.lines.push(line);
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentFile.additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentFile.deletions++;
        }
      }
    }

    return parsedFiles.map(file => {
      let rawPath = file.newName && file.newName !== '/dev/null' ? file.newName : file.oldName;
      if (rawPath.startsWith('b/') || rawPath.startsWith('a/')) {
        rawPath = rawPath.substring(2);
      }
      const name = rawPath.split('/').pop() || rawPath.split('\\').pop() || rawPath;
      return {
        ...file,
        name,
        displayPath: rawPath
      };
    });
  }, [diff]);

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  const renderSelectedFileDiff = () => {
    if (!selectedFile) return null;
    const file = files.find(f => f.name === selectedFile);
    if (!file) return null;

    return (
      <div className="diff-content" style={{ marginTop: 'var(--space-md)' }}>
        <div style={{ marginBottom: 'var(--space-md)', fontWeight: 600 }}>
          {file.displayPath}
        </div>
        {file.lines.map((line, idx) => {
          let className = '';
          if (line.startsWith('+') && !line.startsWith('+++')) {
            className = 'diff-line-add';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            className = 'diff-line-del';
          } else if (line.startsWith('@@')) {
            className = 'diff-line-hunk';
          } else if (line.startsWith('---') || line.startsWith('+++')) {
            className = 'diff-line-header';
          }

          return (
            <div key={idx} className={className}>
              {line}
            </div>
          );
        })}
      </div>
    );
  };

  const renderEmptyState = () => {
    return (
      <div className="empty-state">
        <div className="empty-icon">📊</div>
        <p>No diff available. Changes will appear here after the agent modifies files.</p>
      </div>
    );
  };

  return (
    <div className="diff-panel" id="diff-panel">
      <div className="panel-header">
        <h3>Diff</h3>
        <button
          className="btn btn-ghost btn-sm"
          onClick={loadDiff}
          disabled={loading || !sessionId}
          title="Refresh diff"
        >
          {loading ? <span className="spinner" /> : '↻'} Refresh
        </button>
      </div>
      
      {!diff ? (
        renderEmptyState()
      ) : (
        <>
          <div className="diff-summary-bar" onClick={() => setExpanded(!expanded)}>
            <div>
              {files.length} files changed
            </div>
            <div className="diff-summary-stats">
              <span className="diff-stats-adds">+{totalAdditions}</span>
              <span className="diff-stats-dels">-{totalDeletions}</span>
            </div>
            <div style={{ marginLeft: 'auto' }} className={`diff-chevron ${expanded ? 'expanded' : ''}`}>
              ▼
            </div>
          </div>
          
          {expanded && (
            <div className="diff-file-list">
              {files.map((file, idx) => (
                <div 
                  key={idx} 
                  className={`diff-file-row ${selectedFile === file.name ? 'selected' : ''}`}
                  onClick={() => setSelectedFile(selectedFile === file.name ? null : file.name)}
                  style={{ display: 'flex', alignItems: 'center' }}
                >
                  <span className="diff-file-icon">{getFileIcon(file.name)}</span>
                  <span className="diff-file-name">{file.name}</span>
                  <span className="diff-file-path" title={file.displayPath}>
                    {file.displayPath}
                  </span>
                  <div className="diff-file-stats" style={{ marginLeft: 'auto', display: 'flex', gap: '8px', fontSize: '0.8rem', paddingRight: '8px' }}>
                    {file.additions > 0 && <span className="diff-stats-adds">+{file.additions}</span>}
                    {file.deletions > 0 && <span className="diff-stats-dels">-{file.deletions}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ overflow: 'auto', flex: 1 }}>
            {renderSelectedFileDiff()}
          </div>
        </>
      )}
    </div>
  );
}
