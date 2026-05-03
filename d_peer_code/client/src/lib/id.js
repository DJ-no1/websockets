const KEY = 'peercode_userId';

export function getOrCreateUserId() {
  try {
    let id = localStorage.getItem(KEY);
    if (id) return id;
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return `anon_${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function getStoredRoom() {
  try {
    return localStorage.getItem('peercode_roomId');
  } catch {
    return null;
  }
}

export function setStoredSession(roomId) {
  try {
    if (roomId) localStorage.setItem('peercode_roomId', roomId);
    else localStorage.removeItem('peercode_roomId');
  } catch {
    // ignore
  }
}

export function clearStoredSession() {
  setStoredSession(null);
}
