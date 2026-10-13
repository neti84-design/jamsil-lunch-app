import { useCallback, useEffect, useMemo, useState } from 'react';
import { createTalkBackend, type TalkComment, type TalkPost } from '../lib/talk';
import type { SiteId } from '../lib/sites';

/**
 * 공유톡 글·댓글을 불러오고 실시간으로 따라간다. adminToken 은 관리자 로그인 상태일 때만.
 * 글은 지금 근무지(site) 것만 보여 주고, 새 글도 그 근무지 글로 올린다
 */
export function useTalk(adminToken: string, site: SiteId) {
  const [backend] = useState(createTalkBackend);
  const [posts, setPosts] = useState<TalkPost[]>([]);
  const [comments, setComments] = useState<TalkComment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    backend
      .list()
      .then((v) => {
        if (!alive) return;
        setPosts(v.posts);
        setComments(v.comments);
      })
      .catch((e: unknown) => {
        console.warn('[jamsil-lunch] 공유톡 불러오기 실패:', e);
        if (alive) setError('공유톡을 불러오지 못했어요');
      });
    let off: () => void = () => {};
    try {
      off = backend.subscribe({
        post: (p) => setPosts((prev) => [p, ...prev.filter((x) => x.id !== p.id)]),
        postRemoved: (id) => {
          setPosts((prev) => prev.filter((x) => x.id !== id));
          setComments((prev) => prev.filter((c) => c.postId !== id));
        },
        comment: (c) => setComments((prev) => (prev.some((x) => x.id === c.id) ? prev : [c, ...prev])),
        commentRemoved: (id) => setComments((prev) => prev.filter((c) => c.id !== id)),
      });
    } catch (e) {
      console.warn('[jamsil-lunch] 공유톡 실시간 구독 실패:', e);
    }
    return () => {
      alive = false;
      off();
    };
  }, [backend]);

  const addComment = useCallback(
    async (postId: string, body: string) => {
      const c = await backend.addComment(postId, body);
      setComments((prev) => (prev.some((x) => x.id === c.id) ? prev : [c, ...prev]));
    },
    [backend],
  );

  const removeComment = useCallback(
    async (id: string, asAdmin = false) => {
      if (asAdmin) await backend.removeComment(id, adminToken);
      else await backend.removeOwnComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    },
    [backend, adminToken],
  );

  const createPost = useCallback(
    async (body: string, allowComments: boolean) => {
      const p = await backend.createPost(body, allowComments, site, adminToken);
      setPosts((prev) => [p, ...prev.filter((x) => x.id !== p.id)]);
    },
    [backend, adminToken, site],
  );

  const createPublicPost = useCallback(
    async (body: string) => {
      const p = await backend.createPublicPost(body, site);
      setPosts((prev) => [p, ...prev.filter((x) => x.id !== p.id)]);
    },
    [backend, site],
  );

  const setPostComments = useCallback(
    async (id: string, allowComments: boolean) => {
      const p = await backend.setComments(id, allowComments, adminToken);
      setPosts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    },
    [backend, adminToken],
  );

  const updatePost = useCallback(
    async (id: string, body: string) => {
      const p = await backend.updatePost(id, body, site, adminToken);
      setPosts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    },
    [backend, adminToken, site],
  );

  const removePost = useCallback(
    async (id: string, own = false) => {
      if (own) await backend.removeOwnPost(id);
      else await backend.removePost(id, adminToken);
      setPosts((prev) => prev.filter((x) => x.id !== id));
      setComments((prev) => prev.filter((c) => c.postId !== id));
    },
    [backend, adminToken],
  );

  /** 지금 근무지 글만, 최신 글이 위로 */
  const sortedPosts = useMemo(
    () => posts.filter((p) => p.site === site).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [posts, site],
  );
  const siteComments = useMemo(() => {
    const ids = new Set(sortedPosts.map((p) => p.id));
    return comments.filter((c) => ids.has(c.postId));
  }, [comments, sortedPosts]);

  return { mode: backend.mode, posts: sortedPosts, comments: siteComments, error, addComment, removeComment, createPost, createPublicPost, setPostComments, updatePost, removePost };
}

export type Talk = ReturnType<typeof useTalk>;
