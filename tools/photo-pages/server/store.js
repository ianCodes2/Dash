import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * A deliberately small JSON store. The photo library is one array written
 * atomically, so there is no database to install or migrate.
 */
export class PhotoStore {
  constructor(file) {
    this.file = file;
    this.photos = [];
    this.writeQueue = Promise.resolve();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.photos = Array.isArray(parsed?.photos) ? parsed.photos : [];
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.photos = [];
    }
    return this.photos;
  }

  list() {
    return [...this.photos];
  }

  get(id) {
    return this.photos.find((photo) => photo.id === id) ?? null;
  }

  async add(photo) {
    this.photos.push(photo);
    await this.save();
    return photo;
  }

  async remove(id) {
    const index = this.photos.findIndex((photo) => photo.id === id);
    if (index === -1) return null;
    const [removed] = this.photos.splice(index, 1);
    await this.save();
    return removed;
  }

  async removeMany(ids) {
    const removing = new Set(ids);
    const removed = this.photos.filter((photo) => removing.has(photo.id));
    if (!removed.length) return removed;
    this.photos = this.photos.filter((photo) => !removing.has(photo.id));
    await this.save();
    return removed;
  }

  save() {
    this.writeQueue = this.writeQueue.then(async () => {
      const temp = `${this.file}.tmp`;
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(temp, `${JSON.stringify({ photos: this.photos }, null, 2)}\n`, 'utf8');
      await fs.rename(temp, this.file);
    });
    return this.writeQueue;
  }
}
