import { useState, useRef, useEffect } from 'react';
import { createAndRunSession, stopSession } from '../api';

/**
 * Prompt input bar with Run/Stop controls and status indicator.
 */
export default function PromptBar({ currentSessionId, agentStatus, onSessionCreated, workspacePath }) {
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef(null);

  const isRunning = agentStatus === 'running';

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = '42px';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
  }, [prompt]);

  const handleRun = async () => {
    if (!prompt.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const session = await createAndRunSession(prompt.trim(), workspacePath.trim() || null);
      setPrompt('');
      onSessionCreated(session);
    } catch (err) {
      console.error('Failed to start session:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStop = async () => {
    if (!currentSessionId) return;
    try {
      await stopSession(currentSessionId);
    } catch (err) {
      console.error('Failed to stop session:', err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isRunning) {
        handleRun();
      }
    }
  };

  const isButtonDisabled = (!prompt.trim() && !isRunning) || isSubmitting;

  return (
    <div className="prompt-bar" style={{ padding: 'var(--space-md)' }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#282828',
        borderRadius: '16px',
        padding: '12px 12px 12px 16px',
        border: '1px solid var(--surface-border)',
        width: '100%'
      }}>
        {/* Prompt Textarea */}
        <textarea
          ref={textareaRef}
          id="prompt-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the agent to do something..."
          disabled={isRunning}
          rows={1}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-sans)',
            fontSize: '0.95rem',
            resize: 'none',
            outline: 'none',
            minHeight: '28px',
            padding: '4px 4px 12px 0'
          }}
        />

        {/* Bottom Row: Controls */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <button
            onClick={isRunning ? handleStop : handleRun}
            disabled={isButtonDisabled}
            id="run-btn"
            title={isRunning ? "Stop Session" : "Send"}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isButtonDisabled ? 'var(--bg-primary)' : (isRunning ? 'var(--status-error)' : '#0084ff'),
              color: '#fff',
              border: 'none',
              cursor: isButtonDisabled ? 'default' : 'pointer',
              transition: 'background 0.2s',
              flexShrink: 0
            }}
          >
            {isRunning ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              </svg>
            ) : isSubmitting ? (
              <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
