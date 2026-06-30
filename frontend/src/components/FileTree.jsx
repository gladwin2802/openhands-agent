import { useState, useEffect } from 'react';
import { listFiles, browseFolder } from '../api';
import {
  VscChevronRight, VscChevronDown,
  VscFolder, VscFolderOpened, VscFile,
  VscJson, VscMarkdown, VscFileCode, VscSettingsGear, VscRefresh,
  VscCollapseAll, VscSearch, VscClose
} from 'react-icons/vsc';

const getFileIcon = (name) => {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'json') return <VscJson color="#cbcb41" />;
  if (ext === 'md') return <VscMarkdown color="#42a5f5" />;
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'yml', 'yaml', 'html', 'css', 'toml', 'bat'].includes(ext)) return <VscFileCode color="#42a5f5" />;
  if (name.includes('config') || name.includes('settings')) return <VscSettingsGear color="#888" />;
  return <VscFile color="#888" />;
};

/**
 * Recursive file tree component for the workspace.
 */
function TreeNode({ node, depth, selectedFile, onSelectFile, collapseTrigger, searchQuery }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isDir = node.type === 'directory';
  const isActive = selectedFile === node.path;

  useEffect(() => {
    if (collapseTrigger > 0) {
      setExpanded(false);
    }
  }, [collapseTrigger]);

  useEffect(() => {
    if (searchQuery) {
      setExpanded(true);
    }
  }, [searchQuery]);

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
        style={{ 
          paddingLeft: `${depth * 12 + 8}px`, 
          display: 'flex', 
          alignItems: 'center', 
          gap: '4px',
          fontFamily: 'var(--font-primary)',
          cursor: 'pointer'
        }}
        onClick={handleClick}
        title={node.path}
      >
        {/* Chevron for directories, empty spacer for files */}
        <span style={{ display: 'flex', alignItems: 'center', width: '16px', justifyContent: 'center', flexShrink: 0 }}>
          {isDir ? (
            expanded ? <VscChevronDown size={14} color="var(--text-muted)" /> : <VscChevronRight size={14} color="var(--text-muted)" />
          ) : <span style={{ width: 14 }}></span>}
        </span>
        
        {/* File/Folder Icon */}
        <span style={{ display: 'flex', alignItems: 'center', fontSize: '14px', flexShrink: 0 }}>
          {isDir ? (
            expanded ? <VscFolderOpened color="#dcb67a" /> : <VscFolder color="#dcb67a" />
          ) : (
            getFileIcon(node.name)
          )}
        </span>
        
        {/* File Name */}
        <span className="node-name" style={{ fontSize: '13px', marginLeft: '4px', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {node.name}
        </span>
      </div>
      {isDir && expanded && node.children && (
        <div className="tree-children" style={{ position: 'relative' }}>
          {/* Subtle indent guide */}
          <div style={{ position: 'absolute', left: `${depth * 12 + 20}px`, top: 0, bottom: 0, width: '1px', background: 'var(--surface-border)', opacity: 0.5, pointerEvents: 'none' }} />
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              collapseTrigger={collapseTrigger}
              searchQuery={searchQuery}
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
  const [searchQuery, setSearchQuery] = useState('');
  const [collapseTrigger, setCollapseTrigger] = useState(0);

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
    
    const interval = setInterval(() => {
      loadFiles();
    }, 5000);
    
    return () => clearInterval(interval);
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

  const handleCollapseAll = () => {
    setCollapseTrigger(prev => prev + 1);
  };

  const filterTree = (nodes, query) => {
    if (!query) return nodes;
    const q = query.toLowerCase();
    
    return nodes.map(node => {
      if (node.name.toLowerCase().includes(q)) {
        return node;
      }
      if (node.type === 'directory' && node.children) {
        const filteredChildren = filterTree(node.children, query);
        if (filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
      }
      return null;
    }).filter(Boolean);
  };

  const filteredFiles = filterTree(files, searchQuery);

  return (
    <div className="file-tree" id="file-tree" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
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
          <button className="btn btn-ghost btn-sm" onClick={handleCollapseAll} title="Collapse All" style={{ padding: '4px' }}>
            <VscCollapseAll size={16} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleBrowseFolder} title={`Select workspace folder\nCurrent: ${workspacePath || 'None'}`} style={{ padding: '4px' }}>
            <VscFolderOpened size={16} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={loadFiles} title="Refresh files" style={{ padding: '4px' }}>
            {loading ? <span className="spinner" /> : <VscRefresh size={16} />}
          </button>
        </div>
      </div>

      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--surface-border)', flexShrink: 0, background: 'var(--bg-secondary)' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <VscSearch size={16} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            placeholder="Search files..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ 
              width: '100%', 
              background: 'var(--bg-tertiary)', 
              border: '1px solid var(--surface-border)', 
              borderRadius: '6px', 
              padding: '8px 32px 8px 32px', 
              color: 'var(--text-primary)', 
              fontSize: '0.85rem',
              outline: 'none',
              transition: 'border-color 0.2s ease'
            }}
          />
          {searchQuery && (
            <VscClose 
              size={16} 
              style={{ position: 'absolute', right: '10px', color: 'var(--text-muted)', cursor: 'pointer' }} 
              onClick={() => setSearchQuery('')}
            />
          )}
        </div>
      </div>

      <div className="panel-content" style={{ flex: 1, overflowY: 'auto' }}>
        {filteredFiles.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📁</div>
            <p>Workspace is empty.</p>
          </div>
        ) : (
          filteredFiles.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              collapseTrigger={collapseTrigger}
              searchQuery={searchQuery}
            />
          ))
        )}
      </div>
    </div>
  );
}
