'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useServerMeta, useServerMembers } from '@/hooks/serverView';
import { useChannelViewQuery, channelViewQueryKey } from '@/hooks/useChannelViewQuery';
import { Permission } from '@/types/permissions';
import { hasPermission, PERMISSION_META } from '@/lib/permissions/constants';
import { cn } from '@/lib/utils';
import { Check, X, Minus } from 'lucide-react';

export interface ChannelPermissionOverwrite {
  id: string;
  channelId: string;
  roleId: string | null;
  userId: string | null;
  allow: number;
  deny: number;
  role?: {
    id: string;
    name: string;
    color: string;
    position: number;
  } | null;
  user?: {
    id: string;
    name: string;
    avatarUrl: string | null;
  } | null;
}

interface ChannelPermissionsEditorProps {
  channelId: string;
  serverId: string;
  onSave?: () => void;
}

type PermissionState = 'allow' | 'deny' | 'neutral';

// Permission groups for organization
const PERMISSION_GROUPS = [
  {
    label: 'General',
    permissions: [
      Permission.VIEW_CHANNEL,
    ],
  },
  {
    label: 'Text Permissions',
    permissions: [
      Permission.SEND_MESSAGES,
      Permission.SEND_TTS_MESSAGES,
      Permission.MANAGE_MESSAGES,
      Permission.EMBED_LINKS,
      Permission.ATTACH_FILES,
      Permission.READ_MESSAGE_HISTORY,
      Permission.MENTION_EVERYONE,
      Permission.USE_EXTERNAL_EMOJIS,
      Permission.ADD_REACTIONS,
    ],
  },
  {
    label: 'Voice Permissions',
    permissions: [
      Permission.CONNECT,
      Permission.SPEAK,
      Permission.MUTE_MEMBERS,
      Permission.DEAFEN_MEMBERS,
      Permission.MOVE_MEMBERS,
      Permission.USE_VOICE_ACTIVATION,
      Permission.PRIORITY_SPEAKER,
    ],
  },
];

// Permission names for display
// Note: Using Partial to exclude permissions with bit shift overflow conflicts
// (MODERATE_MEMBERS, VIEW_CHANNEL_INSIGHTS, USE_SOUNDBOARD, CREATE_EVENTS, ADMINISTRATOR)
const PERMISSION_NAMES: Partial<Record<Permission, string>> = {
  [Permission.MANAGE_SERVER]: 'Manage Server',
  [Permission.VIEW_SERVER]: 'View Server',
  [Permission.MANAGE_ROLES]: 'Manage Roles',
  [Permission.MANAGE_CHANNELS]: 'Manage Channels',
  [Permission.MANAGE_MEMBERS]: 'Manage Members',
  [Permission.KICK_MEMBERS]: 'Kick Members',
  [Permission.BAN_MEMBERS]: 'Ban Members',
  [Permission.CREATE_INVITES]: 'Create Invites',
  [Permission.MANAGE_INVITES]: 'Manage Invites',
  [Permission.VIEW_AUDIT_LOG]: 'View Audit Log',
  [Permission.VIEW_CHANNEL]: 'View Channel',
  [Permission.SEND_MESSAGES]: 'Send Messages',
  [Permission.SEND_TTS_MESSAGES]: 'Send TTS Messages',
  [Permission.MANAGE_MESSAGES]: 'Manage Messages',
  [Permission.EMBED_LINKS]: 'Embed Links',
  [Permission.ATTACH_FILES]: 'Attach Files',
  [Permission.READ_MESSAGE_HISTORY]: 'Read Message History',
  [Permission.MENTION_EVERYONE]: 'Mention Everyone',
  [Permission.USE_EXTERNAL_EMOJIS]: 'Use External Emojis',
  [Permission.ADD_REACTIONS]: 'Add Reactions',
  [Permission.CONNECT]: 'Connect',
  [Permission.SPEAK]: 'Speak',
  [Permission.MUTE_MEMBERS]: 'Mute Members',
  [Permission.DEAFEN_MEMBERS]: 'Deafen Members',
  [Permission.MOVE_MEMBERS]: 'Move Members',
  [Permission.USE_VOICE_ACTIVATION]: 'Use Voice Activation',
  [Permission.PRIORITY_SPEAKER]: 'Priority Speaker',
  [Permission.USE_APPLICATION_COMMANDS]: 'Use Application Commands',
  [Permission.MANAGE_EVENTS]: 'Manage Events',
  [Permission.MANAGE_WEBHOOKS]: 'Manage Webhooks',
  [Permission.USE_EXTERNAL_STICKERS]: 'Use External Stickers',
  [Permission.SEND_VOICE_MESSAGES]: 'Send Voice Messages',
  // Note: MODERATE_MEMBERS, VIEW_CHANNEL_INSIGHTS, USE_SOUNDBOARD, CREATE_EVENTS, ADMINISTRATOR
  // are not included due to bit shift overflow conflicts (not used in MVP)
};

