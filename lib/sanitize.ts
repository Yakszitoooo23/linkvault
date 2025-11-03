export const safe = (s: string): string => {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "");
};

