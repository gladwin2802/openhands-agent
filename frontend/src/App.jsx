import { useState, useMemo, useEffect } from 'react';
import PromptBar from './components/PromptBar';
import SessionSidebar from './components/SessionSidebar';
import FileTree from './components/FileTree';
import EditorPanel from './components/EditorPanel';
import ActivityPanel from './components/ActivityPanel';
import TerminalPanel from './components/TerminalPanel';
import DiffPanel from './components/DiffPanel';
import DashboardPanel from './components/DashboardPanel';
import useAgentSocket from './hooks/useAgentSocket';
import { VscFiles, VscChecklist, VscGraph } from 'react-icons/vsc';
import { browseFolder } from './api';
import './App.css';

export default function App() {
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sessionRefresh, setSessionRefresh] = useState(0);
  const [workspacePath, setWorkspacePath] = useState(localStorage.getItem('workspacePath') || '');
  
  const [showWorkspacePopup, setShowWorkspacePopup] = useState(!localStorage.getItem('workspacePath'));
  const [tempWorkspacePath, setTempWorkspacePath] = useState(workspacePath);

  useEffect(() => {
    if (workspacePath) {
      localStorage.setItem('workspacePath', workspacePath);
    }
  }, [workspacePath]);

  const handleBrowseWorkspace = async () => {
    try {
      const res = await browseFolder();
      if (res.path) {
        setTempWorkspacePath(res.path);
      }
    } catch (err) {
      console.error("Failed to browse folder", err);
    }
  };

  const handleSaveWorkspace = () => {
    if (!tempWorkspacePath.trim()) return;
    setWorkspacePath(tempWorkspacePath.trim());
    setShowWorkspacePopup(false);
  };

  // WebSocket event stream
  const { events, isConnected } = useAgentSocket(currentSessionId);

  // Derive agent status from events
  const agentStatus = useMemo(() => {
    const statusEvents = events.filter((e) => e.event_type === 'status');
    if (statusEvents.length > 0) {
      return statusEvents[statusEvents.length - 1].payload?.status || 'unknown';
    }
    return currentSessionId ? 'pending' : 'idle';
  }, [events, currentSessionId]);

  // Count file_changed events as refresh trigger
  const fileRefreshTrigger = useMemo(() => {
    return events.filter((e) => e.event_type === 'file_changed').length;
  }, [events]);

  // Derive diff refresh trigger (refresh when status changes to completed)
  const diffRefreshTrigger = useMemo(() => {
    return events.filter((e) => e.event_type === 'status' && e.payload?.status === 'completed').length;
  }, [events]);

  const handleSessionCreated = (session) => {
    setCurrentSessionId(session.id);
    setSessionRefresh((prev) => prev + 1);
  };

  const handleSelectSession = (session) => {
    setCurrentSessionId(session ? session.id : null);
    if (!session) setSelectedFile(null);
  };

  const [activeSidebarTab, setActiveSidebarTab] = useState('files');
  const [activeBottomTab, setActiveBottomTab] = useState('terminal');

  // --- Resizing logic ---
  const [bottomPanelHeight, setBottomPanelHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      // Calculate new height from bottom
      const newHeight = window.innerHeight - e.clientY;
      // Constrain height between 100px and 80% of window
      if (newHeight > 100 && newHeight < window.innerHeight * 0.8) {
        setBottomPanelHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const startResizing = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const [rightPanelWidth, setRightPanelWidth] = useState(380);
  const [isRightResizing, setIsRightResizing] = useState(false);

  const [leftPanelWidth, setLeftPanelWidth] = useState(250);
  const [isLeftResizing, setIsLeftResizing] = useState(false);

  // Right Panel Resizing
  useEffect(() => {
    const handleRightMouseMove = (e) => {
      if (!isRightResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 250 && newWidth < window.innerWidth * 0.6) {
        setRightPanelWidth(newWidth);
      }
    };

    const handleRightMouseUp = () => {
      setIsRightResizing(false);
    };

    if (isRightResizing) {
      document.addEventListener('mousemove', handleRightMouseMove);
      document.addEventListener('mouseup', handleRightMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleRightMouseMove);
      document.removeEventListener('mouseup', handleRightMouseUp);
    };
  }, [isRightResizing]);

  // Left Panel Resizing
  useEffect(() => {
    const handleLeftMouseMove = (e) => {
      if (!isLeftResizing) return;
      // activity-bar width is ~48px
      const newWidth = e.clientX - 48;
      if (newWidth > 150 && newWidth < window.innerWidth * 0.5) {
        setLeftPanelWidth(newWidth);
      }
    };

    const handleLeftMouseUp = () => {
      setIsLeftResizing(false);
    };

    if (isLeftResizing) {
      document.addEventListener('mousemove', handleLeftMouseMove);
      document.addEventListener('mouseup', handleLeftMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleLeftMouseMove);
      document.removeEventListener('mouseup', handleLeftMouseUp);
    };
  }, [isLeftResizing]);

  const startRightResizing = (e) => {
    e.preventDefault();
    setIsRightResizing(true);
  };

  const startLeftResizing = (e) => {
    e.preventDefault();
    setIsLeftResizing(true);
  };

  return (
    <div className="app-layout" style={{ cursor: isResizing ? 'row-resize' : (isRightResizing || isLeftResizing) ? 'col-resize' : 'default' }}>
      {showWorkspacePopup && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ background: '#1e1e1e', padding: '30px', borderRadius: '12px', width: '450px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', border: '1px solid #333' }}>
            <h2 style={{ marginTop: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.4rem' }}>📁</span> Set Workspace Directory
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '24px', lineHeight: '1.5' }}>
              Welcome! Please select the root directory for your project. This is required before the agent can start.
            </p>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
              <input 
                type="text" 
                value={tempWorkspacePath} 
                onChange={(e) => setTempWorkspacePath(e.target.value)}
                placeholder="C:/path/to/workspace"
                style={{ flex: 1, background: '#2d2d2d', border: '1px solid #444', color: '#fff', padding: '10px 12px', borderRadius: '6px', fontSize: '0.9rem' }}
              />
              <button 
                onClick={handleBrowseWorkspace}
                style={{ background: 'var(--bg-secondary)', border: '1px solid #555', color: '#fff', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Browse...
              </button>
            </div>
            
            <button 
              onClick={handleSaveWorkspace}
              disabled={!tempWorkspacePath.trim()}
              style={{ width: '100%', background: tempWorkspacePath.trim() ? '#0084ff' : '#444', color: tempWorkspacePath.trim() ? '#fff' : '#888', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '1rem', cursor: tempWorkspacePath.trim() ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }}
            >
              Initialize Workspace
            </button>
          </div>
        </div>
      )}

      {/* 1. Activity Bar (Far Left) */}
      <div className="activity-bar">
        <div 
          className={`activity-bar-icon ${activeSidebarTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('files')}
          title="Explorer"
        >
          <VscFiles size={24} />
        </div>
        <div 
          className={`activity-bar-icon ${activeSidebarTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('sessions')}
          title="Agent Tasks"
        >
          <VscChecklist size={24} />
        </div>
        <div 
          className={`activity-bar-icon ${activeSidebarTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('dashboard')}
          title="Metrics Dashboard"
        >
          <VscGraph size={24} />
        </div>
      </div>

      {/* 2. Primary Side Bar (Left) */}
      <div className="primary-sidebar" style={{ width: activeSidebarTab === 'dashboard' ? 0 : leftPanelWidth, minWidth: activeSidebarTab === 'dashboard' ? 0 : leftPanelWidth, maxWidth: activeSidebarTab === 'dashboard' ? 0 : leftPanelWidth, overflow: 'hidden', borderRight: activeSidebarTab === 'dashboard' ? 'none' : undefined }}>
        {activeSidebarTab === 'files' ? (
          <FileTree
            sessionId={currentSessionId}
            workspacePath={workspacePath}
            setWorkspacePath={setWorkspacePath}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            refreshTrigger={fileRefreshTrigger}
          />
        ) : (
          <SessionSidebar
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            refreshTrigger={sessionRefresh}
          />
        )}
      </div>

      {/* Left Vertical Resizer */}
      <div 
        className="vertical-resizer" 
        onMouseDown={startLeftResizing}
      />

      {/* 3. Main Content (Center + Bottom) */}
      <div className="main-content">
        <div className="editor-area">
          {activeSidebarTab === 'dashboard' ? (
            <DashboardPanel />
          ) : (!currentSessionId && !selectedFile) ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '20px', overflowY: 'auto' }}>
              <div style={{ width: '100%', maxWidth: '800px' }}>
                <PromptBar
                  currentSessionId={currentSessionId}
                  agentStatus={agentStatus}
                  onSessionCreated={handleSessionCreated}
                  workspacePath={workspacePath}
                />
              </div>
            </div>
          ) : (
            <EditorPanel
              sessionId={currentSessionId}
              workspacePath={workspacePath}
              selectedFile={selectedFile}
              refreshTrigger={fileRefreshTrigger}
            />
          )}
        </div>
        
        {activeSidebarTab !== 'dashboard' && (
          <>
            {/* Resizer */}
            <div 
              className="horizontal-resizer" 
              onMouseDown={startResizing}
            />

            {/* Bottom Panel */}
            <div className="bottom-panel-area" style={{ height: bottomPanelHeight }}>
              <div className="editor-tabs">
                <div 
                  className={`editor-tab ${activeBottomTab === 'terminal' ? 'active' : ''}`}
                  onClick={() => setActiveBottomTab('terminal')}
                >
                  TERMINAL
                </div>
                <div 
                  className={`editor-tab ${activeBottomTab === 'diff' ? 'active' : ''}`}
                  onClick={() => setActiveBottomTab('diff')}
                >
                  DIFF
                </div>
              </div>
              
              <div className="editor-container" style={{ display: activeBottomTab === 'terminal' ? 'flex' : 'none' }}>
                <TerminalPanel events={events} />
              </div>
              <div className="editor-container" style={{ display: activeBottomTab === 'diff' ? 'flex' : 'none' }}>
                <DiffPanel
                  sessionId={currentSessionId}
                  refreshTrigger={diffRefreshTrigger}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {activeSidebarTab !== 'dashboard' && (
        <>
          {/* Right Vertical Resizer */}
          <div 
            className="vertical-resizer" 
            onMouseDown={startRightResizing}
          />

          {/* 4. Secondary Side Bar (Right) -> Activity & Config */}
          <div className="secondary-sidebar" style={{ width: rightPanelWidth, minWidth: rightPanelWidth, maxWidth: rightPanelWidth }}>
            <ActivityPanel 
              events={events} 
              agentStatus={agentStatus}
              sessionId={currentSessionId}
            />
          </div>
        </>
      )}
    </div>
  );
}
