import { StyleSheet, View, Text } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, MapPressEvent, LongPressEvent } from 'react-native-maps';
import { Street, Completion, YardSign } from '../../lib/storage';

type Props = {
  centerLat: number;
  centerLng: number;
  streets: Street[];
  completions: Completion[];
  yardSigns: YardSign[];
  userLat?: number;
  userLng?: number;
  mapType: 'dark' | 'satellite';
  placingSign: boolean;
  onStreetPress: (street: Street) => void;
  onMapPress: (lat: number, lng: number) => void;
  onYardSignPress: (sign: YardSign) => void;
};

export default function StreetMap({
  centerLat, centerLng, streets, completions, yardSigns,
  userLat, userLng, mapType, placingSign,
  onStreetPress, onMapPress, onYardSignPress,
}: Props) {
  const completedIds = new Set(completions.map(c => c.streetId));

  function handlePress(e: MapPressEvent) {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    onMapPress(latitude, longitude);
  }

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      mapType={mapType === 'satellite' ? 'satellite' : 'standard'}
      initialRegion={{ latitude: centerLat, longitude: centerLng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
      showsUserLocation={false}
      onPress={placingSign ? handlePress : undefined}
    >
      {streets.flatMap(street => {
        if (!street.geometry || street.geometry.length === 0) return [];
        const isDone = completedIds.has(street.id);
        // Normalize: old data stored geometry as [number,number][] (flat).
        // New format is [number,number][][] (array of segments). Detect by
        // checking if the first element is a number pair or a segment array.
        const segments: [number, number][][] =
          typeof street.geometry[0][0] === 'number'
            ? [street.geometry as unknown as [number, number][]]
            : (street.geometry as unknown as [number, number][][]);

        return segments.map((segment, segIdx) => {
          if (segment.length < 2) return null;
          return (
            <Polyline
              key={`${street.id}-${segIdx}`}
              coordinates={segment.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))}
              strokeColor={isDone ? '#4ADE80' : '#60A5FA'}
              strokeWidth={isDone ? 5 : 3}
              tappable
              onPress={() => !placingSign && onStreetPress(street)}
            />
          );
        });
      })}

      {yardSigns.map(sign => (
        <Marker
          key={sign.id}
          coordinate={{ latitude: sign.lat, longitude: sign.lng }}
          onPress={() => onYardSignPress(sign)}
          anchor={{ x: 0.5, y: 1 }}
        >
          <Text style={styles.signEmoji}>🪧</Text>
        </Marker>
      ))}

      {userLat != null && userLng != null && (
        <Marker coordinate={{ latitude: userLat, longitude: userLng }} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.userDot} />
        </Marker>
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  userDot: {
    width: 16, height: 16, backgroundColor: '#3B82F6',
    borderRadius: 8, borderWidth: 2.5, borderColor: '#fff',
    shadowColor: '#3B82F6', shadowOpacity: 0.5, shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 }, elevation: 6,
  },
  signEmoji: { fontSize: 24 },
});
