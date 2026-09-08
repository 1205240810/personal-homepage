export type PrivateRecord = {
  id: string;
  title: string;
  date: string;
  updatedAt: string;
  sourceURL: string;
  sourcePermission: string;
  html: string;
};
export type PrivateSummary = Omit<
  PrivateRecord,
  'html' | 'sourceURL' | 'sourcePermission'
>;
