export interface ScanBadgeInfo {
  publicId: string;
  status: string;
  count: number;
  createdAt: string;
  keyword: string | null;
}

export interface TamanLocation {
  name: string;
  queryPlace: string;
  scan?: ScanBadgeInfo | null;
}

export interface TownLocation {
  id: string;
  name: string;
  fullName: string;
  queryPlace: string;
  scan?: ScanBadgeInfo | null;
  tamans: TamanLocation[];
}

export interface DistrictLocation {
  id: string;
  num: number;
  name: string;
  state: string;
  totalTamans?: number;
  scannedTamans?: number;
  towns: TownLocation[];
}

export interface StateTerritory {
  state: string;
  districts: DistrictLocation[];
}

export const JOHOR_TERRITORY: StateTerritory = {
  state: 'Johor',
  districts: [
  {
    "id": "johor_johor_bahru",
    "num": 1,
    "name": "Johor Bahru",
    "state": "Johor",
    "towns": [
      {
        "id": "johor_johor_bahru_johor_bahru_city_centre",
        "name": "Johor Bahru City Centre",
        "fullName": "Johor Bahru City Centre & Inner Suburbs (MBJB)",
        "queryPlace": "Johor Bahru City Centre, Johor Bahru, Johor",
        "tamans": [
          {
            "name": "Wadi Hana / Bukit Chagar / Tanjung Puteri",
            "queryPlace": "Wadi Hana / Bukit Chagar / Tanjung Puteri, Johor Bahru City Centre, Johor"
          },
          {
            "name": "Taman Pelangi",
            "queryPlace": "Taman Pelangi, Johor Bahru City Centre, Johor"
          },
          {
            "name": "Taman Century (Taman Abad)",
            "queryPlace": "Taman Century, Johor Bahru City Centre, Johor"
          },
          {
            "name": "Taman Sentosa",
            "queryPlace": "Taman Sentosa, Johor Bahru City Centre, Johor"
          },
          {
            "name": "Taman Sri Tebrau",
            "queryPlace": "Taman Sri Tebrau, Johor Bahru City Centre, Johor"
          },
          {
            "name": "Taman Melodies",
            "queryPlace": "Taman Melodies, Johor Bahru City Centre, Johor"
          },
          {
            "name": "Taman Serene",
            "queryPlace": "Taman Serene, Johor Bahru City Centre, Johor"
          },
          {
            "name": "Taman Kebun Teh",
            "queryPlace": "Taman Kebun Teh, Johor Bahru City Centre, Johor"
          },
          {
            "name": "Taman Kolam Air",
            "queryPlace": "Taman Kolam Air, Johor Bahru City Centre, Johor"
          },
          {
            "name": "Taman Nong Chik",
            "queryPlace": "Taman Nong Chik, Johor Bahru City Centre, Johor"
          },
          {
            "name": "Taman Straits View",
            "queryPlace": "Taman Straits View, Johor Bahru City Centre, Johor"
          },
          {
            "name": "Taman Majidee",
            "queryPlace": "Taman Majidee, Johor Bahru City Centre, Johor"
          },
          {
            "name": "Kampung Melayu Majidee",
            "queryPlace": "Kampung Melayu Majidee, Johor Bahru City Centre, Johor"
          },
          {
            "name": "Stulang Laut & Stulang Darat",
            "queryPlace": "Stulang Laut & Stulang Darat, Johor Bahru City Centre, Johor"
          },
          {
            "name": "Country Garden Danga Bay",
            "queryPlace": "Country Garden Danga Bay, Johor Bahru City Centre, Johor"
          }
        ]
      },
      {
        "id": "johor_johor_bahru_tebrau",
        "name": "Tebrau",
        "fullName": "Tebrau & Mount Austin Corridor (MBJB)",
        "queryPlace": "Tebrau, Johor Bahru, Johor",
        "tamans": [
          {
            "name": "Taman Mount Austin",
            "queryPlace": "Taman Mount Austin, Tebrau, Johor"
          },
          {
            "name": "Austin Heights",
            "queryPlace": "Austin Heights, Tebrau, Johor"
          },
          {
            "name": "Austin Perdana",
            "queryPlace": "Austin Perdana, Tebrau, Johor"
          },
          {
            "name": "Austin Crest",
            "queryPlace": "Austin Crest, Tebrau, Johor"
          },
          {
            "name": "Austin Duta",
            "queryPlace": "Austin Duta, Tebrau, Johor"
          },
          {
            "name": "Crest @ Austin",
            "queryPlace": "Crest @ Austin, Tebrau, Johor"
          },
          {
            "name": "Taman Desa Tebrau",
            "queryPlace": "Taman Desa Tebrau, Tebrau, Johor"
          },
          {
            "name": "Taman Daya",
            "queryPlace": "Taman Daya, Tebrau, Johor"
          },
          {
            "name": "Taman Delima",
            "queryPlace": "Taman Delima, Tebrau, Johor"
          },
          {
            "name": "Bandar Dato' Onn",
            "queryPlace": "Bandar Dato' Onn, Tebrau, Johor"
          },
          {
            "name": "Taman Adda Heights",
            "queryPlace": "Taman Adda Heights, Tebrau, Johor"
          },
          {
            "name": "Taman Seri Austin",
            "queryPlace": "Taman Seri Austin, Tebrau, Johor"
          },
          {
            "name": "Taman Setia Indah",
            "queryPlace": "Taman Setia Indah, Tebrau, Johor"
          },
          {
            "name": "Eco Summer",
            "queryPlace": "Eco Summer, Tebrau, Johor"
          },
          {
            "name": "Eco Spring",
            "queryPlace": "Eco Spring, Tebrau, Johor"
          },
          {
            "name": "Eco Cascadia",
            "queryPlace": "Eco Cascadia, Tebrau, Johor"
          },
          {
            "name": "Bandar Jaya Putra (JP Perdana)",
            "queryPlace": "Bandar Jaya Putra, Tebrau, Johor"
          },
          {
            "name": "Taman Glenmarie Johor Bahru",
            "queryPlace": "Taman Glenmarie Johor Bahru, Tebrau, Johor"
          }
        ]
      },
      {
        "id": "johor_johor_bahru_johor_jaya",
        "name": "Johor Jaya",
        "fullName": "Johor Jaya & Plentong Corridor (MBJB / MBPG)",
        "queryPlace": "Johor Jaya, Johor Bahru, Johor",
        "tamans": [
          {
            "name": "Taman Johor Jaya",
            "queryPlace": "Taman Johor Jaya, Johor Jaya, Johor"
          },
          {
            "name": "Jalan Dedap",
            "queryPlace": "Jalan Dedap, Johor Jaya, Johor"
          },
          {
            "name": "Jalan Ros Merah",
            "queryPlace": "Jalan Ros Merah, Johor Jaya, Johor"
          },
          {
            "name": "Jalan Keembong",
            "queryPlace": "Jalan Keembong, Johor Jaya, Johor"
          },
          {
            "name": "Jalan Teratai",
            "queryPlace": "Jalan Teratai, Johor Jaya, Johor"
          },
          {
            "name": "Jalan Anggerik",
            "queryPlace": "Jalan Anggerik, Johor Jaya, Johor"
          },
          {
            "name": "Jalan Bakawali",
            "queryPlace": "Jalan Bakawali, Johor Jaya, Johor"
          },
          {
            "name": "Taman Molek",
            "queryPlace": "Taman Molek, Johor Jaya, Johor"
          },
          {
            "name": "Taman Redang",
            "queryPlace": "Taman Redang, Johor Jaya, Johor"
          },
          {
            "name": "Taman Ponderosa",
            "queryPlace": "Taman Ponderosa, Johor Jaya, Johor"
          },
          {
            "name": "Taman Saujana (Plentong)",
            "queryPlace": "Taman Saujana, Johor Jaya, Johor"
          },
          {
            "name": "Taman Desa Harmoni",
            "queryPlace": "Taman Desa Harmoni, Johor Jaya, Johor"
          },
          {
            "name": "Taman Sri Plentong",
            "queryPlace": "Taman Sri Plentong, Johor Jaya, Johor"
          },
          {
            "name": "Taman Plentong Baru",
            "queryPlace": "Taman Plentong Baru, Johor Jaya, Johor"
          },
          {
            "name": "Taman Ria Plentong",
            "queryPlace": "Taman Ria Plentong, Johor Jaya, Johor"
          },
          {
            "name": "Bandar Baru Permas Jaya",
            "queryPlace": "Bandar Baru Permas Jaya, Johor Jaya, Johor"
          },
          {
            "name": "Senibong Cove",
            "queryPlace": "Senibong Cove, Johor Jaya, Johor"
          }
        ]
      },
      {
        "id": "johor_johor_bahru_ulu_tiram",
        "name": "Ulu Tiram",
        "fullName": "Ulu Tiram & Tebrau North (MBJB)",
        "queryPlace": "Ulu Tiram, Johor Bahru, Johor",
        "tamans": [
          {
            "name": "Bandar Tiram",
            "queryPlace": "Bandar Tiram, Ulu Tiram, Johor"
          },
          {
            "name": "Taman Pelangi Indah",
            "queryPlace": "Taman Pelangi Indah, Ulu Tiram, Johor"
          },
          {
            "name": "Taman Puteri Wangsa",
            "queryPlace": "Taman Puteri Wangsa, Ulu Tiram, Johor"
          },
          {
            "name": "Taman Gaya",
            "queryPlace": "Taman Gaya, Ulu Tiram, Johor"
          },
          {
            "name": "Taman Desa Cemerlang",
            "queryPlace": "Taman Desa Cemerlang, Ulu Tiram, Johor"
          },
          {
            "name": "Taman Bestari Indah",
            "queryPlace": "Taman Bestari Indah, Ulu Tiram, Johor"
          },
          {
            "name": "Taman Bukit Jaya",
            "queryPlace": "Taman Bukit Jaya, Ulu Tiram, Johor"
          },
          {
            "name": "Taman Tiram Baru",
            "queryPlace": "Taman Tiram Baru, Ulu Tiram, Johor"
          },
          {
            "name": "Taman Nora",
            "queryPlace": "Taman Nora, Ulu Tiram, Johor"
          },
          {
            "name": "Taman Zamrud",
            "queryPlace": "Taman Zamrud, Ulu Tiram, Johor"
          },
          {
            "name": "Taman Berlian",
            "queryPlace": "Taman Berlian, Ulu Tiram, Johor"
          },
          {
            "name": "Taman Mutiara Tropika",
            "queryPlace": "Taman Mutiara Tropika, Ulu Tiram, Johor"
          }
        ]
      },
      {
        "id": "johor_johor_bahru_tampoi_kempas",
        "name": "Tampoi, Kempas",
        "fullName": "Tampoi, Kempas & Larkin (MBJB)",
        "queryPlace": "Tampoi, Kempas, Johor Bahru, Johor",
        "tamans": [
          {
            "name": "Taman Larkin Perdana",
            "queryPlace": "Taman Larkin Perdana, Tampoi, Kempas, Johor"
          },
          {
            "name": "Taman Dato' Onn Jaafar",
            "queryPlace": "Taman Dato' Onn Jaafar, Tampoi, Kempas, Johor"
          },
          {
            "name": "Taman Idaman Larkin",
            "queryPlace": "Taman Idaman Larkin, Tampoi, Kempas, Johor"
          },
          {
            "name": "Larkin Sentral Area",
            "queryPlace": "Larkin Sentral Area, Tampoi, Kempas, Johor"
          },
          {
            "name": "Taman Suria (Tampoi/Larkin)",
            "queryPlace": "Taman Suria, Tampoi, Kempas, Johor"
          },
          {
            "name": "Bandar Baru UDA (BBU)",
            "queryPlace": "Bandar Baru UDA, Tampoi, Kempas, Johor"
          },
          {
            "name": "Taman Tampoi Indah (1 & 2)",
            "queryPlace": "Taman Tampoi Indah, Tampoi, Kempas, Johor"
          },
          {
            "name": "Taman Tampoi Utama",
            "queryPlace": "Taman Tampoi Utama, Tampoi, Kempas, Johor"
          },
          {
            "name": "Taman Dahlia",
            "queryPlace": "Taman Dahlia, Tampoi, Kempas, Johor"
          },
          {
            "name": "Taman Kobena",
            "queryPlace": "Taman Kobena, Tampoi, Kempas, Johor"
          },
          {
            "name": "Taman Kemas",
            "queryPlace": "Taman Kemas, Tampoi, Kempas, Johor"
          },
          {
            "name": "Taman Skudai Kanan / Kiri",
            "queryPlace": "Taman Skudai Kanan / Kiri, Tampoi, Kempas, Johor"
          },
          {
            "name": "Taman Damansara Aliff (Aliff Oval)",
            "queryPlace": "Taman Damansara Aliff, Tampoi, Kempas, Johor"
          },
          {
            "name": "Taman Angsana",
            "queryPlace": "Taman Angsana, Tampoi, Kempas, Johor"
          },
          {
            "name": "Kempas Denai",
            "queryPlace": "Kempas Denai, Tampoi, Kempas, Johor"
          },
          {
            "name": "Taman Kempas Indah",
            "queryPlace": "Taman Kempas Indah, Tampoi, Kempas, Johor"
          },
          {
            "name": "Taman Kempas Utama",
            "queryPlace": "Taman Kempas Utama, Tampoi, Kempas, Johor"
          },
          {
            "name": "Taman Sinaran Kempas",
            "queryPlace": "Taman Sinaran Kempas, Tampoi, Kempas, Johor"
          },
          {
            "name": "Taman Setia Tropika",
            "queryPlace": "Taman Setia Tropika, Tampoi, Kempas, Johor"
          }
        ]
      },
      {
        "id": "johor_johor_bahru_iskandar_puteri",
        "name": "Iskandar Puteri",
        "fullName": "Iskandar Puteri Core & Medini (MBIP)",
        "queryPlace": "Iskandar Puteri, Johor Bahru, Johor",
        "tamans": [
          {
            "name": "Kota Iskandar",
            "queryPlace": "Kota Iskandar, Iskandar Puteri, Johor"
          },
          {
            "name": "Puteri Harbour",
            "queryPlace": "Puteri Harbour, Iskandar Puteri, Johor"
          },
          {
            "name": "Medini Iskandar",
            "queryPlace": "Medini Iskandar, Iskandar Puteri, Johor"
          },
          {
            "name": "Sunway City Iskandar Puteri",
            "queryPlace": "Sunway City Iskandar Puteri, Iskandar Puteri, Johor"
          },
          {
            "name": "Eco Botanic (Eco Botanic 1 & 2)",
            "queryPlace": "Eco Botanic, Iskandar Puteri, Johor"
          },
          {
            "name": "Horizon Hills",
            "queryPlace": "Horizon Hills, Iskandar Puteri, Johor"
          },
          {
            "name": "East Ledang",
            "queryPlace": "East Ledang, Iskandar Puteri, Johor"
          },
          {
            "name": "Ledang Heights",
            "queryPlace": "Ledang Heights, Iskandar Puteri, Johor"
          },
          {
            "name": "Leisure Farm Resort",
            "queryPlace": "Leisure Farm Resort, Iskandar Puteri, Johor"
          }
        ]
      },
      {
        "id": "johor_johor_bahru_bukit_indah_perling",
        "name": "Bukit Indah, Perling",
        "fullName": "Bukit Indah, Perling & Sutera (MBIP)",
        "queryPlace": "Bukit Indah, Perling, Johor Bahru, Johor",
        "tamans": [
          {
            "name": "Taman Bukit Indah (Bukit Indah 1 & 2)",
            "queryPlace": "Taman Bukit Indah, Bukit Indah, Perling, Johor"
          },
          {
            "name": "Taman Perling",
            "queryPlace": "Taman Perling, Bukit Indah, Perling, Johor"
          },
          {
            "name": "Taman Baiduri",
            "queryPlace": "Taman Baiduri, Bukit Indah, Perling, Johor"
          },
          {
            "name": "Taman Sutera Utama",
            "queryPlace": "Taman Sutera Utama, Bukit Indah, Perling, Johor"
          },
          {
            "name": "Taman Sutera (Perling)",
            "queryPlace": "Taman Sutera, Bukit Indah, Perling, Johor"
          },
          {
            "name": "Danga Sutera",
            "queryPlace": "Danga Sutera, Bukit Indah, Perling, Johor"
          },
          {
            "name": "Taman Nusa Bestari (Nusa Bestari 1 & 2)",
            "queryPlace": "Taman Nusa Bestari, Bukit Indah, Perling, Johor"
          },
          {
            "name": "Taman Nusa Duta",
            "queryPlace": "Taman Nusa Duta, Bukit Indah, Perling, Johor"
          },
          {
            "name": "Taman Nusa Idaman (Precinct 1 – 8)",
            "queryPlace": "Taman Nusa Idaman, Bukit Indah, Perling, Johor"
          },
          {
            "name": "Taman Nusa Sentral",
            "queryPlace": "Taman Nusa Sentral, Bukit Indah, Perling, Johor"
          },
          {
            "name": "Taman Nusa Bayu",
            "queryPlace": "Taman Nusa Bayu, Bukit Indah, Perling, Johor"
          },
          {
            "name": "Taman Nusa Indah",
            "queryPlace": "Taman Nusa Indah, Bukit Indah, Perling, Johor"
          }
        ]
      },
      {
        "id": "johor_johor_bahru_skudai",
        "name": "Skudai",
        "fullName": "Skudai & Kangkar Pulai (MBIP)",
        "queryPlace": "Skudai, Johor Bahru, Johor",
        "tamans": [
          {
            "name": "Taman Universiti",
            "queryPlace": "Taman Universiti, Skudai, Johor"
          },
          {
            "name": "Taman Ungku Tun Aminah (TUTA)",
            "queryPlace": "Taman Ungku Tun Aminah, Skudai, Johor"
          },
          {
            "name": "Taman Mutiara Rini",
            "queryPlace": "Taman Mutiara Rini, Skudai, Johor"
          },
          {
            "name": "Taman Mutiara Mas",
            "queryPlace": "Taman Mutiara Mas, Skudai, Johor"
          },
          {
            "name": "Taman Skudai Baru",
            "queryPlace": "Taman Skudai Baru, Skudai, Johor"
          },
          {
            "name": "Taman Sri Skudai",
            "queryPlace": "Taman Sri Skudai, Skudai, Johor"
          },
          {
            "name": "Taman Desa Skudai",
            "queryPlace": "Taman Desa Skudai, Skudai, Johor"
          },
          {
            "name": "Taman Bukit Mewah",
            "queryPlace": "Taman Bukit Mewah, Skudai, Johor"
          },
          {
            "name": "Taman Mewah",
            "queryPlace": "Taman Mewah, Skudai, Johor"
          },
          {
            "name": "Taman Damai Jaya",
            "queryPlace": "Taman Damai Jaya, Skudai, Johor"
          },
          {
            "name": "Taman Selesa Jaya",
            "queryPlace": "Taman Selesa Jaya, Skudai, Johor"
          },
          {
            "name": "Taman Sri Orkid",
            "queryPlace": "Taman Sri Orkid, Skudai, Johor"
          },
          {
            "name": "Taman Pulai Flora",
            "queryPlace": "Taman Pulai Flora, Skudai, Johor"
          },
          {
            "name": "Taman Pulai Utama",
            "queryPlace": "Taman Pulai Utama, Skudai, Johor"
          },
          {
            "name": "Kangkar Pulai Town",
            "queryPlace": "Kangkar Pulai Town, Skudai, Johor"
          },
          {
            "name": "Bandar Baru Kangkar Pulai",
            "queryPlace": "Bandar Baru Kangkar Pulai, Skudai, Johor"
          },
          {
            "name": "Taman Pulai Indah",
            "queryPlace": "Taman Pulai Indah, Skudai, Johor"
          },
          {
            "name": "Taman Pulai Hijauan",
            "queryPlace": "Taman Pulai Hijauan, Skudai, Johor"
          },
          {
            "name": "Taman Pulai Mutiara",
            "queryPlace": "Taman Pulai Mutiara, Skudai, Johor"
          },
          {
            "name": "Taman Pulai Bestari",
            "queryPlace": "Taman Pulai Bestari, Skudai, Johor"
          },
          {
            "name": "Taman Pulai Emas",
            "queryPlace": "Taman Pulai Emas, Skudai, Johor"
          },
          {
            "name": "Taman Sri Pulai",
            "queryPlace": "Taman Sri Pulai, Skudai, Johor"
          },
          {
            "name": "Taman Sri Pulai Perdana",
            "queryPlace": "Taman Sri Pulai Perdana, Skudai, Johor"
          }
        ]
      },
      {
        "id": "johor_johor_bahru_gelang_patah",
        "name": "Gelang Patah",
        "fullName": "Gelang Patah & Tanjung Kupang (MBIP)",
        "queryPlace": "Gelang Patah, Johor Bahru, Johor",
        "tamans": [
          {
            "name": "Gelang Patah Town",
            "queryPlace": "Gelang Patah Town, Gelang Patah, Johor"
          },
          {
            "name": "Taman Nusa Perintis (1, 2, 3)",
            "queryPlace": "Taman Nusa Perintis, Gelang Patah, Johor"
          },
          {
            "name": "Taman Nusantara",
            "queryPlace": "Taman Nusantara, Gelang Patah, Johor"
          },
          {
            "name": "Taman Nusantara Prima",
            "queryPlace": "Taman Nusantara Prima, Gelang Patah, Johor"
          },
          {
            "name": "Setia Eco Garden",
            "queryPlace": "Setia Eco Garden, Gelang Patah, Johor"
          },
          {
            "name": "Taman Mas (Gelang Patah)",
            "queryPlace": "Taman Mas, Gelang Patah, Johor"
          },
          {
            "name": "Taman Gelang Emas",
            "queryPlace": "Taman Gelang Emas, Gelang Patah, Johor"
          },
          {
            "name": "Taman Tanjong Adang",
            "queryPlace": "Taman Tanjong Adang, Gelang Patah, Johor"
          },
          {
            "name": "Tanjung Kupang",
            "queryPlace": "Tanjung Kupang, Gelang Patah, Johor"
          },
          {
            "name": "Forest City",
            "queryPlace": "Forest City, Gelang Patah, Johor"
          }
        ]
      },
      {
        "id": "johor_johor_bahru_pasir_gudang",
        "name": "Pasir Gudang",
        "fullName": "Pasir Gudang Core (MBPG)",
        "queryPlace": "Pasir Gudang, Johor Bahru, Johor",
        "tamans": [
          {
            "name": "Pusat Bandar Pasir Gudang",
            "queryPlace": "Pusat Bandar Pasir Gudang, Pasir Gudang, Johor"
          },
          {
            "name": "Taman Pasir Putih",
            "queryPlace": "Taman Pasir Putih, Pasir Gudang, Johor"
          },
          {
            "name": "Taman Bukit Dahlia",
            "queryPlace": "Taman Bukit Dahlia, Pasir Gudang, Johor"
          },
          {
            "name": "Taman Air Biru",
            "queryPlace": "Taman Air Biru, Pasir Gudang, Johor"
          },
          {
            "name": "Taman Mawar",
            "queryPlace": "Taman Mawar, Pasir Gudang, Johor"
          },
          {
            "name": "Taman Cendana",
            "queryPlace": "Taman Cendana, Pasir Gudang, Johor"
          },
          {
            "name": "Taman Nusa Damai",
            "queryPlace": "Taman Nusa Damai, Pasir Gudang, Johor"
          },
          {
            "name": "Taman Scientex Pasir Gudang",
            "queryPlace": "Taman Scientex Pasir Gudang, Pasir Gudang, Johor"
          },
          {
            "name": "Taman Kota Masai (Eco Tropics)",
            "queryPlace": "Taman Kota Masai, Pasir Gudang, Johor"
          },
          {
            "name": "Taman Pasir Putih Baru",
            "queryPlace": "Taman Pasir Putih Baru, Pasir Gudang, Johor"
          },
          {
            "name": "Taman Tanjong Puteri Resort",
            "queryPlace": "Taman Tanjong Puteri Resort, Pasir Gudang, Johor"
          },
          {
            "name": "Kawasan Perindustrian Pasir Gudang",
            "queryPlace": "Kawasan Perindustrian Pasir Gudang, Pasir Gudang, Johor"
          },
          {
            "name": "Kawasan Perindustrian Tanjung Langsat",
            "queryPlace": "Kawasan Perindustrian Tanjung Langsat, Pasir Gudang, Johor"
          }
        ]
      },
      {
        "id": "johor_johor_bahru_masai",
        "name": "Masai",
        "fullName": "Masai & Seri Alam (MBPG)",
        "queryPlace": "Masai, Johor Bahru, Johor",
        "tamans": [
          {
            "name": "Bandar Seri Alam",
            "queryPlace": "Bandar Seri Alam, Masai, Johor"
          },
          {
            "name": "Taman Rinting",
            "queryPlace": "Taman Rinting, Masai, Johor"
          },
          {
            "name": "Taman Megah Ria",
            "queryPlace": "Taman Megah Ria, Masai, Johor"
          },
          {
            "name": "Taman Masai Utama",
            "queryPlace": "Taman Masai Utama, Masai, Johor"
          },
          {
            "name": "Taman Masai Jaya",
            "queryPlace": "Taman Masai Jaya, Masai, Johor"
          },
          {
            "name": "Taman Bukit Tiram (Masai)",
            "queryPlace": "Taman Bukit Tiram, Masai, Johor"
          },
          {
            "name": "Taman Cahaya Kota Puteri",
            "queryPlace": "Taman Cahaya Kota Puteri, Masai, Johor"
          },
          {
            "name": "Taman Sierra Perdana",
            "queryPlace": "Taman Sierra Perdana, Masai, Johor"
          },
          {
            "name": "Taman Flora Heights",
            "queryPlace": "Taman Flora Heights, Masai, Johor"
          },
          {
            "name": "Taman Seri Megah",
            "queryPlace": "Taman Seri Megah, Masai, Johor"
          },
          {
            "name": "Taman Tanjung Puteri",
            "queryPlace": "Taman Tanjung Puteri, Masai, Johor"
          }
        ]
      }
    ]
  },
  {
    "id": "johor_kulai",
    "num": 2,
    "name": "Kulai",
    "state": "Johor",
    "towns": [
      {
        "id": "johor_kulai_kulai",
        "name": "Kulai",
        "fullName": "Kulai Town",
        "queryPlace": "Kulai, Kulai, Johor",
        "tamans": [
          {
            "name": "Bandar Putra Kulai (IOI)",
            "queryPlace": "Bandar Putra Kulai, Kulai, Johor"
          },
          {
            "name": "Taman Putri Kulai",
            "queryPlace": "Taman Putri Kulai, Kulai, Johor"
          },
          {
            "name": "Kulai Indahpura (Genting Indahpura)",
            "queryPlace": "Kulai Indahpura, Kulai, Johor"
          },
          {
            "name": "Taman Kulai Besar",
            "queryPlace": "Taman Kulai Besar, Kulai, Johor"
          },
          {
            "name": "Taman Kulai",
            "queryPlace": "Taman Kulai, Kulai, Johor"
          },
          {
            "name": "Taman Kulai Utama",
            "queryPlace": "Taman Kulai Utama, Kulai, Johor"
          },
          {
            "name": "Taman Sri Kulai",
            "queryPlace": "Taman Sri Kulai, Kulai, Johor"
          },
          {
            "name": "Taman Sri Kulai Baru",
            "queryPlace": "Taman Sri Kulai Baru, Kulai, Johor"
          },
          {
            "name": "Taman Bersatu",
            "queryPlace": "Taman Bersatu, Kulai, Johor"
          },
          {
            "name": "Taman Khet Long",
            "queryPlace": "Taman Khet Long, Kulai, Johor"
          },
          {
            "name": "Taman Permai",
            "queryPlace": "Taman Permai, Kulai, Johor"
          },
          {
            "name": "Taman Sri Sentosa",
            "queryPlace": "Taman Sri Sentosa, Kulai, Johor"
          },
          {
            "name": "Taman Lagenda Putra",
            "queryPlace": "Taman Lagenda Putra, Kulai, Johor"
          },
          {
            "name": "Taman Scientex Kulai",
            "queryPlace": "Taman Scientex Kulai, Kulai, Johor"
          },
          {
            "name": "Taman Saujana Jaya",
            "queryPlace": "Taman Saujana Jaya, Kulai, Johor"
          },
          {
            "name": "Taman Mewah",
            "queryPlace": "Taman Mewah, Kulai, Johor"
          },
          {
            "name": "Taman Gemilang",
            "queryPlace": "Taman Gemilang, Kulai, Johor"
          },
          {
            "name": "Taman Mas (Kulai)",
            "queryPlace": "Taman Mas, Kulai, Johor"
          },
          {
            "name": "Taman Saga",
            "queryPlace": "Taman Saga, Kulai, Johor"
          },
          {
            "name": "Taman Anggerik",
            "queryPlace": "Taman Anggerik, Kulai, Johor"
          },
          {
            "name": "Taman Murni",
            "queryPlace": "Taman Murni, Kulai, Johor"
          },
          {
            "name": "Taman Cantik",
            "queryPlace": "Taman Cantik, Kulai, Johor"
          },
          {
            "name": "Taman Senai Permai",
            "queryPlace": "Taman Senai Permai, Kulai, Johor"
          },
          {
            "name": "Taman Muhibbah",
            "queryPlace": "Taman Muhibbah, Kulai, Johor"
          },
          {
            "name": "Taman D'Putra Suites Area",
            "queryPlace": "Taman D'Putra Suites Area, Kulai, Johor"
          }
        ]
      },
      {
        "id": "johor_kulai_senai",
        "name": "Senai",
        "fullName": "Senai",
        "queryPlace": "Senai, Kulai, Johor",
        "tamans": [
          {
            "name": "Taman Senai Utama",
            "queryPlace": "Taman Senai Utama, Senai, Johor"
          },
          {
            "name": "Taman Senai Baru",
            "queryPlace": "Taman Senai Baru, Senai, Johor"
          },
          {
            "name": "Taman Bintang Senai",
            "queryPlace": "Taman Bintang Senai, Senai, Johor"
          },
          {
            "name": "Taman Sri Senai",
            "queryPlace": "Taman Sri Senai, Senai, Johor"
          },
          {
            "name": "Taman Senai Indah",
            "queryPlace": "Taman Senai Indah, Senai, Johor"
          },
          {
            "name": "Taman Impian Senai",
            "queryPlace": "Taman Impian Senai, Senai, Johor"
          },
          {
            "name": "Taman Handal",
            "queryPlace": "Taman Handal, Senai, Johor"
          },
          {
            "name": "Taman Desa Idaman",
            "queryPlace": "Taman Desa Idaman, Senai, Johor"
          },
          {
            "name": "Taman Bukit Senai",
            "queryPlace": "Taman Bukit Senai, Senai, Johor"
          },
          {
            "name": "Taman DAP Senai",
            "queryPlace": "Taman DAP Senai, Senai, Johor"
          },
          {
            "name": "Taman Bahagia (Senai)",
            "queryPlace": "Taman Bahagia, Senai, Johor"
          },
          {
            "name": "Scientex Senai",
            "queryPlace": "Scientex Senai, Senai, Johor"
          },
          {
            "name": "Eco Business Park II",
            "queryPlace": "Eco Business Park II, Senai, Johor"
          },
          {
            "name": "Senai Airport City Commercial & Industrial Zone",
            "queryPlace": "Senai Airport City Commercial & Industrial Zone, Senai, Johor"
          }
        ]
      },
      {
        "id": "johor_kulai_saleng",
        "name": "Saleng",
        "fullName": "Saleng",
        "queryPlace": "Saleng, Kulai, Johor",
        "tamans": [
          {
            "name": "Taman Saleng Baru",
            "queryPlace": "Taman Saleng Baru, Saleng, Johor"
          },
          {
            "name": "Taman Saleng Gaya",
            "queryPlace": "Taman Saleng Gaya, Saleng, Johor"
          },
          {
            "name": "Taman Saleng Indah",
            "queryPlace": "Taman Saleng Indah, Saleng, Johor"
          },
          {
            "name": "Taman Sri Saleng",
            "queryPlace": "Taman Sri Saleng, Saleng, Johor"
          },
          {
            "name": "Taman Sutera (Saleng)",
            "queryPlace": "Taman Sutera, Saleng, Johor"
          },
          {
            "name": "Kampung Baru Saleng",
            "queryPlace": "Kampung Baru Saleng, Saleng, Johor"
          }
        ]
      },
      {
        "id": "johor_kulai_kelapa_sawit",
        "name": "Kelapa Sawit",
        "fullName": "Kelapa Sawit",
        "queryPlace": "Kelapa Sawit, Kulai, Johor",
        "tamans": [
          {
            "name": "Taman Manis (Fasa 1, 2, 3)",
            "queryPlace": "Taman Manis, Kelapa Sawit, Johor"
          },
          {
            "name": "Taman Kelapa Sawit",
            "queryPlace": "Taman Kelapa Sawit, Kelapa Sawit, Johor"
          },
          {
            "name": "Taman Sawit Indah",
            "queryPlace": "Taman Sawit Indah, Kelapa Sawit, Johor"
          },
          {
            "name": "Taman Sri Sawit",
            "queryPlace": "Taman Sri Sawit, Kelapa Sawit, Johor"
          },
          {
            "name": "Kampung Baru Kelapa Sawit",
            "queryPlace": "Kampung Baru Kelapa Sawit, Kelapa Sawit, Johor"
          }
        ]
      },
      {
        "id": "johor_kulai_sedenak",
        "name": "Sedenak",
        "fullName": "Sedenak & Bukit Batu",
        "queryPlace": "Sedenak, Kulai, Johor",
        "tamans": [
          {
            "name": "Kampung Baru Sedenak",
            "queryPlace": "Kampung Baru Sedenak, Sedenak, Johor"
          },
          {
            "name": "Felda Bukit Batu",
            "queryPlace": "Felda Bukit Batu, Sedenak, Johor"
          },
          {
            "name": "Taman Bukit Batu",
            "queryPlace": "Taman Bukit Batu, Sedenak, Johor"
          },
          {
            "name": "Kampung Ayer Manis",
            "queryPlace": "Kampung Ayer Manis, Sedenak, Johor"
          }
        ]
      },
      {
        "id": "johor_kulai_seelong",
        "name": "Seelong",
        "fullName": "Seelong",
        "queryPlace": "Seelong, Kulai, Johor",
        "tamans": [
          {
            "name": "Kampung Seelong",
            "queryPlace": "Kampung Seelong, Seelong, Johor"
          },
          {
            "name": "Kampung Seelong Jaya",
            "queryPlace": "Kampung Seelong Jaya, Seelong, Johor"
          },
          {
            "name": "Taman Perindustrian Seelong",
            "queryPlace": "Taman Perindustrian Seelong, Seelong, Johor"
          }
        ]
      }
    ]
  },
  {
    "id": "johor_batu_pahat",
    "num": 3,
    "name": "Batu Pahat",
    "state": "Johor",
    "towns": [
      {
        "id": "johor_batu_pahat_bandar_penggaram",
        "name": "Bandar Penggaram",
        "fullName": "Bandar Penggaram (Batu Pahat Town Core)",
        "queryPlace": "Bandar Penggaram, Batu Pahat, Johor",
        "tamans": [
          {
            "name": "Taman Bukit Perdana (1 & 2)",
            "queryPlace": "Taman Bukit Perdana, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Soga",
            "queryPlace": "Taman Soga, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Banang Jaya",
            "queryPlace": "Taman Banang Jaya, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Bandar",
            "queryPlace": "Taman Bandar, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Desa Botani",
            "queryPlace": "Taman Desa Botani, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Bukit Mutiara",
            "queryPlace": "Taman Bukit Mutiara, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Kemajuan",
            "queryPlace": "Taman Kemajuan, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Tanjung & Taman Tanjung Indah",
            "queryPlace": "Taman Tanjung & Taman Tanjung Indah, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Ampang Jaya",
            "queryPlace": "Taman Ampang Jaya, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Ampuan",
            "queryPlace": "Taman Ampuan, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Pantai Baru",
            "queryPlace": "Taman Pantai Baru, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Flora Utama",
            "queryPlace": "Taman Flora Utama, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Maju",
            "queryPlace": "Taman Maju, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Pegawai",
            "queryPlace": "Taman Pegawai, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Koperasi Bahagia",
            "queryPlace": "Taman Koperasi Bahagia, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Bukit Pasir (Batu Pahat)",
            "queryPlace": "Taman Bukit Pasir, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Megah",
            "queryPlace": "Taman Megah, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Mutiara Perdana",
            "queryPlace": "Taman Mutiara Perdana, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Pelangi (Batu Pahat)",
            "queryPlace": "Taman Pelangi, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Beroleh",
            "queryPlace": "Taman Beroleh, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Damai (Batu Pahat)",
            "queryPlace": "Taman Damai, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Mewah",
            "queryPlace": "Taman Mewah, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Limpoon",
            "queryPlace": "Taman Limpoon, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Setia Jaya",
            "queryPlace": "Taman Setia Jaya, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Gembira",
            "queryPlace": "Taman Gembira, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Bukit Permai",
            "queryPlace": "Taman Bukit Permai, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Bukit Indah (Batu Pahat)",
            "queryPlace": "Taman Bukit Indah, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Orchard Heights",
            "queryPlace": "Taman Orchard Heights, Bandar Penggaram, Johor"
          },
          {
            "name": "Taman Puteri Indah",
            "queryPlace": "Taman Puteri Indah, Bandar Penggaram, Johor"
          }
        ]
      },
      {
        "id": "johor_batu_pahat_yong_peng",
        "name": "Yong Peng",
        "fullName": "Yong Peng (MDYP)",
        "queryPlace": "Yong Peng, Batu Pahat, Johor",
        "tamans": [
          {
            "name": "Taman Selatan & Taman Selatan Baru",
            "queryPlace": "Taman Selatan & Taman Selatan Baru, Yong Peng, Johor"
          },
          {
            "name": "Taman Berlian",
            "queryPlace": "Taman Berlian, Yong Peng, Johor"
          },
          {
            "name": "Taman Desa Yong Peng Baru",
            "queryPlace": "Taman Desa Yong Peng Baru, Yong Peng, Johor"
          },
          {
            "name": "Taman Durian",
            "queryPlace": "Taman Durian, Yong Peng, Johor"
          },
          {
            "name": "Taman Suria (Yong Peng)",
            "queryPlace": "Taman Suria, Yong Peng, Johor"
          },
          {
            "name": "Taman Madu",
            "queryPlace": "Taman Madu, Yong Peng, Johor"
          },
          {
            "name": "Taman Sri Aman",
            "queryPlace": "Taman Sri Aman, Yong Peng, Johor"
          },
          {
            "name": "Taman Kotamas",
            "queryPlace": "Taman Kotamas, Yong Peng, Johor"
          },
          {
            "name": "Taman Sembrong & Taman Sembrong Baru",
            "queryPlace": "Taman Sembrong & Taman Sembrong Baru, Yong Peng, Johor"
          },
          {
            "name": "Taman Bandar Cahaya Baru",
            "queryPlace": "Taman Bandar Cahaya Baru, Yong Peng, Johor"
          },
          {
            "name": "Taman Seri Bayu",
            "queryPlace": "Taman Seri Bayu, Yong Peng, Johor"
          },
          {
            "name": "Taman Kota",
            "queryPlace": "Taman Kota, Yong Peng, Johor"
          },
          {
            "name": "Taman Utama (Yong Peng)",
            "queryPlace": "Taman Utama, Yong Peng, Johor"
          },
          {
            "name": "Taman Mewah (Yong Peng)",
            "queryPlace": "Taman Mewah, Yong Peng, Johor"
          },
          {
            "name": "Taman Sutera (Yong Peng)",
            "queryPlace": "Taman Sutera, Yong Peng, Johor"
          },
          {
            "name": "Taman Sri Bertam",
            "queryPlace": "Taman Sri Bertam, Yong Peng, Johor"
          },
          {
            "name": "Taman Bukit Tropika",
            "queryPlace": "Taman Bukit Tropika, Yong Peng, Johor"
          },
          {
            "name": "Taman Sinar Impian",
            "queryPlace": "Taman Sinar Impian, Yong Peng, Johor"
          },
          {
            "name": "Taman Kota Impian",
            "queryPlace": "Taman Kota Impian, Yong Peng, Johor"
          },
          {
            "name": "Taman Damai Jaya",
            "queryPlace": "Taman Damai Jaya, Yong Peng, Johor"
          },
          {
            "name": "Taman Orkid (Yong Peng)",
            "queryPlace": "Taman Orkid, Yong Peng, Johor"
          }
        ]
      },
      {
        "id": "johor_batu_pahat_ayer_hitam",
        "name": "Ayer Hitam",
        "fullName": "Ayer Hitam (MDYP)",
        "queryPlace": "Ayer Hitam, Batu Pahat, Johor",
        "tamans": [
          {
            "name": "Taman Bukit Indah (Ayer Hitam)",
            "queryPlace": "Taman Bukit Indah, Ayer Hitam, Johor"
          },
          {
            "name": "Taman Perdana (Ayer Hitam)",
            "queryPlace": "Taman Perdana, Ayer Hitam, Johor"
          },
          {
            "name": "Taman Suria Ayer Hitam",
            "queryPlace": "Taman Suria Ayer Hitam, Ayer Hitam, Johor"
          },
          {
            "name": "Taman UPC",
            "queryPlace": "Taman UPC, Ayer Hitam, Johor"
          },
          {
            "name": "Taman Mekar & Taman Mekar Emas",
            "queryPlace": "Taman Mekar & Taman Mekar Emas, Ayer Hitam, Johor"
          },
          {
            "name": "Taman Kirana",
            "queryPlace": "Taman Kirana, Ayer Hitam, Johor"
          },
          {
            "name": "Taman Desa Baru",
            "queryPlace": "Taman Desa Baru, Ayer Hitam, Johor"
          },
          {
            "name": "Taman Ros (Taman Pahlawan)",
            "queryPlace": "Taman Ros, Ayer Hitam, Johor"
          },
          {
            "name": "Taman Indah Jaya",
            "queryPlace": "Taman Indah Jaya, Ayer Hitam, Johor"
          },
          {
            "name": "Taman Harmoni",
            "queryPlace": "Taman Harmoni, Ayer Hitam, Johor"
          }
        ]
      },
      {
        "id": "johor_batu_pahat_parit_raja",
        "name": "Parit Raja",
        "fullName": "Parit Raja",
        "queryPlace": "Parit Raja, Batu Pahat, Johor",
        "tamans": [
          {
            "name": "Taman Manis (Parit Raja)",
            "queryPlace": "Taman Manis, Parit Raja, Johor"
          },
          {
            "name": "Taman Melewar",
            "queryPlace": "Taman Melewar, Parit Raja, Johor"
          },
          {
            "name": "Taman Maju & Taman Maju Baru",
            "queryPlace": "Taman Maju & Taman Maju Baru, Parit Raja, Johor"
          },
          {
            "name": "Taman Wira Jaya",
            "queryPlace": "Taman Wira Jaya, Parit Raja, Johor"
          },
          {
            "name": "Taman Impian",
            "queryPlace": "Taman Impian, Parit Raja, Johor"
          },
          {
            "name": "Taman Bandar Universiti",
            "queryPlace": "Taman Bandar Universiti, Parit Raja, Johor"
          },
          {
            "name": "Taman Parit Raja",
            "queryPlace": "Taman Parit Raja, Parit Raja, Johor"
          },
          {
            "name": "Taman Aked",
            "queryPlace": "Taman Aked, Parit Raja, Johor"
          },
          {
            "name": "Taman Siswa Jaya",
            "queryPlace": "Taman Siswa Jaya, Parit Raja, Johor"
          },
          {
            "name": "Taman Kelisa Jaya",
            "queryPlace": "Taman Kelisa Jaya, Parit Raja, Johor"
          },
          {
            "name": "Taman Firus",
            "queryPlace": "Taman Firus, Parit Raja, Johor"
          },
          {
            "name": "Taman Wira Budiman",
            "queryPlace": "Taman Wira Budiman, Parit Raja, Johor"
          },
          {
            "name": "Taman Robena",
            "queryPlace": "Taman Robena, Parit Raja, Johor"
          },
          {
            "name": "Taman Sedap",
            "queryPlace": "Taman Sedap, Parit Raja, Johor"
          },
          {
            "name": "Taman Persona Indah",
            "queryPlace": "Taman Persona Indah, Parit Raja, Johor"
          },
          {
            "name": "Taman Rona",
            "queryPlace": "Taman Rona, Parit Raja, Johor"
          }
        ]
      },
      {
        "id": "johor_batu_pahat_sri_gading",
        "name": "Sri Gading",
        "fullName": "Sri Gading",
        "queryPlace": "Sri Gading, Batu Pahat, Johor",
        "tamans": [
          {
            "name": "Bandar Genting Pura Kencana",
            "queryPlace": "Bandar Genting Pura Kencana, Sri Gading, Johor"
          },
          {
            "name": "Taman Mutiara Gading",
            "queryPlace": "Taman Mutiara Gading, Sri Gading, Johor"
          },
          {
            "name": "Taman Sri Gading (1 & 2)",
            "queryPlace": "Taman Sri Gading, Sri Gading, Johor"
          },
          {
            "name": "Taman Gading Baru",
            "queryPlace": "Taman Gading Baru, Sri Gading, Johor"
          },
          {
            "name": "Taman Wira",
            "queryPlace": "Taman Wira, Sri Gading, Johor"
          },
          {
            "name": "Kawasan Perindustrian Sri Gading",
            "queryPlace": "Kawasan Perindustrian Sri Gading, Sri Gading, Johor"
          }
        ]
      },
      {
        "id": "johor_batu_pahat_tongkang_pechah",
        "name": "Tongkang Pechah",
        "fullName": "Tongkang Pechah",
        "queryPlace": "Tongkang Pechah, Batu Pahat, Johor",
        "tamans": [
          {
            "name": "Bandar Putera Indah",
            "queryPlace": "Bandar Putera Indah, Tongkang Pechah, Johor"
          },
          {
            "name": "Taman Putera Indah",
            "queryPlace": "Taman Putera Indah, Tongkang Pechah, Johor"
          },
          {
            "name": "Taman Tongkang Pechah",
            "queryPlace": "Taman Tongkang Pechah, Tongkang Pechah, Johor"
          },
          {
            "name": "Taman Sri Tongkang",
            "queryPlace": "Taman Sri Tongkang, Tongkang Pechah, Johor"
          },
          {
            "name": "Taman Desa Molek",
            "queryPlace": "Taman Desa Molek, Tongkang Pechah, Johor"
          },
          {
            "name": "Taman Tiara Perdana",
            "queryPlace": "Taman Tiara Perdana, Tongkang Pechah, Johor"
          }
        ]
      },
      {
        "id": "johor_batu_pahat_senggarang",
        "name": "Senggarang",
        "fullName": "Senggarang",
        "queryPlace": "Senggarang, Batu Pahat, Johor",
        "tamans": [
          {
            "name": "Taman Senggarang",
            "queryPlace": "Taman Senggarang, Senggarang, Johor"
          },
          {
            "name": "Taman Sri Senggarang",
            "queryPlace": "Taman Sri Senggarang, Senggarang, Johor"
          },
          {
            "name": "Taman Sri Raya",
            "queryPlace": "Taman Sri Raya, Senggarang, Johor"
          },
          {
            "name": "Taman Sri Mewah",
            "queryPlace": "Taman Sri Mewah, Senggarang, Johor"
          },
          {
            "name": "Taman Senggarang Impian",
            "queryPlace": "Taman Senggarang Impian, Senggarang, Johor"
          },
          {
            "name": "Taman Senggarang Baru",
            "queryPlace": "Taman Senggarang Baru, Senggarang, Johor"
          }
        ]
      },
      {
        "id": "johor_batu_pahat_rengit",
        "name": "Rengit",
        "fullName": "Rengit",
        "queryPlace": "Rengit, Batu Pahat, Johor",
        "tamans": [
          {
            "name": "Taman Rengit",
            "queryPlace": "Taman Rengit, Rengit, Johor"
          },
          {
            "name": "Taman Rengit Damai",
            "queryPlace": "Taman Rengit Damai, Rengit, Johor"
          },
          {
            "name": "Taman Rengit Mewah",
            "queryPlace": "Taman Rengit Mewah, Rengit, Johor"
          },
          {
            "name": "Taman Rengit Bahagia",
            "queryPlace": "Taman Rengit Bahagia, Rengit, Johor"
          },
          {
            "name": "Taman Rengit Jaya",
            "queryPlace": "Taman Rengit Jaya, Rengit, Johor"
          },
          {
            "name": "Taman Karang Muhibbah",
            "queryPlace": "Taman Karang Muhibbah, Rengit, Johor"
          },
          {
            "name": "Taman Pandan Jaya",
            "queryPlace": "Taman Pandan Jaya, Rengit, Johor"
          },
          {
            "name": "Taman Rengit Indah",
            "queryPlace": "Taman Rengit Indah, Rengit, Johor"
          },
          {
            "name": "Taman Sri Rengit",
            "queryPlace": "Taman Sri Rengit, Rengit, Johor"
          }
        ]
      },
      {
        "id": "johor_batu_pahat_semerah",
        "name": "Semerah",
        "fullName": "Semerah",
        "queryPlace": "Semerah, Batu Pahat, Johor",
        "tamans": [
          {
            "name": "Taman Semerah",
            "queryPlace": "Taman Semerah, Semerah, Johor"
          },
          {
            "name": "Taman Seri Semerah",
            "queryPlace": "Taman Seri Semerah, Semerah, Johor"
          },
          {
            "name": "Taman Semerah Indah",
            "queryPlace": "Taman Semerah Indah, Semerah, Johor"
          },
          {
            "name": "Taman Semerah Jaya",
            "queryPlace": "Taman Semerah Jaya, Semerah, Johor"
          }
        ]
      }
    ]
  },
  {
    "id": "johor_kluang",
    "num": 4,
    "name": "Kluang",
    "state": "Johor",
    "towns": [
      {
        "id": "johor_kluang_kluang",
        "name": "Kluang",
        "fullName": "Kluang Town Core (MPK)",
        "queryPlace": "Kluang, Kluang, Johor",
        "tamans": [
          {
            "name": "Bandar Seri Impian",
            "queryPlace": "Bandar Seri Impian, Kluang, Johor"
          },
          {
            "name": "Taman Sri Kluang (Seri Kluang)",
            "queryPlace": "Taman Sri Kluang, Kluang, Johor"
          },
          {
            "name": "Taman Intan",
            "queryPlace": "Taman Intan, Kluang, Johor"
          },
          {
            "name": "Taman Kluang Baru",
            "queryPlace": "Taman Kluang Baru, Kluang, Johor"
          },
          {
            "name": "Taman Berlian Biru",
            "queryPlace": "Taman Berlian Biru, Kluang, Johor"
          },
          {
            "name": "Taman Bersatu",
            "queryPlace": "Taman Bersatu, Kluang, Johor"
          },
          {
            "name": "Taman Desa",
            "queryPlace": "Taman Desa, Kluang, Johor"
          },
          {
            "name": "Taman Emas",
            "queryPlace": "Taman Emas, Kluang, Johor"
          },
          {
            "name": "Taman Kluang Jaya",
            "queryPlace": "Taman Kluang Jaya, Kluang, Johor"
          },
          {
            "name": "Taman Nilam",
            "queryPlace": "Taman Nilam, Kluang, Johor"
          },
          {
            "name": "Taman Permata",
            "queryPlace": "Taman Permata, Kluang, Johor"
          },
          {
            "name": "Taman Tasik",
            "queryPlace": "Taman Tasik, Kluang, Johor"
          },
          {
            "name": "Taman Gunung Lambak",
            "queryPlace": "Taman Gunung Lambak, Kluang, Johor"
          },
          {
            "name": "Taman Kluang Barat",
            "queryPlace": "Taman Kluang Barat, Kluang, Johor"
          },
          {
            "name": "Taman Aman",
            "queryPlace": "Taman Aman, Kluang, Johor"
          },
          {
            "name": "Taman Bahagia",
            "queryPlace": "Taman Bahagia, Kluang, Johor"
          },
          {
            "name": "Taman Harmoni (Kluang)",
            "queryPlace": "Taman Harmoni, Kluang, Johor"
          },
          {
            "name": "Taman Delima (1 & 2)",
            "queryPlace": "Taman Delima, Kluang, Johor"
          },
          {
            "name": "Taman Saujana",
            "queryPlace": "Taman Saujana, Kluang, Johor"
          },
          {
            "name": "Taman Sunrise",
            "queryPlace": "Taman Sunrise, Kluang, Johor"
          },
          {
            "name": "Taman Sam Hoe",
            "queryPlace": "Taman Sam Hoe, Kluang, Johor"
          },
          {
            "name": "Taman Sri Jaya",
            "queryPlace": "Taman Sri Jaya, Kluang, Johor"
          },
          {
            "name": "Taman Mengkibol",
            "queryPlace": "Taman Mengkibol, Kluang, Johor"
          },
          {
            "name": "Taman Lian Seng",
            "queryPlace": "Taman Lian Seng, Kluang, Johor"
          },
          {
            "name": "Taman Yap Tau Sah",
            "queryPlace": "Taman Yap Tau Sah, Kluang, Johor"
          },
          {
            "name": "Taman Dato' Shahbandar",
            "queryPlace": "Taman Dato' Shahbandar, Kluang, Johor"
          },
          {
            "name": "Taman Kluang Perdana",
            "queryPlace": "Taman Kluang Perdana, Kluang, Johor"
          },
          {
            "name": "Taman Kampung Gajah",
            "queryPlace": "Taman Kampung Gajah, Kluang, Johor"
          },
          {
            "name": "Taman Sri Lalang (Kluang)",
            "queryPlace": "Taman Sri Lalang, Kluang, Johor"
          }
        ]
      },
      {
        "id": "johor_kluang_simpang_renggam",
        "name": "Simpang Renggam",
        "fullName": "Simpang Renggam (MDSR)",
        "queryPlace": "Simpang Renggam, Kluang, Johor",
        "tamans": [
          {
            "name": "Taman Renggam Jaya",
            "queryPlace": "Taman Renggam Jaya, Simpang Renggam, Johor"
          },
          {
            "name": "Taman Tiara Perdana",
            "queryPlace": "Taman Tiara Perdana, Simpang Renggam, Johor"
          },
          {
            "name": "Taman Purnama",
            "queryPlace": "Taman Purnama, Simpang Renggam, Johor"
          },
          {
            "name": "Taman Berjaya (Simpang Renggam)",
            "queryPlace": "Taman Berjaya, Simpang Renggam, Johor"
          },
          {
            "name": "Taman Sentosa",
            "queryPlace": "Taman Sentosa, Simpang Renggam, Johor"
          },
          {
            "name": "Taman Sri Puteri",
            "queryPlace": "Taman Sri Puteri, Simpang Renggam, Johor"
          },
          {
            "name": "Taman Orkid",
            "queryPlace": "Taman Orkid, Simpang Renggam, Johor"
          },
          {
            "name": "Taman Jaya 1",
            "queryPlace": "Taman Jaya 1, Simpang Renggam, Johor"
          },
          {
            "name": "Taman Reka Mas",
            "queryPlace": "Taman Reka Mas, Simpang Renggam, Johor"
          },
          {
            "name": "Taman Sri Mewah",
            "queryPlace": "Taman Sri Mewah, Simpang Renggam, Johor"
          },
          {
            "name": "Taman Bukit Renggam",
            "queryPlace": "Taman Bukit Renggam, Simpang Renggam, Johor"
          },
          {
            "name": "Taman Mohd Yassin",
            "queryPlace": "Taman Mohd Yassin, Simpang Renggam, Johor"
          },
          {
            "name": "Taman Permata",
            "queryPlace": "Taman Permata, Simpang Renggam, Johor"
          },
          {
            "name": "Taman Muhibbah",
            "queryPlace": "Taman Muhibbah, Simpang Renggam, Johor"
          },
          {
            "name": "Taman Putrimas",
            "queryPlace": "Taman Putrimas, Simpang Renggam, Johor"
          },
          {
            "name": "Taman Era Simpang Renggam",
            "queryPlace": "Taman Era Simpang Renggam, Simpang Renggam, Johor"
          },
          {
            "name": "Era Park",
            "queryPlace": "Era Park, Simpang Renggam, Johor"
          },
          {
            "name": "Residensi Bangsa Johor @ Simpang Renggam",
            "queryPlace": "Residensi Bangsa Johor @ Simpang Renggam, Simpang Renggam, Johor"
          }
        ]
      },
      {
        "id": "johor_kluang_paloh",
        "name": "Paloh",
        "fullName": "Paloh",
        "queryPlace": "Paloh, Kluang, Johor",
        "tamans": [
          {
            "name": "Taman Sri Paloh",
            "queryPlace": "Taman Sri Paloh, Paloh, Johor"
          },
          {
            "name": "Taman Kota Paloh",
            "queryPlace": "Taman Kota Paloh, Paloh, Johor"
          },
          {
            "name": "Taman Melati Paloh",
            "queryPlace": "Taman Melati Paloh, Paloh, Johor"
          },
          {
            "name": "Taman Murni Paloh",
            "queryPlace": "Taman Murni Paloh, Paloh, Johor"
          },
          {
            "name": "Taman Seri Palma Paloh",
            "queryPlace": "Taman Seri Palma Paloh, Paloh, Johor"
          },
          {
            "name": "Taman Indah Paloh",
            "queryPlace": "Taman Indah Paloh, Paloh, Johor"
          },
          {
            "name": "Kampung Aman Paloh",
            "queryPlace": "Kampung Aman Paloh, Paloh, Johor"
          },
          {
            "name": "Kampung Muhibbah Paloh",
            "queryPlace": "Kampung Muhibbah Paloh, Paloh, Johor"
          },
          {
            "name": "Rumah Murah Paloh",
            "queryPlace": "Rumah Murah Paloh, Paloh, Johor"
          }
        ]
      },
      {
        "id": "johor_kluang_layang_layang",
        "name": "Layang-Layang",
        "fullName": "Layang-Layang",
        "queryPlace": "Layang-Layang, Kluang, Johor",
        "tamans": [
          {
            "name": "Taman Sri Layang-Layang",
            "queryPlace": "Taman Sri Layang-Layang, Layang-Layang, Johor"
          },
          {
            "name": "Taman Layang-Layang",
            "queryPlace": "Taman Layang-Layang, Layang-Layang, Johor"
          },
          {
            "name": "Taman Permata Layang",
            "queryPlace": "Taman Permata Layang, Layang-Layang, Johor"
          },
          {
            "name": "Taman Sri Maju",
            "queryPlace": "Taman Sri Maju, Layang-Layang, Johor"
          },
          {
            "name": "Taman Puteri Layang-Layang",
            "queryPlace": "Taman Puteri Layang-Layang, Layang-Layang, Johor"
          },
          {
            "name": "Taman Sri Mawar",
            "queryPlace": "Taman Sri Mawar, Layang-Layang, Johor"
          },
          {
            "name": "Pekan Layang-Layang Baru",
            "queryPlace": "Pekan Layang-Layang Baru, Layang-Layang, Johor"
          },
          {
            "name": "Rumah Murah Layang-Layang",
            "queryPlace": "Rumah Murah Layang-Layang, Layang-Layang, Johor"
          }
        ]
      },
      {
        "id": "johor_kluang_renggam",
        "name": "Renggam",
        "fullName": "Renggam",
        "queryPlace": "Renggam, Kluang, Johor",
        "tamans": [
          {
            "name": "Taman Sri Jaya Renggam",
            "queryPlace": "Taman Sri Jaya Renggam, Renggam, Johor"
          },
          {
            "name": "Taman Harmoni (Renggam)",
            "queryPlace": "Taman Harmoni, Renggam, Johor"
          },
          {
            "name": "Taman Flora (Renggam)",
            "queryPlace": "Taman Flora, Renggam, Johor"
          },
          {
            "name": "Taman Makmur",
            "queryPlace": "Taman Makmur, Renggam, Johor"
          },
          {
            "name": "Taman Nilam (Renggam)",
            "queryPlace": "Taman Nilam, Renggam, Johor"
          },
          {
            "name": "Taman Perdana",
            "queryPlace": "Taman Perdana, Renggam, Johor"
          },
          {
            "name": "Taman Suria Jaya",
            "queryPlace": "Taman Suria Jaya, Renggam, Johor"
          }
        ]
      },
      {
        "id": "johor_kluang_kahang",
        "name": "Kahang",
        "fullName": "Kahang",
        "queryPlace": "Kahang, Kluang, Johor",
        "tamans": [
          {
            "name": "Taman Sri Kahang",
            "queryPlace": "Taman Sri Kahang, Kahang, Johor"
          },
          {
            "name": "Taman Kahang Baru",
            "queryPlace": "Taman Kahang Baru, Kahang, Johor"
          },
          {
            "name": "Taman Kahang Emas",
            "queryPlace": "Taman Kahang Emas, Kahang, Johor"
          },
          {
            "name": "Taman Desa Kahang",
            "queryPlace": "Taman Desa Kahang, Kahang, Johor"
          },
          {
            "name": "Kampung Baru Kahang",
            "queryPlace": "Kampung Baru Kahang, Kahang, Johor"
          }
        ]
      },
      {
        "id": "johor_kluang_machap",
        "name": "Machap",
        "fullName": "Machap",
        "queryPlace": "Machap, Kluang, Johor",
        "tamans": [
          {
            "name": "Taman Machap Jaya",
            "queryPlace": "Taman Machap Jaya, Machap, Johor"
          },
          {
            "name": "Taman Sri Machap",
            "queryPlace": "Taman Sri Machap, Machap, Johor"
          },
          {
            "name": "Kampung Baru Machap",
            "queryPlace": "Kampung Baru Machap, Machap, Johor"
          }
        ]
      }
    ]
  },
  {
    "id": "johor_muar",
    "num": 5,
    "name": "Muar",
    "state": "Johor",
    "towns": [
      {
        "id": "johor_muar_bandar_maharani",
        "name": "Bandar Maharani",
        "fullName": "Bandar Maharani (Muar Town Core)",
        "queryPlace": "Bandar Maharani, Muar, Johor",
        "tamans": [
          {
            "name": "Taman Sri Temenggong",
            "queryPlace": "Taman Sri Temenggong, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Temiang Jaya (1 & 2)",
            "queryPlace": "Taman Temiang Jaya, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Putera Indah",
            "queryPlace": "Taman Putera Indah, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Sakeh Baru",
            "queryPlace": "Taman Sakeh Baru, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Seri Treh (Taman Bintang Angkasa)",
            "queryPlace": "Taman Seri Treh, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Melati",
            "queryPlace": "Taman Melati, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Mahkota",
            "queryPlace": "Taman Mahkota, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Lembah Padang",
            "queryPlace": "Taman Lembah Padang, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Desa Baiduri",
            "queryPlace": "Taman Desa Baiduri, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Temiang Murni",
            "queryPlace": "Taman Temiang Murni, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Bunga Mawar",
            "queryPlace": "Taman Bunga Mawar, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Orkid",
            "queryPlace": "Taman Orkid, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Nilam Sari",
            "queryPlace": "Taman Nilam Sari, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Pertama Indah",
            "queryPlace": "Taman Pertama Indah, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Desa",
            "queryPlace": "Taman Desa, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Khalidi",
            "queryPlace": "Taman Khalidi, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Mas Jaya",
            "queryPlace": "Taman Mas Jaya, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Indah (Muar)",
            "queryPlace": "Taman Indah, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Junid Perdana",
            "queryPlace": "Taman Junid Perdana, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Sri Maharani",
            "queryPlace": "Taman Sri Maharani, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Sri Terap",
            "queryPlace": "Taman Sri Terap, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Tanjung Gading",
            "queryPlace": "Taman Tanjung Gading, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Seri Mewah",
            "queryPlace": "Taman Seri Mewah, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Sabak Awor",
            "queryPlace": "Taman Sabak Awor, Bandar Maharani, Johor"
          },
          {
            "name": "Taman Sri Tanjung",
            "queryPlace": "Taman Sri Tanjung, Bandar Maharani, Johor"
          }
        ]
      },
      {
        "id": "johor_muar_sungai_abong",
        "name": "Sungai Abong",
        "fullName": "Sungai Abong",
        "queryPlace": "Sungai Abong, Muar, Johor",
        "tamans": [
          {
            "name": "Taman Sungai Abong",
            "queryPlace": "Taman Sungai Abong, Sungai Abong, Johor"
          },
          {
            "name": "Taman Sungai Abong Indah",
            "queryPlace": "Taman Sungai Abong Indah, Sungai Abong, Johor"
          },
          {
            "name": "Taman Sungai Abong Mulia",
            "queryPlace": "Taman Sungai Abong Mulia, Sungai Abong, Johor"
          },
          {
            "name": "Taman Sri Sungai Abong",
            "queryPlace": "Taman Sri Sungai Abong, Sungai Abong, Johor"
          },
          {
            "name": "Taman Damai (Sungai Abong)",
            "queryPlace": "Taman Damai, Sungai Abong, Johor"
          },
          {
            "name": "Taman Perdana (Sungai Abong)",
            "queryPlace": "Taman Perdana, Sungai Abong, Johor"
          }
        ]
      },
      {
        "id": "johor_muar_bakri_bukit_bakri",
        "name": "Bakri / Bukit Bakri",
        "fullName": "Bakri / Bukit Bakri",
        "queryPlace": "Bakri / Bukit Bakri, Muar, Johor",
        "tamans": [
          {
            "name": "Taman Sri Bakri (Fasa 1, 2, 3)",
            "queryPlace": "Taman Sri Bakri, Bakri / Bukit Bakri, Johor"
          },
          {
            "name": "Taman Bakri Indah",
            "queryPlace": "Taman Bakri Indah, Bakri / Bukit Bakri, Johor"
          },
          {
            "name": "Taman Bakri Jaya",
            "queryPlace": "Taman Bakri Jaya, Bakri / Bukit Bakri, Johor"
          },
          {
            "name": "Taman Bakri Mulia",
            "queryPlace": "Taman Bakri Mulia, Bakri / Bukit Bakri, Johor"
          },
          {
            "name": "Taman Bakri Utama",
            "queryPlace": "Taman Bakri Utama, Bakri / Bukit Bakri, Johor"
          },
          {
            "name": "Taman Bakri Maju",
            "queryPlace": "Taman Bakri Maju, Bakri / Bukit Bakri, Johor"
          },
          {
            "name": "Taman Desa Bakri",
            "queryPlace": "Taman Desa Bakri, Bakri / Bukit Bakri, Johor"
          },
          {
            "name": "Taman Bakri Harmoni",
            "queryPlace": "Taman Bakri Harmoni, Bakri / Bukit Bakri, Johor"
          },
          {
            "name": "Taman Bukit Bakri",
            "queryPlace": "Taman Bukit Bakri, Bakri / Bukit Bakri, Johor"
          },
          {
            "name": "Taman Bakri Makmur",
            "queryPlace": "Taman Bakri Makmur, Bakri / Bukit Bakri, Johor"
          }
        ]
      },
      {
        "id": "johor_muar_bukit_pasir",
        "name": "Bukit Pasir",
        "fullName": "Bukit Pasir (Muar)",
        "queryPlace": "Bukit Pasir, Muar, Johor",
        "tamans": [
          {
            "name": "Taman Bukit Pasir",
            "queryPlace": "Taman Bukit Pasir, Bukit Pasir, Johor"
          },
          {
            "name": "Taman Seri Pasir",
            "queryPlace": "Taman Seri Pasir, Bukit Pasir, Johor"
          },
          {
            "name": "Taman Pasir Murni",
            "queryPlace": "Taman Pasir Murni, Bukit Pasir, Johor"
          },
          {
            "name": "Taman Pasir Emas",
            "queryPlace": "Taman Pasir Emas, Bukit Pasir, Johor"
          },
          {
            "name": "Taman Bintang Bukit Pasir",
            "queryPlace": "Taman Bintang Bukit Pasir, Bukit Pasir, Johor"
          }
        ]
      },
      {
        "id": "johor_muar_pagoh",
        "name": "Pagoh",
        "fullName": "Pagoh & Bandar Universiti Pagoh",
        "queryPlace": "Pagoh, Muar, Johor",
        "tamans": [
          {
            "name": "Bandar Universiti Pagoh (BUP)",
            "queryPlace": "Bandar Universiti Pagoh, Pagoh, Johor"
          },
          {
            "name": "Taman Pagoh Jaya",
            "queryPlace": "Taman Pagoh Jaya, Pagoh, Johor"
          },
          {
            "name": "Taman Seri Pagoh",
            "queryPlace": "Taman Seri Pagoh, Pagoh, Johor"
          },
          {
            "name": "Taman Pagoh Indah",
            "queryPlace": "Taman Pagoh Indah, Pagoh, Johor"
          },
          {
            "name": "Taman Harmoni Pagoh",
            "queryPlace": "Taman Harmoni Pagoh, Pagoh, Johor"
          },
          {
            "name": "Pekan Pagoh",
            "queryPlace": "Pekan Pagoh, Pagoh, Johor"
          }
        ]
      },
      {
        "id": "johor_muar_parit_jawa",
        "name": "Parit Jawa",
        "fullName": "Parit Jawa & Padang",
        "queryPlace": "Parit Jawa, Muar, Johor",
        "tamans": [
          {
            "name": "Taman Parit Jawa",
            "queryPlace": "Taman Parit Jawa, Parit Jawa, Johor"
          },
          {
            "name": "Taman Jawa Indah",
            "queryPlace": "Taman Jawa Indah, Parit Jawa, Johor"
          },
          {
            "name": "Taman Padang Indah",
            "queryPlace": "Taman Padang Indah, Parit Jawa, Johor"
          },
          {
            "name": "Taman Seri Menanti",
            "queryPlace": "Taman Seri Menanti, Parit Jawa, Johor"
          },
          {
            "name": "Taman Seri Jaya (Parit Jawa)",
            "queryPlace": "Taman Seri Jaya, Parit Jawa, Johor"
          },
          {
            "name": "Residensi Bangsa Johor (RsBJ) Parit Jawa",
            "queryPlace": "Residensi Bangsa Johor  Parit Jawa, Parit Jawa, Johor"
          }
        ]
      },
      {
        "id": "johor_muar_sungai_balang",
        "name": "Sungai Balang",
        "fullName": "Sungai Balang",
        "queryPlace": "Sungai Balang, Muar, Johor",
        "tamans": [
          {
            "name": "Taman Sungai Balang",
            "queryPlace": "Taman Sungai Balang, Sungai Balang, Johor"
          },
          {
            "name": "Taman Balang Baru",
            "queryPlace": "Taman Balang Baru, Sungai Balang, Johor"
          },
          {
            "name": "Residensi Bangsa Johor (RsBJ) Parit Nipah Laut",
            "queryPlace": "Residensi Bangsa Johor  Parit Nipah Laut, Sungai Balang, Johor"
          }
        ]
      },
      {
        "id": "johor_muar_panchor",
        "name": "Panchor",
        "fullName": "Panchor & Lenga",
        "queryPlace": "Panchor, Muar, Johor",
        "tamans": [
          {
            "name": "Taman Panchor Jaya",
            "queryPlace": "Taman Panchor Jaya, Panchor, Johor"
          },
          {
            "name": "Taman Seri Panchor",
            "queryPlace": "Taman Seri Panchor, Panchor, Johor"
          },
          {
            "name": "Taman Lenga Indah",
            "queryPlace": "Taman Lenga Indah, Panchor, Johor"
          },
          {
            "name": "Pekan Lenga",
            "queryPlace": "Pekan Lenga, Panchor, Johor"
          }
        ]
      }
    ]
  },
  {
    "id": "johor_pontian",
    "num": 6,
    "name": "Pontian",
    "state": "Johor",
    "towns": [
      {
        "id": "johor_pontian_pontian_kechil",
        "name": "Pontian Kechil",
        "fullName": "Pontian Kechil (Pontian Town Core)",
        "queryPlace": "Pontian Kechil, Pontian, Johor",
        "tamans": [
          {
            "name": "Taman Rakyat Pontian",
            "queryPlace": "Taman Rakyat Pontian, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Pontian Jaya",
            "queryPlace": "Taman Pontian Jaya, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Kota Emas",
            "queryPlace": "Taman Kota Emas, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Mawar",
            "queryPlace": "Taman Mawar, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Cahaya",
            "queryPlace": "Taman Cahaya, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Nilam",
            "queryPlace": "Taman Nilam, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Bakek Jaya",
            "queryPlace": "Taman Bakek Jaya, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Sri Maju",
            "queryPlace": "Taman Sri Maju, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Desa Sri Perhentian",
            "queryPlace": "Taman Desa Sri Perhentian, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Desa Harta Ria",
            "queryPlace": "Taman Desa Harta Ria, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Pontian Utama",
            "queryPlace": "Taman Pontian Utama, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Pontian Perdana",
            "queryPlace": "Taman Pontian Perdana, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Megah (Pontian)",
            "queryPlace": "Taman Megah, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Sri Sutera",
            "queryPlace": "Taman Sri Sutera, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Nong Chik (Pontian)",
            "queryPlace": "Taman Nong Chik, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Saujana",
            "queryPlace": "Taman Saujana, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Jasa",
            "queryPlace": "Taman Jasa, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Rimba",
            "queryPlace": "Taman Rimba, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Anggerik",
            "queryPlace": "Taman Anggerik, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Sri Pinang",
            "queryPlace": "Taman Sri Pinang, Pontian Kechil, Johor"
          },
          {
            "name": "Taman Perindustrian Maju",
            "queryPlace": "Taman Perindustrian Maju, Pontian Kechil, Johor"
          }
        ]
      },
      {
        "id": "johor_pontian_pekan_nanas",
        "name": "Pekan Nanas",
        "fullName": "Pekan Nanas",
        "queryPlace": "Pekan Nanas, Pontian, Johor",
        "tamans": [
          {
            "name": "Taman Sri Bahagia",
            "queryPlace": "Taman Sri Bahagia, Pekan Nanas, Johor"
          },
          {
            "name": "Taman Sri Pekan Nanas",
            "queryPlace": "Taman Sri Pekan Nanas, Pekan Nanas, Johor"
          },
          {
            "name": "Taman Tuah",
            "queryPlace": "Taman Tuah, Pekan Nanas, Johor"
          },
          {
            "name": "Taman Baru Utama",
            "queryPlace": "Taman Baru Utama, Pekan Nanas, Johor"
          },
          {
            "name": "Taman Seri Damansara",
            "queryPlace": "Taman Seri Damansara, Pekan Nanas, Johor"
          },
          {
            "name": "Taman Emas Merah",
            "queryPlace": "Taman Emas Merah, Pekan Nanas, Johor"
          },
          {
            "name": "Taman Sri Jaya (Pekan Nanas)",
            "queryPlace": "Taman Sri Jaya, Pekan Nanas, Johor"
          },
          {
            "name": "Taman Sri Sentosa (Pekan Nanas)",
            "queryPlace": "Taman Sri Sentosa, Pekan Nanas, Johor"
          },
          {
            "name": "Taman Bintang",
            "queryPlace": "Taman Bintang, Pekan Nanas, Johor"
          },
          {
            "name": "Taman Mewah (Pekan Nanas)",
            "queryPlace": "Taman Mewah, Pekan Nanas, Johor"
          },
          {
            "name": "Taman Kiara",
            "queryPlace": "Taman Kiara, Pekan Nanas, Johor"
          },
          {
            "name": "Taman Sentosa",
            "queryPlace": "Taman Sentosa, Pekan Nanas, Johor"
          },
          {
            "name": "Pekan Nenas Industrial Park",
            "queryPlace": "Pekan Nenas Industrial Park, Pekan Nanas, Johor"
          }
        ]
      },
      {
        "id": "johor_pontian_benut",
        "name": "Benut",
        "fullName": "Benut",
        "queryPlace": "Benut, Pontian, Johor",
        "tamans": [
          {
            "name": "Bandar Baru Benut",
            "queryPlace": "Bandar Baru Benut, Benut, Johor"
          },
          {
            "name": "Taman Mekar (Benut)",
            "queryPlace": "Taman Mekar, Benut, Johor"
          },
          {
            "name": "Taman Sri Benut",
            "queryPlace": "Taman Sri Benut, Benut, Johor"
          },
          {
            "name": "Taman Benut Jaya",
            "queryPlace": "Taman Benut Jaya, Benut, Johor"
          },
          {
            "name": "Taman Muhibbah Benut",
            "queryPlace": "Taman Muhibbah Benut, Benut, Johor"
          },
          {
            "name": "Taman Permata Benut",
            "queryPlace": "Taman Permata Benut, Benut, Johor"
          },
          {
            "name": "Taman Harmoni Benut",
            "queryPlace": "Taman Harmoni Benut, Benut, Johor"
          }
        ]
      },
      {
        "id": "johor_pontian_kukup",
        "name": "Kukup",
        "fullName": "Kukup",
        "queryPlace": "Kukup, Pontian, Johor",
        "tamans": [
          {
            "name": "Taman Kukup Indah",
            "queryPlace": "Taman Kukup Indah, Kukup, Johor"
          },
          {
            "name": "Taman Permata Kukup",
            "queryPlace": "Taman Permata Kukup, Kukup, Johor"
          },
          {
            "name": "Taman Sri Kukup",
            "queryPlace": "Taman Sri Kukup, Kukup, Johor"
          },
          {
            "name": "Pekan Penerok",
            "queryPlace": "Pekan Penerok, Kukup, Johor"
          },
          {
            "name": "Kampung Nelayan Air Masin",
            "queryPlace": "Kampung Nelayan Air Masin, Kukup, Johor"
          },
          {
            "name": "Kampung Nelayan Kukup Laut",
            "queryPlace": "Kampung Nelayan Kukup Laut, Kukup, Johor"
          }
        ]
      },
      {
        "id": "johor_pontian_ayer_baloi",
        "name": "Ayer Baloi",
        "fullName": "Ayer Baloi",
        "queryPlace": "Ayer Baloi, Pontian, Johor",
        "tamans": [
          {
            "name": "Taman Ayer Baloi",
            "queryPlace": "Taman Ayer Baloi, Ayer Baloi, Johor"
          },
          {
            "name": "Taman Sri Baloi",
            "queryPlace": "Taman Sri Baloi, Ayer Baloi, Johor"
          },
          {
            "name": "Taman Murni (Ayer Baloi)",
            "queryPlace": "Taman Murni, Ayer Baloi, Johor"
          }
        ]
      },
      {
        "id": "johor_pontian_rambah",
        "name": "Rambah",
        "fullName": "Rambah & Serkat",
        "queryPlace": "Rambah, Pontian, Johor",
        "tamans": [
          {
            "name": "Taman Rambah",
            "queryPlace": "Taman Rambah, Rambah, Johor"
          },
          {
            "name": "Taman Sri Rambah",
            "queryPlace": "Taman Sri Rambah, Rambah, Johor"
          },
          {
            "name": "Pekan Serkat (Gateway to Tanjung Piai)",
            "queryPlace": "Pekan Serkat, Rambah, Johor"
          }
        ]
      }
    ]
  },
  {
    "id": "johor_kota_tinggi",
    "num": 7,
    "name": "Kota Tinggi",
    "state": "Johor",
    "towns": [
      {
        "id": "johor_kota_tinggi_kota_tinggi",
        "name": "Kota Tinggi",
        "fullName": "Kota Tinggi Town Core (MDKT)",
        "queryPlace": "Kota Tinggi, Kota Tinggi, Johor",
        "tamans": [
          {
            "name": "Taman Kota Jaya (Fasa 1 & 2)",
            "queryPlace": "Taman Kota Jaya, Kota Tinggi, Johor"
          },
          {
            "name": "Taman Sri Lalang",
            "queryPlace": "Taman Sri Lalang, Kota Tinggi, Johor"
          },
          {
            "name": "Taman Daiman Jaya",
            "queryPlace": "Taman Daiman Jaya, Kota Tinggi, Johor"
          },
          {
            "name": "Taman Scientex Kota Tinggi",
            "queryPlace": "Taman Scientex Kota Tinggi, Kota Tinggi, Johor"
          },
          {
            "name": "Taman Ahmad Perang",
            "queryPlace": "Taman Ahmad Perang, Kota Tinggi, Johor"
          },
          {
            "name": "Taman Guru",
            "queryPlace": "Taman Guru, Kota Tinggi, Johor"
          },
          {
            "name": "Taman Hijrah",
            "queryPlace": "Taman Hijrah, Kota Tinggi, Johor"
          },
          {
            "name": "Taman Laksamana",
            "queryPlace": "Taman Laksamana, Kota Tinggi, Johor"
          },
          {
            "name": "Taman Mawai Jaya",
            "queryPlace": "Taman Mawai Jaya, Kota Tinggi, Johor"
          },
          {
            "name": "Taman Medan Jaya",
            "queryPlace": "Taman Medan Jaya, Kota Tinggi, Johor"
          },
          {
            "name": "Taman Kota Merdesa",
            "queryPlace": "Taman Kota Merdesa, Kota Tinggi, Johor"
          },
          {
            "name": "Taman Kemang",
            "queryPlace": "Taman Kemang, Kota Tinggi, Johor"
          },
          {
            "name": "Taman Kota Mas",
            "queryPlace": "Taman Kota Mas, Kota Tinggi, Johor"
          },
          {
            "name": "Taman YPJ",
            "queryPlace": "Taman YPJ, Kota Tinggi, Johor"
          },
          {
            "name": "Taman Berjaya",
            "queryPlace": "Taman Berjaya, Kota Tinggi, Johor"
          },
          {
            "name": "Taman Bendahara",
            "queryPlace": "Taman Bendahara, Kota Tinggi, Johor"
          },
          {
            "name": "Taman Seri Saujana",
            "queryPlace": "Taman Seri Saujana, Kota Tinggi, Johor"
          }
        ]
      },
      {
        "id": "johor_kota_tinggi_bandar_penawar",
        "name": "Bandar Penawar",
        "fullName": "Bandar Penawar & Desaru (MPP)",
        "queryPlace": "Bandar Penawar, Kota Tinggi, Johor",
        "tamans": [
          {
            "name": "Bandar Penawar Core",
            "queryPlace": "Bandar Penawar Core, Bandar Penawar, Johor"
          },
          {
            "name": "Taman Desaru Utama",
            "queryPlace": "Taman Desaru Utama, Bandar Penawar, Johor"
          },
          {
            "name": "Taman Desaru Damai",
            "queryPlace": "Taman Desaru Damai, Bandar Penawar, Johor"
          },
          {
            "name": "Taman Penawar Harmoni",
            "queryPlace": "Taman Penawar Harmoni, Bandar Penawar, Johor"
          },
          {
            "name": "Taman Sri Penawar",
            "queryPlace": "Taman Sri Penawar, Bandar Penawar, Johor"
          },
          {
            "name": "Taman Desaru Villa",
            "queryPlace": "Taman Desaru Villa, Bandar Penawar, Johor"
          },
          {
            "name": "Taman Bayu Damai",
            "queryPlace": "Taman Bayu Damai, Bandar Penawar, Johor"
          },
          {
            "name": "Taman Harmoni (Bandar Penawar)",
            "queryPlace": "Taman Harmoni, Bandar Penawar, Johor"
          },
          {
            "name": "Taman Nilam Penawar",
            "queryPlace": "Taman Nilam Penawar, Bandar Penawar, Johor"
          },
          {
            "name": "Desaru Coast Resort Corridor",
            "queryPlace": "Desaru Coast Resort Corridor, Bandar Penawar, Johor"
          }
        ]
      },
      {
        "id": "johor_kota_tinggi_pengerang",
        "name": "Pengerang",
        "fullName": "Pengerang & Sungai Rengit (MPP)",
        "queryPlace": "Pengerang, Kota Tinggi, Johor",
        "tamans": [
          {
            "name": "Taman Sungai Rengit",
            "queryPlace": "Taman Sungai Rengit, Pengerang, Johor"
          },
          {
            "name": "Taman Bayu Sutera",
            "queryPlace": "Taman Bayu Sutera, Pengerang, Johor"
          },
          {
            "name": "Taman Pengerang Jaya",
            "queryPlace": "Taman Pengerang Jaya, Pengerang, Johor"
          },
          {
            "name": "Pekan Sungai Rengit",
            "queryPlace": "Pekan Sungai Rengit, Pengerang, Johor"
          },
          {
            "name": "Pekan Teluk Ramunia",
            "queryPlace": "Pekan Teluk Ramunia, Pengerang, Johor"
          },
          {
            "name": "Pekan Tanjung Pengelih",
            "queryPlace": "Pekan Tanjung Pengelih, Pengerang, Johor"
          },
          {
            "name": "Pengerang Integrated Petroleum Complex (PIPC) Enclave",
            "queryPlace": "Pengerang Integrated Petroleum Complex  Enclave, Pengerang, Johor"
          }
        ]
      },
      {
        "id": "johor_kota_tinggi_bandar_tenggara",
        "name": "Bandar Tenggara",
        "fullName": "Bandar Tenggara",
        "queryPlace": "Bandar Tenggara, Kota Tinggi, Johor",
        "tamans": [
          {
            "name": "Taman Tenggara",
            "queryPlace": "Taman Tenggara, Bandar Tenggara, Johor"
          },
          {
            "name": "Taman Sayong Indah",
            "queryPlace": "Taman Sayong Indah, Bandar Tenggara, Johor"
          },
          {
            "name": "Taman Sri Tenggara",
            "queryPlace": "Taman Sri Tenggara, Bandar Tenggara, Johor"
          },
          {
            "name": "FELDA Pengeli Wetan",
            "queryPlace": "FELDA Pengeli Wetan, Bandar Tenggara, Johor"
          }
        ]
      },
      {
        "id": "johor_kota_tinggi_sedili",
        "name": "Sedili",
        "fullName": "Sedili (Kuala Sedili, Sedili Besar, Sedili Kechil)",
        "queryPlace": "Sedili, Kota Tinggi, Johor",
        "tamans": [
          {
            "name": "Taman Sedili",
            "queryPlace": "Taman Sedili, Sedili, Johor"
          },
          {
            "name": "Taman Kota Besar",
            "queryPlace": "Taman Kota Besar, Sedili, Johor"
          },
          {
            "name": "Pekan Kuala Sedili",
            "queryPlace": "Pekan Kuala Sedili, Sedili, Johor"
          },
          {
            "name": "Kampung Sedili Besar",
            "queryPlace": "Kampung Sedili Besar, Sedili, Johor"
          },
          {
            "name": "Kampung Sedili Kechil",
            "queryPlace": "Kampung Sedili Kechil, Sedili, Johor"
          }
        ]
      },
      {
        "id": "johor_kota_tinggi_teluk_sengat",
        "name": "Teluk Sengat",
        "fullName": "Teluk Sengat",
        "queryPlace": "Teluk Sengat, Kota Tinggi, Johor",
        "tamans": [
          {
            "name": "Taman Teluk Sengat",
            "queryPlace": "Taman Teluk Sengat, Teluk Sengat, Johor"
          },
          {
            "name": "Kampung Teluk Sengat",
            "queryPlace": "Kampung Teluk Sengat, Teluk Sengat, Johor"
          }
        ]
      }
    ]
  },
  {
    "id": "johor_segamat",
    "num": 8,
    "name": "Segamat",
    "state": "Johor",
    "towns": [
      {
        "id": "johor_segamat_bandar_segamat",
        "name": "Bandar Segamat",
        "fullName": "Bandar Segamat Core (MPS)",
        "queryPlace": "Bandar Segamat, Segamat, Johor",
        "tamans": [
          {
            "name": "Bandar Putra Segamat (IOI)",
            "queryPlace": "Bandar Putra Segamat, Bandar Segamat, Johor"
          },
          {
            "name": "Bandar Segamat Baru",
            "queryPlace": "Bandar Segamat Baru, Bandar Segamat, Johor"
          },
          {
            "name": "Bandar IOI Segamat",
            "queryPlace": "Bandar IOI Segamat, Bandar Segamat, Johor"
          },
          {
            "name": "Taman Yayasan",
            "queryPlace": "Taman Yayasan, Bandar Segamat, Johor"
          },
          {
            "name": "Taman Utama",
            "queryPlace": "Taman Utama, Bandar Segamat, Johor"
          },
          {
            "name": "Taman Tan Leng Ann",
            "queryPlace": "Taman Tan Leng Ann, Bandar Segamat, Johor"
          },
          {
            "name": "Taman Segar",
            "queryPlace": "Taman Segar, Bandar Segamat, Johor"
          },
          {
            "name": "Taman Astakajaya",
            "queryPlace": "Taman Astakajaya, Bandar Segamat, Johor"
          },
          {
            "name": "Taman Segamat Jaya",
            "queryPlace": "Taman Segamat Jaya, Bandar Segamat, Johor"
          },
          {
            "name": "Taman Cempaka",
            "queryPlace": "Taman Cempaka, Bandar Segamat, Johor"
          },
          {
            "name": "Taman Kenari Indah",
            "queryPlace": "Taman Kenari Indah, Bandar Segamat, Johor"
          },
          {
            "name": "Taman Makmur",
            "queryPlace": "Taman Makmur, Bandar Segamat, Johor"
          },
          {
            "name": "Taman Bintang Indah",
            "queryPlace": "Taman Bintang Indah, Bandar Segamat, Johor"
          },
          {
            "name": "Taman Pemuda",
            "queryPlace": "Taman Pemuda, Bandar Segamat, Johor"
          },
          {
            "name": "Taman Pelangi (Segamat)",
            "queryPlace": "Taman Pelangi, Bandar Segamat, Johor"
          },
          {
            "name": "Taman Sri Wira",
            "queryPlace": "Taman Sri Wira, Bandar Segamat, Johor"
          },
          {
            "name": "Taman Bukit Baru",
            "queryPlace": "Taman Bukit Baru, Bandar Segamat, Johor"
          },
          {
            "name": "Taman Gemereh",
            "queryPlace": "Taman Gemereh, Bandar Segamat, Johor"
          }
        ]
      },
      {
        "id": "johor_segamat_labis",
        "name": "Labis",
        "fullName": "Labis (MDL)",
        "queryPlace": "Labis, Segamat, Johor",
        "tamans": [
          {
            "name": "Taman Asia Timur",
            "queryPlace": "Taman Asia Timur, Labis, Johor"
          },
          {
            "name": "Taman Bandar Jaya",
            "queryPlace": "Taman Bandar Jaya, Labis, Johor"
          },
          {
            "name": "Taman Indah (Labis)",
            "queryPlace": "Taman Indah, Labis, Johor"
          },
          {
            "name": "Taman Mewah",
            "queryPlace": "Taman Mewah, Labis, Johor"
          },
          {
            "name": "Labis Park",
            "queryPlace": "Labis Park, Labis, Johor"
          },
          {
            "name": "Taman Eng Peng",
            "queryPlace": "Taman Eng Peng, Labis, Johor"
          },
          {
            "name": "Taman Ria",
            "queryPlace": "Taman Ria, Labis, Johor"
          },
          {
            "name": "Taman Sentosa (Labis)",
            "queryPlace": "Taman Sentosa, Labis, Johor"
          },
          {
            "name": "Taman Soon Cheong",
            "queryPlace": "Taman Soon Cheong, Labis, Johor"
          },
          {
            "name": "Taman Sri Berlian",
            "queryPlace": "Taman Sri Berlian, Labis, Johor"
          },
          {
            "name": "Taman Wijaya",
            "queryPlace": "Taman Wijaya, Labis, Johor"
          },
          {
            "name": "Taman Sri Jaya",
            "queryPlace": "Taman Sri Jaya, Labis, Johor"
          },
          {
            "name": "Taman Daya (Labis)",
            "queryPlace": "Taman Daya, Labis, Johor"
          },
          {
            "name": "Taman Gunung Emas",
            "queryPlace": "Taman Gunung Emas, Labis, Johor"
          },
          {
            "name": "Taman Sejati",
            "queryPlace": "Taman Sejati, Labis, Johor"
          },
          {
            "name": "Taman Labis Jaya",
            "queryPlace": "Taman Labis Jaya, Labis, Johor"
          },
          {
            "name": "Taman Suria",
            "queryPlace": "Taman Suria, Labis, Johor"
          },
          {
            "name": "Taman Sri Emas",
            "queryPlace": "Taman Sri Emas, Labis, Johor"
          },
          {
            "name": "Taman Bintang Jaya",
            "queryPlace": "Taman Bintang Jaya, Labis, Johor"
          },
          {
            "name": "Taman Pelangi (Labis)",
            "queryPlace": "Taman Pelangi, Labis, Johor"
          },
          {
            "name": "Taman Orkid Baru",
            "queryPlace": "Taman Orkid Baru, Labis, Johor"
          },
          {
            "name": "Taman Perwira",
            "queryPlace": "Taman Perwira, Labis, Johor"
          },
          {
            "name": "Taman Perling (Labis)",
            "queryPlace": "Taman Perling, Labis, Johor"
          },
          {
            "name": "Taman Wawasan & Taman Wawasan 1",
            "queryPlace": "Taman Wawasan & Taman Wawasan 1, Labis, Johor"
          },
          {
            "name": "Taman Wira & Taman Wira 2",
            "queryPlace": "Taman Wira & Taman Wira 2, Labis, Johor"
          },
          {
            "name": "Taman Sri Tenang",
            "queryPlace": "Taman Sri Tenang, Labis, Johor"
          },
          {
            "name": "Taman Sri Bahagia",
            "queryPlace": "Taman Sri Bahagia, Labis, Johor"
          },
          {
            "name": "Taman Sinar Emas",
            "queryPlace": "Taman Sinar Emas, Labis, Johor"
          },
          {
            "name": "Taman Sri Bayu",
            "queryPlace": "Taman Sri Bayu, Labis, Johor"
          },
          {
            "name": "Taman Sri Aman",
            "queryPlace": "Taman Sri Aman, Labis, Johor"
          },
          {
            "name": "Taman Berjaya & Taman Berjaya 2",
            "queryPlace": "Taman Berjaya & Taman Berjaya 2, Labis, Johor"
          },
          {
            "name": "Taman Ah Pong",
            "queryPlace": "Taman Ah Pong, Labis, Johor"
          },
          {
            "name": "Taman Labis Indah",
            "queryPlace": "Taman Labis Indah, Labis, Johor"
          },
          {
            "name": "Taman Lagenda",
            "queryPlace": "Taman Lagenda, Labis, Johor"
          },
          {
            "name": "Taman Maju Jaya",
            "queryPlace": "Taman Maju Jaya, Labis, Johor"
          }
        ]
      },
      {
        "id": "johor_segamat_buloh_kasap",
        "name": "Buloh Kasap",
        "fullName": "Buloh Kasap",
        "queryPlace": "Buloh Kasap, Segamat, Johor",
        "tamans": [
          {
            "name": "Taman Yayasan (Buloh Kasap section)",
            "queryPlace": "Taman Yayasan, Buloh Kasap, Johor"
          },
          {
            "name": "Taman Tasik Sejati",
            "queryPlace": "Taman Tasik Sejati, Buloh Kasap, Johor"
          },
          {
            "name": "Taman Segamat Jaya (Buloh Kasap)",
            "queryPlace": "Taman Segamat Jaya, Buloh Kasap, Johor"
          },
          {
            "name": "Taman Mewah (Buloh Kasap)",
            "queryPlace": "Taman Mewah, Buloh Kasap, Johor"
          },
          {
            "name": "Taman Stesen",
            "queryPlace": "Taman Stesen, Buloh Kasap, Johor"
          },
          {
            "name": "Taman Mutiara Maju",
            "queryPlace": "Taman Mutiara Maju, Buloh Kasap, Johor"
          },
          {
            "name": "Taman Buloh Kasap",
            "queryPlace": "Taman Buloh Kasap, Buloh Kasap, Johor"
          }
        ]
      },
      {
        "id": "johor_segamat_jementah",
        "name": "Jementah",
        "fullName": "Jementah",
        "queryPlace": "Jementah, Segamat, Johor",
        "tamans": [
          {
            "name": "Taman Jementah Baru",
            "queryPlace": "Taman Jementah Baru, Jementah, Johor"
          },
          {
            "name": "Taman Tropika",
            "queryPlace": "Taman Tropika, Jementah, Johor"
          },
          {
            "name": "Taman Molek (Jementah)",
            "queryPlace": "Taman Molek, Jementah, Johor"
          },
          {
            "name": "Taman Cempaka",
            "queryPlace": "Taman Cempaka, Jementah, Johor"
          },
          {
            "name": "Taman Sri Mewah",
            "queryPlace": "Taman Sri Mewah, Jementah, Johor"
          },
          {
            "name": "Taman Jementah Jaya",
            "queryPlace": "Taman Jementah Jaya, Jementah, Johor"
          },
          {
            "name": "Taman Ledang",
            "queryPlace": "Taman Ledang, Jementah, Johor"
          },
          {
            "name": "Taman Melodi",
            "queryPlace": "Taman Melodi, Jementah, Johor"
          },
          {
            "name": "Taman Bahtera",
            "queryPlace": "Taman Bahtera, Jementah, Johor"
          },
          {
            "name": "Taman Ria (Jementah)",
            "queryPlace": "Taman Ria, Jementah, Johor"
          },
          {
            "name": "Taman Jakas",
            "queryPlace": "Taman Jakas, Jementah, Johor"
          },
          {
            "name": "Taman Harmoni (Jementah)",
            "queryPlace": "Taman Harmoni, Jementah, Johor"
          },
          {
            "name": "Taman Sri Ganang",
            "queryPlace": "Taman Sri Ganang, Jementah, Johor"
          },
          {
            "name": "Taman Intan (Jementah)",
            "queryPlace": "Taman Intan, Jementah, Johor"
          },
          {
            "name": "Taman Jaya",
            "queryPlace": "Taman Jaya, Jementah, Johor"
          }
        ]
      },
      {
        "id": "johor_segamat_chaah",
        "name": "Chaah",
        "fullName": "Chaah",
        "queryPlace": "Chaah, Segamat, Johor",
        "tamans": [
          {
            "name": "Taman Chaah Baru",
            "queryPlace": "Taman Chaah Baru, Chaah, Johor"
          },
          {
            "name": "Taman Muhibbah Jaya",
            "queryPlace": "Taman Muhibbah Jaya, Chaah, Johor"
          },
          {
            "name": "Taman Seri Sinaran",
            "queryPlace": "Taman Seri Sinaran, Chaah, Johor"
          },
          {
            "name": "Taman Sri Chaah",
            "queryPlace": "Taman Sri Chaah, Chaah, Johor"
          },
          {
            "name": "Taman Damai Jaya 2",
            "queryPlace": "Taman Damai Jaya 2, Chaah, Johor"
          },
          {
            "name": "Taman Nesa Chaah",
            "queryPlace": "Taman Nesa Chaah, Chaah, Johor"
          },
          {
            "name": "Taman Sentosa (Chaah)",
            "queryPlace": "Taman Sentosa, Chaah, Johor"
          },
          {
            "name": "Taman Sri Setia",
            "queryPlace": "Taman Sri Setia, Chaah, Johor"
          },
          {
            "name": "Desa Temu Jodoh",
            "queryPlace": "Desa Temu Jodoh, Chaah, Johor"
          }
        ]
      },
      {
        "id": "johor_segamat_bekok",
        "name": "Bekok",
        "fullName": "Bekok (MDL)",
        "queryPlace": "Bekok, Segamat, Johor",
        "tamans": [
          {
            "name": "Taman Sri Bekok",
            "queryPlace": "Taman Sri Bekok, Bekok, Johor"
          },
          {
            "name": "Taman Skim Bekok",
            "queryPlace": "Taman Skim Bekok, Bekok, Johor"
          },
          {
            "name": "Taman Sri Mahkota",
            "queryPlace": "Taman Sri Mahkota, Bekok, Johor"
          },
          {
            "name": "Taman Berjaya (Bekok)",
            "queryPlace": "Taman Berjaya, Bekok, Johor"
          },
          {
            "name": "Taman Mutiara (Bekok)",
            "queryPlace": "Taman Mutiara, Bekok, Johor"
          },
          {
            "name": "Taman Wijaya (Bekok)",
            "queryPlace": "Taman Wijaya, Bekok, Johor"
          }
        ]
      },
      {
        "id": "johor_segamat_batu_anam",
        "name": "Batu Anam",
        "fullName": "Batu Anam",
        "queryPlace": "Batu Anam, Segamat, Johor",
        "tamans": [
          {
            "name": "Taman Sri Alam (1 & 2)",
            "queryPlace": "Taman Sri Alam, Batu Anam, Johor"
          },
          {
            "name": "Taman Permai (Batu Anam)",
            "queryPlace": "Taman Permai, Batu Anam, Johor"
          },
          {
            "name": "Taman Mina",
            "queryPlace": "Taman Mina, Batu Anam, Johor"
          },
          {
            "name": "Taman Bintang-Bintang",
            "queryPlace": "Taman Bintang-Bintang, Batu Anam, Johor"
          },
          {
            "name": "Taman Damai",
            "queryPlace": "Taman Damai, Batu Anam, Johor"
          },
          {
            "name": "Taman Desa India",
            "queryPlace": "Taman Desa India, Batu Anam, Johor"
          },
          {
            "name": "Taman KSM",
            "queryPlace": "Taman KSM, Batu Anam, Johor"
          },
          {
            "name": "Taman Mawar",
            "queryPlace": "Taman Mawar, Batu Anam, Johor"
          },
          {
            "name": "Taman Seri Seruling",
            "queryPlace": "Taman Seri Seruling, Batu Anam, Johor"
          },
          {
            "name": "Taman Seri Cahaya",
            "queryPlace": "Taman Seri Cahaya, Batu Anam, Johor"
          },
          {
            "name": "Taman Seri Emas Jaya",
            "queryPlace": "Taman Seri Emas Jaya, Batu Anam, Johor"
          },
          {
            "name": "Taman Molek Perdana",
            "queryPlace": "Taman Molek Perdana, Batu Anam, Johor"
          }
        ]
      },
      {
        "id": "johor_segamat_tenang_tenang_stesen",
        "name": "Tenang / Tenang Stesen",
        "fullName": "Tenang / Tenang Stesen",
        "queryPlace": "Tenang / Tenang Stesen, Segamat, Johor",
        "tamans": [
          {
            "name": "Taman Sri Tenang",
            "queryPlace": "Taman Sri Tenang, Tenang / Tenang Stesen, Johor"
          },
          {
            "name": "Taman Tenang Jaya",
            "queryPlace": "Taman Tenang Jaya, Tenang / Tenang Stesen, Johor"
          },
          {
            "name": "Kampung Tenang",
            "queryPlace": "Kampung Tenang, Tenang / Tenang Stesen, Johor"
          }
        ]
      }
    ]
  },
  {
    "id": "johor_tangkak",
    "num": 9,
    "name": "Tangkak",
    "state": "Johor",
    "towns": [
      {
        "id": "johor_tangkak_tangkak",
        "name": "Tangkak",
        "fullName": "Tangkak Town Core",
        "queryPlace": "Tangkak, Tangkak, Johor",
        "tamans": [
          {
            "name": "Bandar Baru Tangkak",
            "queryPlace": "Bandar Baru Tangkak, Tangkak, Johor"
          },
          {
            "name": "Taman Delima",
            "queryPlace": "Taman Delima, Tangkak, Johor"
          },
          {
            "name": "Taman Kemajuan",
            "queryPlace": "Taman Kemajuan, Tangkak, Johor"
          },
          {
            "name": "Taman Happy Garden",
            "queryPlace": "Taman Happy Garden, Tangkak, Johor"
          },
          {
            "name": "Taman Bintang",
            "queryPlace": "Taman Bintang, Tangkak, Johor"
          },
          {
            "name": "Taman Ledang Emas",
            "queryPlace": "Taman Ledang Emas, Tangkak, Johor"
          },
          {
            "name": "Taman Tangkak Jaya (Fasa 1 – 7)",
            "queryPlace": "Taman Tangkak Jaya, Tangkak, Johor"
          },
          {
            "name": "Taman Tangkak Perdana",
            "queryPlace": "Taman Tangkak Perdana, Tangkak, Johor"
          },
          {
            "name": "Taman Tangkak 2",
            "queryPlace": "Taman Tangkak 2, Tangkak, Johor"
          },
          {
            "name": "Taman Pelangi (Fasa 1 – 4)",
            "queryPlace": "Taman Pelangi, Tangkak, Johor"
          },
          {
            "name": "Taman Sri Ledang & Taman Sri Ledang Baru",
            "queryPlace": "Taman Sri Ledang & Taman Sri Ledang Baru, Tangkak, Johor"
          },
          {
            "name": "Taman Sialang (Fasa 1 – 5)",
            "queryPlace": "Taman Sialang, Tangkak, Johor"
          },
          {
            "name": "Taman Intan (Fasa 1 & 2)",
            "queryPlace": "Taman Intan, Tangkak, Johor"
          },
          {
            "name": "Taman Mahkota (Fasa 1 – 3)",
            "queryPlace": "Taman Mahkota, Tangkak, Johor"
          },
          {
            "name": "Taman Murni",
            "queryPlace": "Taman Murni, Tangkak, Johor"
          },
          {
            "name": "Taman Sri Tangkak (Fasa 1 & 2)",
            "queryPlace": "Taman Sri Tangkak, Tangkak, Johor"
          },
          {
            "name": "Taman Wawasan",
            "queryPlace": "Taman Wawasan, Tangkak, Johor"
          },
          {
            "name": "Taman Gunung Mas",
            "queryPlace": "Taman Gunung Mas, Tangkak, Johor"
          },
          {
            "name": "Taman Kenangan",
            "queryPlace": "Taman Kenangan, Tangkak, Johor"
          },
          {
            "name": "Taman Tasik Ria",
            "queryPlace": "Taman Tasik Ria, Tangkak, Johor"
          },
          {
            "name": "Taman Ayer Molek (1 & 2)",
            "queryPlace": "Taman Ayer Molek, Tangkak, Johor"
          },
          {
            "name": "Taman Damai (1 & 2)",
            "queryPlace": "Taman Damai, Tangkak, Johor"
          },
          {
            "name": "Taman Bekoh Permai",
            "queryPlace": "Taman Bekoh Permai, Tangkak, Johor"
          },
          {
            "name": "Taman Industri Payamas",
            "queryPlace": "Taman Industri Payamas, Tangkak, Johor"
          },
          {
            "name": "Taman Solok Jaya",
            "queryPlace": "Taman Solok Jaya, Tangkak, Johor"
          },
          {
            "name": "Taman Sri Nilam",
            "queryPlace": "Taman Sri Nilam, Tangkak, Johor"
          }
        ]
      },
      {
        "id": "johor_tangkak_bukit_gambir",
        "name": "Bukit Gambir",
        "fullName": "Bukit Gambir",
        "queryPlace": "Bukit Gambir, Tangkak, Johor",
        "tamans": [
          {
            "name": "Bandar Baru Bukit Gambir",
            "queryPlace": "Bandar Baru Bukit Gambir, Bukit Gambir, Johor"
          },
          {
            "name": "Taman Gambir Perdana",
            "queryPlace": "Taman Gambir Perdana, Bukit Gambir, Johor"
          },
          {
            "name": "Taman Desa 2 (Pekan Bukit Gambir)",
            "queryPlace": "Taman Desa 2, Bukit Gambir, Johor"
          },
          {
            "name": "Taman Melor",
            "queryPlace": "Taman Melor, Bukit Gambir, Johor"
          },
          {
            "name": "Taman Mulia",
            "queryPlace": "Taman Mulia, Bukit Gambir, Johor"
          },
          {
            "name": "Taman Cempaka (Bukit Gambir)",
            "queryPlace": "Taman Cempaka, Bukit Gambir, Johor"
          },
          {
            "name": "Taman Jaya Bukit Gambir",
            "queryPlace": "Taman Jaya Bukit Gambir, Bukit Gambir, Johor"
          }
        ]
      },
      {
        "id": "johor_tangkak_sungai_mati",
        "name": "Sungai Mati",
        "fullName": "Sungai Mati & Serom",
        "queryPlace": "Sungai Mati, Tangkak, Johor",
        "tamans": [
          {
            "name": "Taman Serom Utama & Taman Serom Utama 2",
            "queryPlace": "Taman Serom Utama & Taman Serom Utama 2, Sungai Mati, Johor"
          },
          {
            "name": "Taman Serom 1 & Taman Serom 2",
            "queryPlace": "Taman Serom 1 & Taman Serom 2, Sungai Mati, Johor"
          },
          {
            "name": "Taman Serom Baru",
            "queryPlace": "Taman Serom Baru, Sungai Mati, Johor"
          },
          {
            "name": "Taman Serom Perdana",
            "queryPlace": "Taman Serom Perdana, Sungai Mati, Johor"
          },
          {
            "name": "Taman Cemerlang",
            "queryPlace": "Taman Cemerlang, Sungai Mati, Johor"
          },
          {
            "name": "Taman Cempaka Serom",
            "queryPlace": "Taman Cempaka Serom, Sungai Mati, Johor"
          },
          {
            "name": "Taman Pulai Indah (Serom)",
            "queryPlace": "Taman Pulai Indah, Sungai Mati, Johor"
          },
          {
            "name": "Taman Sri Emas (Fasa 1 – 7)",
            "queryPlace": "Taman Sri Emas, Sungai Mati, Johor"
          },
          {
            "name": "Taman Muhibbah Jaya",
            "queryPlace": "Taman Muhibbah Jaya, Sungai Mati, Johor"
          },
          {
            "name": "Taman Muhibbah 3",
            "queryPlace": "Taman Muhibbah 3, Sungai Mati, Johor"
          },
          {
            "name": "Taman Kangkar Jaya",
            "queryPlace": "Taman Kangkar Jaya, Sungai Mati, Johor"
          },
          {
            "name": "Taman Bukit Kangkar Baru",
            "queryPlace": "Taman Bukit Kangkar Baru, Sungai Mati, Johor"
          },
          {
            "name": "Taman Melati (Sungai Mati)",
            "queryPlace": "Taman Melati, Sungai Mati, Johor"
          },
          {
            "name": "Taman Setia",
            "queryPlace": "Taman Setia, Sungai Mati, Johor"
          },
          {
            "name": "Taman Bestari",
            "queryPlace": "Taman Bestari, Sungai Mati, Johor"
          },
          {
            "name": "Taman Rawang Impian",
            "queryPlace": "Taman Rawang Impian, Sungai Mati, Johor"
          },
          {
            "name": "Taman Saujana Putra Serom",
            "queryPlace": "Taman Saujana Putra Serom, Sungai Mati, Johor"
          }
        ]
      },
      {
        "id": "johor_tangkak_tanjung_agas",
        "name": "Tanjung Agas",
        "fullName": "Tanjung Agas (Muar Border)",
        "queryPlace": "Tanjung Agas, Tangkak, Johor",
        "tamans": [
          {
            "name": "Taman Tangkak / Tanjung Agas",
            "queryPlace": "Taman Tangkak / Tanjung Agas, Tanjung Agas, Johor"
          },
          {
            "name": "Taman Sri Tanjung",
            "queryPlace": "Taman Sri Tanjung, Tanjung Agas, Johor"
          },
          {
            "name": "Taman Bakri Indah (Tanjung Agas)",
            "queryPlace": "Taman Bakri Indah, Tanjung Agas, Johor"
          },
          {
            "name": "Taman Melati Tanjung Agas",
            "queryPlace": "Taman Melati Tanjung Agas, Tanjung Agas, Johor"
          },
          {
            "name": "Taman Seri Maharani",
            "queryPlace": "Taman Seri Maharani, Tanjung Agas, Johor"
          },
          {
            "name": "Taman Dahlia",
            "queryPlace": "Taman Dahlia, Tanjung Agas, Johor"
          },
          {
            "name": "Taman Berkat",
            "queryPlace": "Taman Berkat, Tanjung Agas, Johor"
          },
          {
            "name": "Taman Wira",
            "queryPlace": "Taman Wira, Tanjung Agas, Johor"
          },
          {
            "name": "Kawasan Perindustrian Tanjung Agas",
            "queryPlace": "Kawasan Perindustrian Tanjung Agas, Tanjung Agas, Johor"
          }
        ]
      },
      {
        "id": "johor_tangkak_sagil",
        "name": "Sagil",
        "fullName": "Sagil",
        "queryPlace": "Sagil, Tangkak, Johor",
        "tamans": [
          {
            "name": "Taman Sagil Indah",
            "queryPlace": "Taman Sagil Indah, Sagil, Johor"
          },
          {
            "name": "Taman Desa Sagil",
            "queryPlace": "Taman Desa Sagil, Sagil, Johor"
          },
          {
            "name": "Pekan Sagil",
            "queryPlace": "Pekan Sagil, Sagil, Johor"
          }
        ]
      }
    ]
  },
  {
    "id": "johor_mersing",
    "num": 10,
    "name": "Mersing",
    "state": "Johor",
    "towns": [
      {
        "id": "johor_mersing_mersing",
        "name": "Mersing",
        "fullName": "Mersing Town (Mukim Mersing)",
        "queryPlace": "Mersing, Mersing, Johor",
        "tamans": [
          {
            "name": "Taman Mersing",
            "queryPlace": "Taman Mersing, Mersing, Johor"
          },
          {
            "name": "Taman Sri Mersing",
            "queryPlace": "Taman Sri Mersing, Mersing, Johor"
          },
          {
            "name": "Taman Nelayan",
            "queryPlace": "Taman Nelayan, Mersing, Johor"
          },
          {
            "name": "Taman Sri Pantai",
            "queryPlace": "Taman Sri Pantai, Mersing, Johor"
          },
          {
            "name": "Taman Tun Dr. Ismail",
            "queryPlace": "Taman Tun Dr. Ismail, Mersing, Johor"
          },
          {
            "name": "Taman Pantai Timur",
            "queryPlace": "Taman Pantai Timur, Mersing, Johor"
          },
          {
            "name": "Taman Guru",
            "queryPlace": "Taman Guru, Mersing, Johor"
          },
          {
            "name": "Taman Intan",
            "queryPlace": "Taman Intan, Mersing, Johor"
          },
          {
            "name": "Taman Pantai",
            "queryPlace": "Taman Pantai, Mersing, Johor"
          },
          {
            "name": "Taman Sri Bayu",
            "queryPlace": "Taman Sri Bayu, Mersing, Johor"
          },
          {
            "name": "Taman Seri Nakhoda & Taman Seri Nakhoda 1",
            "queryPlace": "Taman Seri Nakhoda & Taman Seri Nakhoda 1, Mersing, Johor"
          },
          {
            "name": "Taman Lautan Biru",
            "queryPlace": "Taman Lautan Biru, Mersing, Johor"
          },
          {
            "name": "Taman Wawasan",
            "queryPlace": "Taman Wawasan, Mersing, Johor"
          },
          {
            "name": "Taman Air Merah",
            "queryPlace": "Taman Air Merah, Mersing, Johor"
          },
          {
            "name": "Taman Emas",
            "queryPlace": "Taman Emas, Mersing, Johor"
          },
          {
            "name": "Taman Sri Daik",
            "queryPlace": "Taman Sri Daik, Mersing, Johor"
          },
          {
            "name": "Taman Samudera",
            "queryPlace": "Taman Samudera, Mersing, Johor"
          },
          {
            "name": "Taman Sutera Indah",
            "queryPlace": "Taman Sutera Indah, Mersing, Johor"
          },
          {
            "name": "Taman Mersing Kechil",
            "queryPlace": "Taman Mersing Kechil, Mersing, Johor"
          },
          {
            "name": "Taman Mahkota Mersing",
            "queryPlace": "Taman Mahkota Mersing, Mersing, Johor"
          }
        ]
      },
      {
        "id": "johor_mersing_endau",
        "name": "Endau",
        "fullName": "Endau (Mukim Endau)",
        "queryPlace": "Endau, Mersing, Johor",
        "tamans": [
          {
            "name": "Taman Desa Sri Endau",
            "queryPlace": "Taman Desa Sri Endau, Endau, Johor"
          },
          {
            "name": "Taman Bahagia",
            "queryPlace": "Taman Bahagia, Endau, Johor"
          },
          {
            "name": "Taman Mutiara",
            "queryPlace": "Taman Mutiara, Endau, Johor"
          },
          {
            "name": "Taman Haji Ariffin",
            "queryPlace": "Taman Haji Ariffin, Endau, Johor"
          },
          {
            "name": "Taman Fajar",
            "queryPlace": "Taman Fajar, Endau, Johor"
          },
          {
            "name": "Taman Markisa",
            "queryPlace": "Taman Markisa, Endau, Johor"
          },
          {
            "name": "Taman Endau Makmur",
            "queryPlace": "Taman Endau Makmur, Endau, Johor"
          },
          {
            "name": "Taman Roselle",
            "queryPlace": "Taman Roselle, Endau, Johor"
          },
          {
            "name": "Taman Koperasi Nelayan",
            "queryPlace": "Taman Koperasi Nelayan, Endau, Johor"
          },
          {
            "name": "Taman Harmoni (Endau)",
            "queryPlace": "Taman Harmoni, Endau, Johor"
          },
          {
            "name": "Taman Endau Utama",
            "queryPlace": "Taman Endau Utama, Endau, Johor"
          },
          {
            "name": "Taman Bahtera",
            "queryPlace": "Taman Bahtera, Endau, Johor"
          },
          {
            "name": "Taman Seri Endau",
            "queryPlace": "Taman Seri Endau, Endau, Johor"
          },
          {
            "name": "Pekan Padang Endau",
            "queryPlace": "Pekan Padang Endau, Endau, Johor"
          }
        ]
      },
      {
        "id": "johor_mersing_jemaluang",
        "name": "Jemaluang",
        "fullName": "Jemaluang",
        "queryPlace": "Jemaluang, Mersing, Johor",
        "tamans": [
          {
            "name": "Taman Jemaluang",
            "queryPlace": "Taman Jemaluang, Jemaluang, Johor"
          },
          {
            "name": "Taman Sri Jemaluang",
            "queryPlace": "Taman Sri Jemaluang, Jemaluang, Johor"
          },
          {
            "name": "Kampung Baru Jemaluang",
            "queryPlace": "Kampung Baru Jemaluang, Jemaluang, Johor"
          }
        ]
      },
      {
        "id": "johor_mersing_tenggaroh",
        "name": "Tenggaroh",
        "fullName": "Tenggaroh",
        "queryPlace": "Tenggaroh, Mersing, Johor",
        "tamans": [
          {
            "name": "Pekan Tenggaroh",
            "queryPlace": "Pekan Tenggaroh, Tenggaroh, Johor"
          },
          {
            "name": "FELDA Tenggaroh 1 – 7 Settlements",
            "queryPlace": "FELDA Tenggaroh 1 – 7 Settlements, Tenggaroh, Johor"
          }
        ]
      }
    ]
  }
]
};

