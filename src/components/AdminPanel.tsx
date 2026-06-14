import React, { useState, useEffect, useMemo } from 'react';
import { db, auth, handleFirestoreError, OperationType, createAccountOnSecondaryAuth, storage } from '../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Building, Admin, Surveyor, GalleryItem } from '../types';
import { Plus, Trash2, X, Check, Upload, User, Shield, Phone, Cpu, Hash, Clock, Landmark, Sparkles, Key, Mail, Compass, MapPin, Search, Send } from 'lucide-react';
import { Language, translations } from '../languages';

// Helper to check if a item is a video
export function isMediaVideo(item: string | GalleryItem): boolean {
  if (!item) return false;
  const url = typeof item === 'string' ? item : item.url;
  if (!url) return false;
  if (typeof item !== 'string' && item.type === 'video') {
    return true;
  }
  if (url.startsWith('data:video/')) {
    return true;
  }
  const cleanUrl = url.split('?')[0].toLowerCase();
  return cleanUrl.endsWith('.mp4') || 
         cleanUrl.endsWith('.webm') || 
         cleanUrl.endsWith('.ogg') || 
         cleanUrl.endsWith('.mov') ||
         cleanUrl.includes('youtube.com/embed/') || 
         cleanUrl.includes('youtu.be/');
}

interface AdminPanelProps {
  user: any;
  isAdmin: boolean;
  isSurveyor?: boolean;
  surveyorName?: string;
  editingBuilding: Building | null;
  onCloseEdit: () => void;
  lang: Language;
  onRefreshData?: () => void;
  onSaveRecord: (recordData: Partial<Building>, isNew: boolean, id?: string) => Promise<void>;
  
  // Tab control from App.tsx sidebar
  activeWorkspaceTab: string;
  buildings?: Building[];
}

