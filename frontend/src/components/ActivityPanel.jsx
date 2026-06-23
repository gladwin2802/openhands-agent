import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { stopSession } from '../api';

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
  if (event.event_type === 'task_update') {
    return <span className="sub-event-item" style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>{payload.content || ''}</span>;
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
  else if (type === 'task_update') title = `Task list updated (${events.length} event${events.length > 1 ? 's' : ''})`;
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

const SuperGroup = ({ items }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="action-group">
      <div className="action-group-header" onClick={() => setExpanded(!expanded)}>
        <Chevron expanded={expanded} />
        <span>{items.length} Background Steps</span>
      </div>
      {expanded && (
        <div className="action-group-content" style={{ paddingLeft: '8px', borderLeft: '1px solid var(--surface-border)', marginLeft: '6px' }}>
          {items.map((item, idx) => {
            if (item.type === 'thought') {
              return <ThoughtGroup key={idx} content={item.content} />;
            } else {
              return <ActionSubGroup key={idx} type={item.type} events={item.events} />;
            }
          })}
        </div>
      )}
    </div>
  );
};

const parseTasks = (content) => {
  if (!content) return [];
  const lines = content.split('\n');
  const tasks = [];
  let currentTask = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match line like: ✅ 1. Explore workspace...
    // We use a regex that looks for optional non-word chars, then a number, then a dot.
    const match = line.match(/^([^\w\s]*)\s*(\d+)\.\s+(.*)$/);
    if (match) {
      if (currentTask) tasks.push(currentTask);
      currentTask = {
        icon: match[1].trim(),
        id: match[2],
        title: match[3].trim(),
        notes: ''
      };
    } else if (currentTask) {
      // If it's a notes line
      const notesMatch = line.match(/^\s*Notes:\s*(.*)$/i);
      if (notesMatch) {
        currentTask.notes = notesMatch[1].trim();
      } else if (line.trim() !== '' && !line.includes('Task list updated')) {
        // Append to notes if it's a continuation
        if (currentTask.notes) currentTask.notes += '\n' + line.trim();
        else currentTask.notes = line.trim();
      }
    }
  }
  if (currentTask) tasks.push(currentTask);
  return tasks;
};

/**
 * Activity panel showing hierarchical agent actions and messages.
 */
