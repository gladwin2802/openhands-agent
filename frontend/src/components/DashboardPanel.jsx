import { useState, useEffect } from 'react';
import { fetchMetrics } from '../api';
import { VscPlayCircle, VscCreditCard, VscDatabase, VscWatch, VscGraph } from 'react-icons/vsc';

export default function DashboardPanel() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const loadMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMetrics();
      setMetrics(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '-';
    return new Intl.NumberFormat().format(num);
  };

  const formatCurrency = (num) => {
    if (num === null || num === undefined) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 }).format(num);
  };

  const renderCard = (title, value, subtitle, icon) => (
    <div style={{
      background: '#282828',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid var(--surface-border)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      flex: 1,
      minWidth: '200px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}>{title}</span>
        <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
      </div>
      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
      {subtitle && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{subtitle}</div>}
    </div>
  );

  return (
    <div style={{ padding: '30px', maxWidth: '1200px', margin: '0 auto', height: '100%', overflowY: 'auto' }}>
      
      {/* Header & Config */}
      <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '2rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <VscGraph size={28} style={{ color: '#0084ff' }} /> Metrics Dashboard
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Analyze OpenHands token usage, cost, and latency metrics.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button 
            onClick={() => loadMetrics()}
            disabled={loading}
            style={{ padding: '8px 16px', background: '#0084ff', border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 500 }}
          >
            <VscGraph size={16} />
            Refresh Data
          </button>
        </div>
      </div>

      {loading && !metrics && (
        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>Loading metrics...</div>
      )}

      {error && (
        <div style={{ background: 'rgba(244, 67, 54, 0.1)', border: '1px solid var(--status-error)', padding: '20px', borderRadius: '8px', color: 'var(--status-error)', marginBottom: '30px' }}>
          <strong>Error: </strong> {error}
        </div>
      )}

      {metrics && !loading && (
        <>
          {/* Global Stats Cards */}
          <h3 style={{ color: 'var(--text-primary)', marginTop: 0, marginBottom: '16px' }}>Global Overview</h3>
          <div style={{ display: 'flex', gap: '20px', marginBottom: '40px', flexWrap: 'wrap' }}>
            {renderCard(
              "Total Runs", 
              formatNumber(metrics.global_stats.total_runs), 
              "Analyzed from directory",
              <VscPlayCircle size={24} style={{ color: '#0084ff' }} />
            )}
            {renderCard(
              "Total Cost", 
              formatCurrency(metrics.global_stats.total_cost), 
              `${formatNumber(metrics.global_stats.total_calls)} API calls`,
              <VscCreditCard size={24} style={{ color: 'var(--status-success)' }} />
            )}
            {renderCard(
              "Total Tokens", 
              formatNumber(metrics.global_stats.total_tokens), 
              `${formatNumber(metrics.global_stats.prompt_tokens)} input / ${formatNumber(metrics.global_stats.completion_tokens)} completion / ${formatNumber(metrics.global_stats.reasoning_tokens || 0)} reasoning`,
              <VscDatabase size={24} style={{ color: 'var(--status-warning)' }} />
            )}
            {renderCard(
              "Avg Latency", 
              metrics.global_stats.avg_latency ? `${metrics.global_stats.avg_latency.toFixed(2)}s` : 'N/A', 
              "Per LLM response",
              <VscWatch size={24} style={{ color: 'var(--status-error)' }} />
            )}
          </div>

          {/* Models Breakdown */}
          <h3 style={{ color: 'var(--text-primary)', marginTop: 0, marginBottom: '16px' }}>Model Breakdown</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px', marginBottom: '40px' }}>
            {metrics.model_stats.map(model => (
              <div key={model.name} style={{ background: '#1e1e1e', borderRadius: '12px', padding: '20px', border: '1px solid #333' }}>
                <h4 style={{ margin: '0 0 16px 0', color: '#0084ff', fontSize: '1.1rem' }}>{model.name}</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Runs used in:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{formatNumber(model.runs_count)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Cost:</span>
                  <span style={{ color: 'var(--status-success)', fontWeight: 500 }}>{formatCurrency(model.cost)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Tokens:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{formatNumber(model.total_tokens)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Avg Latency:</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{model.avg_latency ? `${model.avg_latency.toFixed(2)}s` : 'N/A'}</span>
                </div>
              </div>
            ))}
            {metrics.model_stats.length === 0 && (
              <div style={{ color: 'var(--text-muted)' }}>No model data found.</div>
            )}
          </div>

          {/* Detailed Runs Table */}
          <h3 style={{ color: 'var(--text-primary)', marginTop: 0, marginBottom: '16px' }}>Tasks Detail</h3>
          <div style={{ background: '#1e1e1e', borderRadius: '12px', border: '1px solid #333', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#282828', borderBottom: '1px solid #444' }}>
                  <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Task / Time</th>
                  <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Model(s)</th>
                  <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>API Calls</th>
                  <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Input Tokens</th>
                  <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Output Tokens</th>
                  <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Reasoning Tokens</th>
                  <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Duration</th>
                  <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Latency</th>
                  <th style={{ padding: '16px', color: 'var(--text-secondary)', fontWeight: 500 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {metrics.detailed_runs.map(run => {
                  const date = new Date(run.timestamp);
                  const isFinished = run.status === 'finished';
                  const isError = run.status === 'error';
                  const statusColor = isFinished ? 'var(--status-success)' : (isError ? 'var(--status-error)' : 'var(--status-warning)');
                  const statusBg = isFinished ? 'rgba(76, 175, 80, 0.1)' : (isError ? 'rgba(244, 67, 54, 0.1)' : 'rgba(255, 152, 0, 0.1)');
                  
                  return (
                    <tr key={run.id} style={{ borderBottom: '1px solid #333' }}>
                      <td style={{ padding: '16px' }}>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginBottom: '4px' }}>{run.task_name || run.id}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{date.toLocaleString()}</div>
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                        {run.models.length > 0 ? run.models.join(', ') : 'Unknown'}
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-primary)' }}>{formatNumber(run.calls || 0)}</td>
                      <td style={{ padding: '16px', color: 'var(--text-primary)' }}>{formatNumber(run.prompt_tokens || 0)}</td>
                      <td style={{ padding: '16px', color: 'var(--text-primary)' }}>{formatNumber(run.completion_tokens || 0)}</td>
                      <td style={{ padding: '16px', color: 'var(--text-primary)' }}>{formatNumber(run.reasoning_tokens || 0)}</td>
                      <td style={{ padding: '16px', color: 'var(--text-primary)' }}>
                        {run.duration ? (run.duration >= 60 ? `${Math.floor(run.duration / 60)}m ${Math.floor(run.duration % 60)}s` : `${Math.floor(run.duration)}s`) : 'N/A'}
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{run.latency ? `${run.latency.toFixed(1)}s` : 'N/A'}</td>
                      <td style={{ padding: '16px' }}>
                        <span style={{ 
                          background: statusBg, 
                          color: statusColor, 
                          padding: '4px 10px', 
                          borderRadius: '20px', 
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          textTransform: 'uppercase'
                        }}>
                          {run.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {metrics.detailed_runs.length === 0 && (
                  <tr>
                    <td colSpan="9" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No runs found in this directory.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
