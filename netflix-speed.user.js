// ==UserScript==
// @name         Netflix Speed Keys
// @namespace    https://github.com/local/netflix-speed-keys
// @version      1.1.0
// @description  Change Netflix playback speed with + / − while subtitles stay in sync.
// @author       Netflix Speed Keys
// @match        https://www.netflix.com/*
// @grant        none
// @run-at       document-start
// @noframes
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';

  const STORAGE_KEY = 'nf-speed-keys:rate';
  const HUD_ID = 'nf-speed-keys-hud';

  const DEFAULT_RATE = 1;
  const MIN_RATE = 0.25;
  const MAX_RATE = 4;
  const STEP = 0.25;

  const TEXT_INPUT_TYPES = new Set([
    'text',
    'search',
    'email',
    'password',
    'url',
    'tel',
    'number',
    'date',
    'datetime-local',
    'month',
    'week',
    'time',
  ]);

  // null means "no saved speed yet": don't touch the player until a key is pressed.
  let desiredRate = loadRate();
  let hasAnnouncedSavedRate = false;

  let hudHost = null;
  let hudBox = null;
  let hudSpeed = null;
  let hudHint = null;
  let hideTimer = 0;

  const watchedVideos = new WeakSet();
  let lastPath = location.pathname;
  let scanQueued = false;
  let lastRateKick = 0;

  function clampRate(value) {
    const bounded = Math.min(MAX_RATE, Math.max(MIN_RATE, value));
    return Math.round(bounded * 100) / 100;
  }

  function formatRate(value) {
    return `${Number(value.toFixed(2))}×`;
  }

  function loadRate() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;

      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) return null;

      return clampRate(parsed);
    } catch {
      return null;
    }
  }

  function saveRate(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Storage can be unavailable (private mode, blocked storage, ...).
    }
  }

  function isWatchPage() {
    return /(^|\/)watch(\/|$)/.test(location.pathname);
  }

  // Netflix can leave hidden/preview videos in the DOM. Pick the largest visible one.
  function getVideo() {
    if (!isWatchPage()) return null;

    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;
    if (videos.length === 1) return videos[0];

    let best = null;
    let bestArea = -1;

    for (const video of videos) {
      const rect = video.getBoundingClientRect();
      const area = Math.max(0, rect.width) * Math.max(0, rect.height);
      if (area > bestArea) {
        best = video;
        bestArea = area;
      }
    }

    return best || videos[0];
  }

  function applyRateTo(video) {
    if (!video || desiredRate === null) return;

    // Keep voices sounding natural instead of chipmunk/slow-motion.
    try {
      if ('preservesPitch' in video) {
        video.preservesPitch = true;
      } else if ('webkitPreservesPitch' in video) {
        video.webkitPreservesPitch = true;
      }
    } catch {
      // Ignore unsupported browsers.
    }

    if (Math.abs(video.playbackRate - desiredRate) > 0.001) {
      try {
        video.playbackRate = desiredRate;
      } catch {
        // Some unusual rates are not supported; ignore and keep the player usable.
      }
    }

    if (Math.abs(video.defaultPlaybackRate - desiredRate) > 0.001) {
      try {
        video.defaultPlaybackRate = desiredRate;
      } catch {
        // Ignore.
      }
    }
  }

  const MEDIA_EVENTS = [
    'loadstart',
    'loadedmetadata',
    'loadeddata',
    'canplay',
    'play',
    'playing',
    'seeking',
    'seeked',
    'durationchange',
    'emptied',
  ];

  // If the browser/player refuses an extreme rate and immediately changes it back,
  // don't fight it in a tight loop. One retry per second is enough.
  function handleRateChange(video) {
    if (desiredRate === null) return;
    if (Math.abs(video.playbackRate - desiredRate) <= 0.001) return;

    const now = Date.now();
    if (now - lastRateKick < 1000) return;
    lastRateKick = now;

    applyRateTo(video);
  }

  function watchVideo(video) {
    if (!video || watchedVideos.has(video)) return;
    watchedVideos.add(video);

    for (const eventName of MEDIA_EVENTS) {
      video.addEventListener(eventName, () => applyRateTo(video), { passive: true });
    }

    video.addEventListener('ratechange', () => handleRateChange(video), { passive: true });

    applyRateTo(video);
  }

  function scan() {
    if (!isWatchPage()) {
      hideHud();
      return;
    }

    const video = getVideo();
    if (!video) return;

    watchVideo(video);
    applyRateTo(video);

    if (!hasAnnouncedSavedRate && desiredRate !== null && desiredRate !== DEFAULT_RATE) {
      hasAnnouncedSavedRate = true;
      showHud(desiredRate, 'Saved speed · subtitles in sync');
    }
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;

    window.setTimeout(() => {
      scanQueued = false;
      scan();
    }, 150);
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target.isContentEditable) return true;

    const editable = target.closest('input, textarea, select, [contenteditable]');
    if (!editable || !(editable instanceof HTMLElement)) return false;

    // Sliders, buttons, checkboxes, etc. are not text entry. Only ignore keys
    // while the user is actually typing.
    if (editable instanceof HTMLInputElement) {
      const type = (editable.type || 'text').toLowerCase();
      if (!TEXT_INPUT_TYPES.has(type)) return false;
    }

    if (editable.hidden || editable.getAttribute('aria-hidden') === 'true') return false;

    const style = window.getComputedStyle(editable);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    const rect = editable.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  function setRate(nextRate, hint) {
    desiredRate = clampRate(nextRate);
    hasAnnouncedSavedRate = true;
    saveRate(desiredRate);

    const video = getVideo();
    if (video) {
      watchVideo(video);
      applyRateTo(video);
    }

    showHud(desiredRate, hint || '+ / − adjust · 0 reset · subtitles in sync');
  }

  function changeRate(direction) {
    const video = getVideo();
    if (!video) return;

    // If no custom speed is active yet, start from whatever the player is using.
    const base = desiredRate === null ? video.playbackRate || DEFAULT_RATE : desiredRate;
    const next = clampRate(base + direction * STEP);

    if (next === base) {
      showHud(
        base,
        direction > 0 ? 'Maximum speed · subtitles in sync' : 'Minimum speed · subtitles in sync',
      );
      return;
    }

    setRate(next);
  }

  function handleKeyDown(event) {
    if (event.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const target = event.composedPath?.()[0] || event.target;
    if (isEditableTarget(target)) return;
    if (!isWatchPage() || !getVideo()) return;

    const { key, code } = event;
    // Accept the physical plus/equal and minus keys as well as the numpad keys.
    // This covers layouts where the top-row "+" arrives as "=".
    const isPlus =
      key === '+' || key === '=' || key === 'Add' || code === 'Equal' || code === 'NumpadAdd';
    const isMinus =
      key === '-' ||
      key === '_' ||
      key === 'Subtract' ||
      code === 'Minus' ||
      code === 'NumpadSubtract';
    const isReset = key === '0' && !event.shiftKey;

    if (!isPlus && !isMinus && !isReset) return;

    event.preventDefault();
    event.stopPropagation();

    if (isReset) {
      setRate(DEFAULT_RATE, 'Normal speed · subtitles in sync');
      return;
    }

    changeRate(isPlus ? 1 : -1);
  }

  function createHud() {
    if (hudHost) return;

    hudHost = document.createElement('div');
    hudHost.id = HUD_ID;
    hudHost.setAttribute('role', 'status');
    hudHost.setAttribute('aria-live', 'polite');
    hudHost.setAttribute('aria-atomic', 'true');
    hudHost.style.cssText = [
      'all: initial',
      'display: block',
      'position: fixed',
      'top: 16px',
      'right: 16px',
      'z-index: 2147483647',
      'pointer-events: none',
      'direction: ltr',
    ].join(';');

    const shadow = hudHost.attachShadow({ mode: 'open' });

    hudBox = document.createElement('div');
    hudBox.style.cssText = [
      'display: flex',
      'flex-direction: column',
      'gap: 3px',
      'min-width: 205px',
      'box-sizing: border-box',
      'padding: 11px 16px 12px',
      'border-radius: 12px',
      'border: 1px solid rgba(255,255,255,0.16)',
      'border-left: 3px solid #e50914',
      'background: rgba(12,12,14,0.88)',
      'box-shadow: 0 8px 30px rgba(0,0,0,0.5)',
      'color: #fff',
      'text-align: left',
      'line-height: 1.2',
      'font-family: "Netflix Sans", "Helvetica Neue", "Segoe UI", Arial, sans-serif',
      'opacity: 0',
      'transform: translateY(-8px) scale(0.97)',
      'transition: opacity 160ms ease, transform 160ms ease',
      'will-change: opacity, transform',
      'backdrop-filter: blur(10px)',
      '-webkit-backdrop-filter: blur(10px)',
    ].join(';');

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      hudBox.style.transition = 'none';
    }

    hudSpeed = document.createElement('div');
    hudSpeed.style.cssText = [
      'margin: 0',
      'color: #fff',
      'font-size: 29px',
      'font-weight: 700',
      'letter-spacing: -0.02em',
      'font-variant-numeric: tabular-nums',
      'line-height: 1.1',
    ].join(';');

    hudHint = document.createElement('div');
    hudHint.style.cssText = [
      'margin: 1px 0 0',
      'color: rgba(255,255,255,0.7)',
      'font-size: 11.5px',
      'font-weight: 400',
      'white-space: nowrap',
      'line-height: 1.35',
    ].join(';');

    hudBox.append(hudSpeed, hudHint);
    shadow.append(hudBox);
    mountHud();
  }

  function mountHud() {
    if (!hudHost) return;

    const fullscreenElement =
      document.fullscreenElement || document.webkitFullscreenElement || null;

    let parent = document.body || document.documentElement;

    // In fullscreen, only the fullscreen element's subtree is visible.
    if (
      fullscreenElement &&
      fullscreenElement !== hudHost &&
      !(fullscreenElement instanceof HTMLVideoElement)
    ) {
      parent = fullscreenElement;
    }

    if (hudHost.parentNode !== parent) {
      try {
        parent.appendChild(hudHost);
      } catch {
        // The document may still be loading at document-start; the next scan retries.
      }
    }
  }

  function showHud(rate, hint) {
    createHud();

    hudSpeed.textContent = formatRate(rate);
    hudHint.textContent = hint || '+ / − adjust · 0 reset · subtitles in sync';
    mountHud();

    hudBox.style.opacity = '1';
    hudBox.style.transform = 'translateY(0) scale(1)';

    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      hudBox.style.opacity = '0';
      hudBox.style.transform = 'translateY(-8px) scale(0.97)';
    }, 1800);
  }

  function hideHud() {
    if (!hudBox) return;
    hudBox.style.opacity = '0';
    hudBox.style.transform = 'translateY(-8px) scale(0.97)';
    window.clearTimeout(hideTimer);
  }

  function init() {
    scan();

    window.setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        scan();
        return;
      }

      if (isWatchPage()) scan();
    }, 1000);

    const observer = new MutationObserver((records) => {
      if (!isWatchPage()) return;

      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (
            node.tagName === 'VIDEO' ||
            (typeof node.querySelector === 'function' && node.querySelector('video'))
          ) {
            queueScan();
            return;
          }
        }
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('popstate', queueScan);
    window.addEventListener('pageshow', queueScan);

    document.addEventListener('fullscreenchange', mountHud, true);
    document.addEventListener('webkitfullscreenchange', mountHud, true);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scan();
    });
  }

  // Register the shortcut before Netflix's player handlers whenever possible.
  window.addEventListener('keydown', handleKeyDown, true);

  function boot() {
    if (!document.documentElement) {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
      return;
    }

    init();
  }

  boot();
})();
