export type FactoryStatus = 'normal' | 'warning' | 'critical' | 'fire';

export type FactoryLive = {
  id: string;
  name: string;
  shortName: string;
  material: string;
  zone: string;
  address: string;
  district: string;
  lat: number;
  lng: number;
  sensors: {
    gas_ppm: number;
    current_amp: number;
    temperature_c: number;
  };
  sensorVector: number[];
  mahalanobisDistance: number;
  isAnomaly: boolean;
  safetyGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  safetyScore: number;
  status: FactoryStatus;
  fallbackUsed?: boolean;
  incidentActive: boolean;
  recipeMarkdown: string | null;
  updatedAt: string;
};

export type FactoriesResponse = {
  ok: boolean;
  meta: {
    threshold: number;
    featureOrder: string[];
    factoryIds: string[];
  };
  factories: FactoryLive[];
};
