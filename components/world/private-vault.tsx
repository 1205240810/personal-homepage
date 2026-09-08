'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, KeyRound, LockKeyhole } from 'lucide-react';
import { ArticleBody } from './archive-reader';
import type { PrivateRecord, PrivateSummary } from '@/lib/private-vault/types';

export function PrivateVault({
  onEnter,
  onLock,
}: {
  onEnter?: () => void;
  onLock?: () => void;
}) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const [records, setRecords] = useState<PrivateSummary[]>([]),
    [article, setArticle] = useState<PrivateRecord | null>(null);
  const [signIn, setSignIn] = useState(false);
  const form = useRef<HTMLFormElement>(null),
    controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function expire() {
    controller.current?.abort();
    if (!mounted.current) return;
    setAuthenticated(false);
    setArticle(null);
    setRecords([]);
    setLoading(false);
    setError('门已自动上锁，请重新输入密码。');
  }
  function scheduleExpiry(expiresAt?: number) {
    if (expiryTimer.current) clearTimeout(expiryTimer.current);
    if (expiresAt)
      expiryTimer.current = setTimeout(
        expire,
        Math.max(0, expiresAt - Date.now()),
      );
  }
  async function loadRecords(signal?: AbortSignal) {
    const r = await fetch('/api/vault/records', { signal, cache: 'no-store' });
    const d = (await r.json()) as {
      error: string;
      authenticated: boolean;
      records: PrivateSummary[];
      article: PrivateRecord;
    };
    if (!r.ok) throw new Error(d.error || '记录暂时无法打开。');
    if (mounted.current) setRecords(d.records);
  }
  useEffect(() => {
    mounted.current = true;
    const ac = new AbortController();
    controller.current = ac;
    fetch('/api/vault/session', { signal: ac.signal, cache: 'no-store' })
      .then(async (r) => {
        const d = (await r.json()) as {
          error: string;
          authenticated: boolean;
          expiresAt?: number;
          records: PrivateSummary[];
          article: PrivateRecord;
        };
        if (!r.ok) {
          setSignIn(r.status === 401);
          throw new Error(d.error);
        }
        setAuthenticated(d.authenticated);
        scheduleExpiry(d.expiresAt);
        if (d.authenticated && !onEnter) await loadRecords(ac.signal);
      })
      .catch((e) => {
        if (e.name !== 'AbortError' && mounted.current) setError(e.message);
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    // A cached/back navigation must not resurrect a page of private text after locking.
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) location.reload();
    };
    let focusController: AbortController | undefined;
    const verify = async () => {
      try {
        focusController?.abort();
        focusController = new AbortController();
        const r = await fetch('/api/vault/session', {
          cache: 'no-store',
          signal: focusController.signal,
        });
        const d = (await r.json()) as {
          authenticated?: boolean;
          expiresAt?: number;
        };
        if (!mounted.current) return;
        if (!r.ok || !d.authenticated) expire();
        else scheduleExpiry(d.expiresAt);
      } catch {
        /* Offline state cannot extend the existing in-memory expiry timer. */
      }
    };
    window.addEventListener('pageshow', restore);
    window.addEventListener('focus', verify);
    return () => {
      mounted.current = false;
      ac.abort();
      focusController?.abort();
      controller.current?.abort();
      if (expiryTimer.current) clearTimeout(expiryTimer.current);
      window.removeEventListener('pageshow', restore);
      window.removeEventListener('focus', verify);
    };
  }, []);
  async function unlock(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const password = String(
      new FormData(event.currentTarget).get('password') || '',
    );
    form.current?.reset();
    try {
      const ac = new AbortController();
      controller.current = ac;
      const r = await fetch('/api/vault/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        cache: 'no-store',
        signal: ac.signal,
      });
      const d = (await r.json()) as {
        error: string;
        authenticated: boolean;
        expiresAt?: number;
        records: PrivateSummary[];
        article: PrivateRecord;
      };
      if (!r.ok) {
        setSignIn(r.status === 401 && /账号/.test(d.error));
        throw new Error(d.error);
      }
      if (!mounted.current) return;
      setAuthenticated(true);
      scheduleExpiry(d.expiresAt);
      if (!onEnter) await loadRecords(ac.signal);
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : '暂时无法开门。');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }
  async function lock() {
    controller.current?.abort();
    setArticle(null);
    setRecords([]);
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/vault/session', {
        method: 'DELETE',
        cache: 'no-store',
      });
      if (!r.ok) throw new Error('暂时未能上锁，请重试。');
      if (mounted.current) {
        setAuthenticated(false);
        if (expiryTimer.current) clearTimeout(expiryTimer.current);
        onLock?.();
      }
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : '上锁失败。');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }
  async function read(id: string) {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/vault/records/${encodeURIComponent(id)}`, {
        signal: ac.signal,
        cache: 'no-store',
      });
      const d = (await r.json()) as {
        error: string;
        authenticated: boolean;
        records: PrivateSummary[];
        article: PrivateRecord;
      };
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
          setAuthenticated(false);
          setRecords([]);
          setArticle(null);
        }
        throw new Error(d.error);
      }
      if (!ac.signal.aborted) setArticle(d.article);
    } catch (e) {
      if (!ac.signal.aborted)
        setError(e instanceof Error ? e.message : '暂时无法阅读。');
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }
  return (
    <section className="private-vault">
      <header className="vault-heading">
        <span className="eyebrow">A ROOM OF ONE’S OWN</span>
        {authenticated && (
          <button onClick={lock} disabled={loading}>
            <LockKeyhole size={14} /> 合上并上锁
          </button>
        )}
      </header>
      {!authenticated ? (
        <div className="vault-door">
          <div className="vault-keyhole">
            <KeyRound size={26} strokeWidth={1.2} />
          </div>
          <h2>有些页，只留给自己。</h2>
          <p>
            书柜后面，还有一间安静的房。
            <br />
            用私藏室的钥匙打开它。
          </p>
          <form ref={form} onSubmit={unlock}>
            <label htmlFor="vault-password">私藏室密码</label>
            <input
              id="vault-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
              placeholder="输入独立密码"
              disabled={loading}
            />
            <button type="submit" disabled={loading}>
              {loading ? '正在检查门锁…' : '开门'} <ArrowUpRight size={16} />
            </button>
          </form>
          {signIn && (
            <a href="/signin-with-chatgpt?return_to=%2Fvault" target="_top">
              登录主人的 ChatGPT 账号 ↗
            </a>
          )}
          <small>仅主人账号 · 两小时后自动上锁</small>
        </div>
      ) : onEnter ? (
        <div className="vault-door">
          <div className="vault-keyhole">
            <KeyRound size={26} />
          </div>
          <h2>欢迎回来。</h2>
          <p>门锁轻轻转了一圈。</p>
          <button className="vault-enter" onClick={onEnter}>
            推门进去 <ArrowUpRight size={16} />
          </button>
        </div>
      ) : article ? (
        <article className="vault-article">
          <button className="vault-back" onClick={() => setArticle(null)}>
            <ArrowLeft size={14} /> 放回书架
          </button>
          <time>{article.date} · 私藏记录</time>
          <h1>{article.title}</h1>
          <ArticleBody html={article.html} />
        </article>
      ) : (
        <div className="vault-records">
          <h2>私藏室</h2>
          <p>旧时写下的话，在这里原样收好。</p>
          {records.map((p) => (
            <button key={p.id} onClick={() => read(p.id)} disabled={loading}>
              <time>{p.date}</time>
              <h3>{p.title}</h3>
              <ArrowUpRight size={16} />
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="vault-error" role="alert">
          {error}
        </p>
      )}
      {authenticated && loading && <p role="status">正在翻开记录…</p>}
    </section>
  );
}
