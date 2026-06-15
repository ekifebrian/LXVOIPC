import { useState, useEffect, useRef, useMemo } from 'react';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, doc, getDocFromServer, setDoc, deleteDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { Building, Surveyor } from './types';
import Navbar from './components/Navbar';
import BuildingCard from './components/BuildingCard';
import BuildingDetail from './components/BuildingDetail';
import AdminPanel, { isMediaVideo } from './components/AdminPanel';
import LoginView from './components/LoginView';
import InteractiveMap from './components/InteractiveMap';
import TelegramBotConfig from './components/TelegramBotConfig';
import { AnimatePresence, motion } from 'motion/react';
import { 
  LayoutDashboard, 
  Layers, 
  MapPin, 
  Search, 
  Upload, 
  Users, 
  ShieldAlert, 
  Database,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Clock,
  ArrowRight,
  Eye,
  Check,
  AlertCircle,
  X,
  Bot
} from 'lucide-react';
import { Language, translations } from './languages';

const BOOTSTRAPPED_ADMIN_EMAIL = 'ekifebriann16@gmail.com';
const DEMO_ADMIN_EMAIL = 'admin@admin.com';

// 3 Realistic operational Data Center reports for high-fidelity database seed fallbacks
export const REAL_DEMO_RECORDS: Building[] = [
  {
    id: 'rd-1',
    name: '鹰潭政务中心机房踩点记录',
    category: 'survey',
    operator: '张三',
    operationTime: '2026-06-08 10:23',
    location: '江西省 鹰潭市 月湖区',
    province: '江西省',
    city: '鹰潭市',
    district: '月湖区',
    floors: 1,
    description: '完成对政务大楼四层核心机房的现场勘物理测。配线架空间充足，具备双回路不间断备用电源保障。地线和防雷接地布设到位，室外天线支架稳固，机柜防尘网无破损，保障后续专线接入工作顺利进行。',
    gallery: [
      'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1563770660941-20978e870e26?auto=format&fit=crop&w=1200&q=80'
    ],
    longDistanceLines: 5,
    localLines: 12,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    id: 'rd-2',
    name: '鹰潭-南昌干线测线记录',
    category: 'line',
    operator: '李四',
    operationTime: '2026-06-09 14:15',
    location: '江西省 南昌市 青山湖区',
    province: '江西省',
    city: '南昌市',
    district: '青山湖区',
    floors: 1,
    description: '使用高精度双偏振光衰耗仪对南昌高新站至鹰潭主干传输线进行双向纤芯连通测试。双窗口实测平均衰耗性能良好，指标在正常合规范畴之内，多模转换及光收发接口匹配稳固安全。',
    gallery: [
      'https://images.unsplash.com/photo-1601524909162-be87252be298?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=1200&q=80'
    ],
    longDistancePhones: 8,
    localPhones: 24,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  },
  {
    id: 'rd-3',
    name: '鹰潭政务中心安装记录',
    category: 'installation',
    operator: '王五',
    operationTime: '2026-06-10 09:30',
    location: '江西省 鹰潭市 月湖区',
    province: '江西省',
    city: '鹰潭市',
    district: '月湖区',
    floors: 1,
    description: '完成三层电信交换箱及理线架物理上架调试。双绞线线缆引配、光纤跳线接合固定和理线槽理线操作完成，端口标牌规范清晰。电源供电及备份电池通电考查，系统指示灯亮起运行情况正常。',
    gallery: [
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80'
    ],
    longDistanceLines: 4,
    localLines: 8,
    installedLines: 12,
    totalDuration: 6,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system'
  }
];

