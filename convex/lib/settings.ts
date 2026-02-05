export type LatexCacheMode = "off" | "aux";

export function resolveCacheMode(options: {
  repoCacheMode?: LatexCacheMode | null;
  userCacheMode?: LatexCacheMode | null;
  cacheAllowed?: boolean | null;
}): LatexCacheMode {
  if (options.cacheAllowed === false) {
    return "off";
  }
  return options.repoCacheMode ?? options.userCacheMode ?? "off";
}

export function resolveBackgroundRefreshEnabled(options: {
  repoSetting?: boolean | null;
  userDefault?: boolean | null;
}): boolean {
  if (options.repoSetting === true) return true;
  if (options.repoSetting === false) return false;
  return options.userDefault ?? true;
}
