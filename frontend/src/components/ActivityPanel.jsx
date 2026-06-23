import { useEffect, useRef, useState } from 'react';

const Chevron = ({ expanded }) => (
  <svg 
    style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}
    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
  >
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

const renderSubEventContent = (event) => {
  const payload = event.payload || {};
  if (event.event_type === 'file_changed') {
    const actionIcon = payload.action === 'created' ? '➕' : payload.action === 'deleted' ? '➖' : '✏️';
    return <span className="sub-event-item file" title={payload.path}>{actionIcon} {payload.path}</span>;
  }
  if (event.event_type === 'terminal') {
    const isCommand = payload.type === 'command';
    return (
      <span className="sub-event-item" style={{ fontFamily: 'var(--font-mono)', color: isCommand ? 'var(--text-primary)' : 'var(--text-muted)' }}>
        {isCommand ? '> ' : ''}{payload.content || ''}
      </span>
    );
  }
  if (event.event_type === 'error') {
    return <span className="sub-event-item" style={{ color: 'var(--status-error)' }}>❌ {payload.content || 'Unknown error'}</span>;
  }
  if (event.event_type === 'activity') {
    return <span className="sub-event-item" style={{ color: 'var(--text-secondary)' }}>{payload.content || ''}</span>;
  }
  return <span className="sub-event-item">{JSON.stringify(payload)}</span>;
};

