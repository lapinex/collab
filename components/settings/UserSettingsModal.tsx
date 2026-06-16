'use client';

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth-store';
import { apiGet, apiPatch, apiPost, apiDelete } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { AdminPanel } from '@/components/settings/AdminPanel';

type Section =
  | 'account'
  | 'communication'
  | 'devices'
  | 'notifications'
  | 'voice'
  | 'logout'
  | 'admin';

interface MeSettings {
  username: string;
  email: string;
  user_settings: {
    allowDm: boolean;
    allowDmFromNonMutual: boolean;
    allowFriendRequests: boolean;
    notificationsMode: 'all' | 'mentions' | 'none';
    voiceInputDevice: string | null;
    voiceOutputDevice: string | null;
    voiceScreenShareSound: boolean;
  };
  current_session: {
    id: string;
    userAgent: string | null;
    ip: string | null;
    createdAt: string;
    lastActiveAt: string;
  } | null;
  sessions: Array<{
    id: string;
    userAgent: string | null;
    ip: string | null;
    createdAt: string;
    lastActiveAt: string;
    isCurrent: boolean;
  }>;
}

interface BlockItem {
  id: string;
  user: { id: string; name: string; avatarUrl: string | null } | null;
}

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'account', label: 'Учётная запись' },
  { id: 'communication', label: 'Общение' },
  { id: 'devices', label: 'Устройства' },
  { id: 'notifications', label: 'Уведомления' },
  { id: 'voice', label: 'Голосовые настройки' },
  { id: 'logout', label: 'Выйти' },
];

const EXIT_DURATION_MS = 200;

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after exit animation finishes (for delayed unmount). */
  onClosed?: () => void;
}