export default function AdminPanel({
  user,
  isAdmin,
  isSurveyor = false,
  surveyorName = '',
  editingBuilding,
  onCloseEdit,
  lang,
  onSaveRecord,
  activeWorkspaceTab,
  buildings = []
}: AdminPanelProps) {
  const t = translations[lang];

  // Dynamic lists from Firestore
  const [adminsList, setAdminsList] = useState<Admin[]>([]);
  const [surveyorsList, setSurveyorsList] = useState<Surveyor[]>([]);

  // Form states for adding account
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');

  const [newSurveyorName, setNewSurveyorName] = useState('');
  const [newSurveyorPhone, setNewSurveyorPhone] = useState('');
  const [newSurveyorEmail, setNewSurveyorEmail] = useState('');
  const [newSurveyorPassword, setNewSurveyorPassword] = useState('');

  // Form states for data record uploading
  const [opName, setOpName] = useState('');
  const [opTime, setOpTime] = useState(new Date().toISOString().slice(0, 16));
  const [opProvince, setOpProvince] = useState('');
  const [opCity, setOpCity] = useState('');
  const [opDistrict, setOpDistrict] = useState('');
  const [recordName, setRecordName] = useState('');
  const [recordDesc, setRecordDesc] = useState('');
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [isUploadingLocal, setIsUploadingLocal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; percent: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [opLatitude, setOpLatitude] = useState<number | undefined>(undefined);
  const [opLongitude, setOpLongitude] = useState<number | undefined>(undefined);
  const [isGpsLoading, setIsGpsLoading] = useState(false);



  // Online Geocoding search states for form
  const [formSearchQuery, setFormSearchQuery] = useState('');
  const [formSearchResults, setFormSearchResults] = useState<any[]>([]);
  const [isSearchingFormAddress, setIsSearchingFormAddress] = useState(false);
  const [showFormSearchResults, setShowFormSearchResults] = useState(false);

  // Debounce effect to search online locations via Amap query proxy
  useEffect(() => {
    const query = formSearchQuery.trim();
    if (query.length < 2) {
      setFormSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingFormAddress(true);
      try {
        const url = `/api/amap/search?q=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data && Array.isArray(data.results)) {
          // Normalize display_name for rendering dropdown items seamlessly
          const mapped = data.results.map((item: any) => ({
            ...item,
            display_name: item.description || ''
          }));
          setFormSearchResults(mapped);
        } else {
          setFormSearchResults([]);
        }
      } catch (err) {
        console.error('Error fetching address coordinates via Amap proxy:', err);
        setFormSearchResults([]);
      } finally {
        setIsSearchingFormAddress(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formSearchQuery]);

  const handleSelectAddressSuggestion = (item: any) => {
    const details = item.addressDetails || {};
    const addr = item.address || {};
    
    // Extract state/province (favour state then province/region)
    const province = details.province || addr.state || addr.province || addr.region || addr.governorate || '';
    // Extract city
    const city = details.city || addr.city || addr.town || addr.municipality || addr.city_district || addr.local_administrative_area || '';
    // Extract district
    const district = details.district || addr.county || addr.district || addr.suburb || addr.island || addr.neighbourhood || addr.village || addr.croft || '';
    
    setOpProvince(province);
    setOpCity(city);
    setOpDistrict(district);
    
    if (Array.isArray(item.latlng)) {
      setOpLatitude(item.latlng[0]);
      setOpLongitude(item.latlng[1]);
    } else {
      if (item.lat) setOpLatitude(parseFloat(item.lat));
      if (item.lon) setOpLongitude(parseFloat(item.lon));
    }
    
    // If name is empty, auto fill with the top node name
    if (!recordName) {
      const shortName = item.name || (item.display_name ? item.display_name.split(',')[0] : '');
      setRecordName(shortName);
    }
    
    setFormSearchQuery('');
    setFormSearchResults([]);
    setShowFormSearchResults(false);
  };

  // Auto-fill from previously uploaded buildings
  const [selectedParentBuildingId, setSelectedParentBuildingId] = useState('');

  const selectableBuildings = useMemo(() => {
    if (!buildings || buildings.length === 0) return [];
    
    // Group by building name to avoid duplicates and get the best representative (highest category/stage)
    const groups: { [key: string]: Building } = {};
    buildings.forEach(b => {
      if (!b.name) return;
      const key = b.name.trim().toLowerCase();
      const existing = groups[key];
      if (!existing) {
        groups[key] = b;
      } else {
        const priority = { installation: 3, line: 2, survey: 1 };
        const currentScore = priority[b.category as 'installation' | 'line' | 'survey'] || 0;
        const existingScore = priority[existing.category as 'installation' | 'line' | 'survey'] || 0;
        if (currentScore > existingScore) {
          groups[key] = b;
        }
      }
    });
    return Object.values(groups).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [buildings]);

  const handleSelectParentBuilding = (buildingId: string) => {
    setSelectedParentBuildingId(buildingId);
    if (!buildingId) {
      resetDataForm();
      return;
    }
    
    const target = selectableBuildings.find(b => b.id === buildingId);
    if (target) {
      setRecordName(target.name || '');
      setOpProvince(target.province || '');
      setOpCity(target.city || '');
      setOpDistrict(target.district || '');
      setOpLatitude(target.latitude);
      setOpLongitude(target.longitude);
      setRecordDesc(target.description || '');
      
      // Copy over layout values if relevant (makes user life incredibly easy!)
      if (target.longDistanceLines !== undefined) setLongLines(target.longDistanceLines);
      if (target.localLines !== undefined) setLocLines(target.localLines);
      if (target.longDistancePhones !== undefined) setLongPhones(target.longDistancePhones);
      if (target.localPhones !== undefined) setLocPhones(target.localPhones);
    }
  };

  useEffect(() => {
    setSelectedParentBuildingId('');
  }, [activeWorkspaceTab, editingBuilding]);

  const handleAutoGpsScan = () => {
    if (!navigator.geolocation) {
      alert(lang === 'id' ? 'GPS tidak didukung di peramban ini.' : '您的浏览器不支持GPS定位。');
      return;
    }
    setIsGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setOpLatitude(lat);
        setOpLongitude(lng);
        setIsGpsLoading(false);
        
        try {
          const res = await fetch(`/api/amap/regeo?lat=${lat}&lng=${lng}`);
          if (res.ok) {
            const data = await res.json();
            if (data.province) setOpProvince(data.province.replace(/Province|Kepulauan|Daerah Istimewa/gi, '').trim());
            if (data.city) setOpCity(data.city.replace(/City|Kota|Kabupaten/gi, '').trim());
            if (data.district) setOpDistrict(data.district.trim());
          }
        } catch (e) {
          console.warn("Reverse geocoding with Amap/Gaode failed, used coordinates fallback", e);
        }
        
        alert(lang === 'id' 
          ? `GPS berhasil terpindai! \nLon: ${lng.toFixed(5)}, Lat: ${lat.toFixed(5)}` 
          : `GPS 扫描成功！ \n经度: ${lng.toFixed(5)}, 纬度: ${lat.toFixed(5)}`
        );
      },
      (error) => {
        setIsGpsLoading(false);
        console.error("GPS scan error", error);
        let errMsg = lang === 'id' ? 'Gagal mengakses GPS.' : '无法访问 GPS 定位服务。';
        if (error.code === 1) {
          errMsg = lang === 'id' ? 'Akses GPS ditolak. Silakan izinkan lokasi di pengaturan browser.' : 'GPS 权限被拒绝，请在浏览器中开启定位权限。';
        } else if (error.code === 2) {
          errMsg = lang === 'id' ? 'Lokasi tidak dapat ditentukan.' : '位置信息不可用。';
        } else if (error.code === 3) {
          errMsg = lang === 'id' ? 'Waktu pemindaian GPS habis (Timeout).' : '定位超时。';
        }
        alert(errMsg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  const compressImage = (file: File, maxWidth = 900, maxHeight = 900, quality = 0.7): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(event.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        };
        img.onerror = () => {
          resolve(event.target?.result as string);
        };
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async (files: FileList | File[]) => {
    setIsUploadingLocal(true);
    const newUrls: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress({ current: i + 1, total: files.length, percent: 0 });

      try {
        let objectToUpload: Blob | File = file;

        if (file.type.startsWith('image/')) {
          try {
            // Compress carefully but with higher 1600px resolution and 0.85 quality for crystal clear images (e.g., text on signs)
            const compressedBase64 = await compressImage(file, 1600, 1600, 0.85);
            // Convert to blob so we can upload it cleanly with uploadBytesResumable
            const response = await fetch(compressedBase64);
            objectToUpload = await response.blob();
          } catch (err) {
            console.error('Image compression failed, using original', err);
            objectToUpload = file;
          }
        } else if (file.type.startsWith('video/')) {
          // No more 0.8MB Firestore restriction! Let's allow videos up to 40MB.
          if (file.size > 40 * 1024 * 1024) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            errors.push(
              lang === 'id' 
                ? `Video ${file.name} terlalu besar (${sizeMB}MB). Maksimal batas upload video adalah 40MB.` 
                : `视频 ${file.name} 过大 (${sizeMB}MB)。视频上传大小上限为 40MB。`
            );
            continue;
          }
          objectToUpload = file;
        } else {
          errors.push(
            lang === 'id'
              ? `Format file ${file.name} tidak didukung. Harap pilih gambar atau video.`
              : `不支持的文件格式 ${file.name}。请选择图片或视频。`
          );
          continue;
        }

        // Create storage reference path securely grouped by user UID
        const fileExtension = file.name.split('.').pop() || (file.type.startsWith('image/') ? 'jpg' : 'mp4');
        const storagePath = `buildings/${user?.uid || 'anonymous'}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExtension}`;
        const storageRef = ref(storage, storagePath);

        // Upload using uploadBytesResumable to track transfer progress
        const uploadTask = uploadBytesResumable(storageRef, objectToUpload);

        const url = await new Promise<string>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              setUploadProgress({ current: i + 1, total: files.length, percent: progress });
            },
            (error) => {
              reject(error);
            },
            async () => {
              try {
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(downloadUrl);
              } catch (err) {
                reject(err);
              }
            }
          );
        });

        newUrls.push(url);
      } catch (err: any) {
        console.error('File upload error:', err);
        errors.push(
          lang === 'id'
            ? `Gagal mengunggah ${file.name}: ${err.message || 'Error jaringan/konfigurasi Storage'}`
            : `上传 ${file.name} 失败: ${err.message || '网络或存储配置错误'}`
        );
      }
    }

    if (newUrls.length > 0) {
      setGalleryUrls((prev) => [...prev, ...newUrls]);
    }
    setIsUploadingLocal(false);
    setUploadProgress(null);

    if (errors.length > 0) {
      alert(errors.join('\n'));
    }
  };

  // Form type-specific specifications
  const [longLines, setLongLines] = useState<number>(0);
  const [locLines, setLocLines] = useState<number>(0);
  const [longPhones, setLongPhones] = useState<number>(0);
  const [locPhones, setLocPhones] = useState<number>(0);
  const [instLines, setInstLines] = useState<number>(0);
  const [totalHour, setTotalHour] = useState<number>(0);

  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const showStatus = (text: string, isError = false) => {
    setStatusMessage({ text, isError });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  // Helper to dynamically resolve the operator name of the currently logged-in user
  const currentLoggedName = useMemo(() => {
    if (isSurveyor && surveyorName) {
      return surveyorName;
    }
    if (isAdmin && user) {
      const email = user.email || '';
      // Seek matching admin document from real-time sync list if available
      const matchedAdmin = adminsList.find(a => 
        (a.id && a.id === user.uid) || 
        (a.email && a.email.toLowerCase().trim() === email.toLowerCase().trim())
      );
      if (matchedAdmin && matchedAdmin.name) {
        return matchedAdmin.name;
      }
      if (email.toLowerCase().trim() === 'admin@telekomunikasi.com') {
        return 'Admin Telekomunikasi';
      }
      if (email.toLowerCase().trim() === 'admin@demo.com') {
        return 'Demo Admin';
      }
      if (user.displayName) return user.displayName;
      const prefix = email.split('@')[0];
      if (prefix) {
        return prefix.charAt(0).toUpperCase() + prefix.slice(1);
      }
      return 'Administrator';
    }
    return '';
  }, [isAdmin, isSurveyor, surveyorName, user, adminsList]);

  // Synchronize dynamic editing values
  useEffect(() => {
    if (editingBuilding) {
      setRecordName(editingBuilding.name || '');
      setOpName(editingBuilding.operator || currentLoggedName);
      setOpTime(editingBuilding.operationTime || new Date().toISOString().slice(0, 16));
      setRecordDesc(editingBuilding.description || '');
      setOpProvince(editingBuilding.province || '');
      setOpCity(editingBuilding.city || '');
      setOpDistrict(editingBuilding.district || '');
      setLongLines(editingBuilding.longDistanceLines || 0);
      setLocLines(editingBuilding.localLines || 0);
      setLongPhones(editingBuilding.longDistancePhones || 0);
      setLocPhones(editingBuilding.localPhones || 0);
      setInstLines(editingBuilding.installedLines || 0);
      setTotalHour(editingBuilding.totalDuration || 0);
      setOpLatitude(editingBuilding.latitude);
      setOpLongitude(editingBuilding.longitude);
      
      const flatUrls = editingBuilding.gallery 
        ? editingBuilding.gallery.map(item => typeof item === 'string' ? item : item.url)
        : [];
      setGalleryUrls(flatUrls);
    } else {
      resetDataForm();
    }
  }, [editingBuilding, currentLoggedName]);

  // Handle automatic operator locking/pre-population based on logged-in user session
  useEffect(() => {
    if (currentLoggedName) {
      setOpName(currentLoggedName);
    }
  }, [currentLoggedName, activeWorkspaceTab, editingBuilding]);

  const resetDataForm = () => {
    setRecordName('');
    setOpName(currentLoggedName);
    setOpTime(new Date().toISOString().slice(0, 16));
    setRecordDesc('');
    setOpProvince('');
    setOpCity('');
    setOpDistrict('');
    setLongLines(0);
    setLocLines(0);
    setLongPhones(0);
    setLocPhones(0);
    setInstLines(0);
    setTotalHour(0);
    setGalleryUrls([]);
    setOpLatitude(undefined);
    setOpLongitude(undefined);
  };

  // Preset quick images for ease of database testing/filling
  const PRESET_STOCK_IMAGES = [
    'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1563770660941-20978e870e26?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1601524909162-be87252be298?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=400&q=80'
  ];

  // Dynamic snapshot attachments
  useEffect(() => {
    if (!isAdmin) return;

    const unsubAdmins = onSnapshot(collection(db, 'admins'), (snapshot) => {
      const items: Admin[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Admin);
      });
      setAdminsList(items);
    }, (error) => {
      console.warn("Could not load admins list:", error);
    });

    const unsubSurveyors = onSnapshot(collection(db, 'surveyors'), (snapshot) => {
      const items: Surveyor[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Surveyor);
      });
      setSurveyorsList(items);
    }, (error) => {
      console.warn("Could not load surveyors list:", error);
    });

    return () => {
      unsubAdmins();
      unsubSurveyors();
    };
  }, [isAdmin]);

  // Handle Account Registrations
  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail) return;
    try {
      const cleanEmailInput = newAdminEmail.trim();
      const finalEmail = cleanEmailInput.includes('@') ? cleanEmailInput : `${cleanEmailInput}@admin.com`;
      
      let adminId = finalEmail.replace(/[^a-zA-Z0-9]/g, '_');
      
      if (newAdminPassword.trim()) {
        try {
          adminId = await createAccountOnSecondaryAuth(finalEmail, newAdminPassword.trim());
        } catch (authErr: any) {
          console.error("Auth registration error", authErr);
          alert(lang === 'id' ? `Gagal registrasi user di Auth: ${authErr.message}` : `Auth账户注册失败: ${authErr.message}`);
          return;
        }
      }

      await setDoc(doc(db, 'admins', adminId), {
        email: finalEmail,
        name: newAdminName.trim() || finalEmail.split('@')[0],
        createdAt: serverTimestamp(),
      });
      setNewAdminEmail('');
      setNewAdminName('');
      setNewAdminPassword('');
      showStatus(t.addAdminSuccess || 'Sukses mendaftarkan Admin baru!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'admins');
    }
  };

  const handleDeleteAdmin = async (id: string, name: string) => {
    if (!confirm(t.deleteAdminConfirm?.replace('{name}', name) || `Hapus admin ${name}?`)) return;
    try {
      await deleteDoc(doc(db, 'admins', id));
      showStatus(t.deleteAdminSuccess || 'Sukses menghapus admin.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `admins/${id}`);
    }
  };

  const handleAddSurveyor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSurveyorName) return;
    try {
      const usrInput = newSurveyorEmail.trim() || newSurveyorName.toLowerCase().replace(/\s+/g, '');
      const finalEmail = usrInput.includes('@') ? usrInput : `${usrInput}@admin.com`;
      
      let surveyorId = 'srv_' + Date.now();
      
      if (newSurveyorPassword.trim()) {
        try {
          surveyorId = await createAccountOnSecondaryAuth(finalEmail, newSurveyorPassword.trim());
        } catch (authErr: any) {
          console.error("Auth registration error", authErr);
          alert(lang === 'id' ? `Gagal membuat akun lapangan di Auth: ${authErr.message}` : `外勤Auth账户注册失败: ${authErr.message}`);
          return;
        }
      }

      await setDoc(doc(db, 'surveyors', surveyorId), {
        name: newSurveyorName.trim(),
        phone: newSurveyorPhone.trim() || 'N/A',
        email: finalEmail,
        createdAt: serverTimestamp()
      });
      setNewSurveyorName('');
      setNewSurveyorPhone('');
      setNewSurveyorEmail('');
      setNewSurveyorPassword('');
      showStatus(lang === 'id' ? 'Petugas lapangan baru didaftarkan!' : '踩点员成功注册！');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'surveyors');
    }
  };

  const handleDeleteSurveyor = async (id: string) => {
    if (!confirm(lang === 'id' ? 'Yakin menghapus petugas lapangan ini?' : '确定要移除此踩点员吗？')) return;
    try {
      await deleteDoc(doc(db, 'surveyors', id));
      showStatus(lang === 'id' ? 'Sukses menghapus pendaftaran.' : '成功删除。');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `surveyors/${id}`);
    }
  };

  // Handles submitting telemetry records
  const handleUploadRecord = async (e: React.FormEvent) => {
    e.preventDefault();

    // Map activeWorkspaceTab key to record.category
    let activeType: 'survey' | 'line' | 'installation' = 'survey';
    if (activeWorkspaceTab === 'upload_line') activeType = 'line';
    if (activeWorkspaceTab === 'upload_install') activeType = 'installation';

    if (editingBuilding) {
      // Keeps same category as original when editing
      activeType = editingBuilding.category as any;
    }

    if (!recordName || !opName) {
      alert(lang === 'id' ? 'Nama lokasi dan Operator wajib diisi.' : '记录标题与操作人姓名必须填写。');
      return;
    }

    // Fallback location address string formatting
    const finalLocation = `${opProvince.trim() || '江西省'} ${opCity.trim() || '鹰潭市'} ${opDistrict.trim() || '月湖区'}`;

    // Safeguard asset gallery array fallback
    const finalGallery = galleryUrls.length > 0 ? galleryUrls : [
      activeType === 'survey' ? 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=400&q=80' : 
      activeType === 'line' ? 'https://images.unsplash.com/photo-1601524909162-be87252be298?auto=format&fit=crop&w=400&q=80' : 
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80'
    ];

    const recordPayload: Partial<Building> = {
      name: recordName.trim(),
      category: activeType,
      operator: opName.trim(),
      operationTime: opTime,
      location: finalLocation,
      province: opProvince.trim() || '江西省',
      city: opCity.trim() || '鹰潭市',
      district: opDistrict.trim() || '月湖区',
      description: recordDesc.trim(),
      floors: activeType === 'installation' ? (instLines || 1) : 1, // field compatibility
      gallery: finalGallery,
      latitude: opLatitude ? Number(opLatitude) : undefined,
      longitude: opLongitude ? Number(opLongitude) : undefined,
      
      // Type-specific field attachments
      longDistanceLines: activeType === 'survey' ? Number(longLines) : activeType === 'installation' ? Number(longLines) : undefined,
      localLines: activeType === 'survey' ? Number(locLines) : activeType === 'installation' ? Number(locLines) : undefined,
      longDistancePhones: activeType === 'line' ? Number(longPhones) : undefined,
      localPhones: activeType === 'line' ? Number(locPhones) : undefined,
      installedLines: activeType === 'installation' ? Number(instLines) : undefined,
      totalDuration: activeType === 'installation' ? Number(totalHour) : undefined
    };

    // Limit check for overall document size to be perfectly safe with Firestore's 1MB limit per document
    const payloadSizeEstimation = JSON.stringify(recordPayload).length;
    if (payloadSizeEstimation > 900000) {
      alert(lang === 'id' 
        ? `Ukuran file foto/video yang diunggah terlalu besar (${(payloadSizeEstimation / 1024 / 1024).toFixed(2)} MB). \nHarap hapus beberapa gambar/video lama atau gunakan ukuran yang lebih kecil untuk menghindari batas kapasitas Firestore.` 
        : `上传的文件大小超过限制 (${(payloadSizeEstimation / 1024 / 1024).toFixed(2)} MB)。\n请删除部分已添加的图片/视频，或降低分辨率后再试，以避免超过 Firestore 1MB 数据库写入上限。`
      );
      return;
    }

    try {
      await onSaveRecord(recordPayload, !editingBuilding, editingBuilding?.id);
      showStatus(editingBuilding ? t.saveSuccess : t.uploadSuccess);
      
      if (!editingBuilding) {
        resetDataForm();
      } else {
        onCloseEdit();
      }
    } catch (e) {
      console.error(e);
      showStatus(lang === 'id' ? 'Gagal menyimpan data.' : '数据保存上传失败。', true);
    }
  };

  const handleAddUrl = () => {
    if (newUrl.trim()) {
      setGalleryUrls([...galleryUrls, newUrl.trim()]);
      setNewUrl('');
    }
  };

  const handleRemoveUrl = (idx: number) => {
    setGalleryUrls(galleryUrls.filter((_, i) => i !== idx));
  };


  // Define active type name for form display
  let currentFormType = 'survey';
  if (activeWorkspaceTab === 'upload_line') currentFormType = 'line';
  if (activeWorkspaceTab === 'upload_install') currentFormType = 'installation';
  if (editingBuilding) currentFormType = editingBuilding.category;

  // Render accounts workspace or data forms depending on tab context
  if (activeWorkspaceTab === 'manage_admins') {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-6 flex flex-col gap-6">
        <div>
          <h2 className="font-sans font-black text-xl text-slate-900">{t.adminListHeader}</h2>
          <p className="text-xs text-slate-400 mt-1">{lang === 'id' ? 'Tambahkan akun admin baru dengan email/username dan kata sandi.' : '注册或移除具有云数据库最高读写及分配特权的团队账户。'}</p>
        </div>

        {statusMessage && (
          <div className={`p-4 rounded-xl text-xs font-bold border ${statusMessage.isError ? 'bg-rose-50 text-rose-800 border-rose-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'}`}>
            {statusMessage.text}
          </div>
        )}

        <form onSubmit={handleAddAdmin} className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-slate-500">{t.namePlh || 'Nama'}</label>
              <input
                type="text"
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
                placeholder={lang === 'id' ? 'Nama lengkap...' : '姓名...'}
                className="bg-white border border-slate-200 focus:border-blue-500 rounded-xl p-3 text-xs font-semibold text-slate-800"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-slate-500">{lang === 'id' ? 'Email / Username' : '账号 / 邮箱'}</label>
              <input
                type="text"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="admin1 atau admin@domain.com"
                className="bg-white border border-slate-200 focus:border-blue-500 rounded-xl p-3 text-xs font-semibold text-slate-800"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-slate-500">{lang === 'id' ? 'Kata Sandi' : '密码'}</label>
              <input
                type="password"
                value={newAdminPassword}
                onChange={(e) => setNewAdminPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-white border border-slate-200 focus:border-blue-500 rounded-xl p-3 text-xs font-semibold text-slate-800"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs py-3.5 px-6 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-blue-500/10 w-full sm:w-max self-end"
          >
            <Plus className="w-4 h-4" />
            {t.newAdminBtn}
          </button>
        </form>

        <div className="border border-slate-100 rounded-xl overflow-hidden mt-2">
          {adminsList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-slate-50">
              {t.adminEmptyMsg}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {adminsList.map((admin) => (
                <div key={admin.id} className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200/50">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-850">{admin.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{admin.email}</p>
                    </div>
                  </div>

                  {user?.email !== admin.email && (
                    <button
                      onClick={() => handleDeleteAdmin(admin.id, admin.name)}
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (activeWorkspaceTab === 'manage_surveyors') {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-6 flex flex-col gap-6">
        <div>
          <h2 className="font-sans font-black text-xl text-slate-900">{t.surveyorListHeader}</h2>
          <p className="text-xs text-slate-400 mt-1">{lang === 'id' ? 'Mendaftar nama tim operasional lapangan serta hak login mereka.' : '在此录入、检索和同步负责具体外勤测量与设备搭建的工作人员团队名单及登录密码。'}</p>
        </div>

        {statusMessage && (
          <div className={`p-4 rounded-xl text-xs font-bold border ${statusMessage.isError ? 'bg-rose-50 text-rose-800 border-rose-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'}`}>
            {statusMessage.text}
          </div>
        )}

        <form onSubmit={handleAddSurveyor} className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-slate-500">{t.namePlh || 'Nama'}</label>
              <input
                type="text"
                value={newSurveyorName}
                onChange={(e) => setNewSurveyorName(e.target.value)}
                placeholder={lang === 'id' ? 'Nama lengkap...' : '姓名...'}
                className="bg-white border border-slate-200 focus:border-blue-500 rounded-xl p-3 text-xs font-semibold text-slate-800"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-slate-500">{lang === 'id' ? 'Nomor Telepon' : '联系电话'}</label>
              <input
                type="text"
                value={newSurveyorPhone}
                onChange={(e) => setNewSurveyorPhone(e.target.value)}
                placeholder="08123456789"
                className="bg-white border border-slate-200 focus:border-blue-500 rounded-xl p-3 text-xs font-semibold text-slate-800"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-slate-500">{lang === 'id' ? 'Username / Email' : '用户名 / 邮箱'}</label>
              <input
                type="text"
                value={newSurveyorEmail}
                onChange={(e) => setNewSurveyorEmail(e.target.value)}
                placeholder="budi atau budi@domain.com"
                className="bg-white border border-slate-200 focus:border-blue-500 rounded-xl p-3 text-xs font-semibold text-slate-800"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-slate-500">{lang === 'id' ? 'Kata Sandi' : '密码'}</label>
              <input
                type="password"
                value={newSurveyorPassword}
                onChange={(e) => setNewSurveyorPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-white border border-slate-200 focus:border-blue-500 rounded-xl p-3 text-xs font-semibold text-slate-800"
                required
              />
            </div>
          </div>
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs py-3.5 px-6 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-blue-500/10 w-full sm:w-max self-end"
          >
            <Plus className="w-4 h-4" />
            {t.newSurveyorBtn}
          </button>
        </form>

        <div className="border border-slate-100 rounded-xl overflow-hidden mt-2">
          {surveyorsList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-slate-50">
              {t.surveyorEmptyMsg}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {surveyorsList.map((surv) => (
                <div key={surv.id} className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200/50">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-850">{surv.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {surv.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-slate-400" /> {surv.email}</span>}
                        {surv.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" /> {surv.phone}</span>}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteSurveyor(surv.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- RENDERING DATA RECORE FORM VIEWS ---
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6 flex flex-col gap-6 relative">
      
      {editingBuilding && (
        <div className="flex items-center justify-between bg-blue-50 p-4 rounded-xl border border-blue-100 text-xs">
          <div className="flex items-center gap-2 text-blue-900 font-bold">
            <Sparkles className="w-4 h-4 animate-spin text-blue-500" />
            <span>
              {lang === 'id' ? `Menyunting Catatan: "${editingBuilding.name}"` : `正在编辑记录： "${editingBuilding.name}"`}
            </span>
          </div>
          <button
            onClick={onCloseEdit}
            className="p-1 hover:bg-blue-100 rounded-lg text-blue-800 transition font-black cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div>
        <h2 className="font-sans font-black text-xl text-slate-900">
          {currentFormType === 'survey' ? (lang === 'id' ? 'Formulir Unggah Data Survei' : '踩点数据上传') :
           currentFormType === 'line' ? (lang === 'id' ? 'Formulir Unggah Data Pengukuran' : '测线数据上传') :
           (lang === 'id' ? 'Formulir Unggah Catatan Instalasi' : '安装记录上传')}
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          {lang === 'id' ? 'Masukkan data metrik pelaporan lapangan secara teliti di bawah ini' : '请输入详细测点、主干衰耗或机柜安装调试工程项目物理上架指标。'}
        </p>
      </div>

      {statusMessage && (
        <div className={`p-4 rounded-xl text-xs font-bold border ${statusMessage.isError ? 'bg-rose-50 text-rose-800 border-rose-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'}`}>
          {statusMessage.text}
        </div>
      )}

      <form onSubmit={handleUploadRecord} className="flex flex-col gap-5 text-xs text-slate-700">
        
        {/* Auto-fill/Copy from existing checked/surveyed building */}
        {!editingBuilding && selectableBuildings.length > 0 && (
          <div className="bg-emerald-50/80 border border-emerald-100 p-4 rounded-2xl flex flex-col gap-2 shadow-2xs">
            <div className="flex items-center gap-2 text-emerald-800">
              <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse" />
              <span className="font-sans font-black text-xs">
                {lang === 'id' ? 'Salin Data dari Gedung Terdaftar (Auto-Fill)' : '智能复制/自动填充已有项目点位信息'}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              {lang === 'id'
                ? 'Pernah mengunggah survey/pengukuran gedung ini sebelumnya? Pilih nama gedung di bawah ini untuk mengisi Nama, Wilayah, Koordinat GPS, dan Deskripsi secara otomatis!'
                : '该点位之前是否录入过踩点或测线记录？选择下方已有大楼名称，即可一键自动填充名称、省市、GPS经纬度及描述，免去手动输入：'}
            </p>
            <div className="relative">
              <select
                id="auto-fill-building-select"
                value={selectedParentBuildingId}
                onChange={(e) => handleSelectParentBuilding(e.target.value)}
                className="w-full bg-white border border-slate-200 hover:border-emerald-400 p-3 rounded-xl font-bold text-xs text-slate-800 shadow-2xs outline-hidden focus:ring-1 focus:ring-emerald-400 transition cursor-pointer appearance-none"
              >
                <option value="">{lang === 'id' ? '-- Pilih Gedung untuk Auto-Fill data --' : '-- 选择已有大楼进行智能填充 --'}</option>
                {selectableBuildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    🏨 {b.name} ({b.province} - {b.city}) Stage terakhir: {b.category === 'survey' ? (lang === 'id' ? '1-Survei' : '1-踩点') : b.category === 'line' ? (lang === 'id' ? '2-Pengukuran' : '2-测线') : (lang === 'id' ? '3-Instalasi' : '3-设备安装')}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center px-1 text-slate-400 font-bold">
                ▼
              </div>
            </div>
            {selectedParentBuildingId && (
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 font-bold bg-emerald-100/50 px-2.5 py-1.5 rounded-lg border border-emerald-200/40 w-max mt-1 animate-fade-in">
                <Check className="w-3.5 h-3.5" />
                <span>{lang === 'id' ? 'Data berhasil disalin! Anda masih dapat menyuntingnya jika diperlukan.' : '数据已成功同步！您仍可根据需要对填充内容进行修改。'}</span>
              </div>
            )}
          </div>
        )}
        
        {/* Core Field Layout Group 1 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-extrabold text-[10px] uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              {t.operator} *
            </label>
            <input
              type="text"
              value={opName}
              onChange={(e) => setOpName(e.target.value)}
              disabled={!isAdmin}
              placeholder={lang === 'id' ? 'Masukkan nama operator...' : '请输入操作人姓名...'}
              className={`border border-slate-200 rounded-xl p-3 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 transition ${
                !isAdmin
                  ? 'bg-slate-100 text-slate-500 cursor-not-allowed opacity-90'
                  : 'bg-slate-50 text-slate-800'
              }`}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-extrabold text-[10px] uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {t.operationTime} *
            </label>
            <input
              type="datetime-local"
              value={opTime}
              onChange={(e) => setOpTime(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold text-slate-800 focus:outline-hidden"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-extrabold text-[10px] uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5" />
              {lang === 'id' ? 'Nama Lokasi' : '项目点位/位置名称'} *
            </label>
            <input
              type="text"
              value={recordName}
              onChange={(e) => setRecordName(e.target.value)}
              placeholder={lang === 'id' ? 'cth: Ruang Server Pemkab Yingtan' : '例如: 鹰潭政务中心机房'}
              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold text-slate-800 focus:outline-hidden"
              required
            />
          </div>
        </div>

        {/* Geocoding & Address / GPS coordinate Finder */}
        <div className="bg-gradient-to-br from-blue-50/70 to-indigo-50/70 border border-blue-100 p-4 rounded-2xl flex flex-col gap-3 shadow-2xs relative">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-xs">
              <Search className="w-4.5 h-4.5" />
            </div>
            <div className="flex-grow min-w-0">
              <h4 className="font-sans font-black text-xs text-slate-800">
                {lang === 'id' ? 'Pencarian Lokasi GPS' : '在线地图 GPS 检索'}
              </h4>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                {lang === 'id' 
                  ? 'Cari lokasi atau nama gedung di China untuk mengisi koordinat secara otomatis.' 
                  : '输入中国城市、地标或大楼名称，即可一键精准检索并自动填充经纬度。'}
              </p>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-3.5 flex items-center text-slate-400 pointer-events-none">
              <Search className="w-3.5 h-3.5" />
            </div>
            <input
              type="text"
              value={formSearchQuery}
              onChange={(e) => {
                setFormSearchQuery(e.target.value);
                setShowFormSearchResults(true);
              }}
              onFocus={() => setShowFormSearchResults(true)}
              placeholder={lang === 'id' ? 'Cari lokasi / kota / provinsi di China (mis: Jiangxi, Yingtan)' : '可输入汉字或拼音精准搜索中国各省、市、区、地标或建筑物...'}
              className="w-full bg-white border border-slate-200 placeholder-slate-400 text-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-400 transition"
            />
            {isSearchingFormAddress ? (
              <div className="absolute right-3.5 inset-y-0 flex items-center">
                <span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
              </div>
            ) : formSearchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setFormSearchQuery('');
                  setFormSearchResults([]);
                  setShowFormSearchResults(false);
                }}
                className="absolute right-2.5 inset-y-0 flex items-center text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : null}

            {/* Suggestions list dropdown */}
            {showFormSearchResults && formSearchResults.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-150 rounded-xl shadow-xl divide-y divide-slate-50 max-h-56 overflow-y-auto select-none z-50">
                {formSearchResults.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectAddressSuggestion(item)}
                    className="w-full text-left p-2.5 hover:bg-blue-50/50 transition cursor-pointer flex items-start gap-2.5"
                  >
                    <div className="p-1 bg-blue-50 text-blue-600 rounded-lg shrink-0 mt-0.5">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold text-slate-800 truncate">
                        {item.name || item.display_name.split(',')[0]}
                      </p>
                      <p className="text-[9px] text-slate-400 leading-tight mt-0.5 line-clamp-2">
                        {item.display_name}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Group 2: Operation address province, city, district + Coordinates Lat & Lon */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 col-span-1">
          <div className="flex flex-col gap-1.5 sm:col-span-1">
            <label className="font-extrabold text-[10px] uppercase text-slate-400 tracking-wider">
              {t.provinceStr}
            </label>
            <input
              type="text"
              value={opProvince}
              onChange={(e) => setOpProvince(e.target.value)}
              placeholder={t.selectProvincePlh}
              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold text-slate-800 focus:outline-hidden"
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-1">
            <label className="font-extrabold text-[10px] uppercase text-slate-400 tracking-wider">
              {t.cityStr}
            </label>
            <input
              type="text"
              value={opCity}
              onChange={(e) => setOpCity(e.target.value)}
              placeholder={t.selectCityPlh}
              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold text-slate-800 focus:outline-hidden"
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-1">
            <label className="font-extrabold text-[10px] uppercase text-slate-400 tracking-wider">
              {t.districtStr}
            </label>
            <input
              type="text"
              value={opDistrict}
              onChange={(e) => setOpDistrict(e.target.value)}
              placeholder={t.selectDistrictPlh}
              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold text-slate-800 focus:outline-hidden"
            />
          </div>

          {/* Latitude Edit Field */}
          <div className="flex flex-col gap-1.5 sm:col-span-1">
            <label className="font-extrabold text-[10px] uppercase text-slate-400 tracking-wider">
              {lang === 'id' ? 'Latitude (Garis Lintang)' : '纬度 (Latitude)'}
            </label>
            <input
              type="number"
              step="any"
              value={opLatitude !== undefined ? opLatitude : ''}
              onChange={(e) => setOpLatitude(e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="-6.2088"
              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold text-slate-800 focus:outline-hidden"
            />
          </div>

          {/* Longitude Edit Field */}
          <div className="flex flex-col gap-1.5 sm:col-span-1">
            <label className="font-extrabold text-[10px] uppercase text-slate-400 tracking-wider">
              {lang === 'id' ? 'Longitude (Garis Bujur)' : '经度 (Longitude)'}
            </label>
            <input
              type="number"
              step="any"
              value={opLongitude !== undefined ? opLongitude : ''}
              onChange={(e) => setOpLongitude(e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="106.8456"
              className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold text-slate-800 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Group 3: Dynamic specifications depending on the Form type */}
        {currentFormType !== 'survey' && (
          <div className="bg-slate-50 p-4 border border-slate-100 rounded-xl flex flex-col gap-4">
            <h4 className="text-[10px] font-extrabold uppercase text-slate-400 tracking-widest leading-none">
              {lang === 'id' ? 'SPESIFIKASI VARIABEL TEKNIS' : '特定类别技术变量'}
            </h4>

            {currentFormType === 'line' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-[11px] text-slate-600 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-blue-500" />
                    {t.longDistancePhones}
                  </label>
                  <input
                    type="number"
                    value={longPhones}
                    onChange={(e) => setLongPhones(Number(e.target.value))}
                    className="bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-hidden"
                    min="0"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-[11px] text-slate-600 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-blue-500" />
                    {t.localPhones}
                  </label>
                  <input
                    type="number"
                    value={locPhones}
                    onChange={(e) => setLocPhones(Number(e.target.value))}
                    className="bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-hidden"
                    min="0"
                  />
                </div>
              </div>
            )}

            {currentFormType === 'installation' && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-[11px] text-slate-600">
                    {lang === 'id' ? 'Jalur Jauh' : '长途线路'}
                  </label>
                  <input
                    type="number"
                    value={longLines}
                    onChange={(e) => setLongLines(Number(e.target.value))}
                    className="bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-hidden"
                    min="0"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-[11px] text-slate-600">
                    {lang === 'id' ? 'Jalur Lokal' : '本地线路'}
                  </label>
                  <input
                    type="number"
                    value={locLines}
                    onChange={(e) => setLocLines(Number(e.target.value))}
                    className="bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-hidden"
                    min="0"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-[11px] text-slate-600">
                    {t.installedLines}
                  </label>
                  <input
                    type="number"
                    value={instLines}
                    onChange={(e) => setInstLines(Number(e.target.value))}
                    className="bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-hidden"
                    min="0"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-[11px] text-slate-600">
                    {t.totalDurationHours}
                  </label>
                  <input
                    type="number"
                    value={totalHour}
                    onChange={(e) => setTotalHour(Number(e.target.value))}
                    className="bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-hidden"
                    min="0"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Description textarea */}
        <div className="flex flex-col gap-1.5">
          <label className="font-extrabold text-[10px] uppercase text-slate-400 tracking-wider">
            {t.descStr}
          </label>
          <textarea
            value={recordDesc}
            onChange={(e) => setRecordDesc(e.target.value)}
            placeholder={t.descPlh}
            rows={4}
            className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold text-slate-850 focus:outline-hidden font-sans"
            required
          />
        </div>

        {/* Custom Picture & Video uploads */}
        <div className="flex flex-col gap-4">
          <label className="font-extrabold text-[10px] uppercase text-slate-400 tracking-wider">
            {t.mediaStr}
          </label>



          {/* Drag and Drop Zone */}
          <div
            id="drag-drop-zone"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                processFiles(e.dataTransfer.files);
              }
            }}
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              isDragging 
                ? 'border-blue-500 bg-blue-50/55' 
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100/40'
            }`}
          >
            <input
              type="file"
              id="local-file-upload"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  processFiles(e.target.files);
                }
              }}
            />
            <label htmlFor="local-file-upload" className="w-full h-full flex flex-col items-center justify-center cursor-pointer">
              {isUploadingLocal ? (
                <div className="flex flex-col items-center gap-2.5 py-4 w-full">
                  <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs font-bold text-slate-700">
                    {lang === 'id' ? 'Sedang mengunggah ke Cloud Storage...' : '正在上传云端存储...'}
                  </span>
                  {uploadProgress && (
                    <div className="w-full max-w-[240px] bg-slate-200 h-3 rounded-full overflow-hidden mt-1 relative border border-slate-300">
                      <div 
                        className="bg-blue-600 h-full rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress.percent}%` }}
                      ></div>
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-slate-700 mix-blend-difference leading-none">
                        {uploadProgress.percent}%
                      </span>
                    </div>
                  )}
                  {uploadProgress && (
                    <span className="text-[10px] font-mono text-slate-500">
                      {lang === 'id' 
                        ? `Berkas ${uploadProgress.current} dari ${uploadProgress.total}`
                        : `正在处理第 ${uploadProgress.current} / ${uploadProgress.total} 个文件`}
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-slate-400 mb-2" />
                  <span className="font-extrabold text-xs text-slate-700">
                    {lang === 'id' ? 'Unggah Berkas Gambar / Video' : '选择图片或视频文件'}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1">
                    {lang === 'id' 
                      ? 'Seret & lepas file di sini, atau klik untuk memilih file dari komputer' 
                      : '拖拽多个文件到此处，或点击浏览本地文件'}
                  </span>
                  <span className="text-[9px] text-slate-450 mt-1 font-medium">
                    {lang === 'id'
                      ? '★ Unggah resolusi tinggi langsung ke Firebase Storage (Maksimal 40MB per berkas).'
                      : '★ 高清大图与视频极速直传 Firebase Storage 专属存储（每个文件上限 40MB）。'}
                  </span>
                </>
              )}
            </label>
          </div>

          {/* Alternative URL Link input */}
          <div className="flex flex-col gap-2 mt-1">
            <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wide">
              {lang === 'id' ? 'Atau masukkan tautan URL alternatif:' : '或者输入其他公开的媒资链接:'}
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder={lang === 'id' ? 'Tempel atau isi URL gambar/video...' : '粘贴公开的图片或视频文件 URL 链接...'}
                className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium text-slate-800 focus:outline-hidden flex-grow"
              />
              <button
                type="button"
                onClick={handleAddUrl}
                className="bg-slate-900 hover:bg-slate-850 text-white rounded-xl px-4 text-xs font-bold flex items-center gap-1 cursor-pointer active:scale-95 transition"
              >
                <Plus className="w-4 h-4" />
                {lang === 'id' ? 'Tambahkan Tautan' : '添加连接'}
              </button>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1.5">
            <span className="text-blue-500">★</span>
            <span>{lang === 'id' ? 'Rekomendasi preset URL gambar demo:' : '一键极速填充演示案例相册：'}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {PRESET_STOCK_IMAGES.map((img, i) => {
              const isAdded = galleryUrls.includes(img);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (isAdded) {
                      setGalleryUrls(galleryUrls.filter(u => u !== img));
                    } else {
                      setGalleryUrls([...galleryUrls, img]);
                    }
                  }}
                  className={`w-14 h-14 rounded-lg overflow-hidden border-2 cursor-pointer transition relative ${isAdded ? 'border-blue-600 scale-95 ring-2 ring-blue-500/20' : 'border-slate-100 opacity-75 hover:opacity-100'}`}
                >
                  <img src={img} className="w-full h-full object-cover" />
                  {isAdded && (
                    <div className="absolute inset-0 bg-blue-600/30 flex items-center justify-center text-white">
                      <Check className="w-4 h-4 font-black" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* List of currently queued URLs with beautiful visual previews */}
          {galleryUrls.length > 0 && (
            <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                  {lang === 'id' ? 'PRATINJAU BERKAS YANG DIUNGGAH:' : '上传文件的图片与视频预览:'} ({galleryUrls.length})
                </span>
                <button
                  type="button"
                  onClick={() => setGalleryUrls([])}
                  className="text-[9px] font-bold text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded-md transition cursor-pointer"
                >
                  {lang === 'id' ? 'Hapus Semua' : '清空全部'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-1">
                {galleryUrls.map((url, idx) => {
                  const isVideo = isMediaVideo(url);
                  return (
                    <div 
                      key={idx} 
                      className="group relative aspect-video sm:aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-xs hover:shadow-md transition duration-200"
                    >
                      {/* Media preview element */}
                      {isVideo ? (
                        <div className="w-full h-full relative">
                          <video 
                            src={url} 
                            className="w-full h-full object-cover" 
                            muted 
                            playsInline
                            disabled={true}
                          />
                          {/* Video Overlay Indicator */}
                          <div className="absolute inset-0 bg-slate-900/10 flex items-center justify-center">
                            <span className="bg-slate-950/80 backdrop-blur-xs text-white text-[9px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                              VIDEO
                            </span>
                          </div>
                        </div>
                      ) : (
                        <img 
                          src={url} 
                          alt="preview" 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover" 
                        />
                      )}

                      {/* Hover Overlay with details & control */}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-2">
                        {/* Delete button (top right) */}
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleRemoveUrl(idx)}
                            className="bg-rose-600 hover:bg-rose-700 text-white rounded-lg p-1.5 shadow-md transform hover:scale-105 transition cursor-pointer"
                            title={lang === 'id' ? 'Hapus' : '删除'}
                          >
                            <X className="w-3.5 h-3.5 font-bold" />
                          </button>
                        </div>

                        {/* Filename / index indicator */}
                        <div className="text-[10px] text-white font-medium truncate drop-shadow-xs bg-black/45 px-1.5 py-0.5 rounded-md self-start max-w-full">
                          {url.startsWith('data:') 
                            ? `${lang === 'id' ? 'Berkas' : '档案'} #${idx + 1}` 
                            : url.split('/').pop() || `URL #${idx + 1}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Submit uploads */}
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold p-3.5 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-blue-500/10 transition mt-2"
        >
          <Upload className="w-4 h-4" />
          {editingBuilding ? t.saveBtn : t.submitUpload}
        </button>

      </form>
    </div>
  );
}
