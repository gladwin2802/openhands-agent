import { useState, useRef } from 'react';
import { createAndRunSession, stopSession, uploadMetadata } from '../api';

/**
 * Pure configuration form for Databricks UI
 */
export default function PromptBar({ currentSessionId, agentStatus, onSessionCreated, workspacePath }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Settings State
  const [targetProject, setTargetProject] = useState('demo');
  const [initBundle, setInitBundle] = useState(false);
  const [defaultCatalog, setDefaultCatalog] = useState('');
  const [personalSchema, setPersonalSchema] = useState('no');
  const [language, setLanguage] = useState('python');
  
  // We keep the file in state instead of auto-uploading it immediately
  const [selectedFile, setSelectedFile] = useState(null);
  
  const fileInputRef = useRef(null);
  const isRunning = agentStatus === 'running';

  const handleRun = async () => {
    if (!selectedFile || isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      // 1. Upload Metadata and get generated task
      const uploadRes = await uploadMetadata(selectedFile, workspacePath.trim() || null);
      if (!uploadRes.task_content) {
        throw new Error("Failed to generate task content from metadata.");
      }
      
      const generatedPrompt = uploadRes.task_content;
      
      // 2. Start Session with all advanced settings
      const advancedSettings = {
        targetProject,
        initBundle,
        defaultCatalog,
        personalSchema,
        language
      };
      const taskFile = uploadRes.task_file || null;
      
      const session = await createAndRunSession(generatedPrompt, workspacePath.trim() || null, advancedSettings, taskFile);
      
      // Reset file input for next time
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      
      onSessionCreated(session);
      
    } catch (err) {
      console.error('Failed to start session:', err);
      alert('Error: ' + err.message);
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

  const isButtonDisabled = (!selectedFile && !isRunning) || isSubmitting;

  return (
    <div className="prompt-bar" style={{ padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      
      {/* Configuration Panel */}
      <div style={{
        background: '#282828',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid var(--surface-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        fontSize: '0.9rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, color: 'var(--text-secondary)' }}>Databricks Agent Configuration</h4>
        </div>
        
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '200px' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Target Project / Folder</label>
            <input 
              type="text" 
              value={targetProject} 
              onChange={e => setTargetProject(e.target.value)}
              disabled={isRunning}
              style={{ width: '100%', boxSizing: 'border-box', background: '#1e1e1e', border: '1px solid #333', color: '#fff', padding: '8px 10px', borderRadius: '6px', fontSize: '0.9rem' }}
            />
          </div>
        </div>
        
        <div 
          onClick={() => !isRunning && setInitBundle(!initBundle)}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            marginTop: '8px',
            marginBottom: '4px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            opacity: isRunning ? 0.6 : 1
          }}
        >
          {/* Custom Toggle Switch */}
          <div style={{
            width: '40px',
            height: '22px',
            background: initBundle ? '#0084ff' : '#444',
            borderRadius: '11px',
            position: 'relative',
            transition: 'background 0.3s ease',
            flexShrink: 0
          }}>
            <div style={{
              width: '18px',
              height: '18px',
              background: '#fff',
              borderRadius: '50%',
              position: 'absolute',
              top: '2px',
              left: initBundle ? '20px' : '2px',
              transition: 'left 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }} />
          </div>
          
          <label style={{ cursor: 'inherit', color: 'var(--text-primary)', fontSize: '0.95rem', userSelect: 'none' }}>
            Automatically Initialize Databricks Bundle & Unity Catalog pre-flight
          </label>
        </div>
        
        {initBundle && (
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', paddingLeft: '28px', borderLeft: '2px solid #333', marginLeft: '6px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '150px' }}>
              <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Default Catalog</label>
              <input 
                type="text" 
                value={defaultCatalog} 
                onChange={e => setDefaultCatalog(e.target.value)}
                disabled={isRunning}
                placeholder={targetProject}
                style={{ width: '100%', boxSizing: 'border-box', background: '#1e1e1e', border: '1px solid #333', color: '#fff', padding: '8px 10px', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '150px' }}>
              <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Personal Schema</label>
              <input 
                type="text" 
                value={personalSchema} 
                onChange={e => setPersonalSchema(e.target.value)}
                disabled={isRunning}
                style={{ width: '100%', boxSizing: 'border-box', background: '#1e1e1e', border: '1px solid #333', color: '#fff', padding: '8px 10px', borderRadius: '6px', fontSize: '0.9rem' }}
              />
            </div>
          </div>
        )}
        
        <hr style={{ borderColor: '#333', margin: '8px 0' }} />
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}>Upload JSON Metadata</label>
          
          <div 
            onClick={() => !isRunning && fileInputRef.current && fileInputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isRunning) return;
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file.name.endsWith('.json')) {
                  setSelectedFile(file);
                }
              }
            }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 20px',
              border: `2px dashed ${selectedFile ? '#0084ff' : '#444'}`,
              borderRadius: '8px',
              background: selectedFile ? 'rgba(0, 132, 255, 0.05)' : '#1e1e1e',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              width: '100%',
              boxSizing: 'border-box'
            }}
            onMouseEnter={(e) => { if(!isRunning && !selectedFile) e.currentTarget.style.borderColor = '#666'; }}
            onMouseLeave={(e) => { if(!isRunning && !selectedFile) e.currentTarget.style.borderColor = '#444'; }}
          >
            <input 
              type="file" 
              accept=".json"
              ref={fileInputRef}
              onChange={e => setSelectedFile(e.target.files[0])}
              disabled={isRunning}
              style={{ display: 'none' }}
            />
            
            {selectedFile ? (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0084ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px' }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.95rem' }}>{selectedFile.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '6px' }}>
                  {(selectedFile.size / 1024).toFixed(1)} KB • Click to change
                </div>
              </>
            ) : (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '0.95rem' }}>Click to upload or drag and drop</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '6px' }}>
                  JSON metadata files only
                </div>
              </>
            )}
          </div>
        </div>

        {/* Action Button Row */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button
            onClick={isRunning ? handleStop : handleRun}
            disabled={isButtonDisabled}
            id="run-btn"
            title={isRunning ? "Stop Execution" : "Start Processing"}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontWeight: 600,
              fontSize: '0.95rem',
              background: isButtonDisabled ? 'var(--bg-primary)' : (isRunning ? 'var(--status-error)' : '#0084ff'),
              color: isButtonDisabled ? '#888' : '#fff',
              border: 'none',
              cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              width: '100%',
              boxShadow: !isButtonDisabled && !isRunning ? '0 4px 12px rgba(0, 132, 255, 0.3)' : 'none'
            }}
          >
            {isRunning ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                </svg>
                Stop Execution
              </>
            ) : isSubmitting ? (
              <>
                <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                Initializing...
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Start Agent Task
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