export const ALL_TERRITORIES: Record<string, StateTerritory> = {
  johor: JOHOR_TERRITORY,
};

function cleanStr(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function buildTerritoryResponse(
  stateName = 'johor',
  scans: Array<{
    public_id: string;
    status: string;
    place: string;
    keyword: string | null;
    company_count: number;
    created_at: string;
  }> = []
) {
  const base = ALL_TERRITORIES[stateName.toLowerCase()] ?? JOHOR_TERRITORY;
  const districts: DistrictLocation[] = JSON.parse(JSON.stringify(base.districts));

  let totalTamans = 0;
  let scannedTamans = 0;
  let totalLeads = 0;
  let totalTowns = 0;
  const uniqueScanIds = new Set<string>();

  for (const d of districts) {
    let dTamans = 0;
    let dScanned = 0;
    totalTowns += d.towns.length;

    for (const t of d.towns) {
      const townQueryNorm = cleanStr(t.queryPlace);
      const townNameNorm = cleanStr(t.name);

      const matchingTownScan = scans.find((s) => {
        const p = cleanStr(s.place);
        return p === townQueryNorm || p === townNameNorm || p.startsWith(townNameNorm + ' johor');
      });

      if (matchingTownScan) {
        t.scan = {
          publicId: matchingTownScan.public_id,
          status: matchingTownScan.status,
          count: matchingTownScan.company_count,
          createdAt: matchingTownScan.created_at,
          keyword: matchingTownScan.keyword,
        };
      }

      for (const tm of t.tamans) {
        dTamans++;
        totalTamans++;
        const tamanQueryNorm = cleanStr(tm.queryPlace);
        const tamanNameNorm = cleanStr(tm.name.replace(/^(taman|jalan|bandar|desa|kampung)\s+/i, ''));

        const matchingTamanScan = scans.find((s) => {
          const p = cleanStr(s.place);
          if (p === tamanQueryNorm) return true;
          if (tamanNameNorm.length >= 3 && tamanNameNorm !== townNameNorm && p.includes(tamanNameNorm) && p.includes(townNameNorm)) return true;
          return false;
        });

        if (matchingTamanScan) {
          tm.scan = {
            publicId: matchingTamanScan.public_id,
            status: matchingTamanScan.status,
            count: matchingTamanScan.company_count,
            createdAt: matchingTamanScan.created_at,
            keyword: matchingTamanScan.keyword,
          };
          if (matchingTamanScan.status === 'completed') {
            dScanned++;
            scannedTamans++;
            if (!uniqueScanIds.has(matchingTamanScan.public_id)) {
              uniqueScanIds.add(matchingTamanScan.public_id);
              totalLeads += matchingTamanScan.company_count || 0;
            }
          }
        }
      }
    }
    d.totalTamans = dTamans;
    d.scannedTamans = dScanned;
  }

  return {
    state: base.state,
    stats: {
      totalDistricts: districts.length,
      totalTowns,
      totalTamans,
      scannedTamans,
      totalLeads,
    },
    districts,
  };
}
