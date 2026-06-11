import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Building } from '../types';
import { 
  ZoomIn, 
  ZoomOut, 
  Layers, 
  Maximize2, 
  X, 
  MapPin, 
  Orbit, 
  Database, 
  FileText,
  User,
  Clock,
  Compass,
  Navigation,
  Search,
  Ruler,
  Trash2,
  Check
} from 'lucide-react';

interface InteractiveMapProps {
  activeRecords: Building[];
  selectedMapPoint: Building | null;
  onSelectMapPoint: (point: Building | null) => void;
  lang: string;
  t: any;
  onShowDetails: (point: Building) => void;
}

export function getLatLngForLocation(locationStr: string): [number, number] {
  const norm = (locationStr || '').toLowerCase();
  if (norm.includes('yingtan') || norm.includes('鹰潭')) {
    return [28.2618, 117.0312];
  }
  if (norm.includes('nanchang') || norm.includes('南昌')) {
    return [28.6820, 115.8579];
  }
  if (norm.includes('jiujiang') || norm.includes('九江')) {
    return [29.7050, 115.9918];
  }
  if (norm.includes('yichun') || norm.includes('宜春')) {
    return [27.8151, 114.3911];
  }
  if (norm.includes('shangrao') || norm.includes('上饶')) {
    return [28.4542, 117.9431];
  }
  if (norm.includes('fuzhou') || norm.includes('抚州')) {
    return [27.9859, 116.3582];
  }
  if (norm.includes('ganzhou') || norm.includes('赣州')) {
    return [25.8311, 114.9348];
  }
  
  // Custom hash fallback centered around Jiangxi to prevent blank markers
  let hash = 0;
  for (let i = 0; i < locationStr.length; i++) {
    hash = locationStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const lat = 25.5 + Math.abs((hash * 0.017) % 4);
  const lng = 114.0 + Math.abs((hash * 0.031) % 4);
  return [lat, lng];
}

export function getLatLngForBuilding(building: Building): [number, number] {
  if (building && typeof building.latitude === 'number' && typeof building.longitude === 'number' && building.latitude !== 0 && building.longitude !== 0) {
    return [building.latitude, building.longitude];
  }
  return getLatLngForLocation(building?.location || '');
}

// Coordinate plotter helper for Chinese and custom provinces (SVG view)
function getCoordsForLocationSVG(locationStr: string): { x: number; y: number } {
  const norm = (locationStr || '').toLowerCase();
  if (norm.includes('yingtan') || norm.includes('鹰潭')) {
    return { x: 55, y: 65 };
  }
  if (norm.includes('nanchang') || norm.includes('南昌')) {
    return { x: 42, y: 55 };
  }
  if (norm.includes('jiujiang') || norm.includes('九江')) {
    return { x: 44, y: 40 };
  }
  if (norm.includes('yichun') || norm.includes('宜春')) {
    return { x: 28, y: 60 };
  }
  if (norm.includes('shangrao') || norm.includes('上饶')) {
    return { x: 74, y: 55 };
  }
  if (norm.includes('fuzhou') || norm.includes('抚州')) {
    return { x: 58, y: 78 };
  }
  if (norm.includes('ganzhou') || norm.includes('赣州')) {
    return { x: 35, y: 88 };
  }
  let hash = 0;
  for (let i = 0; i < locationStr.length; i++) {
    hash = locationStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const x = 20 + Math.abs((hash * 23) % 65);
  const y = 20 + Math.abs((hash * 47) % 65);
  return { x, y };
}

type MapMode = 'interactive' | 'classic';
type TileProvider = 'gaode' | 'gaode_satellite' | 'osm';

export default function InteractiveMap({
  activeRecords,
  selectedMapPoint,
  onSelectMapPoint,
  lang,
  t,
  onShowDetails
}: InteractiveMapProps) {
  const [mapMode, setMapMode] = useState<MapMode>('interactive');
  const [tileProvider, setTileProvider] = useState<TileProvider>('gaode');

  // Live GPS Tracking state for mobilers/surveyors
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const handleLocateUser = () => {
    if (!navigator.geolocation) {
      alert(lang === 'id' ? 'GPS tidak didukung di ponsel/browser Anda.' : '手机/浏览器不支持GPS定位。');
      return;
    }
    setIsLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation([lat, lng]);
        setIsLocatingUser(false);

        if (mapInstanceRef.current) {
          const map = mapInstanceRef.current;
          map.setView([lat, lng], 13, { animate: true });

          if (userMarkerRef.current) {
            map.removeLayer(userMarkerRef.current);
          }

          const pulseHtml = `
            <div class="relative flex items-center justify-center w-8 h-8">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-40"></span>
              <span class="relative inline-flex rounded-full h-4 w-4 bg-blue-600 border border-white shadow-md"></span>
            </div>
          `;
          const pulseIcon = L.divIcon({
            html: pulseHtml,
            className: 'user-pulse-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });

          const userMarker = L.marker([lat, lng], { icon: pulseIcon });
          userMarker.bindTooltip(lang === 'id' ? 'Posisi Saya Sekarang' : '当前我的位置').addTo(map);
          userMarkerRef.current = userMarker;
        }
      },
      (error) => {
        setIsLocatingUser(false);
        console.error("GPS user location failed", error);
        alert(lang === 'id' ? 'Gagal mendapatkan sinyal GPS Anda.' : '无法获取精准 GPS 反馈。');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Interactive Map states (for internal zoom of programmatic buttons)
  const [zoomLevel, setZoomLevel] = useState<number>(8);

  // SVG Mode states
  const [svgZoom, setSvgZoom] = useState<number>(1);

  // Drawing & Distance Measurement states
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<L.LatLng[]>([]);

  // Ref tracking measuring state for event listeners
  const isMeasuringRef = useRef(isMeasuring);
  useEffect(() => {
    isMeasuringRef.current = isMeasuring;
  }, [isMeasuring]);

  // Online Geocoding results using Nominatim (OpenStreetMap)
  const [onlineSearchResults, setOnlineSearchResults] = useState<Array<{
    type: 'online';
    name: string;
    description: string;
    latlng: [number, number];
  }>>([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);

  // Search input state
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Searched target location (GPS pinpoint marker state for global searches)
  const [searchedLocation, setSearchedLocation] = useState<{
    latlng: [number, number];
    name: string;
    description: string;
    type: 'preset' | 'online';
  } | null>(null);

  // Online Fetch geocoding with debounce (600ms)
  useEffect(() => {
    const query = mapSearchQuery.trim();
    if (query.length < 2) {
      setOnlineSearchResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearchingOnline(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&accept-language=${lang === 'id' ? 'id,en' : 'zh,en'}`
        );
        const data = await response.json();
        if (Array.isArray(data)) {
          const formatted = data.map((item: any) => {
            const shortName = item.name || item.display_name.split(',')[0] || query;
            return {
              type: 'online' as const,
              name: shortName,
              description: item.display_name,
              latlng: [parseFloat(item.lat), parseFloat(item.lon)] as [number, number]
            };
          });
          setOnlineSearchResults(formatted);
        }
      } catch (err) {
        console.error('Failed to geocode via Nominatim', err);
      } finally {
        setIsSearchingOnline(false);
      }
    }, 600);

    return () => clearTimeout(delayDebounceFn);
  }, [mapSearchQuery, lang]);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.FeatureGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const secondaryLabelLayerRef = useRef<L.TileLayer | null>(null);
  const measureLayerRef = useRef<L.FeatureGroup | null>(null);
  const searchedMarkerLayerRef = useRef<L.FeatureGroup | null>(null);

  // Group activeRecords by unique physical building (combination of normalized name & location)
  const pooledBuildings = useMemo(() => {
    const groups: { [key: string]: Building[] } = {};
    
    activeRecords.forEach(rec => {
      const key = `${rec.name.trim().toLowerCase()}|||${(rec.location || '').trim().toLowerCase()}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(rec);
    });

    return Object.values(groups).map((recs, index) => {
      // User Rules for Building Categorization/Coloring:
      // 1 (survey only) -> Yellow (kuning)
      // 1 & 2 (survey & line) -> Black (hitam)
      // 1, 2, 3 (survey, line & installation) -> Red (merah)
      const hasSurvey = recs.some(r => r.category === 'survey');
      const hasLine = recs.some(r => r.category === 'line');
      const hasInstallation = recs.some(r => r.category === 'installation');

      let highestCategory: 'installation' | 'line' | 'survey' = 'survey';

      if (hasSurvey && hasLine && hasInstallation) {
        highestCategory = 'installation'; // Merah (Red)
      } else if (hasSurvey && hasLine) {
        highestCategory = 'line'; // Hitam (Black)
      } else if (hasSurvey) {
        highestCategory = 'survey'; // Kuning (Yellow)
      } else {
        // Fallbacks for direct/partial entries that don't follow sequential order
        if (hasInstallation) {
          highestCategory = 'installation';
        } else if (hasLine) {
          highestCategory = 'line';
        } else {
          highestCategory = 'survey';
        }
      }

      let representativeRecord = recs[0];
      if (highestCategory === 'installation') {
        representativeRecord = recs.find(r => r.category === 'installation') || recs[0];
      } else if (highestCategory === 'line') {
        representativeRecord = recs.find(r => r.category === 'line') || recs[0];
      } else {
        representativeRecord = recs.find(r => r.category === 'survey') || recs[0];
      }

      return {
        id: `gb_${index}_${representativeRecord.id}`,
        name: representativeRecord.name,
        location: representativeRecord.location,
        highestCategory,
        records: recs,
        representativeRecord
      };
    });
  }, [activeRecords]);

  // Find dynamic metadata related to the selected popup map point
  const selectedGroupedBuilding = useMemo(() => {
    if (!selectedMapPoint) return null;
    return pooledBuildings.find(gb => 
      gb.name.trim().toLowerCase() === selectedMapPoint.name.trim().toLowerCase() &&
      gb.location.trim().toLowerCase() === selectedMapPoint.location.trim().toLowerCase()
    );
  }, [selectedMapPoint, pooledBuildings]);

  // Total distance calculation for drawing path
  const totalDistance = useMemo(() => {
    if (measurePoints.length < 2) return 0;
    let dist = 0;
    for (let i = 0; i < measurePoints.length - 1; i++) {
      dist += measurePoints[i].distanceTo(measurePoints[i + 1]);
    }
    return dist; // in meters
  }, [measurePoints]);

  const formatDistance = (m: number) => {
    if (m < 1000) {
      return `${m.toFixed(1)} m`;
    }
    return `${(m / 1000).toFixed(2)} km`;
  };

  // Search autocomplete list based on databases, presets, and dynamic online Nominatim results
  const mapSearchSuggestionsValue = useMemo(() => {
    const query = mapSearchQuery.trim().toLowerCase();
    if (!query) return [];

    const results: Array<{
      type: 'site' | 'preset' | 'online';
      name: string;
      description: string;
      latlng: [number, number];
      originalItem?: any;
    }> = [];

    // 1. Search in active pooled sites
    pooledBuildings.forEach(gb => {
      const item = gb.representativeRecord;
      const name = gb.name;
      const loc = gb.location;
      if (name.toLowerCase().includes(query) || loc.toLowerCase().includes(query)) {
        results.push({
          type: 'site',
          name,
          description: `${item.province} - ${item.city} | ${loc}`,
          latlng: getLatLngForBuilding(item),
          originalItem: item
        });
      }
    });

    // 2. Search in presets
    const presets = [
      { name: 'Yingtan / 鹰潭', latlng: [28.2618, 117.0312] },
      { name: 'Nanchang / 南昌', latlng: [28.6820, 115.8579] },
      { name: 'Jiujiang / 九江', latlng: [29.7050, 115.9918] },
      { name: 'Yichun / 宜春', latlng: [27.8151, 114.3911] },
      { name: 'Shangrao / 上饶', latlng: [28.4542, 117.9431] },
      { name: 'Fuzhou / 抚州', latlng: [27.9859, 116.3582] },
      { name: 'Ganzhou / 赣州', latlng: [25.8311, 114.9348] },
      { name: 'Jakarta (Indonesia)', latlng: [-6.2088, 106.8456] },
      { name: 'Surabaya (Indonesia)', latlng: [-7.2575, 112.7521] },
      { name: 'Bandung (Indonesia)', latlng: [-6.9175, 107.6191] },
      { name: 'Medan (Indonesia)', latlng: [3.5952, 98.6722] },
      { name: 'Semarang (Indonesia)', latlng: [-6.9667, 110.4167] },
    ];

    presets.forEach(p => {
      if (p.name.toLowerCase().includes(query)) {
        results.push({
          type: 'preset',
          name: p.name,
          description: lang === 'id' ? 'Kota Utama' : '主要城市',
          latlng: p.latlng as [number, number]
        });
      }
    });

    // 3. Online Nominatim geocoding results
    onlineSearchResults.forEach(item => {
      // Prevent duplicates by comparing distance
      const isAltDuplicate = results.some(
        r => Math.abs(r.latlng[0] - item.latlng[0]) < 0.005 && Math.abs(r.latlng[1] - item.latlng[1]) < 0.005
      );
      if (!isAltDuplicate) {
        results.push({
          type: 'online',
          name: item.name,
          description: item.description,
          latlng: item.latlng
        });
      }
    });

    return results.slice(0, 10); // Max 10 suggestions
  }, [mapSearchQuery, pooledBuildings, lang, onlineSearchResults]);

  // SVG zoom transform style helper
  const zoomedStyle = useMemo(() => ({
    transform: `scale(${svgZoom})`,
    transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
  }), [svgZoom]);

  // Leaflet Tile provider configurations
  const providers = {
    gaode: {
      name: lang === 'id' ? 'Peta Gaode (Standard)' : '高德地图 (标准路网)',
      url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      subdomains: ['1', '2', '3', '4']
    },
    gaode_satellite: {
      name: lang === 'id' ? 'Satelit Gaode' : '高德地图 (高清卫星)',
      url: 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
      subdomains: ['1', '2', '3', '4'],
      labelUrl: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}' // Labels over satellite
    },
    osm: {
      name: 'OpenStreetMap (OSM)',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: ['a', 'b', 'c']
    }
  };

  // Initialize and update the Leaflet map
  useEffect(() => {
    if (mapMode !== 'interactive' || !mapContainerRef.current) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      return;
    }

    // 1. Instantiate the map if not already created
    if (!mapInstanceRef.current) {
      const defaultCenter: [number, number] = [28.2618, 117.0312]; // Center at Yingtan
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: zoomLevel,
        zoomControl: false, // Customized buttons
        attributionControl: true
      });
      mapInstanceRef.current = map;

      // Create feature group for active markers
      const markerGroup = L.featureGroup().addTo(map);
      markersLayerRef.current = markerGroup;

      // Create feature group for measurements
      const measureGroup = L.featureGroup().addTo(map);
      measureLayerRef.current = measureGroup;

      // Create feature group for searched geocoding milestones
      const searchedMarkerGroup = L.featureGroup().addTo(map);
      searchedMarkerLayerRef.current = searchedMarkerGroup;

      // Track zoom level updates
      map.on('zoomend', () => {
        setZoomLevel(map.getZoom());
      });
    }

    const map = mapInstanceRef.current;

    // 2. Setup Tile layers dynamically according to selection
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    if (secondaryLabelLayerRef.current) {
      map.removeLayer(secondaryLabelLayerRef.current);
    }

    const activeProv = providers[tileProvider];
    const tileLayer = L.tileLayer(activeProv.url, {
      subdomains: activeProv.subdomains,
      maxZoom: 18,
      attribution: '&copy; <a href="https://ditu.amap.com/" target="_blank">高德地图 Amap</a>'
    });
    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;

    // Add labels overlay if it's satellite mode
    if (tileProvider === 'gaode_satellite' && activeProv.labelUrl) {
      const labelsLayer = L.tileLayer(activeProv.labelUrl, {
        subdomains: activeProv.subdomains,
        maxZoom: 18
      });
      labelsLayer.addTo(map);
      secondaryLabelLayerRef.current = labelsLayer;
    }

    // 3. Clear and repopulate markers with dynamic star styling aligning with stage priority
    if (markersLayerRef.current) {
      markersLayerRef.current.clearLayers();

      pooledBuildings.forEach((gb) => {
        const item = gb.representativeRecord;
        const [lat, lng] = getLatLngForBuilding(item);
        const highestCategory = gb.highestCategory;

        // Custom prioritization: installation (red star), line/pengukuran (black star), survey (yellow star)
        let fillColor = '#fbbf24'; // DEFAULT Gold/Yellow
        let strokeColor = '#b45309';
        let pingColorClass = 'bg-amber-400';

        if (highestCategory === 'installation') {
          fillColor = '#dc2626'; // Red star
          strokeColor = '#ffffff';
          pingColorClass = 'bg-red-500';
        } else if (highestCategory === 'line') {
          fillColor = '#0f172a'; // Black star / charcoal
          strokeColor = '#ffffff';
          pingColorClass = 'bg-slate-500';
        } else {
          fillColor = '#eab308'; // Yellow star / Gold
          strokeColor = '#ffffff';
          pingColorClass = 'bg-amber-400';
        }

        const customHtml = `
          <div class="relative flex items-center justify-center w-8 h-8">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${pingColorClass} opacity-30"></span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-7 h-7 relative drop-shadow-md z-10 transition-all hover:scale-130 cursor-pointer" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>
          </div>
        `;

        const customIcon = L.divIcon({
          html: customHtml,
          className: 'custom-leaflet-div-icon',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        const marker = L.marker([lat, lng], { icon: customIcon });
        
        // Marker click handler programmatically delegates to representing building record or adds to measurement path if measuring mode is active
        marker.on('click', (evt) => {
          if (isMeasuringRef.current) {
            L.DomEvent.stopPropagation(evt as any);
            const latlng = L.latLng(lat, lng);
            setMeasurePoints((prev) => {
              if (prev.length > 0 && prev[prev.length - 1].lat === latlng.lat && prev[prev.length - 1].lng === latlng.lng) {
                return prev;
              }
              return [...prev, latlng];
            });
          } else {
            onSelectMapPoint(item);
            map.setView([lat, lng], Math.max(map.getZoom(), 11), { animate: true });
          }
        });

        markersLayerRef.current?.addLayer(marker);
      });

      // Fit map bounds to encompass all active elements nicely
      const group = markersLayerRef.current;
      if (group.getLayers().length > 0) {
        try {
          const bounds = group.getBounds();
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
        } catch (_) {}
      }
    }

    // Trigger map invalidation on window or frame resize to prevent grey tiles
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

  }, [mapMode, pooledBuildings]);

  // Handle tile provider updates responsively
  useEffect(() => {
    if (mapMode === 'interactive' && mapInstanceRef.current) {
      const map = mapInstanceRef.current;
      if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
      }
      if (secondaryLabelLayerRef.current) {
        map.removeLayer(secondaryLabelLayerRef.current);
      }

      const activeProv = providers[tileProvider];
      const tileLayer = L.tileLayer(activeProv.url, {
        subdomains: activeProv.subdomains,
        maxZoom: 18,
        attribution: tileProvider === 'osm' 
          ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' 
          : '&copy; <a href="https://ditu.amap.com/" target="_blank">高德地图 Amap</a>'
      });
      tileLayer.addTo(map);
      tileLayerRef.current = tileLayer;

      if (tileProvider === 'gaode_satellite' && activeProv.labelUrl) {
        const labelsLayer = L.tileLayer(activeProv.labelUrl, {
          subdomains: activeProv.subdomains,
          maxZoom: 18
        });
        labelsLayer.addTo(map);
        secondaryLabelLayerRef.current = labelsLayer;
      }
    }
  }, [tileProvider]);

  // Handle selectedMapPoint changes programmatically (pan to target)
  useEffect(() => {
    if (mapMode === 'interactive' && mapInstanceRef.current && selectedMapPoint) {
      const [lat, lng] = getLatLngForBuilding(selectedMapPoint);
      mapInstanceRef.current.setView([lat, lng], 12, { animate: true });
    }
  }, [selectedMapPoint]);

  // Render searched location pinpoint marker with beautiful glowing aura pulses
  useEffect(() => {
    if (mapMode !== 'interactive' || !mapInstanceRef.current || !searchedMarkerLayerRef.current) return;
    const map = mapInstanceRef.current;
    const layerGroup = searchedMarkerLayerRef.current;

    layerGroup.clearLayers();

    if (!searchedLocation) return;

    const [lat, lng] = searchedLocation.latlng;

    const customHtml = `
      <div class="relative flex items-center justify-center">
        <!-- Glowing aura wave effect -->
        <span class="absolute inline-flex h-9 w-9 rounded-full bg-red-600 opacity-60 animate-ping"></span>
        <span class="absolute inline-flex h-12 w-12 rounded-full bg-red-500 opacity-20"></span>
        
        <!-- Highly polished visual red search pin matching standard Google Maps design -->
        <svg class="w-8 h-10 drop-shadow-lg filter select-none pointer-events-none transform -translate-y-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C8.13 2 5 5.13 5 9C5 13.9 11.23 21.06 11.53 21.4C11.78 21.68 12.22 21.68 12.47 21.4C12.77 21.06 19 13.9 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="#ef4444" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    `;

    const searchIcon = L.divIcon({
      html: customHtml,
      className: 'searched-marker-pin',
      iconSize: [36, 42],
      iconAnchor: [18, 42]
    });

    const marker = L.marker([lat, lng], { icon: searchIcon });

    // Click handler: either record into distance measurement tool or adjust zoom focus
    marker.on('click', (evt) => {
      if (isMeasuringRef.current) {
        L.DomEvent.stopPropagation(evt as any);
        const latlng = L.latLng(lat, lng);
        setMeasurePoints((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].lat === latlng.lat && prev[prev.length - 1].lng === latlng.lng) {
            return prev;
          }
          return [...prev, latlng];
        });
      } else {
        map.setView([lat, lng], Math.max(map.getZoom(), 12), { animate: true });
        marker.openPopup();
      }
    });

    // Custom leaflet styled popup content
    const labelTitle = lang === 'id' ? 'Hasil Pencarian' : '搜索定位点';
    const cleanAddress = searchedLocation.description ? searchedLocation.description : '';

    const popupContent = `
      <div class="p-3 select-none" style="min-width: 200px; font-family: system-ui, -apple-system, sans-serif;">
        <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
          <span style="font-size: 8px; font-weight: 900; background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; font-family: monospace;">
            ${labelTitle}
          </span>
        </div>
        <h4 style="margin: 0 0 4px 0; font-size: 13px; font-weight: 800; color: #0f172a; line-height: 1.2;">
          ${searchedLocation.name}
        </h4>
        <p style="margin: 0 0 10px 0; font-size: 10px; color: #64748b; line-height: 1.4; max-height: 60px; overflow-y: auto;">
          ${cleanAddress}
        </p>
        <div style="font-family: ui-monospace, monospace; font-size: 9px; font-weight: bold; color: #2563eb; background: #eff6ff; padding: 5px 8px; border-radius: 8px; border: 1px solid #dbeafe; display: flex; flex-direction: column; gap: 2px;">
          <span>Lat: ${lat.toFixed(6)}</span>
          <span>Lon: ${lng.toFixed(6)}</span>
        </div>
      </div>
    `;

    marker.bindPopup(popupContent, {
      closeButton: true,
      offset: [0, -32],
      className: 'custom-leaflet-popup'
    });

    marker.addTo(layerGroup);

    // Auto-open popups so the user instantly notices exact searched details of target path
    const timeout = setTimeout(() => {
      marker.openPopup();
    }, 200);

    return () => clearTimeout(timeout);
  }, [searchedLocation, mapMode, lang]);

  // Cleanup map instance on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      userMarkerRef.current = null;
    };
  }, []);

  // 1. Listen to interactive clicks to record measurement coordinates
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    const handleMapClickForMeasure = (e: L.LeafletMouseEvent) => {
      if (!isMeasuring) return;
      // Capture coordinates
      setMeasurePoints((prev) => [...prev, e.latlng]);
    };

    map.on('click', handleMapClickForMeasure);
    return () => {
      map.off('click', handleMapClickForMeasure);
    };
  }, [isMeasuring]);

  // 2. Render measurement markers and polyline links dynamically
  useEffect(() => {
    if (!mapInstanceRef.current || !measureLayerRef.current) return;
    const layerGroup = measureLayerRef.current;
    layerGroup.clearLayers();

    // Dynamically tweak cursor style for the map stage
    const container = mapInstanceRef.current.getContainer();
    if (container) {
      if (isMeasuring) {
        container.classList.add('cursor-crosshair');
      } else {
        container.classList.remove('cursor-crosshair');
      }
    }

    if (!isMeasuring || measurePoints.length === 0) return;

    measurePoints.forEach((latlng, idx) => {
      const nodeHtml = `
        <div class="relative flex items-center justify-center">
          <span class="absolute inline-flex rounded-full h-5.5 w-5.5 bg-blue-600 hover:bg-rose-600 text-white font-mono text-[10px] font-black items-center justify-center border border-white shadow-md cursor-pointer transition-colors" title="${lang === 'id' ? 'Klik untuk membuang titik ini' : '点击删除此测绘点'}">
            ${idx + 1}
          </span>
        </div>
      `;
      const customNode = L.divIcon({
        html: nodeHtml,
        className: 'custom-measure-node',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });

      const marker = L.marker(latlng, { icon: customNode });
      // Remove point when clicked directly so user can undo / redo easily
      marker.on('click', (evt) => {
        L.DomEvent.stopPropagation(evt as any);
        setMeasurePoints(prev => prev.filter((_, i) => i !== idx));
      });

      marker.addTo(layerGroup);
    });

    if (measurePoints.length > 1) {
      const pathLine = L.polyline(measurePoints, {
        color: '#2563eb',
        weight: 3.5,
        dashArray: '6, 8',
        lineCap: 'round',
        lineJoin: 'round'
      });
      pathLine.addTo(layerGroup);
    }

    return () => {
      if (mapInstanceRef.current) {
        const c = mapInstanceRef.current.getContainer();
        if (c) c.classList.remove('cursor-crosshair');
      }
    };
  }, [measurePoints, isMeasuring, lang]);

  // Zoom commands
  const handleZoomIn = () => {
    if (mapMode === 'interactive') {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.zoomIn();
      }
    } else {
      setSvgZoom(p => Math.min(p + 0.25, 2.5));
    }
  };

  const handleZoomOut = () => {
    if (mapMode === 'interactive') {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.zoomOut();
      }
    } else {
      setSvgZoom(p => Math.max(p - 0.25, 0.75));
    }
  };

  const handleReset = () => {
    if (mapMode === 'interactive') {
      onSelectMapPoint(null);
      if (markersLayerRef.current && mapInstanceRef.current) {
        try {
          const bounds = markersLayerRef.current.getBounds();
          mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
        } catch (_) {
          mapInstanceRef.current.setView([28.2618, 117.0312], 8);
        }
      }
    } else {
      setSvgZoom(1);
      onSelectMapPoint(null);
    }
  };

  return (
    <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-100 flex flex-col gap-5 shadow-xs flex-grow relative animate-fade-in text-slate-700 min-h-[420px] sm:min-h-[500px]">
      
      {/* Map Header containing language details & provider style togglers */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-sans font-black text-xl text-slate-900 flex items-center gap-2">
            <Orbit className="w-5 h-5 text-blue-600 animate-spin-slow" />
            <span>{t.tabMapView}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {lang === 'id' 
              ? 'Tampilan peta interaktif nasional terintegrasi dengan data sensor lapangan.' 
              : '高德地图大数据深度集成，提供精准江西省骨干节点线路与踩点运维数据。'}
          </p>
        </div>

        {/* View Selection Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Main Map Switch (Leaflet Map vs. Classic SVG Diagrams) */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/50 text-[11px] font-bold">
            <button
              onClick={() => setMapMode('interactive')}
              className={`px-3 py-1.5 rounded-lg transition ${mapMode === 'interactive' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              高德/Amap ({lang === 'id' ? 'Aktif' : '实时在线'})
            </button>
            <button
              onClick={() => setMapMode('classic')}
              className={`px-3 py-1.5 rounded-lg transition ${mapMode === 'classic' ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {lang === 'id' ? 'Skema SVG' : '经典拓扑图'}
            </button>
          </div>

          {/* Interactive Map Providers Toggle selector */}
          {mapMode === 'interactive' && (
            <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/50 text-[11px] font-bold">
              <button
                onClick={() => setTileProvider('gaode')}
                className={`px-2.5 py-1.5 rounded-lg transition ${tileProvider === 'gaode' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
              >
                高德路网
              </button>
              <button
                onClick={() => setTileProvider('gaode_satellite')}
                className={`px-2.5 py-1.5 rounded-lg transition ${tileProvider === 'gaode_satellite' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
              >
                高德卫星
              </button>
              <button
                onClick={() => setTileProvider('osm')}
                className={`px-2.5 py-1.5 rounded-lg transition ${tileProvider === 'osm' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
              >
                OSM
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Map Box */}
      <div className="relative flex-grow bg-slate-50 border border-slate-200/50 rounded-2xl overflow-hidden min-h-[380px] flex items-center justify-center">
        
        {/* VIEW A: REAL LEAFLET INTERACTIVE MAP */}
        <div 
          ref={mapContainerRef} 
          className={`absolute inset-0 w-full h-full z-10 transition-opacity duration-300 ${mapMode === 'interactive' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
        />

        {/* VIEW B: CLASSIC BLUEPRINT SVG OUTLINES MAP */}
        {mapMode === 'classic' && (
          <div className="absolute inset-0 w-full h-full flex items-center justify-center p-4 overflow-hidden">
            <div style={zoomedStyle} className="relative w-full h-full max-h-[360px] flex items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 12,25 C 22,22 40,18 60,18 C 72,20 88,38 82,58 C 75,72 58,78 40,82 C 18,78 5,60 12,25 Z" fill="#ebf4ff" stroke="#b9d5ff" strokeWidth="1.2" />
                <path d="M 30,12 C 40,15 50,5 62,5 C 75,10 82,25 78,45 C 68,55 50,58 35,58 C 15,55 10,32 30,12 Z" fill="#f0fff4" stroke="#a7f3d0" strokeWidth="0.8" />
              </svg>

              {/* Plotted static site star markers styled by stage priority */}
              {pooledBuildings.map((gb) => {
                const item = gb.representativeRecord;
                const coords = getCoordsForLocationSVG(item.location);
                const highestCategory = gb.highestCategory;

                let starFill = 'text-amber-500';
                let ratingPing = 'bg-amber-400';
                if (highestCategory === 'installation') {
                  starFill = 'text-red-500';
                  ratingPing = 'bg-red-400';
                } else if (highestCategory === 'line') {
                  starFill = 'text-slate-900';
                  ratingPing = 'bg-slate-400';
                }

                const isActive = selectedMapPoint && 
                  selectedMapPoint.name.trim().toLowerCase() === gb.name.trim().toLowerCase() &&
                  selectedMapPoint.location.trim().toLowerCase() === gb.location.trim().toLowerCase();

                return (
                  <button
                    key={gb.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectMapPoint(item);
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all hover:scale-135 focus:outline-none flex items-center justify-center ${
                      isActive ? 'scale-125 hover:scale-130 filter drop-shadow-md brightness-110' : ''
                    }`}
                    style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
                  >
                    <div className="relative flex items-center justify-center">
                      <span className={`animate-ping absolute inline-flex h-4 w-4 rounded-full opacity-35 ${ratingPing}`}></span>
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        viewBox="0 0 24 24" 
                        fill="currentColor" 
                        className={`w-6 h-6 stroke-white stroke-1 relative z-10 ${starFill}`}
                      >
                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                      </svg>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Dynamic Zooming Overlay Widgets (Fixed at extreme right bottom) */}
        <div 
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-4 right-4 flex flex-col gap-2 z-20 select-none"
        >
          {/* Ruler/Measure Mode Toggle */}
          <button
            onClick={() => {
              setIsMeasuring(!isMeasuring);
              if (isMeasuring) {
                setMeasurePoints([]);
              }
            }}
            className={`w-10 h-10 border rounded-full flex items-center justify-center shadow-md active:scale-95 transition cursor-pointer ${
              isMeasuring 
                ? 'bg-rose-600 border-rose-600 text-white animate-pulse' 
                : 'bg-white hover:bg-slate-50 border-slate-200 text-blue-600'
            }`}
            title={lang === 'id' ? 'Aktifkan Alat Ukur Jarak Peta' : '激活地图测距工具'}
          >
            <Ruler className="w-5 h-5" />
          </button>

          <button
            onClick={handleLocateUser}
            disabled={isLocatingUser}
            className={`w-10 h-10 border rounded-full flex items-center justify-center shadow-md active:scale-95 transition cursor-pointer ${
              isLocatingUser 
                ? 'bg-blue-600 border-blue-600 text-white animate-pulse' 
                : 'bg-white hover:bg-slate-50 border-slate-200 text-blue-600'
            }`}
            title={lang === 'id' ? 'Tampilkan Posisi GPS Saya' : '定位我的位置'}
          >
            <Navigation className="w-5 h-5" />
          </button>
          <button
            onClick={handleZoomIn}
            className="w-10 h-10 bg-white hover:bg-slate-50 border border-slate-200 rounded-full flex items-center justify-center shadow-md active:scale-95 transition text-slate-600 cursor-pointer"
            title={t.zoomIn}
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            onClick={handleZoomOut}
            className="w-10 h-10 bg-white hover:bg-slate-50 border border-slate-200 rounded-full flex items-center justify-center shadow-md active:scale-95 transition text-slate-600 cursor-pointer"
            title={t.zoomOut}
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <button
            onClick={handleReset}
            className="w-10 h-10 bg-white hover:bg-slate-50 border border-slate-200 rounded-full flex items-center justify-center shadow-md active:scale-95 transition text-slate-600 cursor-pointer font-extrabold text-[10px]"
            title={t.resetMap}
          >
            1:1
          </button>
        </div>

        {/* Floating Map Search Overlay */}
        {mapMode === 'interactive' && (
          <div 
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className="absolute top-4 right-4 z-30 w-72 max-w-xs shadow-lg rounded-2xl bg-white/95 backdrop-blur-md border border-slate-100 p-2.5 flex flex-col gap-1 tracking-tight"
          >
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={mapSearchQuery}
                onChange={(e) => {
                  setMapSearchQuery(e.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => setShowSearchResults(true)}
                placeholder={lang === 'id' ? 'Cari koordinat/lokasi/kota...' : '输入并定位地标、城市、测绘点...'}
                className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-hidden transition"
              />
              {isSearchingOnline ? (
                <div className="absolute right-3.5 flex items-center">
                  <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                </div>
              ) : mapSearchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setMapSearchQuery('');
                    setOnlineSearchResults([]);
                    setShowSearchResults(false);
                    setSearchedLocation(null);
                  }}
                  className="absolute right-2.5 text-slate-400 hover:text-slate-600 transition p-[3px] rounded-full hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              ) : null}
            </div>

            {/* Suggestions Dropdown list */}
            {showSearchResults && mapSearchSuggestionsValue.length > 0 && (
              <div className="mt-1 bg-white border border-slate-100 rounded-xl shadow-md divide-y divide-slate-50 max-h-56 overflow-y-auto select-none">
                {mapSearchSuggestionsValue.map((sug, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (mapInstanceRef.current) {
                        const zoomTo = sug.type === 'site' ? 14 : sug.type === 'online' ? 13 : 11;
                        mapInstanceRef.current.setView(sug.latlng, zoomTo, { animate: true });
                        if (sug.originalItem) {
                          onSelectMapPoint(sug.originalItem);
                        }
                      }
                      if (sug.type === 'site') {
                        setSearchedLocation(null);
                      } else {
                        setSearchedLocation({
                          latlng: sug.latlng,
                          name: sug.name,
                          description: sug.description,
                          type: sug.type as 'preset' | 'online'
                        });
                      }
                      setShowSearchResults(false);
                      setMapSearchQuery(sug.name);
                    }}
                    className="w-full text-left p-2 hover:bg-blue-50/50 transition cursor-pointer flex items-start gap-2"
                  >
                    <div className={`p-1 rounded-lg shrink-0 mt-0.5 ${
                        sug.type === 'site' ? 'bg-red-50 text-red-600' :
                        sug.type === 'preset' ? 'bg-amber-50 text-amber-600' :
                        'bg-blue-50 text-blue-600'
                    }`}>
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-800 truncate flex items-center gap-1.5">
                        <span>{sug.name}</span>
                        <span className="text-[8px] px-1 py-0.2 rounded-sm font-black uppercase text-slate-400 bg-slate-100 tracking-wider font-mono scale-[0.9]">
                          {sug.type === 'site' ? (lang === 'id' ? 'Titik' : '测点') :
                           sug.type === 'preset' ? (lang === 'id' ? 'Kota' : '城市') :
                           (lang === 'id' ? 'Global' : '外部')}
                        </span>
                      </p>
                      <p className="text-[9px] text-slate-400 leading-tight mt-0.5 line-clamp-2">{sug.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            {showSearchResults && mapSearchQuery.trim().length >= 2 && mapSearchSuggestionsValue.length === 0 && !isSearchingOnline && (
              <div className="p-3 text-center text-slate-400 text-[10px] font-medium leading-tight">
                {lang === 'id' ? 'Tidak ada lokasi yang cocok' : '未找到相关位置信息'}
              </div>
            )}
          </div>
        )}

        {/* Distance Measurement Control Bar HUD */}
        {isMeasuring && (
          <div 
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-100 shadow-xl flex items-center gap-3 animate-fade-in text-xs min-w-[280px]"
          >
            <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
              <Ruler className="w-4 h-4" />
            </div>
            <div className="flex-grow min-w-0">
              <p className="font-extrabold text-slate-800 flex items-center gap-1.5 leading-none">
                <span>{lang === 'id' ? 'Alat Ukur Jarak Peta' : '地图测距及画线'}</span>
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </p>
              <p className="text-[10px] text-slate-400 mt-1 font-medium leading-none">
                {measurePoints.length === 0 
                  ? (lang === 'id' ? 'Ketuk pada peta untuk membuat titik' : '点击地图节点开始测距')
                  : (lang === 'id' ? `${measurePoints.length} titik terhubung` : `已连接 ${measurePoints.length} 个测点`)}
              </p>
            </div>

            {/* Live calculated value display */}
            {measurePoints.length >= 2 && (
              <div className="font-mono text-xs font-black bg-blue-50 border border-blue-100 text-blue-700 px-2.5 py-1 rounded-xl">
                {formatDistance(totalDistance)}
              </div>
            )}

            {/* Tool commands (Reset drawing) */}
            {measurePoints.length > 0 && (
              <button
                onClick={() => setMeasurePoints([])}
                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg cursor-pointer transition"
                title={lang === 'id' ? 'Hapus Gambar' : '清空当前绘制'}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={() => {
                setIsMeasuring(false);
                setMeasurePoints([]);
              }}
              className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer"
              title={lang === 'id' ? 'Tutup Alat Ukur' : '关闭测距'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Map Pop-up Overlay panel for Selected Marker showing building phase progression */}
        {selectedMapPoint && (
          <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-100 shadow-xl w-[260px] max-w-xs flex flex-col gap-3 animate-fade-in text-xs z-30">
            <div className="flex items-center justify-between gap-3">
              <span className={`px-2.5 py-0.5 text-[9px] uppercase font-black tracking-wider rounded-lg border ${
                selectedMapPoint.category === 'survey' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                selectedMapPoint.category === 'line' ? 'bg-slate-900 text-white border-slate-800' :
                'bg-red-50 text-red-700 border-red-200'
              }`}>
                {selectedMapPoint.category === 'survey' ? t.tabSurveyData :
                 selectedMapPoint.category === 'line' ? t.tabLineData :
                 t.tabInstallData}
              </span>
              <button
                onClick={() => onSelectMapPoint(null)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <h4 className="font-bold text-slate-900 leading-tight block text-sm">{selectedMapPoint.name}</h4>
              <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-300 shrink-0" />
                <span className="truncate">{selectedMapPoint.location}</span>
              </p>
            </div>

            {/* Stepper progress representation describing survey, measurement (line), and installation */}
            {selectedGroupedBuilding && (
              <div className="border-t border-b border-slate-100/70 py-2.5 flex flex-col gap-1.5">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  {lang === 'id' ? 'Kemajuan Pembangunan:' : '工程建设进度:'}
                </p>
                <div className="grid grid-cols-3 gap-1">
                  {/* Step 1: Survey */}
                  <div className={`py-1.5 px-1 rounded-lg border flex flex-col items-center gap-0.5 text-center transition-all ${
                    selectedGroupedBuilding.records.some(r => r.category === 'survey')
                      ? 'bg-amber-50 border-amber-200 text-amber-800 font-bold'
                      : 'bg-slate-50 border-slate-100 text-slate-300'
                  }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                    </svg>
                    <span className="text-[8px] tracking-tight">{lang === 'id' ? 'Survei' : '勘测'}</span>
                  </div>

                  {/* Step 2: Line / Measurement */}
                  <div className={`py-1.5 px-0.5 rounded-lg border flex flex-col items-center gap-0.5 text-center transition-all ${
                    selectedGroupedBuilding.records.some(r => r.category === 'line')
                      ? 'bg-slate-900 text-white border-slate-800 font-bold'
                      : 'bg-slate-50 border-slate-100 text-slate-300'
                  }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                    </svg>
                    <span className="text-[8px] tracking-tight">{lang === 'id' ? 'Line' : '测量'}</span>
                  </div>

                  {/* Step 3: Installation */}
                  <div className={`py-1.5 px-1 rounded-lg border flex flex-col items-center gap-0.5 text-center transition-all ${
                    selectedGroupedBuilding.records.some(r => r.category === 'installation')
                      ? 'bg-red-50 border-red-200 text-red-800 font-bold'
                      : 'bg-slate-50 border-slate-100 text-slate-300'
                  }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                    </svg>
                    <span className="text-[8px] tracking-tight">{lang === 'id' ? 'Pasang' : '安装'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Toggle switch selector to easily load report of other phases/categories of the same physical building */}
            {selectedGroupedBuilding && selectedGroupedBuilding.records.length > 1 && (
              <div className="flex flex-col gap-1 text-[10px]">
                <span className="font-bold text-slate-400">{lang === 'id' ? 'Pilih Laporan Tahap:' : '切换查看的步骤报告:'}</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {selectedGroupedBuilding.records.map((r) => {
                    const isCurrent = selectedMapPoint.id === r.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => onSelectMapPoint(r)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition ${
                          isCurrent 
                            ? 'bg-blue-600 text-white shadow-xs' 
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        {r.category === 'survey' ? (lang === 'id' ? 'Survei' : '勘测') :
                         r.category === 'line' ? (lang === 'id' ? 'Line' : '测量') :
                         (lang === 'id' ? 'Pasang' : '安装')}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1 text-[11px] text-slate-500">
              <p className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-semibold text-slate-700">{lang === 'id' ? 'Operator:' : '操作人:'}</span> 
                <span className="truncate">{selectedMapPoint.operator}</span>
              </p>
              <p className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-semibold text-slate-700">{lang === 'id' ? 'Tanggal:' : '时间:'}</span> 
                <span className="truncate">{selectedMapPoint.operationTime}</span>
              </p>
            </div>

            <button
              onClick={() => onShowDetails(selectedMapPoint)}
              className="w-full mt-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition text-xs text-center cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>{lang === 'id' ? 'Buka Detail Laporan' : '打开详细数据报告'}</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
