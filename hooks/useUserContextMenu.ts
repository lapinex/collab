'use client';

import { useState, useEffect, createElement } from 'react';
import { ContextMenu } from '@/components/context-menu/ContextMenu';
import { RolesSubmenu } from '@/components/context-menu/RolesSubmenu';
import type { Role } from '@/types/server';
import { User, UserX, Ban, Shield, Mic, MicOff, Headphones, HeadphonesIcon } from 'lucide-react';

export interface VoiceModerationActions {
  canMute: boolean;
  canDeafen: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  onMute: () => void;
  onUnmute: () => void;
  onDeafen: () => void;
  onUndeafen: () => void;
}

interface UseUserContextMenuProps {
  userId: string;
  serverId?: string;
  currentUserId?: string;
  canManageRoles?: boolean;
  canKick?: boolean;
  canBan?: boolean;
  onProfileClick?: () => void;
  onKickClick?: () => void;
  onBanClick?: () => void;
  voiceModeration?: VoiceModerationActions;
}

export function useUserContextMenu({
  userId,
  serverId,
  currentUserId,
  canManageRoles = false,
  canKick = false,
  canBan = false,
  onProfileClick,
  onKickClick,
  onBanClick,
  voiceModeration,
}: UseUserContextMenuProps) {
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [currentUserRoles, setCurrentUserRoles] = useState<Role[]>([]);
  const [userRoles, setUserRoles] = useState<Role[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);

  // Load roles when menu opens
  useEffect(() => {
    if (!contextMenuPos || !serverId || !currentUserId) return;

    const loadRoles = async () => {
      setIsLoadingRoles(true);
      try {
        // Load all server roles
        const rolesResponse = await fetch(`/api/servers/${serverId}/roles`);
        if (rolesResponse.ok) {
          const rolesData = await rolesResponse.json();
          const sortedRoles = (rolesData.roles || []).sort((a: Role, b: Role) => b.position - a.position);
          setRoles(sortedRoles);
        }

        // Load current user's roles
        const currentUserResponse = await fetch(`/api/servers/${serverId}/members/${currentUserId}`);
        if (currentUserResponse.ok) {
          const currentUserData = await currentUserResponse.json();
          const currentUserMember = currentUserData.members?.find((m: { id: string }) => m.id === currentUserId);
          if (currentUserMember?.roles) {
            setCurrentUserRoles(currentUserMember.roles.map((r: { id: string; name: string; color: string; position: number }) => ({
              id: r.id,
              serverId,
              name: r.name,
              color: r.color,
              position: r.position,
              permissions: BigInt(0),
              createdAt: new Date(),
              updatedAt: new Date(),
            })));
          }
        }

        // Load target user's roles
        const userResponse = await fetch(`/api/servers/${serverId}/members/${userId}`);
        if (userResponse.ok) {
          const userData = await userResponse.json();
          const userMember = userData.members?.find((m: { id: string }) => m.id === userId);
          if (userMember?.roles) {
            setUserRoles(userMember.roles.map((r: { id: string; name: string; color: string; position: number }) => ({
              id: r.id,
              serverId,
              name: r.name,
              color: r.color,
              position: r.position,
              permissions: BigInt(0),
              createdAt: new Date(),
              updatedAt: new Date(),
            })));
          }
        }
      } catch (err) {
        console.error('Error loading roles:', err);
      } finally {
        setIsLoadingRoles(false);
      }
    };

    void loadRoles();
  }, [contextMenuPos, serverId, currentUserId, userId]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const handleRoleToggle = async (roleId: string, hasRole: boolean) => {
    if (!serverId) return;

    try {
      if (hasRole) {
        // Remove role
        const response = await fetch(`/api/servers/${serverId}/members/${userId}/role?roleId=${roleId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to remove role');
        setUserRoles(prev => prev.filter(r => r.id !== roleId));
      } else {
        // Add role
        const response = await fetch(`/api/servers/${serverId}/members/${userId}/role`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ roleId }),
        });
        if (!response.ok) throw new Error('Failed to add role');
        // Find role in roles list
        const addedRole = roles.find(r => r.id === roleId);
        if (addedRole) {
          setUserRoles(prev => [...prev, addedRole].sort((a, b) => b.position - a.position));
        }
      }
    } catch (err) {
      console.error('Error toggling role:', err);
      // Reload on error
      const userResponse = await fetch(`/api/servers/${serverId}/members/${userId}`);
      if (userResponse.ok) {
        const userData = await userResponse.json();
        const userMember = userData.members?.find((m: { id: string }) => m.id === userId);
        if (userMember?.roles) {
          setUserRoles(userMember.roles.map((r: { id: string; name: string; color: string; position: number }) => ({
            id: r.id,
            serverId,
            name: r.name,
            color: r.color,
            position: r.position,
            permissions: BigInt(0),
            createdAt: new Date(),
            updatedAt: new Date(),
          })));
        }
      }
    }
  };

  const menuItems = [
    {
      label: 'Profile',
      icon: createElement(User, { className: 'w-4 h-4' }),
      onClick: () => {
        onProfileClick?.();
        setContextMenuPos(null);
      },
    },
    ...(canManageRoles && serverId
      ? [
          {
            label: 'Roles',
            icon: createElement(Shield, { className: 'w-4 h-4' }),
            submenuContent: isLoadingRoles ? (
              createElement('div', { className: 'p-2 text-xs text-text-muted' }, 'Loading...')
            ) : (
              createElement(RolesSubmenu, {
                serverId,
                userId,
                currentUserRoles,
                userRoles,
                onRoleToggle: handleRoleToggle,
                onClose: () => setContextMenuPos(null),
              })
            ),
          },
        ]
      : []),
    { label: '', separator: true },
    ...(canKick
      ? [
          {
            label: 'Kick',
            icon: createElement(UserX, { className: 'w-4 h-4' }),
            onClick: () => {
              onKickClick?.();
              setContextMenuPos(null);
            },
          },
        ]
      : []),
    ...(canBan
      ? [
          {
            label: 'Ban',
            icon: createElement(Ban, { className: 'w-4 h-4' }),
            variant: 'danger' as const,
            onClick: () => {
              onBanClick?.();
              setContextMenuPos(null);
            },
          },
        ]
      : []),
    ...(voiceModeration && (voiceModeration.canMute || voiceModeration.canDeafen)
      ? [
          { label: '', separator: true },
          ...(voiceModeration.canMute
            ? [
                {
                  label: voiceModeration.isMuted ? 'Unmute' : 'Mute',
                  icon: createElement(voiceModeration.isMuted ? Mic : MicOff, { className: 'w-4 h-4' }),
                  onClick: () => {
                    (voiceModeration.isMuted ? voiceModeration.onUnmute : voiceModeration.onMute)();
                    setContextMenuPos(null);
                  },
                },
              ]
            : []),
          ...(voiceModeration.canDeafen
            ? [
                {
                  label: voiceModeration.isDeafened ? 'Undeafen' : 'Deafen',
                  icon: createElement(voiceModeration.isDeafened ? HeadphonesIcon : Headphones, { className: 'w-4 h-4' }),
                  onClick: () => {
                    (voiceModeration.isDeafened ? voiceModeration.onUndeafen : voiceModeration.onDeafen)();
                    setContextMenuPos(null);
                  },
                },
              ]
            : []),
        ]
      : []),
  ];

  const contextMenu = contextMenuPos
    ? createElement(ContextMenu, {
        items: menuItems,
        position: contextMenuPos,
        onClose: () => setContextMenuPos(null),
      })
    : null;

  return {
    handleContextMenu,
    contextMenu,
  };
}
