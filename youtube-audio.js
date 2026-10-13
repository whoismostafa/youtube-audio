/*!
 * <youtube-audio> — a tiny custom element that plays a YouTube video as audio only.
 * Hidden player, animated play/pause button with a progress ring, resume support,
 * autoplay fallback, and media-key / lock-screen controls.
 *
 * Copyright (c) Mostafa. All rights reserved.
 *
 * Usage:
 *   <script src="youtube-audio.js"></script>
 *   <youtube-audio video="VIDEO_ID_OR_URL" loop resume label="My audio"></youtube-audio>
 *
 * Attributes:
 *   video     YouTube video ID or full URL (required)
 *   autoplay  try to start immediately; if the browser blocks it, start on first user interaction
 *   loop      restart when the video ends
 *   resume    remember the playback position between visits
 *   volume    0-100 (default 100)
 *   label     accessible name / lock-screen title
 *
 * Styling (CSS variables): --ya-size, --ya-color, --ya-bg, --ya-ring
 *
 * JS API: el.play(), el.pause(), el.toggle(), el.playing (read-only)
 * Events: "yastatechange" with detail.state = "idle" | "loading" | "playing" | "paused" | "error"
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.customElements) return;
  if (customElements.get('youtube-audio')) return;

  /* ---------- Load the YouTube IFrame API once, safely chaining any existing callback ---------- */
  var apiPromise = null;
  function loadApi() {
    if (apiPromise) return apiPromise;
    apiPromise = new Promise(function (resolve) {
      if (window.YT && window.YT.Player) { resolve(window.YT); return; }
      var previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof previous === 'function') { try { previous(); } catch (e) { /* ignore */ } }
        resolve(window.YT);
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        var s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        s.async = true;
        document.head.appendChild(s);
      }
    });
    return apiPromise;
  }

  function parseVideoId(value) {
    if (!value) return null;
    value = String(value).trim();
    if (/^[\w-]{11}$/.test(value)) return value;
    var m = value.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/);
    return m ? m[1] : null;
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }
  function storageRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  var TEMPLATE =
    '<style>' +
    ':host{display:inline-block;--ya-size:56px;--ya-color:#fff;--ya-bg:#e11d48;--ya-ring:rgba(255,255,255,.95);' +
    'width:var(--ya-size);height:var(--ya-size);vertical-align:middle;-webkit-tap-highlight-color:transparent}' +
    ':host([hidden]){display:none}' +
    'button{all:unset;box-sizing:border-box;position:relative;display:block;width:100%;height:100%;border-radius:50%;' +
    'background:var(--ya-bg);color:var(--ya-color);cursor:pointer;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.28);transition:transform .15s ease,box-shadow .2s ease}' +
    'button:hover{transform:scale(1.06)}' +
    'button:active{transform:scale(.94)}' +
    'button:focus-visible{outline:3px solid var(--ya-ring);outline-offset:3px}' +
    'svg{position:absolute;inset:0;width:100%;height:100%}' +
    '.track{fill:none;stroke:rgba(255,255,255,.28);stroke-width:3}' +
    '.bar{fill:none;stroke:var(--ya-ring);stroke-width:3;stroke-linecap:round;' +
    'transform:rotate(-90deg);transform-origin:50% 50%;stroke-dasharray:100;stroke-dashoffset:100;transition:stroke-dashoffset .5s linear}' +
    '.icon{fill:currentColor;opacity:0;transform:scale(.6);transform-origin:50% 50%;transition:opacity .2s,transform .2s}' +
    '.spin{fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-dasharray:30 70;opacity:0;transform-origin:50% 50%}' +
    'button[data-state=idle] .i-play,button[data-state=paused] .i-play,' +
    'button[data-state=playing] .i-pause,button[data-state=error] .i-error{opacity:1;transform:scale(1)}' +
    'button[data-state=loading] .spin{opacity:1;animation:ya-spin 1s linear infinite}' +
    'button[data-state=playing]{animation:ya-pulse 2s ease-out infinite}' +
    'button[data-state=error]{background:#6b7280;cursor:not-allowed}' +
    '@keyframes ya-spin{to{transform:rotate(360deg)}}' +
    '@keyframes ya-pulse{0%{box-shadow:0 4px 14px rgba(0,0,0,.28),0 0 0 0 rgba(225,29,72,.45)}' +
    '100%{box-shadow:0 4px 14px rgba(0,0,0,.28),0 0 0 16px rgba(225,29,72,0)}}' +
    '@media (prefers-reduced-motion:reduce){button,.icon,.bar{transition:none}button[data-state=playing]{animation:none}}' +
    '</style>' +
    '<button type="button" part="button" data-state="idle" aria-pressed="false">' +
    '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
    '<circle class="track" cx="24" cy="24" r="21.5"/>' +
    '<circle class="bar" cx="24" cy="24" r="21.5" pathLength="100"/>' +
    '<circle class="spin" cx="24" cy="24" r="12" pathLength="100"/>' +
    '<path class="icon i-play" d="M19 15.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 19 15.5z"/>' +
    '<g class="icon i-pause"><rect x="17" y="16" width="5" height="16" rx="1.5"/><rect x="26" y="16" width="5" height="16" rx="1.5"/></g>' +
    '<path class="icon i-error" d="M22.5 15h3v12h-3zM22.5 29.5h3v3h-3z"/>' +
    '</svg></button>';

  var STATE_LABELS = {
    idle: 'Play audio', paused: 'Play audio', playing: 'Pause audio',
    loading: 'Loading audio', error: 'Audio unavailable'
  };

  function YouTubeAudio() {
    var self = Reflect.construct(HTMLElement, [], YouTubeAudio);
    self._root = self.attachShadow({ mode: 'open' });
    self._root.innerHTML = TEMPLATE;
    self._btn = self._root.querySelector('button');
    self._bar = self._root.querySelector('.bar');
    self._player = null;
    self._host = null;
    self._ready = false;
    self._wantPlay = false;
    self._userPaused = false;
    self._timer = 0;
    self._ticks = 0;
    self._state = 'idle';
    self._videoId = null;
    self._initToken = 0;
    self._unlock = null;
    self._btn.addEventListener('click', function () { self._userPaused = false; self.toggle(); });
    return self;
  }
  YouTubeAudio.prototype = Object.create(HTMLElement.prototype);
  YouTubeAudio.prototype.constructor = YouTubeAudio;
  Object.setPrototypeOf(YouTubeAudio, HTMLElement);

  YouTubeAudio.observedAttributes = ['video', 'volume', 'label'];

  var proto = YouTubeAudio.prototype;

  proto._flag = function (name) {
    if (!this.hasAttribute(name)) return false;
    var v = (this.getAttribute(name) || '').toLowerCase();
    return v !== 'false' && v !== '0';
  };

  proto._storageKey = function () { return 'youtube-audio:' + this._videoId; };

  proto._setState = function (state) {
    if (this._state === state) return;
    this._state = state;
    this._btn.setAttribute('data-state', state);
    this._btn.setAttribute('aria-pressed', state === 'playing' ? 'true' : 'false');
    this._btn.setAttribute('aria-label', (this.getAttribute('label') ? this.getAttribute('label') + ' — ' : '') + STATE_LABELS[state]);
    this._btn.disabled = state === 'error';
    this.dispatchEvent(new CustomEvent('yastatechange', { detail: { state: state }, bubbles: true }));
  };

  proto._setProgress = function (fraction) {
    var pct = Math.max(0, Math.min(1, fraction || 0)) * 100;
    this._bar.style.strokeDashoffset = String(100 - pct);
  };

  proto._startTimer = function () {
    var self = this;
    this._stopTimer();
    this._timer = window.setInterval(function () {
      var p = self._player;
      if (!self._ready || !p || typeof p.getCurrentTime !== 'function') return;
      var cur = p.getCurrentTime() || 0;
      var dur = p.getDuration() || 0;
      self._setProgress(dur > 0 ? cur / dur : 0);
      self._ticks++;
      if (self._flag('resume') && self._ticks % 4 === 0 && cur > 3) {
        storageSet(self._storageKey(), String(Math.floor(cur)));
      }
    }, 500);
  };

  proto._stopTimer = function () {
    if (this._timer) { window.clearInterval(this._timer); this._timer = 0; }
  };

  proto._setupMediaSession = function () {
    if (!('mediaSession' in navigator) || typeof window.MediaMetadata !== 'function') return;
    var self = this;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({ title: this.getAttribute('label') || 'YouTube Audio' });
      navigator.mediaSession.setActionHandler('play', function () { self.play(); });
      navigator.mediaSession.setActionHandler('pause', function () { self.pause(); });
    } catch (e) { /* unsupported action; ignore */ }
  };

  proto._armAutoplayFallback = function () {
    // Browsers block sound before a user gesture; retry on the first interaction instead of failing silently.
    var self = this;
    if (this._unlock) return;
    var events = ['pointerdown', 'keydown', 'touchstart'];
    this._unlock = function () {
      self._disarmAutoplayFallback();
      if (!self._userPaused && self._state !== 'playing') self.play();
    };
    events.forEach(function (n) { document.addEventListener(n, self._unlock, { once: true, passive: true }); });
    this._unlockEvents = events;
  };

  proto._disarmAutoplayFallback = function () {
    var self = this;
    if (!this._unlock) return;
    (this._unlockEvents || []).forEach(function (n) { document.removeEventListener(n, self._unlock); });
    this._unlock = null;
  };

  proto._init = function () {
    var self = this;
    var id = parseVideoId(this.getAttribute('video'));
    this._destroyPlayer();
    this._videoId = id;
    if (!id) {
      if (this.hasAttribute('video')) console.warn('<youtube-audio>: invalid "video" attribute.');
      this._setState('idle');
      return;
    }
    var token = ++this._initToken;
    loadApi().then(function (YT) {
      if (token !== self._initToken || !self.isConnected) return;
      var host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';
      var inner = document.createElement('div');
      host.appendChild(inner);
      self.appendChild(host);
      self._host = host;

      var start = 0;
      if (self._flag('resume')) {
        var saved = parseInt(storageGet(self._storageKey()), 10);
        if (isFinite(saved) && saved > 0) start = saved;
      }

      self._player = new YT.Player(inner, {
        width: '1',
        height: '1',
        videoId: id,
        playerVars: { playsinline: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, start: start },
        events: {
          onReady: function () { self._onReady(token); },
          onStateChange: function (e) { self._onStateChange(e, token); },
          onError: function () { if (token === self._initToken) { self._stopTimer(); self._setState('error'); } }
        }
      });
    });
  };

  proto._onReady = function (token) {
    if (token !== this._initToken || !this._player) return;
    this._ready = true;
    this._applyVolume();
    this._setupMediaSession();
    if (this._wantPlay || this._flag('autoplay')) {
      this._wantPlay = true;
      this._player.playVideo();
      if (this._flag('autoplay')) {
        var self = this;
        window.setTimeout(function () {
          if (token === self._initToken && self._state !== 'playing' && !self._userPaused) {
            self._armAutoplayFallback();
            self._setState('paused');
          }
        }, 1500);
      }
    } else {
      this._setState('paused');
    }
  };

  proto._onStateChange = function (e, token) {
    if (token !== this._initToken || !window.YT) return;
    var S = window.YT.PlayerState;
    switch (e.data) {
      case S.PLAYING:
        this._disarmAutoplayFallback();
        this._setState('playing');
        this._startTimer();
        if (navigator.mediaSession) { try { navigator.mediaSession.playbackState = 'playing'; } catch (x) { /* ignore */ } }
        break;
      case S.BUFFERING:
        if (this._wantPlay) this._setState('loading');
        break;
      case S.ENDED:
        this._stopTimer();
        if (this._flag('loop')) {
          this._player.seekTo(0, true);
          this._player.playVideo();
        } else {
          this._wantPlay = false;
          this._setProgress(0);
          if (this._flag('resume')) storageRemove(this._storageKey());
          this._setState('paused');
        }
        break;
      case S.PAUSED:
      case S.CUED:
        this._stopTimer();
        this._setState(this._wantPlay && e.data === S.CUED ? 'loading' : 'paused');
        if (navigator.mediaSession) { try { navigator.mediaSession.playbackState = 'paused'; } catch (x) { /* ignore */ } }
        break;
      default:
        break;
    }
  };

  proto._applyVolume = function () {
    if (!this._ready || !this._player) return;
    var v = parseInt(this.getAttribute('volume'), 10);
    this._player.setVolume(isFinite(v) ? Math.max(0, Math.min(100, v)) : 100);
  };

  proto._destroyPlayer = function () {
    this._stopTimer();
    this._disarmAutoplayFallback();
    this._initToken++;
    this._ready = false;
    if (this._player && typeof this._player.destroy === 'function') {
      try { this._player.destroy(); } catch (e) { /* ignore */ }
    }
    this._player = null;
    if (this._host && this._host.parentNode) this._host.parentNode.removeChild(this._host);
    this._host = null;
    this._setProgress(0);
  };

  /* ---------- Public API ---------- */
  proto.play = function () {
    if (this._state === 'error' || !this._videoId) return;
    this._wantPlay = true;
    this._userPaused = false;
    if (this._ready && this._player) this._player.playVideo();
    else this._setState('loading');
  };

  proto.pause = function () {
    this._wantPlay = false;
    this._userPaused = true;
    this._disarmAutoplayFallback();
    if (this._ready && this._player) this._player.pauseVideo();
    else this._setState('paused');
  };

  proto.toggle = function () {
    if (this._state === 'playing' || this._state === 'loading') this.pause();
    else this.play();
  };

  Object.defineProperty(proto, 'playing', {
    get: function () { return this._state === 'playing'; }
  });

  /* ---------- Lifecycle ---------- */
  proto.connectedCallback = function () {
    this._btn.setAttribute('aria-label', (this.getAttribute('label') ? this.getAttribute('label') + ' — ' : '') + STATE_LABELS[this._state]);
    this._init();
  };

  proto.disconnectedCallback = function () { this._destroyPlayer(); };

  proto.attributeChangedCallback = function (name, oldValue, newValue) {
    if (oldValue === newValue || !this.isConnected) return;
    if (name === 'video') this._init();
    else if (name === 'volume') this._applyVolume();
    else if (name === 'label') this._btn.setAttribute('aria-label', (newValue ? newValue + ' — ' : '') + STATE_LABELS[this._state]);
  };

  customElements.define('youtube-audio', YouTubeAudio);
})();
