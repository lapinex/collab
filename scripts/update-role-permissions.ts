/**
 * Скрипт для обновления прав ролей в базе данных
 * Обновляет существующие роли USER и MODERATOR, устанавливая правильные права
 */

import { db, withDbRetry } from '../lib/db/client';
import { roles } from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { Permission } from '../types/permissions';
import { MVPRole } from '../lib/permissions/mvp-roles';

// Функция для безопасного обновления роли с повторными попытками
// withDbRetry уже обрабатывает повторные попытки при ошибках соединения
async function updateRoleSafely(roleId: string, permissions: number, roleName: string): Promise<boolean> {
  try {
    await withDbRetry(
      () => db
        .update(roles)
        .set({ permissions })
        .where(eq(roles.id, roleId)),
      `update-role-permissions (${roleName})`
    );
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Не удалось обновить роль ${roleName} (${roleId}): ${errorMessage}`);
    return false;
  }
}

async function updateRolePermissions() {
  console.log('🔄 Начинаю обновление прав ролей...');

  try {
    // Получаем все роли USER и MODERATOR с повторными попытками при ошибках соединения
    // Ищем только точные совпадения: 'user' и 'moderator'
    const userRoles = await withDbRetry(
      () => db.query.roles.findMany({
        where: eq(roles.name, MVPRole.USER),
      }),
      'fetch-user-roles'
    );

    const moderatorRoles = await withDbRetry(
      () => db.query.roles.findMany({
        where: eq(roles.name, MVPRole.MODERATOR),
      }),
      'fetch-moderator-roles'
    );

    console.log(`📊 Найдено ролей USER: ${userRoles.length}`);
    console.log(`📊 Найдено ролей MODERATOR: ${moderatorRoles.length}`);

    // Права для роли USER
    const userPermissions = 
      Permission.VIEW_SERVER |
      Permission.VIEW_CHANNEL |
      Permission.SEND_MESSAGES |
      Permission.READ_MESSAGE_HISTORY |
      Permission.ADD_REACTIONS |
      Permission.ATTACH_FILES |
      Permission.EMBED_LINKS |
      Permission.USE_EXTERNAL_EMOJIS |
      Permission.CONNECT |
      Permission.SPEAK |
      Permission.USE_VOICE_ACTIVATION;

    // Права для роли MODERATOR
    const moderatorPermissions = 
      Permission.VIEW_SERVER |
      Permission.VIEW_CHANNEL |
      Permission.SEND_MESSAGES |
      Permission.READ_MESSAGE_HISTORY |
      Permission.MANAGE_MESSAGES |
      Permission.ADD_REACTIONS |
      Permission.ATTACH_FILES |
      Permission.EMBED_LINKS |
      Permission.KICK_MEMBERS |
      Permission.CONNECT |
      Permission.SPEAK |
      Permission.USE_VOICE_ACTIVATION;

    // Обновляем роли USER
    let updatedUserRoles = 0;
    let failedUserRoles = 0;
    for (const role of userRoles) {
      const currentPerms = typeof role.permissions === 'bigint' ? Number(role.permissions) : role.permissions;
      
      // Обновляем только если права не установлены или установлены неправильно
      if (currentPerms === 0 || currentPerms !== userPermissions) {
        const success = await updateRoleSafely(role.id, userPermissions, 'USER');
        if (success) {
          updatedUserRoles++;
          console.log(`✅ Обновлена роль USER: ${role.id} (сервер: ${role.serverId})`);
        } else {
          failedUserRoles++;
        }
      } else {
        console.log(`⏭️  Роль USER уже имеет правильные права: ${role.id} (сервер: ${role.serverId})`);
      }
    }

    // Обновляем роли MODERATOR
    let updatedModeratorRoles = 0;
    let failedModeratorRoles = 0;
    for (const role of moderatorRoles) {
      const currentPerms = typeof role.permissions === 'bigint' ? Number(role.permissions) : role.permissions;
      
      // Обновляем только если права не установлены или установлены неправильно
      if (currentPerms === 0 || currentPerms !== moderatorPermissions) {
        const success = await updateRoleSafely(role.id, moderatorPermissions, 'MODERATOR');
        if (success) {
          updatedModeratorRoles++;
          console.log(`✅ Обновлена роль MODERATOR: ${role.id} (сервер: ${role.serverId})`);
        } else {
          failedModeratorRoles++;
        }
      } else {
        console.log(`⏭️  Роль MODERATOR уже имеет правильные права: ${role.id} (сервер: ${role.serverId})`);
      }
    }

    console.log(`\n✨ Обновление завершено!`);
    console.log(`   - Обновлено ролей USER: ${updatedUserRoles}`);
    console.log(`   - Ошибок при обновлении USER: ${failedUserRoles}`);
    console.log(`   - Обновлено ролей MODERATOR: ${updatedModeratorRoles}`);
    console.log(`   - Ошибок при обновлении MODERATOR: ${failedModeratorRoles}`);
    console.log(`   - Всего обработано: ${userRoles.length + moderatorRoles.length}`);
    
    if (failedUserRoles > 0 || failedModeratorRoles > 0) {
      console.log(`\n⚠️  Некоторые роли не удалось обновить из-за ошибок соединения.`);
      console.log(`   Попробуйте запустить скрипт еще раз - он обновит только те роли, которые еще не обновлены.`);
    }

  } catch (error) {
    console.error('❌ Ошибка при обновлении прав ролей:', error);
    process.exit(1);
  }
}

// Запускаем скрипт
updateRolePermissions()
  .then(() => {
    console.log('✅ Скрипт выполнен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Критическая ошибка:', error);
    process.exit(1);
  });