// Coordinate plotter helper for Chinese and custom provinces
function getCoordsForLocation(locationStr: string): { x: number; y: number } {
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
  // String hash-based coordinates scatter so that custom names distribute perfectly
  let hash = 0;
  for (let i = 0; i < locationStr.length; i++) {
    hash = locationStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const x = 20 + Math.abs((hash * 23) % 65);
  const y = 20 + Math.abs((hash * 47) % 65);
  return { x, y };
}

export default function App() {
  // Global Language settings
  const [lang, setLang] = useState<Language>('zh');

  useEffect(() => {
    localStorage.setItem('app_lang', lang);
  }, [lang]);

  const t = translations[lang];

  // Database list states
  const [dbBuildings, setDbBuildings] = useState<Building[]>([]);
  const [dbSurveyors, setDbSurveyors] = useState<Surveyor[]>([]);
  const [deletedDemoIds, setDeletedDemoIds] = useState<string[]>([]);
  const [connectionValid, setConnectionValid] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Authentication states
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSurveyor, setIsSurveyor] = useState(false);
  const [surveyorName, setSurveyorName] = useState('');
  const wasLoggedInRef = useRef(false);

  // Dynamically synchronize surveyor profile when user logs in
  useEffect(() => {
    if (user && !isAdmin && dbSurveyors.length > 0) {
      const userEmail = user.email?.toLowerCase().trim() || '';
      const matchingSurveyor = dbSurveyors.find(
        (s) => s.id === user.uid || (s.email && s.email.toLowerCase().trim() === userEmail)
      );
      if (matchingSurveyor) {
        setIsSurveyor(true);
        setSurveyorName(matchingSurveyor.name);

        // If the surveyor document ID doesn't match the current logged-in user UID, duplicate it under their UID!
        if (matchingSurveyor.id !== user.uid) {
          const syncSurveyorDoc = async () => {
            try {
              await setDoc(doc(db, 'surveyors', user.uid), {
                name: matchingSurveyor.name,
                phone: matchingSurveyor.phone || 'N/A',
                email: userEmail,
                createdAt: serverTimestamp()
              });
            } catch (err) {
              console.warn("Auto sync of surveyor profile to auth UID document skipped/failed:", err);
            }
          };
          syncSurveyorDoc();
        }
      } else {
        setIsSurveyor(false);
        setSurveyorName('');
      }
    } else {
      setIsSurveyor(false);
      setSurveyorName('');
    }
  }, [user, isAdmin, dbSurveyors]);

  // Sidebar navigation routes
  // 'dashboard' | 'survey_data' | 'line_data' | 'install_data' | 'map_view' | 'search_center' | 'upload_survey' | 'upload_line' | 'upload_install' | 'manage_admins' | 'manage_surveyors'
  const [sidebarTab, setSidebarTab] = useState<string>('login');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filter States inside listings
  const [filterProvince, setFilterProvince] = useState('全部');
  const [filterCity, setFilterCity] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [tabSearchQuery, setTabSearchQuery] = useState('');

  // Selected Detail Modal overlay
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);

  // One-time startup state to remember a record ID from URL
  const [initialUrlRecordId, setInitialUrlRecordId] = useState<string | null>(null);

  // Map state selectors
  const [mapZoom, setMapZoom] = useState(1);
  const [selectedMapPoint, setSelectedMapPoint] = useState<Building | null>(null);

  // Test Firestore Connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        setConnectionValid(true);
      } catch (error) {
        if (error instanceof Error && error.message.includes('offline')) {
          setConnectionValid(false);
        } else {
          setConnectionValid(true);
        }
      }
    }
    testConnection();
  }, []);

  // Listen to Auth State and Realtime Collection updates
  useEffect(() => {
    let unsubAdminCheck: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (unsubAdminCheck) {
        unsubAdminCheck();
        unsubAdminCheck = null;
      }

      if (currentUser) {
        wasLoggedInRef.current = true;
        const userEmail = currentUser.email?.toLowerCase().trim() || '';
        const isSuper = userEmail === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase().trim() || userEmail === DEMO_ADMIN_EMAIL.toLowerCase().trim();
        
        if (isSuper) {
          setIsAdmin(true);
          // Auto register super admin under the official 'admins' collection
          const autoRegAdmin = async () => {
            try {
              const ref = doc(db, 'admins', currentUser.uid);
              const snap = await getDocFromServer(ref);
              if (!snap.exists()) {
                await setDoc(ref, {
                  email: currentUser.email,
                  name: currentUser.displayName || (currentUser.email === DEMO_ADMIN_EMAIL ? 'Demo Admin' : 'Super Admin'),
                  createdAt: serverTimestamp()
                });
              }
            } catch (err) {
              console.warn("Bootstrap admin doc registration skipped", err);
            }
          };
          autoRegAdmin();
        } else {
          // Dyn check admins
          const ref = doc(db, 'admins', currentUser.uid);
          unsubAdminCheck = onSnapshot(ref, (snap) => {
            setIsAdmin(snap.exists());
          }, (err) => {
            console.warn("UID admin verify failed, fallback false", err);
            setIsAdmin(false);
          });
        }
      } else {
        setIsAdmin(false);
        setIsSurveyor(false);
        setSurveyorName('');
        wasLoggedInRef.current = false;
        setSidebarTab('login');
      }
    });

    // Dyn surveyors list listener
    const unsubSurveyors = onSnapshot(collection(db, 'surveyors'), (snapshot) => {
      const items: Surveyor[] = [];
      snapshot.forEach((snap) => {
        items.push({ id: snap.id, ...snap.data() } as Surveyor);
      });
      setDbSurveyors(items);
    }, (error) => {
      console.warn("Could not listen surveyors", error);
    });

    return () => {
      unsubAuth();
      if (unsubAdminCheck) unsubAdminCheck();
      unsubSurveyors();
    };
  }, []);

  // Real-time Records subscription (supports data-isolation for field officers/surveyors vs. admins)
  useEffect(() => {
    if (!user) {
      setDbBuildings([]);
      setLoading(false);
      return;
    }

    let q;
    if (isAdmin) {
      // Admins see everything
      q = collection(db, 'buildings');
    } else if (isSurveyor) {
      // Surveyors can ONLY load and access documents created by themselves (Secure Isolation)
      q = query(collection(db, 'buildings'), where('createdBy', '==', user.uid));
    } else {
      // Wait for roles to initialize fully before subscribing to prevent 'missing permissions' errors
      return;
    }

    setLoading(true);
    const unsubRecords = onSnapshot(q, (snapshot) => {
      const items: Building[] = [];
      snapshot.forEach((snap) => {
        items.push({ id: snap.id, ...snap.data() } as Building);
      });
      // Sort newest first
      items.sort((a, b) => b.operationTime?.localeCompare(a.operationTime) || 0);
      setDbBuildings(items);
      setLoading(false);
    }, (error) => {
      console.warn("Could not load data records from Firestore.", error);
      setLoading(false);
    });

    return () => {
      unsubRecords();
    };
  }, [user, isAdmin, isSurveyor]);

  // Strict gating for unauthorized users on any restricted navigation tabs
  useEffect(() => {
    const isAuthorized = isAdmin || isSurveyor;
    if (!isAuthorized) {
      const restrictedTabs = [
        'dashboard',
        'survey_data', 'line_data', 'install_data', 'map_view', 'search_center',
        'upload_survey', 'upload_line', 'upload_install', 
        'manage_admins', 'manage_surveyors'
      ];
      if (restrictedTabs.includes(sidebarTab)) {
        setSidebarTab('login');
      }
    } else {
      if (sidebarTab === 'login') {
        setSidebarTab('dashboard');
      }
    }
  }, [isAdmin, isSurveyor, sidebarTab]);

  // Use database results directly, defaulting dynamically to pre-made DEMO records if Cloud is blank
  const activeRecords = useMemo(() => {
    // If a user is logged in, we should NEVER fallback to DEMO records for them.
    // This maintains clean data isolation for surveyors and prevents showing un-owned records.
    if (user) {
      return dbBuildings;
    }
    const raw = dbBuildings.length > 0 ? dbBuildings : REAL_DEMO_RECORDS;
    return raw.filter((item) => !deletedDemoIds.includes(item.id));
  }, [dbBuildings, deletedDemoIds, user]);

  // 1. Synchronize URL query parameters into React app state on initial load & layout changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get('tab');
    const urlRecordId = params.get('record');

    if (urlTab) {
      setSidebarTab(urlTab);
    }
    if (urlRecordId) {
      setInitialUrlRecordId(urlRecordId);
    }

    // Capture standard popstate event (e.g. user goes Back / Forward in browser)
    const handlePopState = () => {
      const currentParams = new URLSearchParams(window.location.search);
      const poppedTab = currentParams.get('tab');
      const poppedRecordId = currentParams.get('record');

      if (poppedTab) {
        setSidebarTab(poppedTab);
      } else {
        setSidebarTab(user ? 'dashboard' : 'login');
      }

      if (!poppedRecordId) {
        setSelectedBuilding(null);
      } else {
        setInitialUrlRecordId(poppedRecordId);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [user]);

  // 2. Automatically select record when activeRecords gets populated
  useEffect(() => {
    if (initialUrlRecordId && activeRecords.length > 0) {
      const found = activeRecords.find(item => item.id === initialUrlRecordId);
      if (found) {
        setSelectedBuilding(found);
        setInitialUrlRecordId(null); // Clear once loaded
      }
    }
  }, [activeRecords, initialUrlRecordId]);

  // 3. Synchronize state changes BACK to URL query parameters
  useEffect(() => {
    const currentParams = new URLSearchParams(window.location.search);
    const prevTab = currentParams.get('tab');
    const prevRecordId = currentParams.get('record');

    const nextTab = sidebarTab;
    const nextRecordId = selectedBuilding?.id || null;

    if (prevTab !== nextTab || prevRecordId !== nextRecordId) {
      const newParams = new URLSearchParams();
      if (nextTab && nextTab !== 'login') {
        newParams.set('tab', nextTab);
      }
      if (nextRecordId) {
        newParams.set('record', nextRecordId);
      }

      const queryString = newParams.toString();
      const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}`;
      
      window.history.pushState({ tab: nextTab, record: nextRecordId }, '', newUrl);
    }
  }, [sidebarTab, selectedBuilding]);

  // Convert activeRecords into lat/lng and then project into % percentages to plot on SVG accurately
  const plottedPreviewPoints = useMemo(() => {
    if (activeRecords.length === 0) return [];

    // 1. Convert each record to lat / lng
    const withLatLng = activeRecords.map((item) => {
      let lat = 0;
      let lng = 0;
      if (typeof item.latitude === 'number' && typeof item.longitude === 'number' && item.latitude !== 0 && item.longitude !== 0) {
        lat = item.latitude;
        lng = item.longitude;
      } else {
        const norm = (item.location || '').toLowerCase();
        if (norm.includes('yingtan') || norm.includes('鹰潭')) {
          lat = 28.2618; lng = 117.0312;
        } else if (norm.includes('nanchang') || norm.includes('南昌')) {
          lat = 28.6820; lng = 115.8579;
        } else if (norm.includes('jiujiang') || norm.includes('九江')) {
          lat = 29.7050; lng = 115.9918;
        } else if (norm.includes('yichun') || norm.includes('宜春')) {
          lat = 27.8151; lng = 114.3911;
        } else if (norm.includes('shangrao') || norm.includes('上饶')) {
          lat = 28.4542; lng = 117.9431;
        } else if (norm.includes('fuzhou') || norm.includes('抚州')) {
          lat = 27.9859; lng = 116.3582;
        } else if (norm.includes('ganzhou') || norm.includes('赣州')) {
          lat = 25.8311; lng = 114.9348;
        } else {
          let hash = 0;
          const locStr = item.location || '';
          for (let i = 0; i < locStr.length; i++) {
            hash = locStr.charCodeAt(i) + ((hash << 5) - hash);
          }
          lat = -6.2 + ((Math.abs(hash) % 1500) / 1000) - 0.75;
          lng = 106.8 + ((Math.abs(hash * 31) % 2000) / 1000) - 1.0;
        }
      }
      return { item, lat, lng };
    });

    // 2. Find min and max boundaries
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    withLatLng.forEach((p) => {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    });

    const latSpan = maxLat - minLat;
    const lngSpan = maxLng - minLng;

    const padLat = latSpan > 0.001 ? latSpan * 0.25 : 0.05;
    const padLng = lngSpan > 0.001 ? lngSpan * 0.25 : 0.05;

    const finalMinLat = minLat - padLat;
    const finalMaxLat = maxLat + padLat;
    const finalMinLng = minLng - padLng;
    const finalMaxLng = maxLng + padLng;

    const finalLatSpan = finalMaxLat - finalMinLat || 0.1;
    const finalLngSpan = finalMaxLng - finalMinLng || 0.1;

    return withLatLng.map((p) => {
      const pctX = ((p.lng - finalMinLng) / finalLngSpan) * 100;
      const pctY = 100 - (((p.lat - finalMinLat) / finalLatSpan) * 100);

      // We use 10% to 90% space inside preview frame for gorgeous margins
      const x = Math.max(10, Math.min(90, pctX));
      const y = Math.max(10, Math.min(90, pctY));

      return {
        id: p.item.id,
        building: p.item,
        lat: p.lat,
        lng: p.lng,
        x,
        y,
      };
    });
  }, [activeRecords]);

  // Coordinate labels for decorated preview map grid
  const previewMapGrid = useMemo(() => {
    if (activeRecords.length === 0) return null;

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    activeRecords.forEach((item) => {
      let lat = 0;
      let lng = 0;
      if (typeof item.latitude === 'number' && typeof item.longitude === 'number' && item.latitude !== 0 && item.longitude !== 0) {
        lat = item.latitude;
        lng = item.longitude;
      } else {
        const norm = (item.location || '').toLowerCase();
        if (norm.includes('yingtan') || norm.includes('鹰潭')) {
          lat = 28.2618; lng = 117.0312;
        } else if (norm.includes('nanchang') || norm.includes('南昌')) {
          lat = 28.6820; lng = 115.8579;
        } else if (norm.includes('jiujiang') || norm.includes('九江')) {
          lat = 29.7050; lng = 115.9918;
        } else if (norm.includes('yichun') || norm.includes('宜春')) {
          lat = 27.8151; lng = 114.3911;
        } else if (norm.includes('shangrao') || norm.includes('上饶')) {
          lat = 28.4542; lng = 117.9431;
        } else if (norm.includes('fuzhou') || norm.includes('抚州')) {
          lat = 27.9859; lng = 116.3582;
        } else if (norm.includes('ganzhou') || norm.includes('赣州')) {
          lat = 25.8311; lng = 114.9348;
        } else {
          let hash = 0;
          const locStr = item.location || '';
          for (let i = 0; i < locStr.length; i++) {
            hash = locStr.charCodeAt(i) + ((hash << 5) - hash);
          }
          lat = -6.2 + ((Math.abs(hash) % 1500) / 1000) - 0.75;
          lng = 106.8 + ((Math.abs(hash * 31) % 2000) / 1000) - 1.0;
        }
      }
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    });

    const latSpan = maxLat - minLat;
    const lngSpan = maxLng - minLng;
    const padLat = latSpan > 0.001 ? latSpan * 0.25 : 0.05;
    const padLng = lngSpan > 0.001 ? lngSpan * 0.25 : 0.05;

    const finalMinLat = minLat - padLat;
    const finalMaxLat = maxLat + padLat;
    const finalMinLng = minLng - padLng;
    const finalMaxLng = maxLng + padLng;

    const midLat = (finalMinLat + finalMaxLat) / 2;
    const midLng = (finalMinLng + finalMaxLng) / 2;

    const formatCoord = (val: number, isLat: boolean) => {
      const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
      return `${Math.abs(val).toFixed(2)}°${dir}`;
    };

    return {
      latMin: formatCoord(finalMinLat, true),
      latMax: formatCoord(finalMaxLat, true),
      latMid: formatCoord(midLat, true),
      lngMin: formatCoord(finalMinLng, false),
      lngMax: formatCoord(finalMaxLng, false),
      lngMid: formatCoord(midLng, false),
    };
  }, [activeRecords]);

  // Filter conditions
  const getFilteredListForTab = (categoryKey: string) => {
    return activeRecords.filter(item => {
      const isCorrectTab = item.category === categoryKey;
      const matchesProvince = filterProvince === '全部' || item.province === filterProvince;
      const matchesCity = filterCity === '全部' || item.city === filterCity;
      
      const searchStr = tabSearchQuery.toLowerCase().trim();
      const matchesSearch = !searchStr || (
        item.name?.toLowerCase().includes(searchStr) ||
        item.operator?.toLowerCase().includes(searchStr) ||
        item.location?.toLowerCase().includes(searchStr) ||
        item.description?.toLowerCase().includes(searchStr) ||
        item.province?.toLowerCase().includes(searchStr) ||
        item.city?.toLowerCase().includes(searchStr) ||
        item.district?.toLowerCase().includes(searchStr)
      );

      return isCorrectTab && matchesProvince && matchesCity && matchesSearch;
    });
  };

  // General searching results list (Search Center Tab)
  const searchResultsList = activeRecords.filter(item => {
    // If the sidebar search range is filtered
    const tabMatch = 
      sidebarTab === 'search_center' || 
      (sidebarTab === 'survey_data' && item.category === 'survey') ||
      (sidebarTab === 'line_data' && item.category === 'line') ||
      (sidebarTab === 'install_data' && item.category === 'installation');

    const searchStr = searchQuery.toLowerCase();
    const queryMatch = 
      item.name?.toLowerCase().includes(searchStr) ||
      item.operator?.toLowerCase().includes(searchStr) ||
      item.location?.toLowerCase().includes(searchStr) ||
      item.description?.toLowerCase().includes(searchStr) ||
      item.category?.toLowerCase().includes(searchStr);

    return queryMatch;
  });

  // Calculate high-fidelity metrics counters
  const totalLogsCount = activeRecords.length;
  const surveyLogsCount = activeRecords.filter(r => r.category === 'survey').length;
  const lineLogsCount = activeRecords.filter(r => r.category === 'line').length;
  const installationLogsCount = activeRecords.filter(r => r.category === 'installation').length;

  // Extract unique filter categories list for lists dropdowns
  const availableProvinces = Array.from(new Set(activeRecords.map(r => r.province || '江西省')));
  const availableCities = Array.from(new Set(activeRecords.map(r => r.city || '鹰潭市')));

  // Trigger seeding to cloud
  const handleSeedCloudDatabase = async () => {
    if (!isAdmin) {
      alert(t.notAdminWarningTitle);
      return;
    }
    if (!confirm(t.seedConfirm)) return;

    try {
      for (const demoRec of REAL_DEMO_RECORDS) {
        await setDoc(doc(db, 'buildings', demoRec.id), {
          name: demoRec.name,
          category: demoRec.category,
          operator: demoRec.operator,
          operationTime: demoRec.operationTime,
          location: demoRec.location,
          province: demoRec.province,
          city: demoRec.city,
          district: demoRec.district,
          floors: demoRec.floors,
          gallery: demoRec.gallery,
          description: demoRec.description,
          longDistanceLines: demoRec.longDistanceLines || null,
          localLines: demoRec.localLines || null,
          longDistancePhones: demoRec.longDistancePhones || null,
          localPhones: demoRec.localPhones || null,
          installedLines: demoRec.installedLines || null,
          totalDuration: demoRec.totalDuration || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: user?.uid || 'system'
        });
      }

      // Add default surveyors for ease
      const defaultTim = ['张三', '李四', '王五'];
      for (let i = 0; i < defaultTim.length; i++) {
        await setDoc(doc(db, 'surveyors', `srv_${i}`), {
          name: defaultTim[i],
          phone: `1388888000${i}`,
          createdAt: serverTimestamp()
        });
      }

      alert(t.seedSuccess);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'seeding');
    }
  };

  // Trigger delete specific data log
  const handleDeleteRecord = async (record: Building) => {
    if (!confirm(t.confirmDelete.replace('{name}', record.name))) {
      return;
    }
    try {
      // Local optimistic update
      setDeletedDemoIds(prev => [...prev, record.id]);
      
      // If the record exists in the Firestore database list, delete it from Firestore
      const existsInDb = dbBuildings.some(b => b.id === record.id);
      if (existsInDb) {
        await deleteDoc(doc(db, 'buildings', record.id));
      }
      
      setSelectedBuilding(null);
      alert(t.deleteSuccess);
    } catch (error: any) {
      // Revert optimistic update on failure
      setDeletedDemoIds(prev => prev.filter(id => id !== record.id));
      const isAuthErr = error?.code === 'permission-denied' || error?.message?.includes('permission');
      if (isAuthErr) {
        alert(
          lang === 'id' 
            ? "Izin Ditolak! Harap pastikan akun Anda memiliki otoritas administrator atau Anda adalah pembuat record ini." 
            : "无权删除本记录！请确保您当前使用的是官方的管理员登录，或者您是此条记录的创建人。"
        );
      } else {
        alert("Gagal menghapus: " + (error?.message || error));
      }
    }
  };

  // Save new or modified records
  const handleSaveRecordToFirestore = async (recordData: Partial<Building>, isNew: boolean, id?: string) => {
    if (!isAdmin && !isSurveyor) {
      alert(t.notAdminWarningTitle);
      return;
    }
    const finalId = isNew ? 'datacenter_' + Date.now() : id!;

    // Sanitize any undefined properties to prevent firestore write crashes
    const sanitizedData: Record<string, any> = {};
    Object.entries(recordData).forEach(([key, val]) => {
      if (val !== undefined) {
        sanitizedData[key] = val;
      }
    });

    try {
      await setDoc(doc(db, 'buildings', finalId), {
        ...sanitizedData,
        updatedAt: serverTimestamp(),
        createdAt: isNew ? serverTimestamp() : (editingBuilding?.createdAt || serverTimestamp()),
        createdBy: isNew ? user.uid : (editingBuilding?.createdBy || user.uid)
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `buildings/${finalId}`);
    }
  };

  // Triggers edit routing in sidebar
  const handleTriggerEdit = (record: Building) => {
    setEditingBuilding(record);
    setSelectedBuilding(null);
    // Redirect contextually to the upload forms corresponding tabs
    if (record.category === 'survey') setSidebarTab('upload_survey');
    else if (record.category === 'line') setSidebarTab('upload_line');
    else if (record.category === 'installation') setSidebarTab('upload_install');
  };

  // Floating map zoom selectors
  const zoomedStyle = {
    transform: `scale(${mapZoom})`,
    transformOrigin: 'center center',
    transition: 'transform 0.25s ease-out'
  };

  return (
    <div className="flex h-screen bg-[#f1f3f6] overflow-hidden font-sans selection:bg-blue-100 selection:text-blue-900">
      
      {/* LEFT SIDEBAR (Desktop side drawing / Mobile slide tray drawers) */}
      <aside className={`fixed inset-y-0 left-0 z-40 bg-slate-900 text-slate-300 w-64 transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} transition-transform duration-200 ease-in-out shrink-0 flex flex-col justify-between border-r border-slate-800`}>
        
        <div className="flex flex-col gap-6 overflow-y-auto max-h-[calc(100vh-80px)] p-5 select-none custom-scrollbar">
          
          {/* Main Logo head branding card */}
          <div className="flex items-center gap-2.5 px-1 py-2">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-blue-500/20">
              LX
            </div>
            <div>
              <h1 className="text-white text-base font-black leading-none tracking-tight">
                LXVOIP DATABASE
              </h1>
              <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-500 block mt-1.5 leading-none">
                {lang === 'id' ? 'SISTEM MULTI-WILAYAH' : '集团级多维数据中心'}
              </span>
            </div>
          </div>

          <div className="border-t border-slate-800/80 my-1"></div>

          {/* Navigation link widgets grouped beautifully */}
          <nav className="flex flex-col gap-5 text-xs font-semibold">
            
            {/* Group 1: Dashboards */}
            {(isAdmin || isSurveyor) && (
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => { setSidebarTab('dashboard'); setSidebarOpen(false); }}
                  className={`w-full text-left py-3 px-4 rounded-xl flex items-center gap-3 transition cursor-pointer ${sidebarTab === 'dashboard' ? 'bg-blue-600 text-white font-bold shadow-sm' : 'hover:bg-slate-800/65'}`}
                >
                  <LayoutDashboard className="w-4 h-4 shrink-0" />
                  <span>{t.tabDashboard}</span>
                </button>
              </div>
            )}

            {/* Group 2: Comprehensive Management */}
            {(isAdmin || isSurveyor) && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-500 pl-4">
                  {t.tabDataManage}
                </span>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => { setSidebarTab('survey_data'); setSidebarOpen(false); }}
                    className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center gap-3 transition cursor-pointer ${sidebarTab === 'survey_data' ? 'bg-slate-800 text-white font-bold border-l-4 border-blue-500' : 'hover:bg-slate-800/65'}`}
                  >
                    <Layers className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <span>{t.tabSurveyData}</span>
                  </button>
                  <button
                    onClick={() => { setSidebarTab('line_data'); setSidebarOpen(false); }}
                    className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center gap-3 transition cursor-pointer ${sidebarTab === 'line_data' ? 'bg-slate-800 text-white font-bold border-l-4 border-blue-500' : 'hover:bg-slate-800/65'}`}
                  >
                    <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>{t.tabLineData}</span>
                  </button>
                  <button
                    onClick={() => { setSidebarTab('install_data'); setSidebarOpen(false); }}
                    className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center gap-3 transition cursor-pointer ${sidebarTab === 'install_data' ? 'bg-slate-800 text-white font-bold border-l-4 border-blue-500' : 'hover:bg-slate-800/65'}`}
                  >
                    <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>{t.tabInstallData}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Group 3: Utility maps and search engines */}
            {(isAdmin || isSurveyor) && (
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => { setSidebarTab('map_view'); setSidebarOpen(false); }}
                  className={`w-full text-left py-3 px-4 rounded-xl flex items-center gap-3 transition cursor-pointer ${sidebarTab === 'map_view' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-800/65'}`}
                >
                  <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{t.tabMapView}</span>
                </button>
                <button
                  onClick={() => { setSidebarTab('search_center'); setSidebarOpen(false); }}
                  className={`w-full text-left py-3 px-4 rounded-xl flex items-center gap-3 transition cursor-pointer ${sidebarTab === 'search_center' ? 'bg-blue-600 text-white font-bold' : 'hover:bg-slate-800/65'}`}
                >
                  <Search className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{t.tabSearchCenter}</span>
                </button>
              </div>
            )}

            {/* Group 4: Administrations and reporting channels */}
            {(isAdmin || isSurveyor) && (
              <div className="flex flex-col gap-1.5 border-t border-slate-800/60 pt-4 mt-2">
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-500 pl-4">
                  {t.tabUploadChannel}
                </span>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => { setSidebarTab('upload_survey'); setSidebarOpen(false); }}
                    className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center gap-3 transition cursor-pointer ${sidebarTab === 'upload_survey' ? 'bg-slate-800 text-white font-bold border-l-4 border-blue-500' : 'hover:bg-slate-800/35'}`}
                  >
                    <Upload className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                    <span>{t.tabUploadSurvey}</span>
                  </button>
                  <button
                    onClick={() => { setSidebarTab('upload_line'); setSidebarOpen(false); }}
                    className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center gap-3 transition cursor-pointer ${sidebarTab === 'upload_line' ? 'bg-slate-800 text-white font-bold border-l-4 border-blue-500' : 'hover:bg-slate-800/35'}`}
                  >
                    <Upload className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>{t.tabUploadLine}</span>
                  </button>
                  <button
                    onClick={() => { setSidebarTab('upload_install'); setSidebarOpen(false); }}
                    className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center gap-3 transition cursor-pointer ${sidebarTab === 'upload_install' ? 'bg-slate-800 text-white font-bold border-l-4 border-blue-500' : 'hover:bg-slate-800/35'}`}
                  >
                    <Upload className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>{t.tabUploadInstall}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Group 5: Accounts Directory and Access management */}
            {isAdmin && (
              <div className="flex flex-col gap-1.5 border-t border-slate-800/60 pt-4">
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-500 pl-4">
                  {t.tabAccountManage}
                </span>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => { setSidebarTab('manage_admins'); setSidebarOpen(false); }}
                    className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center gap-3 transition cursor-pointer ${sidebarTab === 'manage_admins' ? 'bg-slate-800 text-white font-bold border-l-4 border-blue-500' : 'hover:bg-slate-800/35'}`}
                  >
                    <Users className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>{t.tabAdminAccount}</span>
                  </button>
                  <button
                    onClick={() => { setSidebarTab('manage_surveyors'); setSidebarOpen(false); }}
                    className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center gap-3 transition cursor-pointer ${sidebarTab === 'manage_surveyors' ? 'bg-slate-800 text-white font-bold border-l-4 border-blue-500' : 'hover:bg-slate-800/35'}`}
                  >
                    <Users className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>{t.tabSurveyorAccount}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Group 6: Telegram Integration */}
            {(isAdmin || isSurveyor) && (
              <div className="flex flex-col gap-1.5 border-t border-slate-800/60 pt-4">
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-500 pl-4">
                  {lang === 'id' ? 'INTEGRASI' : '服务集成'}
                </span>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => { setSidebarTab('telegram_bot'); setSidebarOpen(false); }}
                    className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center gap-3 transition cursor-pointer ${sidebarTab === 'telegram_bot' ? 'bg-slate-800 text-white font-bold border-l-4 border-blue-500' : 'hover:bg-slate-800/35'}`}
                  >
                    <Bot className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>{lang === 'id' ? 'Bot Telegram' : '电报机器人'}</span>
                  </button>
                </div>
              </div>
            )}

          </nav>
        </div>

        {/* Bottom Sidebar gate login action trigger */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-850 select-none">
          {user ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                  {t.adminTag}
                </span>
              </div>
              <p className="text-[10px] font-semibold text-slate-500 truncate" title={user.email}>
                {user.email}
              </p>
            </div>
          ) : (
            <button
              onClick={() => { setSidebarTab('login'); }}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <LayoutDashboard className="w-4 h-4" />
              {lang === 'id' ? 'Login Kredensial' : '管理员登录'}
            </button>
          )}
        </div>
      </aside>

      {/* Mobile backdrop tray dark shield */}
      {sidebarOpen && (
        <div 
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-xs"
        />
      )}

      {/* MAIN VIEW CONTENT CONTAINER */}
      <div className="flex-1 lg:pl-64 flex flex-col h-full overflow-hidden">
        
        {/* Navbar */}
        <Navbar 
          user={user}
          isAdmin={isAdmin}
          lang={lang}
          setLang={setLang}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onLogout={() => setSidebarTab('login')}
        />

        {/* Flexible Workspace Scroll panel */}
        <main className="flex-grow overflow-y-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6 custom-scrollbar bg-[#f5f6f9]">
          
          {connectionValid === false && (
            <div className="bg-amber-50 border border-amber-200/60 p-4 rounded-xl flex items-start gap-2 text-xs text-amber-900 shadow-3xs shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold">{lang === 'id' ? 'Koneksi Cloud Firestore Terputus / Mode Simulator' : '云数据库离线 / 演示演练模式'}</p>
                <p className="text-slate-600 mt-1 leading-relaxed">
                  {lang === 'id' 
                    ? 'Aplikasi berjalan dalam mode simulasi aman. Seluruh data masih tersimpan handal di pelataran cadangan lokal.' 
                    : '检测至云数据库连接超时！系统已无缝启动极速沙盒缓存引擎，数据保存可安全进行。'}
                </p>
              </div>
            </div>
          )}

          {/* ACTIVE ROUTE WORKSPACE ROUTER */}
          
          {/* TAB 1: 控制台首页 (Dashboard Home) */}
          {sidebarTab === 'dashboard' && (
            <div className="flex flex-col gap-6 animate-fade-in">
              
              {/* Top Banner section */}
              <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 rounded-3xl p-6 sm:p-8 text-white relative shadow-md overflow-hidden shrink-0 border border-blue-900/10">
                <div className="absolute -right-12 -top-12 opacity-10 pointer-events-none select-none">
                  <Database className="w-64 h-64" />
                </div>
                <div className="relative z-10 flex flex-col gap-3 max-w-xl">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black tracking-widest bg-white/10 text-blue-200 uppercase w-max">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Terminal {lang === 'id' ? 'Aktif' : '在线中'}
                  </span>
                  <h2 className="font-sans font-black text-2xl sm:text-3xl tracking-tight leading-tight">
                    {t.bannerTitle}
                  </h2>

                </div>
              </div>

              {/* Statistical counter blocks top grid layout */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0 select-none">
                <div className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center justify-between gap-4 shadow-3xs hover:shadow-xs transition duration-200">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">{t.statTotalData}</span>
                    <span className="text-2xl sm:text-3xl font-black text-slate-900 block mt-1">{totalLogsCount}</span>
                  </div>
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                    <Database className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center justify-between gap-4 shadow-3xs hover:shadow-xs transition duration-200">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">{t.statSurveyData}</span>
                    <span className="text-2xl sm:text-3xl font-black text-teal-600 block mt-1">{surveyLogsCount}</span>
                  </div>
                  <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center text-teal-600">
                    <Layers className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center justify-between gap-4 shadow-3xs hover:shadow-xs transition duration-200">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">{t.statLineData}</span>
                    <span className="text-2xl sm:text-3xl font-black text-sky-600 block mt-1">{lineLogsCount}</span>
                  </div>
                  <div className="w-10 h-10 bg-sky-50 rounded-xl flex items-center justify-center text-sky-600">
                    <Layers className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center justify-between gap-4 shadow-3xs hover:shadow-xs transition duration-200">
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">{t.statInstallData}</span>
                    <span className="text-2xl sm:text-3xl font-black text-indigo-600 block mt-1">{installationLogsCount}</span>
                  </div>
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                    <Layers className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* Lower Section Grid layout: Plotted map vs latest documents lists */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Lower left: Plotted Point layout */}
                <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-100 flex flex-col gap-4 shadow-3xs h-[390px]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase font-extrabold tracking-widest text-slate-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>
                      {t.pointPreview}
                    </span>
                    <button
                      onClick={() => setSidebarTab('map_view')}
                      className="text-[11px] font-black text-blue-600 hover:text-blue-700 hover:underline transition uppercase flex items-center gap-1 cursor-pointer"
                    >
                      {lang === 'id' ? 'Peta Interaktif' : '查看交互大图'}
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>

                  {/* SVG map visual container */}
                  <div className="flex-grow bg-slate-50 border border-slate-200/50 rounded-xl overflow-hidden relative flex items-center justify-center">
                    <svg className="w-full h-full max-h-[300px]" viewBox="0 0 100 100" preserveAspectRatio="none">
                      {/* Grid lines indicating coordinate divisions */}
                      <line x1="30" y1="0" x2="30" y2="100" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="3,3" />
                      <line x1="70" y1="0" x2="70" y2="100" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="3,3" />
                      <line x1="0" y1="30" x2="100" y2="30" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="3,3" />
                      <line x1="0" y1="70" x2="100" y2="70" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="3,3" />

                      {/* Display bounding box of records */}
                      {plottedPreviewPoints.length > 2 && (
                        <polygon
                          points={plottedPreviewPoints.map(p => `${p.x},${p.y}`).join(' ')}
                          fill="rgba(59, 130, 246, 0.04)"
                          stroke="rgba(59, 130, 246, 0.15)"
                          strokeWidth="1"
                          strokeDasharray="2,2"
                        />
                      )}

                      {/* Scientific labels showing exact boundary coordinates for geographic accuracy */}
                      {previewMapGrid && (
                        <>
                          <text x="3" y="8" fill="#94a3b8" fontSize="2.8" fontWeight="bold" fontFamily="monospace" className="select-none">{previewMapGrid.latMax}</text>
                          <text x="3" y="94" fill="#94a3b8" fontSize="2.8" fontWeight="bold" fontFamily="monospace" className="select-none">{previewMapGrid.latMin}</text>
                          <text x="76" y="97" fill="#94a3b8" fontSize="2.8" fontWeight="bold" fontFamily="monospace" className="select-none">{previewMapGrid.lngMax}</text>
                          <text x="3" y="97" fill="#94a3b8" fontSize="2.8" fontWeight="bold" fontFamily="monospace" className="select-none">{previewMapGrid.lngMin}</text>
                        </>
                      )}
                    </svg>

                    {/* Plots the actual dynamic record coordinates on the SVG canvas map with absolute precision */}
                    {plottedPreviewPoints.map((item, i) => {
                      // Custom colors and indicators based on Category
                      const isInstall = item.building.category === 'installation';
                      const isLine = item.building.category === 'line';
                      const bgClass = isInstall 
                        ? 'bg-rose-500 shadow-rose-500/50' 
                        : isLine 
                          ? 'bg-sky-500 shadow-sky-500/50' 
                          : 'bg-emerald-500 shadow-emerald-500/50';
                      
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedBuilding(item.building)}
                          title={`${item.building.name} (${item.building.operator}) - Lat: ${item.lat.toFixed(5)}, Lng: ${item.lng.toFixed(5)}`}
                          className={`absolute w-3.5 h-3.5 ${bgClass} hover:scale-130 focus:outline-hidden rounded-full cursor-pointer shadow-md transition-all duration-200 z-10 border-2 border-white flex items-center justify-center`}
                          style={{ left: `${item.x}%`, top: `${item.y}%`, transform: 'translate(-50%, -50%)' }}
                        >
                          {/* Pulsing indicator loop */}
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-40 ${isInstall ? 'bg-rose-400' : isLine ? 'bg-sky-400' : 'bg-emerald-400'}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Lower Right: Latest document feeds */}
                <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-100 flex flex-col gap-4 shadow-3xs h-[390px] overflow-hidden">
                  <div className="flex justify-between items-center select-none">
                    <span className="text-xs uppercase font-extrabold tracking-widest text-slate-400">
                      {t.latestRecords}
                    </span>
                    
                    {/* Cloud Seed button triggers standard fill */}
                    {isAdmin && activeRecords.length === 3 && (
                      <span className="text-[10px] text-emerald-500 font-extrabold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                        {lang === 'id' ? 'Aktif' : '存盘连通'}
                      </span>
                    )}

                    {isAdmin && dbBuildings.length === 0 && (
                      <button
                        onClick={handleSeedCloudDatabase}
                        title={t.dbSeedDesc}
                        className="text-[11px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1 rounded-lg transition shrink-0 cursor-pointer flex items-center gap-1 animate-pulse"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        {t.dbSeedBtn}
                      </button>
                    )}
                  </div>

                  <div className="flex-grow overflow-y-auto divide-y divide-slate-100 custom-scrollbar pr-1">
                    {activeRecords.slice(0, 6).map((item) => (
                      <div
                        key={item.id}
                        onClick={() => setSelectedBuilding(item)}
                        className="py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/50 transition px-1 rounded-lg"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-850 truncate">{item.name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2 truncate">
                            <span>{item.operator}</span>
                            <span>•</span>
                            <span>{item.operationTime}</span>
                          </p>
                        </div>

                        <span className={`text-[9px] font-black uppercase rounded-md border px-2 py-0.5 shrink-0 ${
                          item.category === 'survey' ? 'bg-teal-50 text-teal-700 border-teal-100' :
                          item.category === 'line' ? 'bg-sky-50 text-sky-700 border-sky-100' :
                          'bg-indigo-50 text-indigo-700 border-indigo-100'
                        }`}>
                          {item.category}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* TAB 2, 3, 4: 数据分类管理 - 踩点, 测线, 安装 */}
          {(sidebarTab === 'survey_data' || sidebarTab === 'line_data' || sidebarTab === 'install_data') && (
            <div className="flex flex-col gap-6 animate-fade-in text-slate-700">
              
              {/* Filtration and selector controls top row */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 flex flex-col md:flex-row md:items-end justify-between gap-4 shadow-3xs select-none">
                <div className="flex flex-wrap items-end gap-3.5 text-xs font-semibold w-full">
                  
                  {/* Tab Search Bar Box */}
                  <div className="flex flex-col gap-1.5 w-full sm:w-72">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                      {lang === 'id' ? 'Cari di Kategori Ini' : '在当前分类中搜索'}
                    </span>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-3.5 flex items-center text-slate-400 pointer-events-none">
                        <Search className="w-3.5 h-3.5" />
                      </div>
                      <input
                        type="text"
                        value={tabSearchQuery}
                        onChange={(e) => setTabSearchQuery(e.target.value)}
                        placeholder={lang === 'id' ? 'Ketik nama, operator, lokasi...' : '输入名称、操作人、地点或备注...'}
                        className="w-full bg-slate-50 border border-slate-200 placeholder-slate-400 text-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold focus:outline-hidden focus:bg-white focus:border-blue-500 transition shadow-inner-xs"
                      />
                      {tabSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setTabSearchQuery('')}
                          className="absolute inset-y-0 right-2.5 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Province Filter */}
                  <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                      {t.provinceStr}
                    </span>
                    <select
                      value={filterProvince}
                      onChange={(e) => { setFilterProvince(e.target.value); setFilterCity('全部'); }}
                      className="bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-hidden"
                    >
                      <option value="全部">{lang === 'id' ? 'Semua Provinsi' : '全部省份'}</option>
                      {availableProvinces.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  {/* City filter */}
                  <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                      {t.cityStr}
                    </span>
                    <select
                      value={filterCity}
                      onChange={(e) => setFilterCity(e.target.value)}
                      className="bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-hidden"
                    >
                      <option value="全部">{lang === 'id' ? 'Semua Kota' : '全部城市'}</option>
                      {availableCities.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* Reset trigger */}
                  {(filterProvince !== '全部' || filterCity !== '全部' || tabSearchQuery !== '') && (
                    <button
                      onClick={() => { setFilterProvince('全部'); setFilterCity('全部'); setTabSearchQuery(''); }}
                      className="text-xs font-extrabold text-rose-500 hover:text-rose-600 transition cursor-pointer mb-2.5"
                    >
                      {lang === 'id' ? 'Atur Ulang' : '重置筛选'}
                    </button>
                  )}

                </div>

                <div className="text-xs text-slate-400 font-bold shrink-0 self-start md:self-end pb-2.5 whitespace-nowrap">
                  {lang === 'id' ? 'Hasil Saringan:' : '筛选结果条目:'} <span className="text-blue-600 font-black text-sm">{
                    sidebarTab === 'survey_data' ? getFilteredListForTab('survey').length :
                    sidebarTab === 'line_data' ? getFilteredListForTab('line').length :
                    getFilteredListForTab('installation').length
                  }</span>
                </div>
              </div>

              {/* Data sheets grids representation */}
              {((sidebarTab === 'survey_data' && getFilteredListForTab('survey').length === 0) ||
                (sidebarTab === 'line_data' && getFilteredListForTab('line').length === 0) ||
                (sidebarTab === 'install_data' && getFilteredListForTab('installation').length === 0)) ? (
                
                <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center flex flex-col items-center justify-center gap-3 shadow-3xs">
                  <AlertCircle className="w-12 h-12 text-slate-300 animate-pulse" />
                  <h3 className="font-sans font-black text-slate-800 text-sm">{t.noRecordsFound}</h3>
                  <p className="text-xs text-slate-400 max-w-xs">{t.noRecordsDesc}</p>
                </div>

              ) : (

                <div className="grid grid-cols-1 gap-4">
                  {sidebarTab === 'survey_data' && getFilteredListForTab('survey').map((rec, idx) => (
                    <BuildingCard
                      key={rec.id}
                      building={rec}
                      onSelect={setSelectedBuilding}
                      lang={lang}
                      isAdmin={isAdmin || isSurveyor}
                      onEdit={handleTriggerEdit}
                      onDelete={handleDeleteRecord}
                      index={idx + 1}
                    />
                  ))}
                  {sidebarTab === 'line_data' && getFilteredListForTab('line').map((rec, idx) => (
                    <BuildingCard
                      key={rec.id}
                      building={rec}
                      onSelect={setSelectedBuilding}
                      lang={lang}
                      isAdmin={isAdmin || isSurveyor}
                      onEdit={handleTriggerEdit}
                      onDelete={handleDeleteRecord}
                      index={idx + 1}
                    />
                  ))}
                  {sidebarTab === 'install_data' && getFilteredListForTab('installation').map((rec, idx) => (
                    <BuildingCard
                      key={rec.id}
                      building={rec}
                      onSelect={setSelectedBuilding}
                      lang={lang}
                      isAdmin={isAdmin || isSurveyor}
                      onEdit={handleTriggerEdit}
                      onDelete={handleDeleteRecord}
                      index={idx + 1}
                    />
                  ))}
                </div>

              )}

            </div>
          )}

          {/* TAB 5: 可视化点位分布图 (Visual Point Distribution map grid) */}
          {sidebarTab === 'map_view' && (
            <InteractiveMap
              activeRecords={activeRecords}
              selectedMapPoint={selectedMapPoint}
              onSelectMapPoint={setSelectedMapPoint}
              lang={lang}
              t={t}
              onShowDetails={setSelectedBuilding}
            />
          )}

          {/* TAB 6: 数据检索中心 (Data Search Center) */}
          {sidebarTab === 'search_center' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-100 flex flex-col gap-6 shadow-3xs animate-fade-in text-slate-700">
              
              <div>
                <h2 className="font-sans font-black text-xl text-slate-900">{t.tabSearchCenter}</h2>
                <p className="text-xs text-slate-400 mt-1">{lang === 'id' ? 'Ketik kata kunci untuk mencari data multi-wilayah' : '在此可通过组合操作人名称、地区、或测量简本说明检索标准库日志。'}</p>
              </div>

              {/* Large search input */}
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center text-slate-400 pointer-events-none">
                  <Search className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="w-full bg-slate-50 border border-slate-200 placeholder-slate-400 text-slate-800 rounded-xl pl-12 pr-4 py-3.5 text-sm font-semibold focus:outline-hidden focus:bg-white focus:border-blue-500 transition"
                />
              </div>

              {/* Results display */}
              <div className="flex flex-col gap-4">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  {lang === 'id' ? `Hasil Pencarian (${searchResultsList.length})` : `检索匹配清单 (${searchResultsList.length})`}
                </span>

                {searchResultsList.length === 0 ? (
                  <div className="p-16 border rounded-xl bg-slate-50/50 border-dashed border-slate-200 text-center flex flex-col items-center justify-center gap-3">
                    <AlertCircle className="w-10 h-10 text-slate-300 animate-pulse" />
                    <h3 className="font-extrabold text-slate-600 text-xs">{t.noRecordsFound}</h3>
                    <p className="text-xs text-slate-400 max-w-xs">{t.noRecordsDesc}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {searchResultsList.map((item) => (
                      <BuildingCard
                        key={item.id}
                        building={item}
                        onSelect={setSelectedBuilding}
                        lang={lang}
                        isAdmin={isAdmin || isSurveyor}
                        onEdit={handleTriggerEdit}
                        onDelete={handleDeleteRecord}
                      />
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 7: Administrators Login gate view */}
          {sidebarTab === 'login' && (
            <div className="flex items-center justify-center py-4 animate-fade-in">
              <LoginView 
                user={user}
                isAdmin={isAdmin}
                isSurveyor={isSurveyor}
                surveyorName={surveyorName}
                lang={lang}
                onSuccess={() => {
                  setSidebarTab('dashboard');
                }}
                onNavigateHome={() => setSidebarTab('dashboard')}
              />
            </div>
          )}

          {/* TAB 8: Administrative forms & Accounts Registry panels */}
          {(sidebarTab === 'upload_survey' || 
            sidebarTab === 'upload_line' || 
            sidebarTab === 'upload_install' || 
            sidebarTab === 'manage_admins' || 
            sidebarTab === 'manage_surveyors') && (
            <div className="max-w-4xl w-full mx-auto animate-fade-in relative">
              <AdminPanel
                user={user}
                isAdmin={isAdmin}
                isSurveyor={isSurveyor}
                surveyorName={surveyorName}
                editingBuilding={editingBuilding}
                onCloseEdit={() => setEditingBuilding(null)}
                lang={lang}
                onSaveRecord={handleSaveRecordToFirestore}
                activeWorkspaceTab={sidebarTab}
                buildings={activeRecords}
              />
            </div>
          )}

          {/* TAB 9: Telegram Bot configuration and linking tutorial */}
          {sidebarTab === 'telegram_bot' && (
            <div className="max-w-4xl w-full mx-auto animate-fade-in">
              <TelegramBotConfig lang={lang} />
            </div>
          )}

        </main>

        {/* MOBILE BOTTOM NAVIGATION BAR */}
        {(isAdmin || isSurveyor) && (
          <div className="lg:hidden bg-slate-900 border-t border-slate-800 text-slate-400 py-2.5 px-2 shadow-2xl z-30 flex items-center justify-around select-none shrink-0">
            <button
              onClick={() => { setSidebarTab('dashboard'); }}
              className={`flex-1 flex flex-col items-center gap-1 transition ${sidebarTab === 'dashboard' ? 'text-blue-400 font-bold' : 'text-slate-400'}`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="text-[9px] tracking-tight truncate">{lang === 'id' ? 'Beranda' : '控制台'}</span>
            </button>

            <button
              onClick={() => { setSidebarTab('survey_data'); }}
              className={`flex-1 flex flex-col items-center gap-1 transition ${sidebarTab === 'survey_data' ? 'text-teal-400 font-bold' : 'text-slate-500'}`}
            >
              <Layers className="w-4.5 h-4.5 text-teal-400" />
              <span className="text-[9px] tracking-tight truncate">{lang === 'id' ? 'Survei' : '踩点'}</span>
            </button>

            <button
              onClick={() => { setSidebarTab('line_data'); }}
              className={`flex-1 flex flex-col items-center gap-1 transition ${sidebarTab === 'line_data' ? 'text-sky-400 font-bold' : 'text-slate-500'}`}
            >
              <Layers className="w-4.5 h-4.5 text-sky-400" />
              <span className="text-[9px] tracking-tight truncate">{lang === 'id' ? 'Ukur' : '测线'}</span>
            </button>

            <button
              onClick={() => { setSidebarTab('install_data'); }}
              className={`flex-1 flex flex-col items-center gap-1 transition ${sidebarTab === 'install_data' ? 'text-indigo-400 font-bold' : 'text-slate-500'}`}
            >
              <Layers className="w-4.5 h-4.5 text-indigo-400" />
              <span className="text-[9px] tracking-tight truncate">{lang === 'id' ? 'Pasang' : '安装'}</span>
            </button>

            <button
              onClick={() => { setSidebarTab('map_view'); }}
              className={`flex-1 flex flex-col items-center gap-1 transition ${sidebarTab === 'map_view' ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}
            >
              <Layers className="w-4.5 h-4.5 text-emerald-400" />
              <span className="text-[9px] tracking-tight truncate">{lang === 'id' ? 'Peta' : '地图'}</span>
            </button>
          </div>
        )}

        {/* Dynamic Details slider overlay modal sheets drawers */}
        <AnimatePresence>
          {selectedBuilding && (
            <BuildingDetail
              building={selectedBuilding}
              isAdmin={isAdmin || isSurveyor}
              onClose={() => setSelectedBuilding(null)}
              onEdit={handleTriggerEdit}
              onDelete={handleDeleteRecord}
              lang={lang}
            />
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
