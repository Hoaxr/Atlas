import { describe, it, expect, beforeEach } from 'vitest';
const db = require('../config/database');

describe('Play History Recording', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM play_history').run();
  });

  it('allows inserting multiple play entries for the same device session with unique session IDs', () => {
    const sessionDevice = 'jellyfin_c4b123';
    const movie1 = 'The Matrix';
    const movie2 = 'Inception';

    // Insert first movie play
    db.prepare('INSERT INTO play_history (session_id, user, title, type, server, player) VALUES (?, ?, ?, ?, ?, ?)').run(
      `${sessionDevice}_${Date.now()}_1`,
      'testuser',
      movie1,
      'movie',
      'Jellyfin',
      'Jellyfin Web'
    );

    // Insert second movie play on same device session
    db.prepare('INSERT INTO play_history (session_id, user, title, type, server, player) VALUES (?, ?, ?, ?, ?, ?)').run(
      `${sessionDevice}_${Date.now()}_2`,
      'testuser',
      movie2,
      'movie',
      'Jellyfin',
      'Jellyfin Web'
    );

    const recent = db.prepare('SELECT title FROM play_history ORDER BY id DESC').all();
    expect(recent.length).toBe(2);
    expect(recent[0].title).toBe(movie2);
    expect(recent[1].title).toBe(movie1);
  });
});
