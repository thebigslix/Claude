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
  onStreetPress: (street: Street) => void;
};

export default function StreetMap({
  centerLat, centerLng, streets, completions, userLat, userLng, onStreetPress,
}: Props) {
  const completedIds = new Set(completions.map(c => c.streetId));

  return (
    <MapView
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      initialRegion={{
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }}
      showsUserLocation={false}
      showsMyLocationButton={false}
    >
      {streets.map(street => {
        if (!street.geometry || street.geometry.length < 2) return null;
        const isDone = completedIds.has(street.id);
        return (
          <Polyline
            key={street.id}
            coordinates={street.geometry.map(([lat, lng]) => ({ latitude: lat, longitude: lng }))}
            strokeColor={isDone ? '#16A34A' : '#3B82F6'}
            strokeWidth={isDone ? 6 : 4}
            tappable
            onPress={() => onStreetPress(street)}
          />
        );
      })}

      {userLat != null && userLng != null && (
        <Marker coordinate={{ latitude: userLat, longitude: userLng }} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={{
            width: 18, height: 18,
            backgroundColor: '#2563EB',
            borderRadius: 9,
            borderWidth: 3,
            borderColor: '#fff',
          }} />
        </Marker>
      )}
    </MapView>
  );
}
