import { useEffect, useRef } from 'react';

/**
 * Terminal panel showing only terminal events (commands and output)
 * with a dark terminal aesthetic.
 */
export default function TerminalPanel({ events }) {
  const bottomRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const terminalEvents = events.filter((e) => e.event_type === 'terminal');

  return (
    <div className="terminal-panel" id="terminal-panel">
      <div className="panel-header">
        <h3>⬛ Terminal</h3>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {terminalEvents.length} entries
        </span>
      </div>
      <div className="panel-content" style={{ background: 'rgba(0,0,0,0.3)' }}>
        {terminalEvents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon" style={{ fontFamily: 'var(--font-mono)' }}>{'>'}_</div>
            <p>Terminal output will appear here.</p>
          </div>
        ) : (
          terminalEvents.map((event, idx) => {
            const payload = event.payload || {};
            const isCommand = payload.type === 'command';
            return (
              <div
                key={event.id || idx}
                className={`terminal-line ${isCommand ? 'command' : 'output'}`}
              >
                {payload.content || ''}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
