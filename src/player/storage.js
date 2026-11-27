const scoreKeys = new Map([
  ['campaign', 'gobbler-trip-v2'],
  ['hunt', 'gobbler-foodfight-v1-hunt'],
  ['city', 'gobbler-foodfight-v1-city'],
]);

export const HUD_LAYOUTS = Object.freeze({
  'field-kit': 'Field Kit',
  'trail-atlas': 'Trail Atlas',
  'supper-ticket': 'Supper Ticket',
});
const hudLayoutKey = 'gobbler-hud-layout';

export function createPlayerStorage(getStorage = () => window.localStorage) {
  let unsavedLayout;
  function read(key) {
    try {
      return getStorage().getItem(key);
    } catch {
      return null;
    }
  }

  function write(key, value) {
    try {
      getStorage().setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function setting(key, on, off, defaultOn = false) {
    let unsaved;
    return {
      get() {
        if (unsaved !== undefined) return unsaved;
        const value = read(key);
        return defaultOn ? value !== off : value === on;
      },
      set(enabled) {
        unsaved = write(key, enabled ? on : off) ? undefined : enabled;
      },
    };
  }

  function discovery(key) {
    let found = false;
    return {
      has: () => found || read(key) === 'found',
      collect() {
        found = true;
        write(key, 'found');
      },
    };
  }

  function best(mode = 'campaign') {
    if (!scoreKeys.has(mode)) return 0;
    const time = Number(read(scoreKeys.get(mode)));
    return Number.isFinite(time) && time > 0 ? time : 0;
  }

  return {
    timer: setting('gobbler-hunt-timer', 'on', 'off', true),
    mute: setting('gobbler-muted', '1', '0'),
    chase: setting('gobbler-chase-view', 'on', 'off'),
    hudLayout: {
      get() {
        const layout = unsavedLayout ?? read(hudLayoutKey);
        return Object.hasOwn(HUD_LAYOUTS, layout) ? layout : 'field-kit';
      },
      set(layout) {
        if (Object.hasOwn(HUD_LAYOUTS, layout))
          unsavedLayout = write(hudLayoutKey, layout) ? undefined : layout;
      },
    },
    grail: discovery('gobbler-dover-grail-v1'),
    recipe: discovery('gobbler-dover-recipe-v1'),
    best,
    recordBest(mode, time) {
      if (!scoreKeys.has(mode) || !Number.isFinite(time) || time <= 0)
        return false;
      const previous = best(mode);
      return (
        (!previous || time < previous) &&
        write(scoreKeys.get(mode), String(time))
      );
    },
  };
}

export const playerStorage = createPlayerStorage();
