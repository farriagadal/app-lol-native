const OPGG_REGION: Record<string, string> = {
  la2: 'las', la1: 'lan', na1: 'na', br1: 'br',
  euw1: 'euw', eun1: 'eune', kr: 'kr', jp1: 'jp',
  oc1: 'oce', tr1: 'tr', ru: 'ru',
};

/** URL de op.gg para un jugador dado su riotId (Nombre#TAG) y región de plataforma. */
export function opggUrl(riotId: string, region: string): string {
  const [gameName, tagLine] = riotId.split('#');
  const r = OPGG_REGION[region] ?? region;
  return `https://www.op.gg/summoners/${r}/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine ?? r.toUpperCase())}`;
}
