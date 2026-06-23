import { useEffect, useState } from 'react';
import { getSessions, deleteAllSessions } from '../api';

/**
 * Sidebar listing all sessions with prompt preview, status, and timestamp.
 */
export default function SessionSidebar({ currentSessionId, onSelectSession, refreshTrigger }) {
  const [sessions, setSessions] = useState([]);

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

  return (
    <div className="session-sidebar" id="session-sidebar">
      <div className="panel-header">
        <h3>Chats</h3>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button className="btn btn-ghost btn-sm" onClick={handleDeleteAll} title="Delete all sessions" style={{ color: 'var(--status-error)' }}>
            🗑️
          </button>
          <button className="btn btn-ghost btn-sm" onClick={loadSessions} title="Refresh sessions">
            ↻
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
                <div className="prompt-preview" style={{ flex: 1, paddingRight: '12px', marginBottom: 0, minWidth: 0 }}>
                  {session.prompt}
                </div>
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