export function UserSettingsModal({ isOpen, onClose, onClosed }: UserSettingsModalProps) {
  const { user } = useAuth();
  const { setUser, logout: authLogout } = useAuthStore.getState();
  const [activeSection, setActiveSection] = useState<Section>('account');
  const [isExiting, setIsExiting] = useState(false);
  const wasOpenRef = useRef(isOpen);
  const [settings, setSettings] = useState<MeSettings | null>(null);
  const [blocks, setBlocks] = useState<BlockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Account form
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !user) return;
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<MeSettings>('/api/users/me/settings'),
      apiGet<{ blocks: BlockItem[] }>('/api/users/me/blocks'),
    ])
      .then(([me, bl]) => {
        setSettings(me);
        setBlocks(bl.blocks || []);
        setUsername(me.username);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      })
      .finally(() => setLoading(false));
  }, [isOpen, user]);

  const handleSaveCommunication = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      await apiPatch('/api/users/me/settings', {
        allowDm: settings.user_settings.allowDm,
        allowDmFromNonMutual: settings.user_settings.allowDmFromNonMutual,
        allowFriendRequests: settings.user_settings.allowFriendRequests,
      });
      setSettings((s) =>
        s ? { ...s, user_settings: { ...s.user_settings } } : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      await apiPatch('/api/users/me/settings', {
        notificationsMode: settings.user_settings.notificationsMode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveVoice = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      await apiPatch('/api/users/me/settings', {
        voiceInputDevice: settings.user_settings.voiceInputDevice,
        voiceOutputDevice: settings.user_settings.voiceOutputDevice,
        voiceScreenShareSound: settings.user_settings.voiceScreenShareSound,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    setSaving(true);
    try {
      await apiPost('/api/users/me/change-password', {
        currentPassword: currentPassword,
        newPassword: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfileName = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiPatch<{ user: { name: string } }>('/api/users/profile', {
        name: username.trim(),
      });
      if (res.user) {
        setUser({ ...user!, name: res.user.name });
        setSettings((s) => (s ? { ...s, username: res.user.name } : null));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleUnblock = async (blockedUserId: string) => {
    try {
      await apiDelete(`/api/users/me/block/${blockedUserId}`);
      setBlocks((b) => b.filter((x) => x.id !== blockedUserId));
    } catch {
      setError('Failed to unblock');
    }
  };

  const handleLogout = async () => {
    try {
      await apiPost('/api/auth/logout', {});
      authLogout();
      onClose();
      window.location.href = '/';
    } catch {
      authLogout();
      onClose();
      window.location.href = '/';
    }
  };

  const parseUserAgent = (ua: string | null) => {
    if (!ua) return 'Unknown device';
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edg')) return 'Edge';
    return 'Browser';
  };

  // Exit animation: when isOpen goes false, keep mounted and fade out, then onClosed
  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      setIsExiting(true);
      const t = setTimeout(() => {
        setIsExiting(false);
        onClosed?.();
      }, EXIT_DURATION_MS);
      return () => clearTimeout(t);
    }
    wasOpenRef.current = isOpen;
    return undefined;
  }, [isOpen, onClosed]);

  if (!isOpen && !isExiting) return null;

  const isExit = !isOpen && isExiting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={cn('absolute inset-0 bg-black/60', isExit && 'animate-out fade-out-0 duration-200')}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={cn(
          'relative z-10 flex w-[min(42rem,100%)] h-[min(85vh,720px)] m-auto bg-bg-secondary border border-border-primary rounded-lg shadow-2xl overflow-hidden',
          isExit && 'animate-out fade-out-0 zoom-out-95 duration-200'
        )}
      >
        {/* Sidebar */}
        <div className="w-52 bg-bg-tertiary border-r border-border-primary flex flex-col">
          <div className="p-4 border-b border-border-primary">
            <h2 className="text-lg font-semibold text-text-primary">
              User Settings
            </h2>
          </div>
          <nav className="flex-1 overflow-y-auto p-2">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors mb-0.5',
                  activeSection === s.id
                    ? 'bg-bg-hover text-text-primary'
                    : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
                )}
              >
                {s.label}
              </button>
            ))}
            {user?.globalRole === 'admin' && (
              <button
                onClick={() => setActiveSection('admin')}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors mb-0.5',
                  activeSection === 'admin'
                    ? 'bg-bg-hover text-text-primary'
                    : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
                )}
              >
                Admin
              </button>
            )}
          </nav>
          <div className="p-2 border-t border-border-primary">
            <Button variant="ghost" size="sm" onClick={onClose} className="w-full">
              <X className="w-4 h-4 mr-1" />
              Close
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 min-w-0">
          {loading ? (
            <div className="text-text-muted">Loading...</div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded text-sm text-danger">
                  {error}
                </div>
              )}

              {activeSection === 'account' && settings && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Учётная запись</h3>
                  <div className="space-y-2">
                    <Label>Username</Label>
                    <div className="flex gap-2">
                      <Input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        disabled={saving}
                      />
                      <Button
                        size="sm"
                        onClick={handleSaveProfileName}
                        disabled={saving || !username.trim()}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <div className="text-text-muted text-sm">{settings.email}</div>
                  </div>
                  <div className="space-y-2 pt-4 border-t border-border-primary">
                    <Label>Change Password</Label>
                    <form
                      id="user-settings-change-password"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleChangePassword();
                      }}
                      className="space-y-2"
                    >
                      <input
                        type="text"
                        name="username"
                        autoComplete="username"
                        value={settings.email ?? ''}
                        readOnly
                        tabIndex={-1}
                        aria-hidden
                        className="absolute opacity-0 w-0 h-0 overflow-hidden pointer-events-none"
                      />
                      <Input
                        id="current-password"
                        name="currentPassword"
                        type="password"
                        autoComplete="current-password"
                        placeholder="Current password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        disabled={saving}
                        className="mb-2"
                      />
                      <Input
                        id="new-password"
                        name="newPassword"
                        type="password"
                        autoComplete="new-password"
                        placeholder="New password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={saving}
                        className="mb-2"
                      />
                      <Input
                        id="confirm-new-password"
                        name="confirmNewPassword"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={saving}
                        className="mb-2"
                      />
                      {passwordError && (
                        <p className="text-sm text-danger">{passwordError}</p>
                      )}
                      <Button
                        type="submit"
                        size="sm"
                        disabled={saving || !currentPassword || !newPassword}
                      >
                        Change Password
                      </Button>
                    </form>
                  </div>
                </div>
              )}

              {activeSection === 'communication' && settings && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Общение</h3>
                  <div className="space-y-4">
                    <label className="flex items-center justify-between gap-4">
                      <span>Личные сообщения</span>
                      <input
                        type="checkbox"
                        checked={settings.user_settings.allowDm}
                        onChange={(e) =>
                          setSettings((s) =>
                            s
                              ? {
                                  ...s,
                                  user_settings: {
                                    ...s.user_settings,
                                    allowDm: e.target.checked,
                                  },
                                }
                              : null
                          )
                        }
                        disabled={saving}
                        className="rounded"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-4">
                      <span>Запросы на общение без общих серверов</span>
                      <input
                        type="checkbox"
                        checked={settings.user_settings.allowDmFromNonMutual}
                        onChange={(e) =>
                          setSettings((s) =>
                            s
                              ? {
                                  ...s,
                                  user_settings: {
                                    ...s.user_settings,
                                    allowDmFromNonMutual: e.target.checked,
                                  },
                                }
                              : null
                          )
                        }
                        disabled={saving}
                        className="rounded"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-4">
                      <span>
                        Запросы дружбы <span className="text-xs text-amber-500">🧪 Beta</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={settings.user_settings.allowFriendRequests}
                        onChange={(e) =>
                          setSettings((s) =>
                            s
                              ? {
                                  ...s,
                                  user_settings: {
                                    ...s.user_settings,
                                    allowFriendRequests: e.target.checked,
                                  },
                                }
                              : null
                          )
                        }
                        disabled={saving}
                        className="rounded"
                      />
                    </label>
                  </div>
                  <Button onClick={handleSaveCommunication} disabled={saving}>
                    Save
                  </Button>

                  <div className="pt-4 border-t border-border-primary">
                    <h4 className="font-medium mb-2">Чёрный список</h4>
                    {blocks.length === 0 ? (
                      <p className="text-sm text-text-muted">No blocked users</p>
                    ) : (
                      <ul className="space-y-2">
                        {blocks.map((b) => (
                          <li
                            key={b.id}
                            className="flex items-center justify-between py-2 px-3 bg-bg-tertiary rounded"
                          >
                            <span>{b.user?.name ?? 'Unknown'}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnblock(b.id)}
                            >
                              Unblock
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {activeSection === 'devices' && settings && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Устройства</h3>
                  <p className="text-sm text-text-muted">
                    Это устройство: {settings.current_session
                      ? parseUserAgent(settings.current_session.userAgent)
                      : 'Unknown'}
                  </p>
                  <div className="space-y-2">
                    {settings.sessions.map((s) => (
                      <div
                        key={s.id}
                        className={cn(
                          'flex items-center justify-between py-2 px-3 rounded',
                          s.isCurrent ? 'bg-bg-hover' : 'bg-bg-tertiary'
                        )}
                      >
                        <div>
                          <span className="font-medium">
                            {parseUserAgent(s.userAgent)}
                          </span>
                          {s.isCurrent && (
                            <span className="ml-2 text-xs text-green-500">
                              (текущее)
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-text-muted">
                          {new Date(s.lastActiveAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeSection === 'notifications' && settings && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Уведомления</h3>
                  <p className="text-xs text-text-muted">
                    Настройки влияют на UI (иконки/подпись)
                  </p>
                  <div className="space-y-2">
                    {(['all', 'mentions', 'none'] as const).map((mode) => (
                      <label
                        key={mode}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="notifications"
                          checked={settings.user_settings.notificationsMode === mode}
                          onChange={() =>
                            setSettings((s) =>
                              s
                                ? {
                                    ...s,
                                    user_settings: {
                                      ...s.user_settings,
                                      notificationsMode: mode,
                                    },
                                  }
                                : null
                            )
                          }
                          disabled={saving}
                        />
                        <span>
                          {mode === 'all' && 'Все'}
                          {mode === 'mentions' && 'Упоминания'}
                          {mode === 'none' && 'Никаких'}
                        </span>
                      </label>
                    ))}
                  </div>
                  <Button onClick={handleSaveNotifications} disabled={saving}>
                    Save
                  </Button>
                </div>
              )}

              {activeSection === 'voice' && settings && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Голосовые настройки</h3>
                  <p className="text-xs text-text-muted">
                    Используются в LiveKit и audio settings
                  </p>
                  <div className="space-y-2">
                    <Label>Устройство ввода</Label>
                    <Input
                      value={settings.user_settings.voiceInputDevice ?? ''}
                      onChange={(e) =>
                        setSettings((s) =>
                          s
                            ? {
                                ...s,
                                user_settings: {
                                  ...s.user_settings,
                                  voiceInputDevice: e.target.value || null,
                                },
                              }
                            : null
                        )
                      }
                      placeholder="Default"
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Устройство вывода</Label>
                    <Input
                      value={settings.user_settings.voiceOutputDevice ?? ''}
                      onChange={(e) =>
                        setSettings((s) =>
                          s
                            ? {
                                ...s,
                                user_settings: {
                                  ...s.user_settings,
                                  voiceOutputDevice: e.target.value || null,
                                },
                              }
                            : null
                        )
                      }
                      placeholder="Default"
                      disabled={saving}
                    />
                  </div>
                  <label className="flex items-center justify-between gap-4">
                    <span>Звук демонстрации экрана</span>
                    <input
                      type="checkbox"
                      checked={settings.user_settings.voiceScreenShareSound}
                      onChange={(e) =>
                        setSettings((s) =>
                          s
                            ? {
                                ...s,
                                user_settings: {
                                  ...s.user_settings,
                                  voiceScreenShareSound: e.target.checked,
                                },
                              }
                            : null
                        )
                      }
                      disabled={saving}
                      className="rounded"
                    />
                  </label>
                  <Button onClick={handleSaveVoice} disabled={saving}>
                    Save
                  </Button>
                </div>
              )}

              {activeSection === 'logout' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Выйти</h3>
                  <p className="text-sm text-text-muted">
                    Выйти из аккаунта на этом устройстве
                  </p>
                  <Button variant="destructive" onClick={handleLogout}>
                    Logout
                  </Button>
                </div>
              )}

              {activeSection === 'admin' && user?.globalRole === 'admin' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-semibold">Admin Panel</h3>
                  <p className="text-sm text-text-muted">
                    Manage email whitelist and developer codes
                  </p>
                  <AdminPanel />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
