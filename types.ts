export interface Spot {
    id: number;
    title: string;
    description: string | null;
    latitude: number;
    longitude: number;
    created_at: string;
}

export interface Hotspot {
    id: number;
    title: string;
    latitude: number;
    longitude: number;
    spot_count: number;
    created_at: string;
}

export interface HotspotComment {
    id: number;
    comment: string;
    created_at: string;   
}