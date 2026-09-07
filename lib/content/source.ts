import catalog from './generated.json';
import profile from '../../content/data/profile.json';
import awards from '../../content/data/awards.json';
export type Article = (typeof catalog.posts)[number];
export type ArticleSummary = Omit<Article, 'html' | 'headings'>;
export type ContentDocument =
  | { kind: 'article'; article: Article }
  | { kind: 'profile'; profile: typeof profile; awards: typeof awards };
export interface ContentSource {
  list(filter?: { chapter?: string; tag?: string }): Promise<ArticleSummary[]>;
  get(id: string): Promise<ContentDocument | null>;
}
export const contentSource: ContentSource = {
  async list(filter = {}) {
    return catalog.posts
      .filter(
        (p) =>
          (!filter.chapter || p.chapter === filter.chapter) &&
          (!filter.tag || p.tags.includes(filter.tag)),
      )
      .map(({ html, headings, ...summary }) => summary);
  },
  async get(id) {
    if (id === 'profile') return { kind: 'profile', profile, awards };
    const article = catalog.posts.find((p) => p.id === id || p.slug === id);
    return article ? { kind: 'article', article } : null;
  },
};
export const isPrivatePreview = catalog.preview;
export { profile, awards };
