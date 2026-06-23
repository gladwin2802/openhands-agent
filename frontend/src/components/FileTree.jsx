import { useState, useEffect } from 'react';
import { listFiles, browseFolder } from '../api';

/**
 * Recursive file tree component for the workspace.
 */
function TreeNode({ node, depth, selectedFile, onSelectFile }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isDir = node.type === 'directory';
  const isActive = selectedFile === node.path;

  const handleClick = () => {
    if (isDir) {
      setExpanded(!expanded);
    } else {
      onSelectFile(node.path);
    }
  };

  return (
    <div>
      <div
        className={`file-tree-node ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        title={node.path}
      >
        <span className="node-icon">
          {isDir ? (expanded ? '📂' : '📁') : '📄'}
        </span>
        <span className="node-name">{node.name}</span>
      </div>
      {isDir && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * File explorer panel with expandable tree and refresh on file changes.
 */
export default function FileTree({ sessionId, workspacePath, setWorkspacePath, selectedFile, onSelectFile, refreshTrigger }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadFiles = async () => {
    if (!sessionId && !workspacePath) {
      setFiles([]);
      return;
    }
    setLoading(true);
    try {
      const data = await listFiles(sessionId, workspacePath);
      setFiles(data);
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [sessionId, workspacePath, refreshTrigger]);

  const handleBrowseFolder = async () => {
    try {
      const data = await browseFolder();
      if (data.path && setWorkspacePath) {
        setWorkspacePath(data.path);
      }
    } catch (err) {
      console.error('Failed to browse folder:', err);
    }
  };

  return (
    <div className="file-tree" id="file-tree">
      <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          <h3 style={{ margin: 0 }}>Files</h3>
          {workspacePath && (
            <span 
              title={workspacePath} 
              style={{ fontSize: '0.8rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'help' }}
            >
              ({workspacePath.split(/[/\\]/).pop()})
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={handleBrowseFolder} title={`Select workspace folder\nCurrent: ${workspacePath || 'None'}`}>
            📂
          </button>
          <button className="btn btn-ghost btn-sm" onClick={loadFiles} title="Refresh files">
            {loading ? <span className="spinner" /> : '↻'}
          </button>
        </div>
      </div>
      <div className="panel-content">
        {files.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📁</div>
            <p>Workspace is empty.</p>
          </div>
        ) : (
          files.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
            />
          ))
        )}
      </div>
    </div>
  );
}
