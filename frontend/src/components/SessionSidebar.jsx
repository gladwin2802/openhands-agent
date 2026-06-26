import { useEffect, useState } from 'react';
import { getSessions, deleteAllSessions, updateSessionName, deleteSession } from '../api';
import { VscAdd, VscTrash, VscRefresh, VscEdit } from 'react-icons/vsc';

/**
 * Sidebar listing all sessions with prompt preview, status, and timestamp.
 */
export default function SessionSidebar({ currentSessionId, onSelectSession, refreshTrigger }) {
  const [sessions, setSessions] = useState([]);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');

  useEffect(() => {
    loadSessions();
  }, [refreshTrigger]);

  // Poll for session updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadSessions = async () => {
    try {
      const data = await getSessions();
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const handleDeleteAll = async () => {
    if (window.confirm("Are you sure you want to delete all sessions? This cannot be undone.")) {
      try {
        await deleteAllSessions();
        onSelectSession(null); // Clear active session in parent
        loadSessions(); // Refresh list
      } catch (err) {
        console.error('Failed to delete sessions:', err);
      }
    }
  };

  const formatTime = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const handleEditClick = (e, session) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditNameValue(session.name || session.prompt);
  };

  const handleEditSubmit = async (e, sessionId) => {
    e.preventDefault();
    if (!editNameValue.trim()) {
      setEditingSessionId(null);
      return;
    }
    try {
      await updateSessionName(sessionId, editNameValue.trim());
      setEditingSessionId(null);
      loadSessions(); // refresh list to show new name
    } catch (err) {
      console.error('Failed to rename session:', err);
    }
  };

  const handleEditKeyDown = (e, sessionId) => {
    if (e.key === 'Enter') {
      handleEditSubmit(e, sessionId);
    } else if (e.key === 'Escape') {
      setEditingSessionId(null);
    }
  };

  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this task?")) {
      try {
        await deleteSession(sessionId);
        if (currentSessionId === sessionId) {
          onSelectSession(null);
        }
        loadSessions();
      } catch (err) {
        console.error('Failed to delete session:', err);
      }
    }
  };

  return (
    <div className="session-sidebar" id="session-sidebar">
      <div className="panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3>Agent Tasks</h3>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onSelectSession(null)} title="New Task" style={{ padding: '4px' }}>
            <VscAdd size={16} />
          </button>
          {/* <button className="btn btn-ghost btn-sm" onClick={handleDeleteAll} title="Delete all sessions" style={{ color: 'var(--status-error)', padding: '4px' }}>
            <VscTrash size={16} />
          </button> */}
          <button className="btn btn-ghost btn-sm" onClick={loadSessions} title="Refresh sessions" style={{ padding: '4px' }}>
            <VscRefresh size={16} />
          </button>
        </div>
      </div>
      <div className="panel-content">
        {sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💬</div>
            <p>No sessions yet. Enter a prompt to start.</p>
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`session-item ${session.id === currentSessionId ? 'active' : ''}`}
              onClick={() => onSelectSession(session)}
              id={`session-${session.id}`}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                {editingSessionId === session.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    onKeyDown={(e) => handleEditKeyDown(e, session.id)}
                    onBlur={(e) => handleEditSubmit(e, session.id)}
                    style={{ flex: 1, marginRight: '8px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--accent-primary)', borderRadius: '4px', padding: '2px 6px', fontSize: '0.85rem', outline: 'none' }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="prompt-preview" style={{ flex: 1, paddingRight: '4px', marginBottom: 0, minWidth: 0, display: 'flex', alignItems: 'center' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={session.name || session.prompt}>
                      {session.name || session.prompt}
                    </span>
                    <button 
                      onClick={(e) => handleEditClick(e, session)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 4px', opacity: 0.6, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = 0.6}
                      title="Rename Task"
                    >
                      <VscEdit size={14} />
                    </button>
                    <button 
                      onClick={(e) => handleDeleteSession(e, session.id)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--status-error)', cursor: 'pointer', padding: '0 4px', opacity: 0.6, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = 0.6}
                      title="Delete Task"
                    >
                      <VscTrash size={14} />
                    </button>
                  </div>
                )}
                <span className={`status-dot ${session.status}`} title={`Status: ${session.status}`} style={{ flexShrink: 0, marginTop: '4px' }}></span>
              </div>
              <div className="session-meta" style={{ marginTop: 'var(--space-xs)', justifyContent: 'flex-end' }}>
                <span className="session-time">{formatTime(session.created_at)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
