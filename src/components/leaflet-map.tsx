import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Coordinate } from '@/lib/routing';

interface Props {
  location: Coordinate | null;
  routeCoords: Coordinate[];
  heatmapData?: [number, number, number][]; // [lat, lng, intensity]
  showHeatmap?: boolean;
}

export function LeafletMap({ location, routeCoords, heatmapData = [], showHeatmap = true }: Props) {
  const webviewRef = useRef<WebView>(null);
  const lat = location?.latitude ?? 51.5074;
  const lng = location?.longitude ?? -0.1278;

  const routeJson = JSON.stringify(routeCoords.map((c) => [c.latitude, c.longitude]));
  const heatJson = JSON.stringify(heatmapData);

  // Send live location updates without reloading the whole map
  useEffect(() => {
    if (!location || !webviewRef.current) return;
    webviewRef.current.postMessage(
      JSON.stringify({ type: 'location', lat: location.latitude, lng: location.longitude })
    );
  }, [location]);

  // Send route updates
  useEffect(() => {
    if (!webviewRef.current) return;
    webviewRef.current.postMessage(
      JSON.stringify({ type: 'route', coords: routeCoords.map((c) => [c.latitude, c.longitude]) })
    );
  }, [routeCoords]);

  // Send heatmap updates
  useEffect(() => {
    if (!webviewRef.current) return;
    webviewRef.current.postMessage(
      JSON.stringify({ type: 'heatmap', data: heatmapData, visible: showHeatmap })
    );
  }, [heatmapData, showHeatmap]);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
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
    radius: 8, fillColor: '#ff8500', color: '#fff', weight: 2, fillOpacity: 1
  }).addTo(map);

  var routeLayer = null;
  var heatLayer = null;

  // Initial route
  var initCoords = ${routeJson};
  if (initCoords.length > 0) {
    routeLayer = L.polyline(initCoords, {color: '#ff8500', weight: 5}).addTo(map);
    map.fitBounds(routeLayer.getBounds(), {padding: [40, 40]});
  }

  // Initial heatmap
  var initHeat = ${heatJson};
  if (initHeat.length > 0) {
    heatLayer = L.heatLayer(initHeat, {
      radius: 25,
      blur: 20,
      maxZoom: 17,
      gradient: { 0.2: '#ffffb2', 0.5: '#fd8d3c', 0.8: '#f03b20', 1.0: '#bd0026' }
    }).addTo(map);
  }

  document.addEventListener('message', function(e) {
    var data = JSON.parse(e.data);

    if (data.type === 'location') {
      userMarker.setLatLng([data.lat, data.lng]);
      map.setView([data.lat, data.lng]);
    }

    if (data.type === 'route') {
      if (routeLayer) map.removeLayer(routeLayer);
      if (data.coords.length > 0) {
        routeLayer = L.polyline(data.coords, {color: '#ff8500', weight: 5}).addTo(map);
        map.fitBounds(routeLayer.getBounds(), {padding: [40, 40]});
      }
    }

    if (data.type === 'heatmap') {
      if (heatLayer) map.removeLayer(heatLayer);
      heatLayer = null;
      if (data.visible && data.data.length > 0) {
        heatLayer = L.heatLayer(data.data, {
          radius: 25,
          blur: 20,
          maxZoom: 17,
          gradient: { 0.2: '#ffffb2', 0.5: '#fd8d3c', 0.8: '#f03b20', 1.0: '#bd0026' }
        }).addTo(map);
      }
    }
  });
</script>
</body>
</html>`;

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
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