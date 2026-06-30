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

const ToolCallDropdown = ({ event }) => {
  const [expanded, setExpanded] = useState(false);
  const { event_type, payload = {}, returns = [], pending = false } = event;
  
  if (event_type === 'tool_execution') {
    const toolName = payload.tool_name || 'Tool';
    let argsText = payload.args;
    if (typeof payload.args === 'object') {
      try {
        argsText = JSON.stringify(payload.args, null, 2);
      } catch (e) {
        argsText = String(payload.args);
      }
    }
    
    return (
      <div className="sub-event-item" style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => setExpanded(!expanded)}>
          <Chevron expanded={expanded} />
          <span style={{ fontWeight: '500', marginLeft: '4px', display: 'flex', alignItems: 'center' }}>
            ⚙️ Executing {toolName}
            {pending && <span className="spinner" style={{ width: '12px', height: '12px', marginLeft: '8px', opacity: 0.6 }} />}
            {!pending && returns.length > 0 && <span style={{ marginLeft: '8px', color: 'var(--status-success)', fontSize: '0.9em' }}>✓</span>}
          </span>
        </div>
        {expanded && (
          <div style={{ marginLeft: '22px', marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {argsText && (
              <div style={{ padding: '8px', background: 'rgba(0,0,0,0.15)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', whiteSpace: 'pre-wrap', color: 'var(--text-muted)', overflowX: 'auto', border: '1px solid var(--surface-border)' }}>
                <strong style={{color: 'var(--text-primary)'}}>Arguments:</strong><br/>{argsText}
              </div>
            )}
            {returns.map((ret, i) => (
              <div key={i} style={{ padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', whiteSpace: 'pre-wrap', color: 'var(--text-primary)', overflowX: 'auto', border: '1px solid var(--surface-border)' }}>
                <strong style={{color: 'var(--accent-primary)'}}>Return:</strong><br/>{ret.payload?.return_data || ret.payload?.content}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } else if (event_type === 'activity') {
    const toolName = payload.tool_name || 'Tool';
    return (
      <div className="sub-event-item" style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => setExpanded(!expanded)}>
          <Chevron expanded={expanded} />
          <span style={{ fontWeight: '500', marginLeft: '4px' }}>Return from {toolName}</span>
        </div>
        {expanded && payload.return_data && (
          <div style={{ marginLeft: '22px', marginTop: '6px', padding: '8px', background: 'rgba(0,0,0,0.15)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', whiteSpace: 'pre-wrap', color: 'var(--text-muted)', overflowX: 'auto', border: '1px solid var(--surface-border)' }}>
            {payload.return_data}
          </div>
        )}
      </div>
    );
  }
  return null;
};


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
    if (payload.tool_name) return <ToolCallDropdown event={event} />;
    return <span className="sub-event-item" style={{ color: 'var(--text-secondary)' }}>{payload.content || ''}</span>;
  }
  if (event.event_type === 'tool_execution') {
    if (payload.tool_name) return <ToolCallDropdown event={event} />;
    return <span className="sub-event-item" style={{ color: 'var(--text-secondary)' }}>{payload.content || ''}</span>;
  }
  return <span className="sub-event-item">{JSON.stringify(payload)}</span>;
};

const ActionSubGroup = ({ type, events }) => {
  const [expanded, setExpanded] = useState(false);
  
  let title = '';
  const allSameType = events.every(e => e.event_type === events[0].event_type);
  if (allSameType) {
    const t = events[0].event_type;
    if (t === 'file_changed') title = `Explored ${events.length} file${events.length > 1 ? 's' : ''}`;
    else if (t === 'terminal') title = `Executed ${events.length} terminal action${events.length > 1 ? 's' : ''}`;
    else if (t === 'error') title = `Encountered ${events.length} error${events.length > 1 ? 's' : ''}`;
    else if (t === 'activity') title = `${events.length} Action${events.length > 1 ? 's' : ''}`;
    else if (t === 'tool_execution') title = `${events.length} Background Step${events.length > 1 ? 's' : ''}`;
    else title = `${events.length} ${t} event${events.length > 1 ? 's' : ''}`;
  } else {
    title = `${events.length} Background Step${events.length > 1 ? 's' : ''}`;
  }

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


/**
 * Activity panel showing hierarchical agent actions and messages.
 */
export default function ActivityPanel({ events, agentStatus, sessionId }) {
  const bottomRef = useRef(null);

  const filteredEvents = events.filter(e => 
    e.event_type !== 'terminal' && 
    e.event_type !== 'status'
  );

  // Preprocess events to match Executing (tool_execution) and Return (activity)
  const processedEvents = [];
  const pendingExecutions = [];

  for (const e of filteredEvents) {
    if (e.event_type === 'tool_execution') {
      const copy = { ...e, pending: true, returns: [] };
      pendingExecutions.push(copy);
      processedEvents.push(copy);
    } else if (e.event_type === 'activity') {
      const toolName = e.payload?.tool_name;
      const toolCallId = e.payload?.tool_call_id;
      if (toolName) {
        let matchIdx = -1;
        if (toolCallId) {
          matchIdx = pendingExecutions.findIndex(ex => ex.payload?.tool_call_id === toolCallId && ex.pending);
        }
        if (matchIdx === -1) {
          matchIdx = pendingExecutions.findIndex(ex => ex.payload?.tool_name === toolName && ex.pending);
        }
        if (matchIdx !== -1) {
          const match = pendingExecutions[matchIdx];
          match.pending = false;
          match.returns.push(e);
          pendingExecutions.splice(matchIdx, 1);
        } else {
          processedEvents.push(e);
        }
      } else {
        processedEvents.push(e);
      }
    } else {
      processedEvents.push(e);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredEvents.length]);

  const displayItems = [];
  let currentGroup = null;

  for (const e of processedEvents) {
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
      if (!currentGroup || currentGroup.type !== 'background') {
        if (currentGroup) displayItems.push(currentGroup);
        currentGroup = { type: 'background', events: [e] };
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

        </div>
      </div>
      <div className="panel-content" style={{ padding: 'var(--space-md) 0', overflowY: 'auto' }}>
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
            {agentStatus === 'running' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', color: 'var(--text-muted)' }}>
                <span className="spinner" style={{ width: '16px', height: '16px', opacity: 0.7 }} />
                <span style={{ fontSize: '0.9rem', fontStyle: 'italic' }}>Agent is working...</span>
              </div>
            )}
            <div ref={bottomRef} />
          </>

      </div>
    </div>
  );
}
