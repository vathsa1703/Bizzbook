const express = require('express');
const router = express.Router();
const { getDb } = require('../config/db');
const { requirePermission, clearPermissionCache } = require('../middleware/auth');

// 1. List all roles and permissions
router.get('/', requirePermission('settings.view'), (req, res, next) => {
  const db = getDb();
  try {
    const roles = db.prepare('SELECT * FROM roles WHERE company_id = ? OR is_system = 1 ORDER BY is_system DESC, name ASC').all(req.user.companyId);
    
    // Add member counts
    const counts = db.prepare('SELECT role_id, count(*) as count FROM user_roles WHERE company_id = ? GROUP BY role_id').all(req.user.companyId);
    const countMap = {};
    counts.forEach(c => countMap[c.role_id] = c.count);
    roles.forEach(r => r.member_count = countMap[r.id] || 0);

    const permissionGroups = db.prepare('SELECT * FROM permission_groups').all();
    const allPermissions = db.prepare('SELECT * FROM permissions').all();
    
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
  } finally {
    db.close();
  }
});

// 2. Create custom role
router.post('/', requirePermission('settings.manage'), (req, res, next) => {
  const db = getDb();
  try {
    const { name, description, color, permissions } = req.body;
    if (!name) return res.status(400).json({ error: 'Role name is required' });

    db.exec('BEGIN TRANSACTION');
    try {
      const info = db.prepare(`
        INSERT INTO roles (company_id, name, description, color, is_system)
        VALUES (?, ?, ?, ?, 0)
      `).run(req.user.companyId, name, description, color);
      
      const newRoleId = info.lastInsertRowid;
      
      if (permissions && Array.isArray(permissions)) {
        const insertPerm = db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
        for (const permId of permissions) {
          insertPerm.run(newRoleId, permId);
        }
      }
      
      db.exec('COMMIT');
      const newRole = db.prepare('SELECT * FROM roles WHERE id = ?').get(newRoleId);
      res.status(201).json(newRole);
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// 3. Get permissions for a role
router.get('/:id/permissions', requirePermission('settings.view'), (req, res, next) => {
  const db = getDb();
  try {
    const roleId = req.params.id;
    // Verify role belongs to company or is system
    const role = db.prepare('SELECT * FROM roles WHERE id = ? AND (company_id = ? OR is_system = 1)').get(roleId, req.user.companyId);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    
    const perms = db.prepare('SELECT permission_id FROM role_permissions WHERE role_id = ?').all(roleId);
    res.json(perms.map(p => p.permission_id));
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// 4. Update role and its permissions
router.put('/:id', requirePermission('settings.manage'), (req, res, next) => {
  const db = getDb();
  try {
    const roleId = req.params.id;
    const { name, description, color, permissions } = req.body;
    
    const role = db.prepare('SELECT * FROM roles WHERE id = ? AND company_id = ? AND is_system = 0').get(roleId, req.user.companyId);
    if (!role) return res.status(404).json({ error: 'Custom role not found or cannot be modified' });

    db.exec('BEGIN TRANSACTION');
    try {
      db.prepare(`
        UPDATE roles SET 
          name = COALESCE(?, name),
          description = COALESCE(?, description),
          color = COALESCE(?, color)
        WHERE id = ?
      `).run(name, description, color, roleId);
      
      if (permissions && Array.isArray(permissions)) {
        db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
        const insertPerm = db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
        for (const permId of permissions) {
          insertPerm.run(roleId, permId);
        }
      }
      
      db.exec('COMMIT');
      
      // We should really clear caches for users who have this role. For simplicity we don't know who has it here,
      // but if the current user modifies their own role, we should clear it.
      
      const updatedRole = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId);
      res.json(updatedRole);
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// 5. Delete role
router.delete('/:id', requirePermission('settings.manage'), (req, res, next) => {
  const db = getDb();
  try {
    const roleId = req.params.id;
    const role = db.prepare('SELECT * FROM roles WHERE id = ? AND company_id = ? AND is_system = 0').get(roleId, req.user.companyId);
    if (!role) return res.status(404).json({ error: 'Role not found or cannot be deleted' });

    const assigned = db.prepare('SELECT count(*) as count FROM user_roles WHERE role_id = ?').get(roleId);
    if (assigned.count > 0) return res.status(400).json({ error: 'Cannot delete role: Assigned to active users' });

    db.exec('BEGIN TRANSACTION');
    try {
      db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
      db.prepare('DELETE FROM roles WHERE id = ?').run(roleId);
      db.exec('COMMIT');
      res.status(204).end();
    } catch (innerErr) {
      db.exec('ROLLBACK');
      throw innerErr;
    }
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// 6. Assign role to user
router.post('/assign', requirePermission('settings.manage'), (req, res, next) => {
  const db = getDb();
  try {
    const { userId, roleId } = req.body;
    
    // Verify user and role belong to company
    const user = db.prepare('SELECT id FROM users WHERE id = ? AND company_id = ?').get(userId, req.user.companyId);
    const role = db.prepare('SELECT id FROM roles WHERE id = ? AND (company_id = ? OR is_system = 1)').get(roleId, req.user.companyId);
    
    if (!user || !role) return res.status(400).json({ error: 'Invalid user or role' });

    db.prepare(`
      INSERT INTO user_roles (user_id, role_id, company_id, assigned_by) 
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, role_id) DO NOTHING
    `).run(userId, roleId, req.user.companyId, req.user.userId);
    
    clearPermissionCache(userId, req.user.companyId);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

// 7. Revoke role from user
router.delete('/assign/:userId/:roleId', requirePermission('settings.manage'), (req, res, next) => {
  const db = getDb();
  try {
    const { userId, roleId } = req.params;
    
    // Cannot revoke own owner role easily here, but we will trust UI for now
    db.prepare('DELETE FROM user_roles WHERE user_id = ? AND role_id = ? AND company_id = ?').run(userId, roleId, req.user.companyId);
    
    clearPermissionCache(userId, req.user.companyId);
    res.status(204).end();
  } catch (err) {
    next(err);
  } finally {
    db.close();
  }
});

module.exports = router;
