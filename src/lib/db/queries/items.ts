import { getDb } from '../index';
import { generateId } from '../../utils/id';
import type { IItem, IItemTree, ItemType, ItemPriority, ItemStatus } from '@/types';

export function getItems(projectId: string): IItem[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM items WHERE project_id = ? ORDER BY sort_order ASC'
  ).all(projectId) as IItem[];
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
      item_type, priority, status, is_locked, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?, ?)
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
  priority?: ItemPriority;
  sort_order?: number;
}): IItem | undefined {
  const db = getDb();
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as IItem | undefined;
  if (!item) return undefined;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE items SET
      title = ?, description = ?, status = ?, is_locked = ?,
      priority = ?, sort_order = ?, updated_at = ?
    WHERE id = ?
  `).run(
    data.title ?? item.title,
    data.description ?? item.description,
    data.status ?? item.status,
    data.is_locked !== undefined ? (data.is_locked ? 1 : 0) : (item.is_locked ? 1 : 0),
    data.priority ?? item.priority,
    data.sort_order ?? item.sort_order,
    now,
    id,
  );

  return db.prepare('SELECT * FROM items WHERE id = ?').get(id) as IItem;
}

export function deleteItemsByProject(projectId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM items WHERE project_id = ?').run(projectId);
}

export function replaceItems(projectId: string, brainstormId: string, newItems: {
  parent_id: string | null;
  title: string;
  description: string;
  item_type: ItemType;
  priority: ItemPriority;
  children?: typeof newItems;
}[]): IItemTree[] {
  const db = getDb();

  const insertItems = db.transaction(() => {
    // Delete existing items for this project
    db.prepare('DELETE FROM items WHERE project_id = ?').run(projectId);

    // Insert new items recursively
    let sortOrder = 0;
    const insertRecursive = (items: typeof newItems, parentId: string | null) => {
      for (const item of items) {
        const id = generateId();
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO items (id, project_id, brainstorm_id, parent_id, title, description,
            item_type, priority, status, is_locked, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?, ?)
        `).run(id, projectId, brainstormId, parentId, item.title, item.description,
          item.item_type, item.priority, sortOrder++, now, now);

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
