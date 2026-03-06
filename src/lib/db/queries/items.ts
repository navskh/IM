import { getDb } from '../index';
import { generateId } from '../../utils/id';
import type { IItem, IItemTree, ItemType, ItemPriority, ItemStatus } from '@/types';

export function getItems(projectId: string): IItem[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM items WHERE project_id = ? ORDER BY sort_order ASC'
  ).all(projectId) as IItem[];
}

export function getItem(id: string): IItem | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM items WHERE id = ?').get(id) as IItem | undefined;
}

export function getItemTree(projectId: string): IItemTree[] {
  const items = getItems(projectId);
  return buildTree(items);
}

function buildTree(items: IItem[]): IItemTree[] {
  const map = new Map<string, IItemTree>();
  const roots: IItemTree[] = [];

  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }

  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export function createItem(data: {
  project_id: string;
  brainstorm_id?: string;
  parent_id?: string;
  title: string;
  description?: string;
  item_type?: ItemType;
  priority?: ItemPriority;
  sort_order?: number;
}): IItem {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO items (id, project_id, brainstorm_id, parent_id, title, description,
      item_type, priority, status, is_locked, is_pinned, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, 1, ?, ?, ?)
  `).run(
    id,
    data.project_id,
    data.brainstorm_id ?? null,
    data.parent_id ?? null,
    data.title,
    data.description ?? '',
    data.item_type ?? 'feature',
    data.priority ?? 'medium',
    data.sort_order ?? 0,
    now,
    now,
  );

  return db.prepare('SELECT * FROM items WHERE id = ?').get(id) as IItem;
}

export function updateItem(id: string, data: {
  title?: string;
  description?: string;
  status?: ItemStatus;
  is_locked?: boolean;
  is_pinned?: boolean;
  priority?: ItemPriority;
  sort_order?: number;
}): IItem | undefined {
  const db = getDb();
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as IItem | undefined;
  if (!item) return undefined;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE items SET
      title = ?, description = ?, status = ?, is_locked = ?, is_pinned = ?,
      priority = ?, sort_order = ?, updated_at = ?
    WHERE id = ?
  `).run(
    data.title ?? item.title,
    data.description ?? item.description,
    data.status ?? item.status,
    data.is_locked !== undefined ? (data.is_locked ? 1 : 0) : (item.is_locked ? 1 : 0),
    data.is_pinned !== undefined ? (data.is_pinned ? 1 : 0) : (item.is_pinned ? 1 : 0),
    data.priority ?? item.priority,
    data.sort_order ?? item.sort_order,
    now,
    id,
  );

  return db.prepare('SELECT * FROM items WHERE id = ?').get(id) as IItem;
}

export function deleteItem(id: string): boolean {
  const db = getDb();
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as IItem | undefined;
  if (!item) return false;

  // Delete children first (recursive via collecting all descendant IDs)
  const deleteRecursive = db.transaction(() => {
    const collectIds = (parentId: string): string[] => {
      const children = db.prepare('SELECT id FROM items WHERE parent_id = ?').all(parentId) as { id: string }[];
      const ids: string[] = [];
      for (const child of children) {
        ids.push(...collectIds(child.id));
        ids.push(child.id);
      }
      return ids;
    };

    const idsToDelete = [...collectIds(id), id];
    const placeholders = idsToDelete.map(() => '?').join(',');
    db.prepare(`DELETE FROM prompts WHERE item_id IN (${placeholders})`).run(...idsToDelete);
    db.prepare(`DELETE FROM items WHERE id IN (${placeholders})`).run(...idsToDelete);
  });

  deleteRecursive();
  return true;
}

export function deleteItemsByProject(projectId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM items WHERE project_id = ?').run(projectId);
}

export function bulkUpdateStatus(projectId: string, status: ItemStatus): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('UPDATE items SET status = ?, updated_at = ? WHERE project_id = ?').run(status, now, projectId);
}

type NewItemInput = {
  parent_id: string | null;
  title: string;
  description: string;
  item_type: ItemType;
  priority: ItemPriority;
  status?: ItemStatus;
  children?: NewItemInput[];
};

/**
 * Append new items to existing ones (additive).
 * Existing items are preserved — only new items are inserted.
 */
export function appendItems(projectId: string, brainstormId: string, newItems: NewItemInput[]): IItemTree[] {
  const db = getDb();

  const insertItems = db.transaction(() => {
    const maxOrder = db.prepare(
      'SELECT MAX(sort_order) as max_order FROM items WHERE project_id = ?'
    ).get(projectId) as { max_order: number | null };
    let sortOrder = (maxOrder?.max_order ?? -1) + 1;

    const insertRecursive = (items: NewItemInput[], parentId: string | null) => {
      for (const item of items) {
        const id = generateId();
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO items (id, project_id, brainstorm_id, parent_id, title, description,
            item_type, priority, status, is_locked, is_pinned, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
        `).run(id, projectId, brainstormId, parentId, item.title, item.description,
          item.item_type, item.priority, item.status || 'pending', sortOrder++, now, now);

        if (item.children?.length) {
          insertRecursive(item.children, id);
        }
      }
    };

    insertRecursive(newItems, null);
  });

  insertItems();
  return getItemTree(projectId);
}

/**
 * Add children under a specific parent item.
 */
export function addChildItems(projectId: string, parentId: string, newChildren: NewItemInput[]): IItemTree[] {
  const db = getDb();

  const insertItems = db.transaction(() => {
    const maxOrder = db.prepare(
      'SELECT MAX(sort_order) as max_order FROM items WHERE project_id = ?'
    ).get(projectId) as { max_order: number | null };
    let sortOrder = (maxOrder?.max_order ?? -1) + 1;

    const insertRecursive = (items: NewItemInput[], pid: string | null) => {
      for (const item of items) {
        const id = generateId();
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO items (id, project_id, brainstorm_id, parent_id, title, description,
            item_type, priority, status, is_locked, is_pinned, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
        `).run(id, projectId, null, pid, item.title, item.description,
          item.item_type, item.priority, item.status || 'pending', sortOrder++, now, now);

        if (item.children?.length) {
          insertRecursive(item.children, id);
        }
      }
    };

    insertRecursive(newChildren, parentId);
  });

  insertItems();
  return getItemTree(projectId);
}

/**
 * Replace ALL items for the project with new ones.
 * Deletes all existing items first, then inserts the new tree.
 */
export function replaceItems(projectId: string, brainstormId: string, newItems: NewItemInput[]): IItemTree[] {
  const db = getDb();

  const insertItems = db.transaction(() => {
    // Delete ALL existing items and their prompts
    db.prepare('DELETE FROM prompts WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM items WHERE project_id = ?').run(projectId);

    let sortOrder = 0;

    const insertRecursive = (items: NewItemInput[], parentId: string | null) => {
      for (const item of items) {
        const id = generateId();
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO items (id, project_id, brainstorm_id, parent_id, title, description,
            item_type, priority, status, is_locked, is_pinned, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)
        `).run(id, projectId, brainstormId, parentId, item.title, item.description,
          item.item_type, item.priority, item.status || 'pending', sortOrder++, now, now);

        if (item.children?.length) {
          insertRecursive(item.children, id);
        }
      }
    };

    insertRecursive(newItems, null);
  });

  insertItems();
  return getItemTree(projectId);
}
