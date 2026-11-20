// ---------- サイト版のオンライン: the game talks to window.claude.use('db' | 'user' | 'room' | 'downloads') inside
// claude.ai. On the self-hosted site this file provides the same calls on top of Supabase (anonymous sign-in,
// one 'docs' table, Realtime broadcast for rooms), so the game code doesn't change. ----------
(function () {
  'use strict';
  var SB_URL = 'https://iiynrsrvzzzmhiltwrfp.supabase.co', SB_KEY = 'sb_publishable_Ck6Um-N8nv3GadMotxdOJw_NWhoqhVH';
  if (!window.supabase || !window.supabase.createClient) return;
  var sb = window.supabase.createClient(SB_URL, SB_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'jan.sb.auth' },
    realtime: { params: { eventsPerSecond: 40 } },
  });
  var uidP = null;
  function uid() {
    if (!uidP) uidP = (async function () {
      var s = (await sb.auth.getSession()).data.session;
      if (!s) { var r = await sb.auth.signInAnonymously(); if (r.error) throw r.error; s = r.data.session; }
      return s.user.id;
    })().catch(function (e) { uidP = null; throw e; });
    return uidP;
  }
  function withTimeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  // ---------------- db ----------------
  function DocSnap(id, data) { this.id = id; this.exists = data != null; this._d = data; this.metadata = { fromCache: false }; }
  DocSnap.prototype.data = function () { return this._d == null ? undefined : clone(this._d); };
  function QuerySnap(rows) {
    this.docs = rows.map(function (r) { return new DocSnap(r.id, r.data); });
    this.size = this.docs.length; this.empty = !this.size; this.metadata = { fromCache: false };
  }
  QuerySnap.prototype.forEach = function (fn) { this.docs.forEach(fn); };
  function split(path) { var p = String(path).split('/'); return { coll: p.slice(0, -1).join('/'), id: p[p.length - 1] }; }

  // live queries: one realtime channel on the table, each listener re-runs its query (debounced) when its collection changes
  var listeners = [], liveCh = null;
  function ensureLive() {
    if (liveCh) return;
    liveCh = sb.channel('docs-live').on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, function (ev) {
      var coll = (ev.new && ev.new.coll) || (ev.old && ev.old.coll);
      listeners.forEach(function (l) { if (!coll || l.coll === coll) l.kick(); });
    }).subscribe();
  }
  function Query(coll, filters, order, lim) { this.coll = coll; this.f = filters || []; this.o = order || null; this.l = lim || 0; }
  Query.prototype.where = function (field, op, v) { return new Query(this.coll, this.f.concat([[field, op, v]]), this.o, this.l); };
  Query.prototype.orderBy = function (field, dir) { return new Query(this.coll, this.f, [field, dir || 'asc'], this.l); };
  Query.prototype.limit = function (n) { return new Query(this.coll, this.f, this.o, n); };
  Query.prototype._run = async function () {
    await uid();
    var q = sb.from('docs').select('id,data').eq('coll', this.coll);
    this.f.forEach(function (w) {
      var col = 'data->>' + w[0];
      if (w[1] === '==') q = q.eq(col, String(w[2]));
      else if (w[1] === 'array-contains') q = q.contains('data->' + w[0], JSON.stringify([w[2]]));
      else if (w[1] === '<') q = q.lt(col, w[2]); else if (w[1] === '<=') q = q.lte(col, w[2]);
      else if (w[1] === '>') q = q.gt(col, w[2]); else if (w[1] === '>=') q = q.gte(col, w[2]);
      else if (w[1] === '!=') q = q.neq(col, String(w[2]));
    });
    if (this.o) q = q.order('data->' + this.o[0], { ascending: this.o[1] !== 'desc' });
    q = q.limit(this.l || 500);
    var r = await q; if (r.error) throw r.error;
    return new QuerySnap(r.data || []);
  };
  Query.prototype.get = function () { return withTimeout(this._run(), 15000); };
  Query.prototype.doc = function (id) { return new DocRef(this.coll, id); };
  Query.prototype.onSnapshot = function (next, err) {
    var self = this, dead = false, t = null, busy = false, again = false;
    function run() {
      if (dead) return; if (busy) { again = true; return; } busy = true;
      self._run().then(function (s) { if (!dead) next(s); }, function (e) { if (!dead && err) err({ code: 'unavailable', message: String(e && e.message || e) }); })
        .finally(function () { busy = false; if (again) { again = false; kick(); } });
    }
    function kick() { clearTimeout(t); t = setTimeout(run, 400); }
    var l = { coll: self.coll, kick: kick }; listeners.push(l); ensureLive(); run();
    var poll = setInterval(run, 30000);   // safety net if a realtime event is missed
    return function () { dead = true; clearInterval(poll); listeners = listeners.filter(function (x) { return x !== l; }); };
  };
  function DocRef(coll, id) { this.coll = coll; this.id = id; this.path = coll + '/' + id; }
  DocRef.prototype.get = function () {
    var self = this;
    return withTimeout((async function () {
      await uid();
      var r = await sb.from('docs').select('id,data').eq('coll', self.coll).eq('id', self.id).maybeSingle();
      if (r.error) throw r.error; return new DocSnap(self.id, r.data ? r.data.data : null);
    })(), 15000);
  };
  DocRef.prototype.set = function (data, opts) {
    var self = this;
    return withTimeout((async function () {
      var me = await uid(), body = clone(data);
      if (opts && opts.merge) { var cur = await self.get(); body = Object.assign(cur.exists ? cur.data() : {}, body); }
      var r = await sb.from('docs').upsert({ coll: self.coll, id: self.id, data: body, owner: me }, { onConflict: 'coll,id' });
      if (r.error) throw r.error;
    })(), 15000);
  };
  DocRef.prototype.update = function (patch) { return this.set(patch, { merge: true }); };
  DocRef.prototype.delete = function () {
    var self = this;
    return withTimeout((async function () { await uid(); var r = await sb.from('docs').delete().eq('coll', self.coll).eq('id', self.id); if (r.error) throw r.error; })(), 15000);
  };
  DocRef.prototype.onSnapshot = function (next, err) {
    var q = new Query(this.coll).where('__id', '==', this.id), self = this;
    var dead = false, t = null;
    function run() { self.get().then(function (s) { if (!dead) next(s); }, function (e) { if (!dead && err) err({ code: 'unavailable', message: String(e) }); }); }
    var l = { coll: self.coll, kick: function () { clearTimeout(t); t = setTimeout(run, 300); } }; listeners.push(l); ensureLive(); run();
    return function () { dead = true; listeners = listeners.filter(function (x) { return x !== l; }); };
  };
  var db = {
    doc: function (path) { var s = split(path); return new DocRef(s.coll, s.id); },
    collection: function (path) { return new Query(String(path)); },
  };

  // ---------------- user ----------------
  var user = {
    id: function () { return uid(); },
    me: async function () { return { id: await uid(), name: '' }; },
    profiles: async function () { return {}; },
    isOwner: function () { return false; }, canEdit: function () { return false; }, can: function () { return null; },
  };

  // ---------------- room ----------------
  // Presence is sent as broadcast messages (the game updates it ~15 times a second during a race, too often for
  // Supabase presence). Each tab re-sends its full state every 2 s; a peer silent for 7 s has left.
  var tabId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  function makeRoom(name) {
    var ch = null, ready = null, mine = {}, peers = {}, subs = [], hb = null, sweep = null, dirty = false, lastSend = 0, sendT = null, myUid = null, left = false;
    function peerList() { return Object.keys(peers).map(function (k) { return peers[k]; }).sort(function (a, b) { return (a.joinedAt - b.joinedAt) || (a.peer < b.peer ? -1 : 1); }); }
    function me() { return { peer: tabId, by: myUid, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze(clone(mine)), updatedAt: Date.now(), joinedAt: joinT }; }
    var joinT = Date.now();
    function fire(joined, gone, updated) {
      var all = [me()].concat(peerList());
      var change = { peers: all, joined: joined || [], left: gone || [], updated: updated || [] };
      subs.forEach(function (s) { try { s.fn(change); } catch (e) { console.error(e); } });
    }
    function send(force) {
      if (!ch || left) return;
      var now = Date.now();
      if (!force && now - lastSend < 66) { dirty = true; if (!sendT) sendT = setTimeout(function () { sendT = null; send(true); }, 66 - (now - lastSend)); return; }
      lastSend = now; dirty = false;
      ch.send({ type: 'broadcast', event: 'p', payload: { peer: tabId, by: myUid, j: joinT, p: mine } });
    }
    function onP(m) {
      var d = m.payload; if (!d || d.peer === tabId) return;
      var old = peers[d.peer];
      var p = { peer: d.peer, by: d.by || null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: Object.freeze(d.p || {}), updatedAt: Date.now(), joinedAt: d.j || Date.now(), seen: Date.now() };
      peers[d.peer] = p;
      if (!old) { send(true); fire([p], [], []); } else fire([], [], [p]);
    }
    function onBye(m) { var d = m.payload; if (d && peers[d.peer]) { var p = peers[d.peer]; delete peers[d.peer]; fire([], [p], []); } }
    ready = (async function () {
      myUid = await uid();
      ch = sb.channel('room:' + name, { config: { broadcast: { self: false, ack: false } } });
      ch.on('broadcast', { event: 'p' }, onP).on('broadcast', { event: 'bye' }, onBye);
      await new Promise(function (res, rej) {
        var done = false;
        ch.subscribe(function (st) {
          if (st === 'SUBSCRIBED' && !done) { done = true; res(); }
          else if ((st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') && !done) { done = true; rej(new Error(st)); }
          else if ((st === 'CHANNEL_ERROR' || st === 'CLOSED') && done && !left) subs.forEach(function (s) { s.err && s.err({ code: 'disconnected', message: st }); });
        });
        setTimeout(function () { if (!done) { done = true; rej(new Error('timeout')); } }, 12000);
      });
      hb = setInterval(function () { send(true); }, 2000);
      sweep = setInterval(function () {
        var now = Date.now(), gone = [];
        Object.keys(peers).forEach(function (k) { if (now - peers[k].seen > 7000) { gone.push(peers[k]); delete peers[k]; } });
        if (gone.length) fire([], gone, []);
      }, 1000);
      send(true);
    })();
    window.addEventListener('pagehide', function () { if (ch && !left) ch.send({ type: 'broadcast', event: 'bye', payload: { peer: tabId } }); });
    var room = {
      name: name,
      presence: function (patch) {
        Object.keys(patch || {}).forEach(function (k) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; });
        fire([], [], []);
        return ready.then(function () { send(false); });
      },
      peers: function () { return [me()].concat(peerList()); },
      onPeers: function (fn, err) { var s = { fn: fn, err: err }; subs.push(s); ready.then(function () { fire([], [], []); }, function (e) { err && err({ code: 'unavailable', message: String(e) }); }); return function () { subs = subs.filter(function (x) { return x !== s; }); }; },
      emit: function (topic, data) { return ready.then(function () { return ch.send({ type: 'broadcast', event: 'e:' + topic, payload: { peer: tabId, by: myUid, d: data } }); }); },
      on: function (topic, fn) {
        var off = false;
        ready.then(function () { ch.on('broadcast', { event: 'e:' + topic }, function (m) { if (off || !m.payload) return; fn({ topic: topic, data: m.payload.d, peer: m.payload.peer, by: m.payload.by, isMe: false, sameTab: false, kind: 'viewer', guest: false }); }); });
        return function () { off = true; };
      },
      leave: async function () {
        left = true; clearInterval(hb); clearInterval(sweep); clearTimeout(sendT);
        try { if (ch) { await ch.send({ type: 'broadcast', event: 'bye', payload: { peer: tabId } }); await sb.removeChannel(ch); } } catch (_) {}
        subs = [];
      },
    };
    return room;
  }
  var lobby = {
    join: async function (name) { var r = makeRoom(String(name)); await r.presence({}); return r; },
  };

  // ---------------- downloads ----------------
  var downloads = {
    save: async function (o) {
      var blob = o.data instanceof Blob ? o.data : new Blob([o.data]);
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = o.filename || 'download';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    },
  };

  var NS = { db: db, user: user, room: lobby, downloads: downloads };
  var cache = {};
  window.claude = Object.freeze({
    use: function (name) {
      if (!NS[name]) return Promise.resolve(null);
      if (name === 'downloads') return Promise.resolve(downloads);
      if (!cache[name]) cache[name] = withTimeout(uid(), 10000).then(function () { return NS[name]; }, function () { cache[name] = null; return null; });
      return cache[name];
    },
  });
})();
