import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import ReactMarkdown from 'react-markdown';
import { MessageSquare, Code2, Copy, LogOut, Code, AlertTriangle } from 'lucide-react';
import { cn } from './lib/utils.js';
import { buildPreviewSrcDoc } from './lib/preview.js';
import { clearStoredSession, getOrCreateUserId, getStoredRoom, setStoredSession } from './lib/id.js';

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3002';
const CODE_DEBOUNCE_MS = 180;

function formatRemainingMs(ms) {
  if (ms == null || ms <= 0) return '00:00';
  const t = Math.floor(ms / 1000);
  const m = String(Math.floor(t / 60)).padStart(2, '0');
  const s = String(t % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function readRoomFromUrl() {
  const q = new URLSearchParams(window.location.search);
  return q.get('room') || null;
}

function useSocket() {
  const ref = useRef(null);
  if (!ref.current) {
    ref.current = io(SERVER, { transports: ['websocket', 'polling'] });
  }
  return ref.current;
}

export default function App() {
  const socket = useSocket();
  const userId = useMemo(() => getOrCreateUserId(), []);

  const [phase, setPhase] = useState('init');
  const [error, setError] = useState('');
  const [findBusy, setFindBusy] = useState(false);
  const [work, setWork] = useState(null);
  const [chat, setChat] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [tick, setTick] = useState(0);
  const [stuckHint, setStuckHint] = useState(null);
  const [inviteUrl, setInviteUrl] = useState('');
  const [rightTab, setRightTab] = useState('peer'); // 'peer' | 'chat'
  const [copyFeedback, setCopyFeedback] = useState(false);

  const localViewRef = useRef(null);
  const workRef = useRef(null);
  workRef.current = work;
  const debRef = useRef(0);
  const remainingLabel = useMemo(() => {
    if (!work?.endsAt) return '—:—';
    return formatRemainingMs(work.endsAt - Date.now());
  }, [work, tick]);

  const syncLocalStorage = (roomId) => {
    if (roomId) setStoredSession(roomId);
  };

  const applySession = useCallback(
    (payload, opts = {}) => {
      const w = {
        roomId: payload.roomId,
        userId: payload.userId,
        role: payload.role,
        peerId: payload.peerId,
        yourCode: payload.yourCode ?? payload.starterCode,
        peerCode: payload.peerCode ?? '',
        testScript: payload.testScript,
        problem: payload.problem,
        endsAt: payload.endsAt || 0,
        waitingForPeer: Boolean(payload.waitingForPeer) || (opts.isInvite && !payload.peerId),
        winnerId: payload.winnerId || null,
      };
      if (Array.isArray(payload.chat) && payload.chat.length) {
        setChat(
          payload.chat
            .filter(Boolean)
            .map((c) => ({ userId: c.userId, text: c.text, t: c.t || Date.now() }))
        );
      } else {
        setChat([]);
      }
      setWork(w);
      setPhase('work');
      syncLocalStorage(w.roomId);
      if (opts.inviteUrl) {
        setInviteUrl(opts.inviteUrl);
      } else {
        setInviteUrl('');
      }
    },
    [setChat, setWork, setPhase]
  );

  useEffect(() => {
    if (!work?.endsAt) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [work?.endsAt]);

  useEffect(() => {
    const onTestPass = (ev) => {
      if (ev.data?.type !== 'TEST_PASS') return;
      const w = workRef.current;
      if (!w?.roomId) return;
      socket.emit('challenge_complete', { roomId: w.roomId, userId: w.userId });
    };
    window.addEventListener('message', onTestPass);
    return () => window.removeEventListener('message', onTestPass);
  }, [socket]);

  useEffect(() => {
    const s = socket;

    const onConnect = () => {
      const storedRoom = getStoredRoom();
      if (storedRoom) {
        s.emit('restore_session', { roomId: storedRoom, userId });
        return;
      }
      const room = readRoomFromUrl();
      if (room) {
        s.emit('join_invite', { roomId: room, userId });
        return;
      }
      const fromMemory = workRef.current?.roomId;
      if (fromMemory) {
        s.emit('restore_session', { roomId: fromMemory, userId });
        return;
      }
      setPhase('landing');
    };

    const onErrorMsg = (e) => {
      setError(e?.message || 'Error');
      setFindBusy(false);
      setPhase((ph) => (ph === 'init' ? 'landing' : ph));
    };

    const onRestoreFailed = () => {
      clearStoredSession();
      const room = readRoomFromUrl();
      if (room) s.emit('join_invite', { roomId: room, userId });
      else {
        setPhase('landing');
        setFindBusy(false);
      }
    };

    const onMatched = (p) => {
      setFindBusy(false);
      setError('');
      applySession(
        p,
        p.waitingForPeer
          ? { isInvite: true, inviteUrl: `${window.location.origin}/?room=${p.roomId}` }
          : {}
      );
      if (p.waitingForPeer) {
        setInviteUrl(`${window.location.origin}/?room=${p.roomId}`);
        try {
          const u = new URL(window.location.href);
          u.searchParams.set('room', p.roomId);
          window.history.replaceState({}, '', u.toString());
        } catch {
          // ignore
        }
      }
    };

    const onInviteCreated = (p) => {
      setFindBusy(false);
      setError('');
      const url = `${window.location.origin}/?room=${p.roomId}`;
      applySession(
        { ...p, yourCode: p.yourCode, peerId: null, waitingForPeer: true },
        { isInvite: true, inviteUrl: url }
      );
      setInviteUrl(url);
      try {
        const u = new URL(window.location.href);
        u.searchParams.set('room', p.roomId);
        window.history.replaceState({}, '', u.toString());
      } catch {
        // ignore
      }
    };

    const onRoomRestored = (p) => {
      setError('');
      setFindBusy(false);
      applySession(p, {
        isInvite: p.waitingForPeer,
        inviteUrl: p.waitingForPeer
          ? `${window.location.origin}/?room=${p.roomId}`
          : undefined,
      });
      if (p.waitingForPeer) {
        setInviteUrl(`${window.location.origin}/?room=${p.roomId}`);
      }
    };

    const onPeerCode = ({ fromUserId, code }) => {
      setWork((w) => {
        if (!w || fromUserId === w.userId) return w;
        return { ...w, peerCode: code };
      });
    };

    const onChat = (msg) => {
      setChat((c) => [...c, { userId: msg.userId, text: msg.text, t: msg.t }].slice(-50));
    };

    const onStuckHighlight = (p) => {
      if (p.fromUserId === userId) return;
      setStuckHint({ line: p.line, ch: p.ch });
      window.setTimeout(() => setStuckHint(null), 2500);
    };

    const onPeerJoined = (p) => {
      setWork((w) =>
        w
          ? {
              ...w,
              peerId: p.peerId,
              peerCode: p.peerCode ?? w.peerCode,
              endsAt: p.endsAt,
              waitingForPeer: false,
            }
          : w
      );
    };

    const onWon = ({ winnerId, roomId }) => {
      setWork((w) => (w && w.roomId === roomId ? { ...w, winnerId, endsAt: w.endsAt } : w));
    };

    s.on('connect', onConnect);
    s.on('error_msg', onErrorMsg);
    s.on('restore_failed', onRestoreFailed);
    s.on('matched', onMatched);
    s.on('invite_created', onInviteCreated);
    s.on('room_restored', onRoomRestored);
    s.on('peer_code_update', onPeerCode);
    s.on('chat_message', onChat);
    s.on('stuck_highlight', onStuckHighlight);
    s.on('peer_joined', onPeerJoined);
    s.on('challenge_won', onWon);

    return () => {
      s.off('connect', onConnect);
      s.off('error_msg', onErrorMsg);
      s.off('restore_failed', onRestoreFailed);
      s.off('matched', onMatched);
      s.off('invite_created', onInviteCreated);
      s.off('room_restored', onRoomRestored);
      s.off('peer_code_update', onPeerCode);
      s.off('chat_message', onChat);
      s.off('stuck_highlight', onStuckHighlight);
      s.off('peer_joined', onPeerJoined);
      s.off('challenge_won', onWon);
    };
  }, [socket, userId, applySession]);

  const onLocalCode = useCallback(
    (v) => {
      setWork((w) => (w ? { ...w, yourCode: v } : w));
      window.clearTimeout(debRef.current);
      debRef.current = window.setTimeout(() => {
        const w = workRef.current;
        if (w?.roomId) {
          socket.emit('code_update', { roomId: w.roomId, userId, code: v });
        }
      }, CODE_DEBOUNCE_MS);
    },
    [socket, userId]
  );

  const onFind = () => {
    setError('');
    setFindBusy(true);
    socket.emit('find_match', { userId });
  };

  const onCreateInvite = () => {
    setError('');
    setFindBusy(true);
    socket.emit('create_invite', { userId });
  };

  const onSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !work?.roomId) return;
    socket.emit('chat_message', { roomId: work.roomId, userId, text: chatInput.trim() });
    setChatInput('');
  };

  const onStuck = () => {
    if (!work?.roomId) return;
    const v = localViewRef.current;
    if (!v) {
      socket.emit('stuck_ping', { roomId: work.roomId, userId, line: 0, ch: 0 });
      return;
    }
    const st = v.state;
    const pos = st.selection.main.head;
    const line = st.doc.lineAt(pos);
    socket.emit('stuck_ping', {
      roomId: work.roomId,
      userId,
      line: line.number - 1,
      ch: pos - line.from,
    });
  };

  const onLeave = () => {
    clearStoredSession();
    setWork(null);
    setChat([]);
    setPhase('landing');
    setFindBusy(false);
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete('room');
      window.history.replaceState({}, '', u.toString());
    } catch {
      // ignore
    }
  };

  const copyUrl = () => {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  if (phase === 'init') {
    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <p className="text-zinc-500">Connecting…</p>
      </div>
    );
  }

  if (phase === 'landing' && !work) {
    return (
      <div className="min-h-dvh p-6">
        <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-white">PeerCode</h1>
          <p className="text-sm leading-relaxed text-zinc-400">
            Two devs, one front-end challenge, no accounts. Match randomly or create a room link for a
            friend.
          </p>
          {error ? (
            <p className="rounded-lg border border-red-900/60 bg-red-950/50 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onFind}
              disabled={findBusy}
              className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {findBusy ? 'Finding…' : 'Find match'}
            </button>
            <button
              type="button"
              onClick={onCreateInvite}
              disabled={findBusy}
              className="rounded-xl border border-zinc-600 px-4 py-3 text-sm font-medium text-zinc-200 hover:border-zinc-500 disabled:opacity-50"
            >
              Create room link
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'work' && work) {
    const youPreview = buildPreviewSrcDoc(work.yourCode, work.testScript);
    const theyPreview = work.peerCode || '';

    return (
      <div className="flex min-h-dvh flex-col bg-zinc-950">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950 px-4 py-3 text-sm shadow-sm md:px-6">
          <div className="flex flex-col min-w-0 max-w-prose">
            <span className="text-zinc-400 font-semibold tracking-wide flex items-center gap-2 mb-1"><Code className="h-4 w-4" /> PeerCode</span>
            {work.problem ? (
              <div className="max-w-prose text-sm text-zinc-400">
                <p className="font-semibold text-zinc-100">{work.problem.title}</p>
                <div className="leading-relaxed text-zinc-400 [&>p]:m-0 mt-0.5 text-xs">
                  <ReactMarkdown>{work.problem.statement}</ReactMarkdown>
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 flex-1 lg:flex-none">
            <div
              className="flex items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-sm font-medium text-amber-300 shadow-sm"
              title="Time left"
            >
              {work.endsAt ? remainingLabel : '—:—'}
            </div>
            {inviteUrl ? (
              <div className="flex hidden sm:flex max-w-[200px] sm:max-w-xs items-center gap-2 text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1.5">
                <span className="font-mono truncate select-all" title={inviteUrl}>
                  {inviteUrl}
                </span>
                <button
                  type="button"
                  onClick={copyUrl}
                  className={cn("shrink-0 flex items-center justify-center rounded-sm p-1 transition-colors", copyFeedback ? "text-emerald-400 bg-emerald-950" : "text-zinc-300 hover:bg-zinc-800")}
                  title="Copy Link"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copyFeedback && <span className="sr-only">Copied</span>}
                </button>
              </div>
            ) : null}
            {work.winnerId ? (
              <span
                className={cn("px-2.5 py-1rounded-md text-xs font-semibold uppercase tracking-wider border",
                  work.winnerId === work.userId
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-zinc-800/50 text-zinc-400 border-zinc-700"
                )}
              >
                {work.winnerId === work.userId ? 'Winner!' : 'Finished'}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onLeave}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-red-900/50 bg-transparent px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-950/30 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Leave space</span>
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row bg-zinc-950 p-2 md:p-3 gap-3 md:overflow-hidden">
          <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-sm min-h-[400px]">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs font-medium uppercase tracking-wider text-sky-400/90">
              <div className="flex items-center gap-1.5"><Code2 className="h-3.5 w-3.5" /> Your Code</div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col bg-zinc-950">
              <div className="flex-1 overflow-auto">
                <CodeMirror
                  value={work.yourCode}
                  height="100%"
                  theme={vscodeDark}
                  extensions={[html({ matchClosingTags: true })]}
                  onCreateEditor={(v) => {
                    localViewRef.current = v;
                  }}
                  onChange={onLocalCode}
                  basicSetup={{ lineNumbers: true, foldGutter: true }}
                />
              </div>
              <div className="shrink-0 flex flex-col border-t border-zinc-800 bg-zinc-900/40 p-1.5">
                <p className="px-1.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Preview Layout (Runs tests)</p>
                <div className="relative h-[250px] w-full rounded-md border border-zinc-800 bg-white overflow-hidden shadow-inner">
                  <iframe
                    title="Your preview"
                    className="absolute inset-0 h-full w-full"
                    sandbox="allow-scripts"
                    srcDoc={youPreview}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className={cn("flex flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-sm transition-all duration-300 min-h-[400px]",
             stuckHint ? "ring-2 ring-red-500/50 ring-offset-2 ring-offset-zinc-950" : "")}>
            
            <div className="flex shrink-0 items-center justify-center border-b border-zinc-800 bg-zinc-900/80 p-2">
               <div className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-950/80 p-1 text-zinc-400 border border-zinc-800/80 shadow-inner w-full max-w-sm">
                 <button 
                    onClick={() => setRightTab('chat')} 
                    className={cn("w-1/2 inline-flex items-center justify-center whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-zinc-950",
                      rightTab === 'chat' ? "bg-zinc-800 text-zinc-100 shadow-sm" : "hover:text-zinc-200"
                    )}
                 >
                   <MessageSquare className="mr-2 w-4 h-4" />
                   CHAT
                 </button>
                 <div className="relative w-1/2 flex">
                   <button 
                      onClick={() => setRightTab('peer')} 
                      className={cn("w-full inline-flex items-center justify-center whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-zinc-950",
                        rightTab === 'peer' ? "bg-zinc-800 text-zinc-100 shadow-sm" : "hover:text-zinc-200"
                      )}
                   >
                     <Code2 className="mr-2 w-4 h-4" />
                     Peer code
                   </button>
                   {stuckHint && rightTab !== 'peer' && (
                     <span className="absolute top-1 right-1 flex h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 ring-2 ring-zinc-900" />
                   )}
                 </div>
               </div>
            </div>

            <div className="flex-1 min-h-0 flex flex-col bg-zinc-950">
              {rightTab === 'peer' && (
                <div className="flex flex-col h-full w-full">
                  <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/30 px-3 py-2 text-xs">
                    <span className="font-medium uppercase tracking-wider text-violet-400/90">
                      Opponent's view
                    </span>
                    {stuckHint ? (
                      <span className="flex items-center gap-1 text-red-400 font-mono text-[10px] bg-red-500/10 px-2 py-0.5 rounded-sm border border-red-500/20">
                        <AlertTriangle className="h-3 w-3" />
                        (stuck at {stuckHint.line + 1}:{stuckHint.ch + 1})
                      </span>
                    ) : null}
                  </div>
                  <div className="flex-1 overflow-auto bg-zinc-950">
                    <CodeMirror
                      value={work.peerCode || ' '}
                      height="100%"
                      theme={vscodeDark}
                      extensions={[html({ matchClosingTags: true })]}
                      editable={false}
                      basicSetup={{ lineNumbers: true, foldGutter: true }}
                    />
                    {work.waitingForPeer && !work.peerId && (
                      <div className="absolute inset-x-0 top-1/4 flex justify-center pointer-events-none">
                         <div className="bg-zinc-900/90 border border-zinc-800 px-4 py-2 rounded-lg text-sm text-zinc-400 shadow-xl backdrop-blur-sm">Waiting for peer to join...</div>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col border-t border-zinc-800 bg-zinc-900/40 p-1.5">
                    <p className="px-1.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">Opponent Preview</p>
                    <div className="relative h-[250px] w-full rounded-md border border-zinc-800 bg-white overflow-hidden shadow-inner">
                      {work.waitingForPeer && !work.peerId ? (
                        <div className="grid h-full place-items-center bg-zinc-900 text-sm text-zinc-500">Waiting for peer...</div>
                      ) : (
                        <iframe
                          title="Opponent preview"
                          className="absolute inset-0 h-full w-full"
                          sandbox="allow-scripts"
                          srcDoc={theyPreview}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}
              {rightTab === 'chat' && (
                <div className="flex flex-col h-full w-full">
                   <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-zinc-950/50 flex flex-col">
                     {chat.length === 0 ? (
                       <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-sm gap-2">
                         <MessageSquare className="w-8 h-8 opacity-20" />
                         <p>No messages yet. Say hi!</p>
                       </div>
                     ) : (
                       chat.map((m) => {
                         const isMe = m.userId === userId;
                         return (
                           <div key={`${m.t}-${m.text}`} className={cn("flex flex-col max-w-[85%]", isMe ? "ml-auto items-end" : "mr-auto items-start")}>
                             <span className={cn("text-[10px] mb-1 font-medium tracking-wide uppercase", isMe ? "text-sky-500" : "text-violet-400")}>
                               {isMe ? 'You' : 'Opponent'}
                             </span>
                             <div className={cn("px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm", 
                               isMe ? "bg-sky-600 text-white rounded-tr-sm" : "bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-tl-sm"
                             )}>
                               {m.text}
                             </div>
                           </div>
                         );
                       })
                     )}
                   </div>
                   <div className="shrink-0 border-t border-zinc-800 bg-zinc-900/80 p-3 shadow-sm">
                     <form onSubmit={onSendChat} className="flex gap-2 mb-3">
                       <input
                         className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                         value={chatInput}
                         onChange={(e) => setChatInput(e.target.value)}
                         placeholder="Type a message..."
                       />
                       <button
                         type="submit"
                         className="inline-flex items-center justify-center rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-zinc-900 transition-colors shrink-0"
                       >
                         Send
                       </button>
                     </form>
                     <button
                       type="button"
                       onClick={onStuck}
                       className="w-full inline-flex items-center justify-center rounded-md border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 active:scale-[0.98] transition-all"
                     >
                       <AlertTriangle className="mr-2 h-4 w-4" />
                       I'm stuck, notify opponent!
                     </button>
                   </div>
                </div>
              )}
            </div>
          </section>

        </div>
      </div>
    );
  }

  return null;
}
