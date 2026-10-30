// "Now playing" from the desktop media player, via playerctl (MPRIS on Linux).
// Works with Spotify, Firefox/Chrome (YouTube etc.), VLC, Elisa, mpv... anything that shows up in KDE's media widget.
'use strict';
const { execFile } = require('child_process');
const fs = require('fs');

const SEP = '\u001f';
const FORMAT = ['status', 'playerName', 'artist', 'title', 'album', 'mpris:artUrl', 'mpris:length', 'position'].map((k) => `{{${k}}}`).join(SEP);

class Media {
  constructor(onState) {
    this.onState = onState;
    this.available = null; // null = unknown, false = playerctl missing
    this.state = { available: false, active: false };
    this.demo = false;
    this.demoT = 0;
  }

  start() {
    this.poll();
    this.timer = setInterval(() => this.poll(), 1000);
  }

  poll() {
    if (this.available === false) {
      if (this.demo) this.demoTick();
      return;
    }
    execFile('playerctl', ['metadata', '--format', FORMAT], { timeout: 1500 }, (err, out) => {
      if (err && err.code === 'ENOENT') {
        this.available = false;
        console.log('[media] playerctl not found - install it for "now playing" (CachyOS: sudo pacman -S playerctl)');
        this.emit({ available: false, active: false });
        setTimeout(() => { this.available = null; }, 60000); // look again later
        return;
      }
      this.available = true;
      if (err || !out.trim()) { this.emit({ available: true, active: false }); return; }
      const [status, player, artist, title, album, artUrl, length, position] = out.trim().split(SEP);
      this.emit({
        available: true, active: true, status, player, artist, title, album,
        art: artUrl ? (artUrl.startsWith('file://') ? `/api/media/art?v=${encodeURIComponent(artUrl.slice(-40))}` : artUrl) : null,
        artFile: artUrl && artUrl.startsWith('file://') ? decodeURIComponent(artUrl.slice(7)) : null,
        length: (+length || 0) / 1e6, position: (+position || 0) / 1e6,
      });
    });
  }

  // fake track while the demo car runs on a machine without playerctl (e.g. Windows)
  demoTick() {
    this.demoT = (this.demoT + 1) % 215;
    this.emit({ available: true, active: true, status: 'Playing', player: 'demo', artist: 'BeamDash', title: 'Night Drive (demo track)', album: 'Install playerctl for real music', art: null, length: 215, position: this.demoT });
  }

  emit(s) {
    this.state = s;
    this.onState({ ...s, artFile: undefined });
  }

  command(op) {
    if (!['play-pause', 'next', 'previous'].includes(op)) return Promise.resolve(false);
    if (this.available === false) return Promise.resolve(false);
    return new Promise((resolve) => execFile('playerctl', [op], { timeout: 1500 }, (err) => { setTimeout(() => this.poll(), 250); resolve(!err); }));
  }

  // only ever serves the art file of the track that is playing right now
  sendArt(res) {
    const f = this.state.artFile;
    if (!f) { res.writeHead(404); res.end(); return; }
    fs.readFile(f, (err, buf) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const type = buf[0] === 0x89 ? 'image/png' : buf.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : 'image/jpeg';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'max-age=3600' });
      res.end(buf);
    });
  }
}

module.exports = { Media };