export default function ActivityPanel({ events, agentStatus, sessionId }) {
  const bottomRef = useRef(null);
  const [activeTab, setActiveTab] = useState('activity');

  const filteredEvents = events.filter(e => 
    e.event_type !== 'terminal' && 
    e.event_type !== 'status'
  );

  const taskSets = [];
  events.filter(e => e.event_type === 'task_update').forEach(e => {
    const parsed = parseTasks(e.payload?.content);
    if (parsed.length === 0) return;
    
    let isNewSet = false;
    if (taskSets.length > 0) {
      const currentSet = taskSets[taskSets.length - 1];
      for (const task of parsed) {
        const existing = currentSet.get(task.id);
        // If a task with the same ID has a completely different title, the agent started a new task set
        if (existing && existing.title.trim().toLowerCase() !== task.title.trim().toLowerCase()) {
          isNewSet = true;
          break;
        }
      }
    } else {
      isNewSet = true;
    }
    
    if (isNewSet) {
      const newSet = new Map();
      for (const task of parsed) {
        newSet.set(task.id, task);
      }
      taskSets.push(newSet);
    } else {
      const currentSet = taskSets[taskSets.length - 1];
      for (const task of parsed) {
        currentSet.set(task.id, task);
      }
    }
  });

  const taskSetsList = taskSets.map(map => Array.from(map.values()).sort((a, b) => parseInt(a.id) - parseInt(b.id)));

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

  const finalDisplayItems = [];
  let currentSuperGroup = [];

  for (const item of displayItems) {
    if (item.type === 'message') {
      if (currentSuperGroup.length > 5) {
        finalDisplayItems.push({ type: 'super_group', items: currentSuperGroup });
      } else {
        finalDisplayItems.push(...currentSuperGroup);
      }
      currentSuperGroup = [];
      finalDisplayItems.push(item);
    } else {
      currentSuperGroup.push(item);
    }
  }
  
  if (currentSuperGroup.length > 5) {
    finalDisplayItems.push({ type: 'super_group', items: currentSuperGroup });
  } else {
    finalDisplayItems.push(...currentSuperGroup);
  }

  return (
    <div className="activity-panel" id="activity-panel">
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`status-dot ${agentStatus}`} title={`Status: ${agentStatus}`}></span>
              <h3>Activity</h3>
            </div>
            {agentStatus === 'running' && sessionId && (
              <button 
                onClick={async () => {
                  try {
                    await stopSession(sessionId);
                  } catch (e) {
                    console.error("Failed to stop session", e);
                  }
                }}
                className="stop-action-btn"
                style={{
                  background: 'var(--status-error)', color: '#fff', border: 'none', 
                  borderRadius: '50%', width: '24px', height: '24px', padding: '0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(220, 38, 38, 0.4)',
                  position: 'relative'
                }}
                title="Stop Agent Execution"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect></svg>
              </button>
            )}
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
      </div>
      <div className="panel-content" style={{ padding: 'var(--space-md) 0', overflowY: 'auto' }}>
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
              finalDisplayItems.map((item, idx) => {
                if (item.type === 'message') {
                  return (
                    <div key={idx} className={`message-turn ${item.role}`}>
                      <div style={{ fontWeight: 600, color: item.role === 'user' ? 'var(--accent-primary-hover)' : 'var(--text-accent)', marginBottom: '4px' }}>
                        {item.role === 'user' ? '👤 You' : '🤖 Agent'}
                      </div>
                      <div className="markdown-body" style={{ paddingLeft: '2px' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {item.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  );
                } else if (item.type === 'super_group') {
                  return <SuperGroup key={idx} items={item.items} />;
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
          <div className="tasks-content" style={{ padding: '16px 24px', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)' }}>
            {taskSetsList.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>No tasks created yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
                {taskSetsList.map((tasks, setIdx) => (
                  <div key={setIdx} className="task-set-container">
                    {taskSetsList.length > 1 && (
                      <h3 style={{ 
                        marginBottom: '24px', 
                        color: 'var(--text-secondary)', 
                        fontSize: '0.9rem', 
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        borderBottom: '1px solid var(--surface-border)', 
                        paddingBottom: '8px' 
                      }}>
                        Task Set {setIdx + 1}
                      </h3>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {tasks.map((task, idx, arr) => {
                        const isDone = task.icon.includes('✅') || task.icon.includes('x') || task.icon.includes('X');
                        const isPending = task.icon.includes('⏳') || task.icon.includes('-');
                        const isLast = idx === arr.length - 1;
                        
                        return (
                          <div key={idx} style={{ display: 'flex', gap: '16px', position: 'relative', paddingBottom: isLast ? '0' : '24px' }}>
                            {/* Vertical line connecting nodes */}
                            {!isLast && (
                              <div style={{
                                position: 'absolute',
                                top: '24px',
                                bottom: '0',
                                left: '11px',
                                width: '2px',
                                background: isDone ? 'var(--status-success)' : '#444',
                                zIndex: 0
                              }} />
                            )}
                            
                            {/* Node Icon */}
                            <div style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: isDone ? 'var(--status-success)' : isPending ? '#d97706' : '#444',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              zIndex: 1,
                              border: '2px solid var(--bg-primary)',
                              fontSize: '12px',
                              color: '#fff',
                              flexShrink: 0
                            }}>
                              {isDone ? '✓' : isPending ? '⏳' : ''}
                            </div>
                            
                            {/* Content */}
                            <div style={{ flex: 1, paddingTop: '2px' }}>
                              <div style={{ fontWeight: 600, color: isDone ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                {task.id}. {task.title}
                              </div>
                              {task.notes && (
                                <div style={{ 
                                  marginTop: '8px', 
                                  padding: '12px', 
                                  background: 'var(--bg-tertiary)', 
                                  borderRadius: '6px',
                                  fontSize: '0.85rem',
                                  color: 'var(--text-muted)',
                                  whiteSpace: 'pre-wrap',
                                  border: '1px solid #333'
                                }}>
                                  {task.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
