const express = require('express');
const router = express.Router();
const { dbGet, dbAll } = require('../config/dbEngine');
const { withTransaction } = require('../config/pgDb');
const { requirePermission, clearPermissionCache } = require('../middleware/auth');

const NOT_SYSTEM = false;

// 1. List all roles and permissions
router.get('/', requirePermission('settings.view'), async (req, res, next) => {
  try {
    const roles = await dbAll('SELECT * FROM roles WHERE company_id = ? ORDER BY is_system DESC, name ASC', [req.user.companyId]);

    // Add member counts
    const counts = await dbAll('SELECT role_id, count(*) as count FROM user_roles WHERE company_id = ? GROUP BY role_id', [req.user.companyId]);
    const countMap = {};
    counts.forEach(c => countMap[c.role_id] = c.count);
    roles.forEach(r => r.member_count = countMap[r.id] || 0);

    const permissionGroups = await dbAll('SELECT * FROM permission_groups', []);
    const allPermissions = await dbAll('SELECT * FROM permissions', []);

    // Structure permissions by group
    const permissionsByGroup = permissionGroups.map(g => {
      return {
        ...g,
        permissions: allPermissions.filter(p => p.group_id === g.id)
      };
    });

    res.json({ roles, permissionGroups: permissionsByGroup });
  } catch (err) {
    next(err);
  }
});

// 2. Create custom role
router.post('/', requirePermission('settings.manage'), async (req, res, next) => {
  try {
    const { name, description, color, permissions } = req.body;
    if (!name) return res.status(400).json({ error: 'Role name is required' });

    const newRoleId = await withTransaction(async (tx) => {
      const row = await tx.getOne(`
        INSERT INTO roles (company_id, name, description, color, is_system)
        VALUES (?, ?, ?, ?, ?) RETURNING id
      `, [req.user.companyId, name, description, color, NOT_SYSTEM]);

      if (permissions && Array.isArray(permissions)) {
        for (const permId of permissions) {
          await tx.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [row.id, permId]);
        }
      }
      return row.id;
    });

    const newRole = await dbGet('SELECT * FROM roles WHERE id = ?', [newRoleId]);
    res.status(201).json(newRole);
  } catch (err) {
    next(err);
  }
});

// 3. Get permissions for a role
router.get('/:id/permissions', requirePermission('settings.view'), async (req, res, next) => {
  try {
    const roleId = req.params.id;
    // Verify role belongs to this company (system roles are per-company, not global —
    // an OR is_system=1 check here would leak/authorize other tenants' roles)
    const role = await dbGet('SELECT * FROM roles WHERE id = ? AND company_id = ?', [roleId, req.user.companyId]);
    if (!role) return res.status(404).json({ error: 'Role not found' });

    const perms = await dbAll('SELECT permission_id FROM role_permissions WHERE role_id = ?', [roleId]);
    res.json(perms.map(p => p.permission_id));
  } catch (err) {
    next(err);
  }
});

// 4. Update role and its permissions
router.put('/:id', requirePermission('settings.manage'), async (req, res, next) => {
  try {
    const roleId = req.params.id;
    const { name, description, color, permissions } = req.body;

    const role = await dbGet('SELECT * FROM roles WHERE id = ? AND company_id = ? AND is_system = ?', [roleId, req.user.companyId, NOT_SYSTEM]);
    if (!role) return res.status(404).json({ error: 'Custom role not found or cannot be modified' });

    await withTransaction(async (tx) => {
      await tx.query(`
        UPDATE roles SET
          name = COALESCE(?, name),
          description = COALESCE(?, description),
          color = COALESCE(?, color)
        WHERE id = ?
      `, [name, description, color, roleId]);

      if (permissions && Array.isArray(permissions)) {
        await tx.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
        for (const permId of permissions) {
          await tx.query('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, permId]);
        }
      }
    });

    // We should really clear caches for users who have this role. For simplicity we don't know who has it here,
    // but if the current user modifies their own role, we should clear it.

    const updatedRole = await dbGet('SELECT * FROM roles WHERE id = ?', [roleId]);
    res.json(updatedRole);
  } catch (err) {
    next(err);
  }
});

// 5. Delete role
router.delete('/:id', requirePermission('settings.manage'), async (req, res, next) => {
  try {
    const roleId = req.params.id;
    const role = await dbGet('SELECT * FROM roles WHERE id = ? AND company_id = ? AND is_system = ?', [roleId, req.user.companyId, NOT_SYSTEM]);
    if (!role) return res.status(404).json({ error: 'Role not found or cannot be deleted' });

    const assigned = await dbGet('SELECT count(*) as count FROM user_roles WHERE role_id = ?', [roleId]);
    if (assigned.count > 0) return res.status(400).json({ error: 'Cannot delete role: Assigned to active users' });

    await withTransaction(async (tx) => {
      await tx.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
      await tx.query('DELETE FROM roles WHERE id = ?', [roleId]);
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// 6. Assign role to user
router.post('/assign', requirePermission('settings.manage'), async (req, res, next) => {
  try {
    const { userId, roleId } = req.body;

    // Verify user and role belong to company
    const user = await dbGet('SELECT id FROM users WHERE id = ? AND company_id = ?', [userId, req.user.companyId]);
    const role = await dbGet('SELECT id FROM roles WHERE id = ? AND company_id = ?', [roleId, req.user.companyId]);

    if (!user || !role) return res.status(400).json({ error: 'Invalid user or role' });

    await dbGet(`
      INSERT INTO user_roles (user_id, role_id, company_id, assigned_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, role_id) DO NOTHING
    `, [userId, roleId, req.user.companyId, req.user.userId]);

    clearPermissionCache(userId, req.user.companyId);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// 7. Revoke role from user
router.delete('/assign/:userId/:roleId', requirePermission('settings.manage'), async (req, res, next) => {
  try {
    const { userId, roleId } = req.params;

    // Cannot revoke own owner role easily here, but we will trust UI for now
    await dbGet('DELETE FROM user_roles WHERE user_id = ? AND role_id = ? AND company_id = ?', [userId, roleId, req.user.companyId]);

    clearPermissionCache(userId, req.user.companyId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
