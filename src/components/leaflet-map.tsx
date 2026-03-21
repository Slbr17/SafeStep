import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { Danger } from '@/lib/dangers';
import { Coordinate } from '@/lib/routing';

export interface MapBounds {
  minLat: number; minLng: number;
  maxLat: number; maxLng: number;
}

interface Props {
  location: Coordinate | null;
  routeCoords: Coordinate[];
  showHeatmap?: boolean;
  dangers?: Array<Danger & { icon: string }>;
  onCrimeData?: (points: Array<{ lat: number; lng: number; category: string }>) => void;
  onMapLongPress?: (lat: number, lng: number) => void;
  onDangerTap?: (id: string) => void;
}

export function LeafletMap({ location, routeCoords, showHeatmap = true, dangers = [], onCrimeData, onMapLongPress, onDangerTap }: Props) {
  const webviewRef = useRef<WebView>(null);
  const isReady = useRef(false);
  const pendingMessages = useRef<object[]>([]);

  const lat = location?.latitude ?? 51.5074;
  const lng = location?.longitude ?? -0.1278;
  const routeJson = JSON.stringify(routeCoords.map((c) => [c.latitude, c.longitude]));

  function postMessage(msg: object) {
    if (!isReady.current) { pendingMessages.current.push(msg); return; }
    webviewRef.current?.postMessage(JSON.stringify(msg));
  }

  useEffect(() => {
    if (!location) return;
    postMessage({ type: 'location', lat: location.latitude, lng: location.longitude });
  }, [location]);

  useEffect(() => {
    postMessage({ type: 'route', coords: routeCoords.map((c) => [c.latitude, c.longitude]) });
  }, [routeCoords]);

  useEffect(() => {
    postMessage({ type: 'toggleHeatmap', visible: showHeatmap });
  }, [showHeatmap]);

  useEffect(() => {
    postMessage({ type: 'dangers', items: dangers });
  }, [dangers]);

  function onReady() {
    isReady.current = true;
    for (const msg of pendingMessages.current) {
      webviewRef.current?.postMessage(JSON.stringify(msg));
    }
    pendingMessages.current = [];
    postMessage({ type: 'toggleHeatmap', visible: showHeatmap });
    if (routeCoords.length > 0) {
      postMessage({ type: 'route', coords: routeCoords.map((c) => [c.latitude, c.longitude]) });
    }
  }

  function onMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'crimeData' && onCrimeData) {
        onCrimeData(msg.points);
      }
      if (msg.type === 'longPress' && onMapLongPress) {
        onMapLongPress(msg.lat, msg.lng);
      }
      if (msg.type === 'dangerTap' && onDangerTap) {
        onDangerTap(msg.id);
      }
    } catch {}
  }

  const now = new Date();
  now.setMonth(now.getMonth() - 2);
  const apiDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

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
  var TILE_SIZE = 0.05;
  var CACHE_TTL = 6 * 60 * 60 * 1000;
  var API_DATE = '${apiDate}';
  var HIGH_RISK = new Set(['violent-crime','robbery','theft-from-the-person','public-order','possession-of-weapons']);

  var map = L.map('map', { zoomControl: false }).setView([${lat}, ${lng}], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd', maxZoom: 19
  }).addTo(map);

  var userMarker = L.circleMarker([${lat}, ${lng}], {
    radius: 8, fillColor: '#208AEF', color: '#fff', weight: 2, fillOpacity: 1
  }).addTo(map);

  var routeLayer = null;
  var heatLayer = null;
  var heatVisible = true;
  var allPoints = [];
  var fetchedTiles = new Set();
  var fetchQueue = [];
  var fetching = false;
  var dangerMarkers = {};

  // Long-press detection
  var pressTimer = null;
  map.on('mousedown touchstart', function(e) {
    pressTimer = setTimeout(function() {
      var latlng = e.latlng || (e.touches && e.touches[0] ? map.mouseEventToLatLng(e.touches[0]) : null);
      if (!latlng) return;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'longPress', lat: latlng.lat, lng: latlng.lng }));
    }, 600);
  });
  map.on('mouseup touchend touchcancel', function() { clearTimeout(pressTimer); });
  map.on('move', function() { clearTimeout(pressTimer); });

  var initCoords = ${routeJson};
  if (initCoords.length > 0) {
    routeLayer = L.polyline(initCoords, { color: '#208AEF', weight: 5 }).addTo(map);
    map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
  }

  function tileKey(latT, lngT) { return 'ct_' + latT + '_' + lngT; }

  function getCached(latT, lngT) {
    try {
      var raw = localStorage.getItem(tileKey(latT, lngT));
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (Date.now() - obj.ts > CACHE_TTL) { localStorage.removeItem(tileKey(latT, lngT)); return null; }
      return obj.data;
    } catch(e) { return null; }
  }

  function setCache(latT, lngT, data) {
    try { localStorage.setItem(tileKey(latT, lngT), JSON.stringify({ data: data, ts: Date.now() })); } catch(e) {}
  }

  function rebuildHeatmap() {
    if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
    if (!heatVisible || allPoints.length === 0) return;
    var grid = {};
    var GRID = 0.002;
    for (var i = 0; i < allPoints.length; i++) {
      var p = allPoints[i];
      var gx = Math.round(p[0] / GRID);
      var gy = Math.round(p[1] / GRID);
      var k = gx + '_' + gy;
      if (!grid[k]) grid[k] = { lat: gx * GRID, lng: gy * GRID, count: 0 };
      grid[k].count++;
    }
    var hotspots = Object.values(grid).sort(function(a, b) { return b.count - a.count; }).slice(0, 300);
    var maxCount = hotspots[0] ? hotspots[0].count : 1;
    var heat = hotspots.map(function(h) { return [h.lat, h.lng, h.count / maxCount]; });
    heatLayer = L.heatLayer(heat, {
      radius: 18, blur: 12, minOpacity: 0.2, maxZoom: 18,
      gradient: { 0.3: '#ffffb2', 0.6: '#fd8d3c', 0.85: '#f03b20', 1.0: '#bd0026' }
    }).addTo(map);
  }

  function addPoints(pts) {
    for (var i = 0; i < pts.length; i++) { allPoints.push(pts[i]); }
    rebuildHeatmap();
    var highRisk = allPoints.filter(function(p) { return HIGH_RISK.has(p[2]); });
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'crimeData',
      points: highRisk.map(function(p) { return { lat: p[0], lng: p[1], category: p[2] }; })
    }));
  }

  function fetchNextInQueue() {
    if (fetching || fetchQueue.length === 0) return;
    var tile = fetchQueue.shift();
    var latT = tile[0], lngT = tile[1];
    var cached = getCached(latT, lngT);
    if (cached) { addPoints(cached); fetchNextInQueue(); return; }
    fetching = true;
    var minLat = latT * TILE_SIZE, minLng = lngT * TILE_SIZE;
    var maxLat = minLat + TILE_SIZE, maxLng = minLng + TILE_SIZE;
    var poly = [minLat+','+minLng, minLat+','+maxLng, maxLat+','+maxLng, maxLat+','+minLng].join(':');
    var url = 'https://data.police.uk/api/crimes-street/all-crime?poly=' + poly + '&date=' + API_DATE;
    fetch(url)
      .then(function(r) { return r.ok ? r.json() : []; })
      .then(function(raw) {
        var pts = raw.map(function(c) {
          return [parseFloat(c.location.latitude), parseFloat(c.location.longitude), c.category];
        });
        setCache(latT, lngT, pts);
        addPoints(pts);
      })
      .catch(function() {})
      .finally(function() { fetching = false; fetchNextInQueue(); });
  }

  function enqueueTilesForBounds(b) {
    if (map.getZoom() < 13) return;
    var minLat = b.getSouth(), minLng = b.getWest();
    var maxLat = b.getNorth(), maxLng = b.getEast();
    var la0 = Math.floor(minLat / TILE_SIZE);
    var la1 = Math.floor(maxLat / TILE_SIZE);
    var ln0 = Math.floor(minLng / TILE_SIZE);
    var ln1 = Math.floor(maxLng / TILE_SIZE);
    for (var la = la0; la <= la1; la++) {
      for (var ln = ln0; ln <= ln1; ln++) {
        var id = la + '_' + ln;
        if (!fetchedTiles.has(id)) {
          fetchedTiles.add(id);
          fetchQueue.push([la, ln]);
        }
      }
    }
    fetchNextInQueue();
  }

  var moveTimer = null;
  map.on('moveend', function() {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(function() { enqueueTilesForBounds(map.getBounds()); }, 400);
  });

  map.whenReady(function() { enqueueTilesForBounds(map.getBounds()); });

  function handleMessage(e) {
    var msg;
    try { msg = JSON.parse(e.data); } catch(err) { return; }
    if (msg.type === 'location') {
      userMarker.setLatLng([msg.lat, msg.lng]);
      map.setView([msg.lat, msg.lng]);
    }
    if (msg.type === 'route') {
      if (routeLayer) map.removeLayer(routeLayer);
      routeLayer = null;
      if (msg.coords.length > 0) {
        routeLayer = L.polyline(msg.coords, { color: '#208AEF', weight: 5 }).addTo(map);
        map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
      }
    }
    if (msg.type === 'toggleHeatmap') {
      heatVisible = msg.visible;
      rebuildHeatmap();
    }
    if (msg.type === 'dangers') {
      // Remove old markers
      Object.values(dangerMarkers).forEach(function(m) { map.removeLayer(m); });
      dangerMarkers = {};
      msg.items.forEach(function(d) {
        var icon = L.divIcon({
          className: '',
          html: '<div style="font-size:24px;line-height:1;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.5))">' + d.icon + '</div>',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        var m = L.marker([d.lat, d.lng], { icon: icon }).addTo(map);
        m.on('click', function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dangerTap', id: d.id }));
        });
        dangerMarkers[d.id] = m;
      });
    }
  }

  document.addEventListener('message', handleMessage);
  window.addEventListener('message', handleMessage);
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
        onLoadEnd={onReady}
        onMessage={onMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
});
