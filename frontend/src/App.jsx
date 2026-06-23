import { useState, useMemo, useEffect } from 'react';
import PromptBar from './components/PromptBar';
import SessionSidebar from './components/SessionSidebar';
import FileTree from './components/FileTree';
import EditorPanel from './components/EditorPanel';
import ActivityPanel from './components/ActivityPanel';
import TerminalPanel from './components/TerminalPanel';
import DiffPanel from './components/DiffPanel';
import useAgentSocket from './hooks/useAgentSocket';
import './App.css';

export default function App() {
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sessionRefresh, setSessionRefresh] = useState(0);
  const [workspacePath, setWorkspacePath] = useState('C:/Users/Gladwin.aj/Downloads/workspace');

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

  return (
    <div className="app-layout" style={{ cursor: isResizing ? 'row-resize' : 'default' }}>
      {/* 1. Activity Bar (Far Left) */}
      <div className="activity-bar">
        <div 
          className={`activity-bar-icon ${activeSidebarTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('files')}
          title="Explorer"
        >
          📁
        </div>
        <div 
          className={`activity-bar-icon ${activeSidebarTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveSidebarTab('sessions')}
          title="Sessions"
        >
          🕒
        </div>
      </div>

      {/* 2. Primary Side Bar (Left) */}
      <div className="primary-sidebar">
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

      {/* 3. Main Content (Center + Bottom) */}
      <div className="main-content">
        <div className="editor-area">
          <EditorPanel
            sessionId={currentSessionId}
            workspacePath={workspacePath}
            selectedFile={selectedFile}
            refreshTrigger={fileRefreshTrigger}
          />
        </div>
        
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
      </div>

      {/* 4. Secondary Side Bar (Right) -> Chat & Prompt */}
      <div className="secondary-sidebar">
        <ActivityPanel events={events} agentStatus={agentStatus} />
        <PromptBar
          currentSessionId={currentSessionId}
          agentStatus={agentStatus}
          onSessionCreated={handleSessionCreated}
          workspacePath={workspacePath}
        />
      </div>
    </div>
  );
}
