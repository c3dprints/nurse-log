'use strict';
// Phone notifications (Web Push). A phone that opened the app on its HTTPS address
// (Tailscale Serve) and turned on notifications leaves a subscription here; alerts
// go to every subscription of an active user. Messages are end-to-end encrypted
// to the phone, so the push service (Apple, Google) cannot read them. The key pair
// is made once and kept in settings.

const webpush = require('web-push');

class Push {
  constructor(db, log = () => {}) {
    this.db = db;
    this.log = log;
  }

  keys() {
    let k = this.db.setting('vapid', null);
    if (!k || !k.publicKey || !k.privateKey) {
      k = webpush.generateVAPIDKeys();
      this.db.setSetting('vapid', k);
    }
    return k;
  }

  subscribe(userId, sub) {
    const endpoint = String((sub && sub.endpoint) || '');
    const p256dh = String((sub && sub.keys && sub.keys.p256dh) || '');
    const auth = String((sub && sub.keys && sub.keys.auth) || '');
    if (!/^https:\/\/[^\s]{10,2000}$/.test(endpoint) || !/^[A-Za-z0-9_-]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}$/.test(auth)) {
      throw Object.assign(new Error('that notification subscription is not valid'), { code: 400 });
    }
    this.db.run('DELETE FROM push_subs WHERE endpoint = ?', [endpoint]);
    this.db.run('INSERT INTO push_subs(user_id, endpoint, p256dh, auth, created_at) VALUES(?,?,?,?,?)', [userId, endpoint, p256dh, auth, Date.now()]);
  }

  unsubscribe(endpoint) {
    this.db.run('DELETE FROM push_subs WHERE endpoint = ?', [String(endpoint || '')]);
  }

  forgetUser(userId) {
    this.db.run('DELETE FROM push_subs WHERE user_id = ?', [userId]);
  }

  count(userId) {
    return this.db.get('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?', [userId]).n;
  }

  // payload: { title, body, tag, url }. userId limits it to one user's phones.
  async send(payload, userId = null) {
    const k = this.keys();
    const subs = this.db.all(`SELECT p.* FROM push_subs p JOIN users u ON u.id = p.user_id WHERE u.active = 1${userId ? ' AND p.user_id = ?' : ''}`, userId ? [userId] : []);
    let sent = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), {
          vapidDetails: { subject: 'mailto:hi@c3dprints.com', publicKey: k.publicKey, privateKey: k.privateKey },
          TTL: 60 * 60,
          urgency: 'high',
          timeout: 15000,
        });
        sent++;
      } catch (e) {
        // Gone or no longer valid: the phone turned notifications off or reinstalled.
        if (e.statusCode === 404 || e.statusCode === 410) this.unsubscribe(s.endpoint);
        else this.log(`push failed: ${e.statusCode || ''} ${e.message}`);
      }
    }
    return sent;
  }
}

module.exports = { Push };
