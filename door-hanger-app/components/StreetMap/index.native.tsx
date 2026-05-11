import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { Street, Completion } from '../../lib/storage';

type Props = {
  centerLat: number;
  centerLng: number;
  streets: Street[];
  completions: Completion[];
  userLat?: number;
  userLng?: number;
  mapType: 'dark' | 'satellite';
  onStreetPress: (street: Street) => void;
};

export default function StreetMap({
  centerLat, centerLng, streets, completions, userLat, userLng, mapType, onStreetPress,
}: Props) {
  const completedIds = new Set(completions.map(c => c.streetId));

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      mapType={mapType === 'satellite' ? 'satellite' : 'standard'}
      initialRegion={{
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }}
      showsUserLocation={false}
    >
      {streets.map(street => {
        if (!street.geometry || street.geometry.length < 2) return null;
        const isDone = completedIds.has(street.id);
        return (
          <Polyline
            key={street.id}
            coordinates={street.geometry.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))}
            strokeColor={isDone ? '#4ADE80' : '#60A5FA'}
            strokeWidth={isDone ? 6 : 4}
            tappable
            onPress={() => onStreetPress(street)}
          />
        );
      })}
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
    width: 16, height: 16,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: '#fff',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
});
