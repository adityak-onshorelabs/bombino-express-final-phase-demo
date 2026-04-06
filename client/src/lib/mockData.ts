export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface TrackingEvent {
  id: string;
  status: string;
  note: string;
  location: string;
  timestamp: Date;
}

export interface Shipment {
  id: string;
  awb: string;
  userId: string;
  originCountry: string;
  originCity: string;
  originState: string;
  originZip: string;
  destCountry: string;
  destCity: string;
  destState: string;
  destPincode: string;
  weightLb: number;
  weightKg: number;
  pieces: number;
  dimLIn?: number;
  dimWIn?: number;
  dimHIn?: number;
  dimLCm?: number;
  dimWCm?: number;
  dimHCm?: number;
  declaredValue?: number;
  currency: string;
  productType: 'Document' | 'Package';
  serviceType: 'Standard' | 'Express';
  status: string;
  statusReason?: string;
  priceEstimate: number;
  eta: Date;
  lastUpdateAt: Date;
  createdAt: Date;
  trackingEvents: TrackingEvent[];
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  severity: 'info' | 'warn';
  createdAt: Date;
  readAt?: Date;
}

export const demoUser: User = {
  id: 'user-1',
  firstName: 'Rahul',
  lastName: 'Sharma',
  email: 'rahul.sharma@email.com',
  phone: '+1 555-123-4567',
};

export const lbToKg = (lb: number): number => lb * 0.453592;
export const kgToLb = (kg: number): number => kg / 0.453592;
export const inToCm = (inches: number): number => inches * 2.54;
export const cmToIn = (cm: number): number => cm / 2.54;

const roundUpToHalfKg = (kg: number): number => {
  return Math.ceil(kg * 2) / 2;
};

export const calculateRateFromLb = (weightLb: number, serviceType: 'Standard' | 'Express'): number => {
  if (serviceType === 'Express') {
    if (weightLb <= 1.0) return 24;
    if (weightLb <= 2.2) return 30;
    if (weightLb <= 4.4) return 44;
    if (weightLb <= 11) return 92;
    const kg = lbToKg(weightLb);
    const roundedKg = roundUpToHalfKg(kg);
    return Math.floor(92 + (roundedKg - 5) * 16);
  } else {
    if (weightLb <= 1.0) return 18;
    if (weightLb <= 2.2) return 22;
    if (weightLb <= 4.4) return 34;
    if (weightLb <= 11) return 72;
    const kg = lbToKg(weightLb);
    const roundedKg = roundUpToHalfKg(kg);
    return Math.floor(72 + (roundedKg - 5) * 12);
  }
};

export const calculateRateFromKg = (weightKg: number, serviceType: 'Standard' | 'Express'): number => {
  const weightLb = kgToLb(weightKg);
  return calculateRateFromLb(weightLb, serviceType);
};

const generateAWB = () => 'BMB' + Math.random().toString().slice(2, 11);

const statuses = [
  'Pickup Scheduled',
  'Picked Up',
  'In Transit',
  'Arrived at Hub',
  'Customs Clearance',
  'Customs Hold',
  'Out for Delivery',
  'Delivered',
  'Exception',
];

const generateTrackingEvents = (status: string, createdAt: Date): TrackingEvent[] => {
  const events: TrackingEvent[] = [];
  const statusIndex = statuses.indexOf(status);
  
  const locations = [
    'New York, NY, USA',
    'JFK International Airport, USA',
    'Mumbai, Maharashtra, India',
    'Delhi Hub, India',
    'Local Delivery Center, India',
  ];
  
  for (let i = 0; i <= Math.min(statusIndex, 4); i++) {
    const eventDate = new Date(createdAt);
    eventDate.setDate(eventDate.getDate() + i);
    eventDate.setHours(9 + i * 3, Math.floor(Math.random() * 60));
    
    events.push({
      id: `event-${Math.random().toString(36).slice(2)}`,
      status: statuses[i],
      note: getStatusNote(statuses[i]),
      location: locations[Math.min(i, locations.length - 1)],
      timestamp: eventDate,
    });
  }
  
  return events;
};

const getStatusNote = (status: string): string => {
  const notes: Record<string, string> = {
    'Pickup Scheduled': 'Shipment pickup has been scheduled',
    'Picked Up': 'Package collected from sender',
    'In Transit': 'Shipment is on the way to destination',
    'Arrived at Hub': 'Package arrived at sorting facility',
    'Customs Clearance': 'Shipment undergoing customs processing',
    'Customs Hold': 'Additional documentation required',
    'Out for Delivery': 'Package is out for final delivery',
    'Delivered': 'Successfully delivered to recipient',
    'Exception': 'Delivery exception - address verification needed',
  };
  return notes[status] || status;
};

