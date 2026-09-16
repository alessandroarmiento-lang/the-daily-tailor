/** Where the weather lat/lon came from. */
export type WeatherLocationSource = "gps" | "last_known" | "default";

export type WeatherLocation = {
  latitude: number;
  longitude: number;
  /** Display label (city / place / approx coords). */
  city: string;
  source: WeatherLocationSource;
  /** ISO timestamp when this fix was recorded (GPS or last save). */
  updatedAt: string;
};

export type WeatherLocationInput = {
  latitude: number;
  longitude: number;
  city?: string;
  source?: WeatherLocationSource;
};