export function ChannelPermissionsEditor({
  channelId,
  serverId,
  onSave,
}: ChannelPermissionsEditorProps) {
  const queryClient = useQueryClient();
  const { data: metaData } = useServerMeta(serverId);
  const { data: membersData } = useServerMembers(serverId);
  const { overwrites: queryOverwrites, isLoading } = useChannelViewQuery(channelId);

  const serverRoles = useMemo(() => metaData?.roles ?? [], [metaData?.roles]);
  const serverMembers = useMemo(() => membersData ?? [], [membersData]);

  const [selectedEntity, setSelectedEntity] = useState<{
    type: 'role' | 'user';
    id: string;
  } | null>(null);

  const [overwrites, setOverwrites] = useState<ChannelPermissionOverwrite[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setOverwrites(queryOverwrites ?? []);
  }, [queryOverwrites]);

  // Get current overwrite for selected entity
  const currentOverwrite = useMemo(() => {
    if (!selectedEntity) return null;
    
    return overwrites.find(ow => 
      (selectedEntity.type === 'role' && ow.roleId === selectedEntity.id) ||
      (selectedEntity.type === 'user' && ow.userId === selectedEntity.id)
    ) || null;
  }, [selectedEntity, overwrites]);

  // Get permission state for a specific permission
  const getPermissionState = (permission: Permission): PermissionState => {
    if (!currentOverwrite) return 'neutral';
    
    const allow = hasPermission(currentOverwrite.allow, permission);
    const deny = hasPermission(currentOverwrite.deny, permission);
    
    if (allow) return 'allow';
    if (deny) return 'deny';
    return 'neutral';
  };

  // Toggle permission state (neutral -> allow -> deny -> neutral)
  const togglePermission = async (permission: Permission) => {
    if (!selectedEntity) return;

    const currentState = getPermissionState(permission);
    let newState: PermissionState;
    
    // Cycle: neutral -> allow -> deny -> neutral
    if (currentState === 'neutral') {
      newState = 'allow';
    } else if (currentState === 'allow') {
      newState = 'deny';
    } else {
      newState = 'neutral';
    }

    // Calculate new allow/deny masks
    let newAllow = currentOverwrite?.allow || 0;
    let newDeny = currentOverwrite?.deny || 0;

    // Remove from both first
    newAllow &= ~permission;
    newDeny &= ~permission;

    // Add to appropriate mask
    if (newState === 'allow') {
      newAllow |= permission;
    } else if (newState === 'deny') {
      newDeny |= permission;
    }

    // Optimistic update
    const existingIndex = overwrites.findIndex(ow =>
      (selectedEntity.type === 'role' && ow.roleId === selectedEntity.id) ||
      (selectedEntity.type === 'user' && ow.userId === selectedEntity.id)
    );

    const newOverwrite: ChannelPermissionOverwrite = {
      id: existingIndex >= 0 ? overwrites[existingIndex]!.id : `temp_${Date.now()}`,
      channelId,
      roleId: selectedEntity.type === 'role' ? selectedEntity.id : null,
      userId: selectedEntity.type === 'user' ? selectedEntity.id : null,
      allow: newAllow,
      deny: newDeny,
    };

    const newOverwrites = existingIndex >= 0
      ? overwrites.map((ow, idx) => idx === existingIndex ? newOverwrite : ow)
      : [...overwrites, newOverwrite];

    setOverwrites(newOverwrites);

    // Save to server
    try {
      setIsSaving(true);
      const response = await fetch(`/api/channels/${channelId}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          roleId: selectedEntity.type === 'role' ? selectedEntity.id : null,
          userId: selectedEntity.type === 'user' ? selectedEntity.id : null,
          allow: newAllow,
          deny: newDeny,
        }),
      });

      if (!response.ok) {
        // Rollback on error
        setOverwrites(overwrites);
        throw new Error('Failed to save permission');
      }

      const data = await response.json();
      // Update with server response
      const updatedOverwrites = newOverwrites.map(ow =>
        ow.id === newOverwrite.id ? data.overwrite : ow
      );
      setOverwrites(updatedOverwrites);
      
      queryClient.invalidateQueries({ queryKey: channelViewQueryKey(channelId) });
      onSave?.();
    } catch (err) {
      console.error('Error saving permission:', err);
      // Rollback already done above
    } finally {
      setIsSaving(false);
    }
  };

  // Remove overwrite
  const removeOverwrite = async (overwriteId: string) => {
    try {
      setIsSaving(true);
      const response = await fetch(`/api/channels/${channelId}/permissions/${overwriteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to remove overwrite');

      setOverwrites(prev => prev.filter(ow => ow.id !== overwriteId));
      
      // If we removed the selected entity's overwrite, clear selection
      if (currentOverwrite?.id === overwriteId) {
        setSelectedEntity(null);
      }
      
      queryClient.invalidateQueries({ queryKey: channelViewQueryKey(channelId) });
      onSave?.();
    } catch (err) {
      console.error('Error removing overwrite:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Sort roles by position DESC
  const sortedRoles = useMemo(() => {
    return [...serverRoles].sort((a, b) => b.position - a.position);
  }, [serverRoles]);

  if (isLoading) {
    return <div className="text-text-muted">Loading permissions...</div>;
  }

  return (
    <div className="flex gap-4 h-[600px]">
      {/* Left sidebar: Roles and Members */}
      <div className="w-64 border-r border-border-primary pr-4 overflow-y-auto">
        <div className="space-y-4">
          {/* Roles section */}
          <div>
            <h3 className="text-xs font-semibold uppercase text-text-muted mb-2">Roles</h3>
            <div className="space-y-1">
              {sortedRoles.map((role) => {
                const overwrite = overwrites.find(ow => ow.roleId === role.id);
                const isSelected = selectedEntity?.type === 'role' && selectedEntity.id === role.id;
                
                return (
                  <button
                    key={role.id}
                    onClick={() => setSelectedEntity({ type: 'role', id: role.id })}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                      'hover:bg-bg-hover',
                      isSelected && 'bg-green-primary/20 border border-green-primary/50',
                      !isSelected && 'border border-transparent'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: role.color }}
                      />
                      <span className="flex-1 truncate">{role.name}</span>
                      {overwrite && (
                        <span className="text-xs text-text-muted">●</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Members section */}
          <div>
            <h3 className="text-xs font-semibold uppercase text-text-muted mb-2">Members</h3>
            <div className="space-y-1">
              {serverMembers.slice(0, 20).map((member) => {
                const overwrite = overwrites.find(ow => ow.userId === member.id);
                const isSelected = selectedEntity?.type === 'user' && selectedEntity.id === member.id;
                
                return (
                  <button
                    key={member.id}
                    onClick={() => setSelectedEntity({ type: 'user', id: member.id })}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                      'hover:bg-bg-hover',
                      isSelected && 'bg-green-primary/20 border border-green-primary/50',
                      !isSelected && 'border border-transparent'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate">
                        {member.nickname || member.name || `User ${member.id.slice(0, 8)}`}
                      </span>
                      {overwrite && (
                        <span className="text-xs text-text-muted">●</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Right panel: Permission editor */}
      <div className="flex-1 overflow-y-auto">
        {selectedEntity ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">
                {selectedEntity.type === 'role'
                  ? serverRoles.find(r => r.id === selectedEntity.id)?.name || 'Role'
                  : serverMembers.find(m => m.id === selectedEntity.id)?.nickname
                    || serverMembers.find(m => m.id === selectedEntity.id)?.name || 'User'}
              </h3>
              <p className="text-sm text-text-muted">
                {selectedEntity.type === 'role' 
                  ? 'Override permissions for this role in this channel'
                  : 'Override permissions for this user in this channel'}
              </p>
            </div>

            {currentOverwrite && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => removeOverwrite(currentOverwrite.id)}
                disabled={isSaving}
                className="text-destructive hover:text-destructive"
              >
                Remove Override
              </Button>
            )}

            {/* Permission groups */}
            <div className="space-y-6">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.label}>
                  <h4 className="text-sm font-semibold text-text-secondary mb-3">
                    {group.label}
                  </h4>
                  <div className="space-y-2">
                    {group.permissions.map((permission) => {
                      const state = getPermissionState(permission);
                      
                      return (
                        <div
                          key={permission}
                          className="flex items-center justify-between p-3 rounded-md border border-border-primary hover:bg-bg-hover transition-colors"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-sm">
                              {PERMISSION_NAMES[permission] ?? `Permission ${permission}`}
                              {PERMISSION_META[permission]?.implemented === false && (
                                <span className="ml-2 text-xs text-text-muted" title="Not enforced yet">
                                  {' '}🧪 Beta — not enforced yet
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {/* Tristate toggle */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => togglePermission(permission)}
                              disabled={isSaving}
                              className={cn(
                                'w-8 h-8 rounded flex items-center justify-center transition-colors',
                                state === 'allow' && 'bg-green-primary/20 text-green-primary',
                                state === 'deny' && 'bg-destructive/20 text-destructive',
                                state === 'neutral' && 'bg-bg-tertiary text-text-muted hover:bg-bg-hover'
                              )}
                              title={state === 'allow' ? 'Allowed' : state === 'deny' ? 'Denied' : 'Neutral'}
                            >
                              {state === 'allow' && <Check className="w-4 h-4" />}
                              {state === 'deny' && <X className="w-4 h-4" />}
                              {state === 'neutral' && <Minus className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-text-muted">
            <div className="text-center">
              <p className="text-lg mb-2">Select a role or member</p>
              <p className="text-sm">Choose from the list to configure permissions</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
