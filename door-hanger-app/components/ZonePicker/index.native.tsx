import { StyleSheet } from 'react-native';
import MapView, { Marker, Circle, PROVIDER_DEFAULT, MapPressEvent } from 'react-native-maps';

type Props = {
  lat: number;
  lng: number;
  radiusMeters: number;
  onMove: (lat: number, lng: number) => void;
};

export default function ZonePicker({ lat, lng, radiusMeters, onMove }: Props) {
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      region={{
        latitude: lat,
        longitude: lng,
        latitudeDelta: (radiusMeters / 111000) * 3,
        longitudeDelta: (radiusMeters / 111000) * 3,
      }}
      onPress={(e: MapPressEvent) => {
        const { latitude, longitude } = e.nativeEvent.coordinate;
        onMove(latitude, longitude);
      }}
    >
      <Circle
        center={{ latitude: lat, longitude: lng }}
        radius={radiusMeters}
        strokeColor="#3B82F6"
        fillColor="rgba(59,130,246,0.1)"
        strokeWidth={2}
      />
      <Marker
        coordinate={{ latitude: lat, longitude: lng }}
        draggable
        onDragEnd={e => onMove(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)}
      />
    </MapView>
  );
}