const ActionSubGroup = ({ type, events }) => {
  const [expanded, setExpanded] = useState(false);
  
  let title = '';
  if (type === 'file_changed') title = `Explored ${events.length} file${events.length > 1 ? 's' : ''}`;
  else if (type === 'terminal') title = `Executed ${events.length} terminal action${events.length > 1 ? 's' : ''}`;
  else if (type === 'error') title = `Encountered ${events.length} error${events.length > 1 ? 's' : ''}`;
  else if (type === 'activity') title = `${events.length} Action${events.length > 1 ? 's' : ''}`;
  else title = `${events.length} ${type} event${events.length > 1 ? 's' : ''}`;

  return (
    <div className="action-group">
      <div className="action-group-header" onClick={() => setExpanded(!expanded)}>
        <Chevron expanded={expanded} />
        <span>{title}</span>
      </div>
      {expanded && (
        <div className="action-group-content">
          {events.map((e, idx) => (
             <div key={idx} style={{ display: 'flex' }}>
               {renderSubEventContent(e)}
             </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ThoughtGroup = ({ content }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="action-group">
      <div className="action-group-header" onClick={() => setExpanded(!expanded)}>
        <Chevron expanded={expanded} />
        <span>Thought</span>
      </div>
      {expanded && (
        <div className="action-group-content">
          <div className="sub-event-item" style={{ color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
            {content}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Activity panel showing hierarchical agent actions and messages.
 */
export default function ActivityPanel({ events, agentStatus }) {
  const bottomRef = useRef(null);
  const [activeTab, setActiveTab] = useState('activity');

  const filteredEvents = events.filter(e => 
    e.event_type !== 'terminal' && 
    e.event_type !== 'status' &&
    e.event_type !== 'task_update'
  );

  const latestTaskEvent = events.filter(e => e.event_type === 'task_update').pop();

  useEffect(() => {
    if (activeTab === 'activity') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredEvents.length, activeTab]);

  const displayItems = [];
  let currentGroup = null;

  for (const e of filteredEvents) {
    if (e.event_type === 'message') {
      if (currentGroup) {
        displayItems.push(currentGroup);
        currentGroup = null;
      }
      
      const payload = e.payload || {};
      const role = payload.role || 'agent';
      let content = payload.content || '';
      
      // Models prefilled with <think> might omit the opening tag but include </think>
      if (content.includes('</think>') && !content.includes('<think>')) {
        content = '<think>\n' + content;
      }
      
      // Extract <think> blocks
      const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
      let match;
      let lastIndex = 0;
      
      while ((match = thinkRegex.exec(content)) !== null) {
        const beforeText = content.substring(lastIndex, match.index).trim();
        if (beforeText) {
          displayItems.push({ type: 'message', role, content: beforeText });
        }
        
        const thoughtContent = match[1].trim();
        if (thoughtContent) {
          displayItems.push({ type: 'thought', content: thoughtContent });
        }
        
        lastIndex = thinkRegex.lastIndex;
      }
      
      const remainingText = content.substring(lastIndex).trim();
      if (remainingText) {
        displayItems.push({ type: 'message', role, content: remainingText });
      } else if (content.trim() === '' && lastIndex === 0) {
        displayItems.push({ type: 'message', role, content: '' });
      }

    } else {
      if (!currentGroup || currentGroup.type !== e.event_type) {
        if (currentGroup) displayItems.push(currentGroup);
        currentGroup = { type: e.event_type, events: [e] };
      } else {
        currentGroup.events.push(e);
      }
    }
  }
  if (currentGroup) displayItems.push(currentGroup);

  return (
    <div className="activity-panel" id="activity-panel">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3>Activity</h3>
            <span className={`status-dot ${agentStatus}`} title={`Status: ${agentStatus}`}></span>
          </div>
          <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: '2px', gap: '2px' }}>
            <button 
              onClick={() => setActiveTab('activity')}
              style={{
                background: activeTab === 'activity' ? 'var(--bg-secondary)' : 'transparent',
                color: activeTab === 'activity' ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: activeTab === 'activity' ? 'var(--shadow-sm)' : 'none',
                border: 'none', padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.05em', borderRadius: 'var(--radius-sm)', cursor: 'pointer'
              }}
            >
              Feed
            </button>
            <button 
              onClick={() => setActiveTab('tasks')}
              style={{
                background: activeTab === 'tasks' ? 'var(--bg-secondary)' : 'transparent',
                color: activeTab === 'tasks' ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: activeTab === 'tasks' ? 'var(--shadow-sm)' : 'none',
                border: 'none', padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.05em', borderRadius: 'var(--radius-sm)', cursor: 'pointer'
              }}
            >
              Tasks
            </button>
          </div>
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {activeTab === 'activity' ? `${displayItems.length} items` : ''}
        </span>
      </div>
      <div className="panel-content" style={{ padding: 'var(--space-md) 0' }}>
        {activeTab === 'activity' ? (
          <>
            {displayItems.length === 0 ? (
              <div className="empty-state">
                {agentStatus === 'running' ? (
                  <>
                    <span className="spinner" style={{ width: '24px', height: '24px', marginBottom: '16px', opacity: 0.7 }} />
                    <p>Agent is setting up the workspace and thinking...</p>
                  </>
                ) : (
                  <>
                    <div className="empty-icon">📋</div>
                    <p>Agent activity will appear here when a session is running.</p>
                  </>
                )}
              </div>
            ) : (
              displayItems.map((item, idx) => {
                if (item.type === 'message') {
                  return (
                    <div key={idx} className={`message-turn ${item.role}`}>
                      <div style={{ fontWeight: 600, color: item.role === 'user' ? 'var(--accent-primary-hover)' : 'var(--text-accent)', marginBottom: '4px' }}>
                        {item.role === 'user' ? '👤 You' : '🤖 Agent'}
                      </div>
                      <div style={{ paddingLeft: '2px' }}>{item.content}</div>
                    </div>
                  );
                } else if (item.type === 'thought') {
                  return <ThoughtGroup key={idx} content={item.content} />;
                } else {
                  return <ActionSubGroup key={idx} type={item.type} events={item.events} />;
                }
              })
            )}
            
            {displayItems.length > 0 && agentStatus === 'running' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', color: 'var(--text-muted)' }}>
                <span className="spinner" style={{ width: '16px', height: '16px', opacity: 0.7 }} />
                <span style={{ fontSize: '0.9rem', fontStyle: 'italic' }}>Agent is thinking...</span>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        ) : (
          <div className="tasks-content" style={{ padding: '0 16px', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
            {latestTaskEvent ? latestTaskEvent.payload?.content : 'No tasks created yet.'}
          </div>
        )}
      </div>
    </div>
  );
}
