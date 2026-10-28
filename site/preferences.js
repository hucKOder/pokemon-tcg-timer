export const DEFAULT_PREFERENCES = Object.freeze({ language: 'en', volume: 1, showExtensions: true });

export function restorePreferences(raw) {
  try {
    const value = JSON.parse(raw);
    return {
      language: value?.language === 'sk' ? 'sk' : 'en',
      volume: typeof value?.volume === 'number' && Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1 ? value.volume : 1,
      showExtensions: typeof value?.showExtensions === 'boolean' ? value.showExtensions : true,
    };
  } catch { return { ...DEFAULT_PREFERENCES }; }
}
