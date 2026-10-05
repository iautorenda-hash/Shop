export interface PlaceResult {
  display_name: string;
  lat: string;
  lon: string;
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  if (!query || query.length < 3) return [];
  
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=br`);
    if (!response.ok) {
      throw new Error('Failed to fetch places');
    }
    const data = await response.json();
    return data as PlaceResult[];
  } catch (error) {
    console.error("Geocoding error:", error);
    return [];
  }
}
