export type AppUrlState = {
  tab?: 'servers' | 'dms';
  serverId?: string | null;
  channelId?: string | null;
  dmId?: string | null;
};

export function parseAppUrlState(searchParams: URLSearchParams): AppUrlState {
  const tabParam = searchParams.get('tab');
  const dmId = searchParams.get('dmId') ?? searchParams.get('dm');
  const serverId = searchParams.get('serverId');
  const channelId = searchParams.get('channelId');

  const tab: 'servers' | 'dms' | undefined =
    tabParam === 'dms' || dmId ? 'dms' : tabParam === 'servers' ? 'servers' : undefined;

  return {
    tab,
    serverId: serverId || null,
    channelId: channelId || null,
    dmId: dmId || null,
  };
}

export function buildAppUrl(state: AppUrlState): string {
  const params = new URLSearchParams();
  const tab = state.tab ?? (state.dmId ? 'dms' : 'servers');

  if (tab === 'dms') {
    params.set('tab', 'dms');
    if (state.dmId) params.set('dmId', state.dmId);
  } else {
    params.set('tab', 'servers');
    if (state.serverId) params.set('serverId', state.serverId);
    if (state.channelId) params.set('channelId', state.channelId);
  }

  const query = params.toString();
  return query ? `/app?${query}` : '/app';
}
