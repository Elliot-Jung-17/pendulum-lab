/** One explicit dynamic import per available unit. The build gate checks this against disk and metadata. */
export const learnModules: Readonly<Record<string, () => Promise<{ default: unknown }>>> = {
  'course-1/1.1': () => import('./course-1/1.1')
};