const createShipment = (
  status: string,
  daysAgo: number,
  serviceType: 'Standard' | 'Express',
  statusReason?: string
): Shipment => {
  const createdAt = new Date();
  createdAt.setDate(createdAt.getDate() - daysAgo);
  
  const eta = new Date(createdAt);
  eta.setDate(eta.getDate() + (serviceType === 'Express' ? 5 : 8));
  
  const lastUpdate = new Date();
  lastUpdate.setHours(lastUpdate.getHours() - Math.floor(Math.random() * 24));
  
  const cities = [
    { city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
    { city: 'Delhi', state: 'Delhi', pincode: '110001' },
    { city: 'Bangalore', state: 'Karnataka', pincode: '560001' },
    { city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
    { city: 'Hyderabad', state: 'Telangana', pincode: '500001' },
  ];
  
  const dest = cities[Math.floor(Math.random() * cities.length)];
  const weightLb = Math.random() * 8 + 1;
  const weightKg = lbToKg(weightLb);
  
  return {
    id: Math.random().toString(36).slice(2),
    awb: generateAWB(),
    userId: 'user-1',
    originCountry: 'USA',
    originCity: 'New York',
    originState: 'NY',
    originZip: '10001',
    destCountry: 'India',
    destCity: dest.city,
    destState: dest.state,
    destPincode: dest.pincode,
    weightLb: parseFloat(weightLb.toFixed(1)),
    weightKg: parseFloat(weightKg.toFixed(2)),
    pieces: Math.ceil(Math.random() * 3),
    productType: Math.random() > 0.5 ? 'Document' : 'Package',
    serviceType,
    status,
    statusReason,
    priceEstimate: calculateRateFromLb(weightLb, serviceType),
    eta,
    lastUpdateAt: lastUpdate,
    createdAt,
    currency: 'USD',
    trackingEvents: generateTrackingEvents(status, createdAt),
  };
};

export const shipments: Shipment[] = [
  createShipment('Delivered', 12, 'Express'),
  createShipment('Delivered', 15, 'Standard'),
  createShipment('In Transit', 3, 'Express'),
  createShipment('In Transit', 4, 'Standard'),
  createShipment('In Transit', 2, 'Express'),
  createShipment('Customs Hold', 5, 'Standard', 'Additional documentation required for customs clearance'),
  createShipment('Out for Delivery', 6, 'Express'),
  createShipment('Exception', 4, 'Standard', 'Recipient address could not be verified'),
  createShipment('Pickup Scheduled', 0, 'Express'),
  createShipment('Pickup Scheduled', 1, 'Standard'),
];

export const notifications: Notification[] = [
  {
    id: 'notif-1',
    userId: 'user-1',
    title: 'Shipment Created',
    body: `Your shipment ${shipments[8].awb} has been created and pickup is scheduled.`,
    severity: 'info',
    createdAt: new Date(),
  },
  {
    id: 'notif-2',
    userId: 'user-1',
    title: 'Customs Hold Alert',
    body: `Shipment ${shipments[5].awb} is on customs hold. Please provide additional documents.`,
    severity: 'warn',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'notif-3',
    userId: 'user-1',
    title: 'Out for Delivery',
    body: `Great news! Shipment ${shipments[6].awb} is out for delivery today.`,
    severity: 'info',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'notif-4',
    userId: 'user-1',
    title: 'Delivery Exception',
    body: `Shipment ${shipments[7].awb} has an address issue. Please verify recipient details.`,
    severity: 'warn',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
  },
];

export const serviceablePincodes = [
  '400001', '400002', '400003', '400004', '400005',
  '110001', '110002', '110003', '110004', '110005',
  '560001', '560002', '560003', '560004', '560005',
  '600001', '600002', '600003', '600004', '600005',
  '500001', '500002', '500003', '500004', '500005',
  '700001', '700002', '700003', '700004', '700005',
];

export const getShipmentByAWB = (awb: string): Shipment | undefined => {
  return shipments.find(s => s.awb.toLowerCase() === awb.toLowerCase());
};

export const sampleAWBs = [shipments[2].awb, shipments[5].awb];