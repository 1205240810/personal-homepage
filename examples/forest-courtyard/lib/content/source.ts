import catalog from './catalog.json';
export type Article = Omit<(typeof catalog.posts)[number], 'headings'> & {
  headings: { id: string; level: number; title: string }[];
};
export type ArticleSummary = Omit<Article, 'html' | 'headings'>;
export const articles: Article[] = catalog.posts;
export const articleSummaries: ArticleSummary[] = articles.map(
  ({ html, headings, ...summary }) => summary,
);
export const contentSource = {
  async get(id: string) {
    const article = articles.find((item) => item.id === id || item.slug === id);
    return article ? { kind: 'article' as const, article } : null;
  },
};
