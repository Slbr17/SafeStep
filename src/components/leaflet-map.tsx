import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Coordinate } from '@/lib/routing';

interface Props {
  location: Coordinate | null;
  routeCoords: Coordinate[];
}

export function LeafletMap({ location, routeCoords }: Props) {
  const lat = location?.latitude ?? 51.5074;
  const lng = location?.longitude ?? -0.1278;

  const routeJson = JSON.stringify(
    routeCoords.map((c) => [c.latitude, c.longitude])
  );

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>html,body,#map{margin:0;padding:0;height:100%;width:100%;}</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map').setView([${lat}, ${lng}], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors © CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  var userMarker = L.circleMarker([${lat}, ${lng}], {
    radius: 8, fillColor: '#208AEF', color: '#fff', weight: 2, fillOpacity: 1
  }).addTo(map);

  var routeLayer = null;
  var coords = ${routeJson};
  if (coords.length > 0) {
    routeLayer = L.polyline(coords, {color: '#208AEF', weight: 5}).addTo(map);
    map.fitBounds(routeLayer.getBounds(), {padding: [40, 40]});
  }

  // Listen for location/route updates from React Native
  document.addEventListener('message', function(e) {
    var data = JSON.parse(e.data);
    if (data.type === 'location') {
      userMarker.setLatLng([data.lat, data.lng]);
      map.setView([data.lat, data.lng]);
    }
    if (data.type === 'route') {
      if (routeLayer) map.removeLayer(routeLayer);
      routeLayer = L.polyline(data.coords, {color: '#208AEF', weight: 5}).addTo(map);
      map.fitBounds(routeLayer.getBounds(), {padding: [40, 40]});
    }
  });
</script>
</body>
</html>`;

  return (
    <View style={styles.container}>
      <WebView
        source={{ html }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
});
