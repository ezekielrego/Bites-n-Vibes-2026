module.exports = ({ config }) => {
  const androidGoogleMapsApiKey =
    process.env.EXPO_PUBLIC_ANDROID_GOOGLE_MAPS_API_KEY ||
    process.env.ANDROID_GOOGLE_MAPS_API_KEY ||
    '';

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...(config.android?.config || {}),
        ...(androidGoogleMapsApiKey
          ? {
              googleMaps: {
                ...(config.android?.config?.googleMaps || {}),
                apiKey: androidGoogleMapsApiKey,
              },
            }
          : {}),
      },
    },
    extra: {
      ...config.extra,
      androidGoogleMapsApiKey: androidGoogleMapsApiKey || null,
    },
  };
};
