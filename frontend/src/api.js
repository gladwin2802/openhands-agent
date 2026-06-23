/**
 * REST API client for the OpenHands Agent backend.
 */

const API_BASE = 'http://localhost:8000';

// --------------- Sessions ---------------

export async function createAndRunSession(prompt, workspacePath = null) {
  const res = await fetch(`${API_BASE}/api/sessions/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, workspace_path: workspacePath }),
  });
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  return res.json();
}

export async function getSessions() {
  const res = await fetch(`${API_BASE}/api/sessions`);
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
  return res.json();
}

export async function deleteAllSessions() {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete sessions: ${res.status}`);
  return res.json();
}

export async function getSession(sessionId) {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
  if (!res.ok) throw new Error(`Failed to fetch session: ${res.status}`);
  return res.json();
}

export async function getSessionEvents(sessionId) {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/events`);
  if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
  return res.json();
}

export async function getChangedFiles(sessionId) {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/changed-files`);
  if (!res.ok) throw new Error(`Failed to fetch changed files: ${res.status}`);
  return res.json();
}

export async function stopSession(sessionId) {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/stop`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to stop session: ${res.status}`);
  return res.json();
}

export async function browseFolder() {
  const res = await fetch(`${API_BASE}/api/browse-folder`);
  if (!res.ok) throw new Error(`Failed to browse folder: ${res.status}`);
  return res.json();
}

// --------------- Files ---------------

export async function listFiles(sessionId, workspacePath = null) {
  let url = `${API_BASE}/api/files`;
  if (sessionId) url += `?session_id=${sessionId}`;
  else if (workspacePath) url += `?workspace_path=${encodeURIComponent(workspacePath)}`;
  else url += '?session_id=';
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to list files: ${res.status}`);
  return res.json();
}

export async function readFile(sessionId, path, workspacePath = null) {
  let url = `${API_BASE}/api/files/content?path=${encodeURIComponent(path)}`;
  if (sessionId) url += `&session_id=${sessionId}`;
  else if (workspacePath) url += `&workspace_path=${encodeURIComponent(workspacePath)}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to read file: ${res.status}`);
  return res.json();
}

export async function writeFile(sessionId, path, content, workspacePath = null) {
  let url = `${API_BASE}/api/files/content?path=${encodeURIComponent(path)}`;
  if (sessionId) url += `&session_id=${sessionId}`;
  else if (workspacePath) url += `&workspace_path=${encodeURIComponent(workspacePath)}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`Failed to write file: ${res.status}`);
  return res.json();
}

// --------------- Diff ---------------

export async function getSessionDiff(sessionId) {
  const res = await fetch(`${API_BASE}/api/diff/${sessionId}`);
  if (!res.ok) throw new Error(`Failed to fetch diff: ${res.status}`);
  return res.json();
}

export async function getFileDiff(sessionId, filePath) {
  const res = await fetch(`${API_BASE}/api/diff/${sessionId}/${encodeURIComponent(filePath)}`);
  if (!res.ok) throw new Error(`Failed to fetch file diff: ${res.status}`);
  return res.json();
}

// --------------- WebSocket URL ---------------

export function getWebSocketUrl(sessionId) {
  return `ws://localhost:8000/ws/${sessionId}`;
}
