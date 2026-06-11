export interface Admin {
  id: string; // Document ID (UID)
  email: string;
  name: string;
  createdAt: any; // Server timestamp
}

export interface Surveyor {
  id: string; // Document ID
  name: string;
  phone: string;
  email?: string;
  createdAt: any;
}

export interface Category {
  id: string; // Document ID
  name: string;
  createdAt: any; // Server timestamp
}

export interface GalleryItem {
  url: string;
  caption?: string;
  type?: 'image' | 'video';
}

export interface Building {
  id: string; // Document ID
  name: string; // Operator Title or Site Name
  category: string; // 'survey' | 'line' | 'installation'
  description: string; // detailed notes
  location: string; // full address e.g. "江西省 鹰潭市 月湖区"
  floors: number; // compatible integer field
  gallery: (string | GalleryItem)[]; // photos and videos list
  createdAt: any; // Server timestamp
  updatedAt: any; // Server timestamp
  createdBy: string; // UID of admin who saved it
  
  // High-fidelity fields matching the screenshots
  operator: string; // Name of person who did the operation
  operationTime: string; // datetime string or timestamp
  province: string; // Province
  city: string; // City
  district: string; // District/county
  
  // Survey Specific
  longDistanceLines?: number;
  localLines?: number;

  // Line Specific
  longDistancePhones?: number;
  localPhones?: number;

  // Installation Specific
  installedLines?: number;
  totalDuration?: number; // hours
  latitude?: number;
  longitude?: number;
}

export type DataRecord = Building;
