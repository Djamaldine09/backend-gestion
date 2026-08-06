import Candidat from '../models/Candidat';
import CentreExamen from '../models/CentreExamen';

type CentreLike = {
  coords?: { lat?: number; lng?: number };
  latitude?: number;
  longitude?: number;
  nom?: string;
  ville?: string;
  region?: string;
  adresse?: string;
  code?: string;
  telephone?: string;
  email?: string;
  salle?: string;
  numeroPlace?: string | number;
  photo?: string;
  [key: string]: any;
};

export function normalizeCentreCoords(centre: CentreLike | null | undefined) {
  if (!centre) return undefined;

  if (centre.coords && (centre.coords.lat !== undefined || centre.coords.lng !== undefined)) {
    return { lat: Number(centre.coords.lat), lng: Number(centre.coords.lng) };
  }

  if (centre.latitude !== undefined || centre.longitude !== undefined) {
    return { lat: Number(centre.latitude), lng: Number(centre.longitude) };
  }

  return undefined;
}

export function buildCentreAffectePayload(centre: CentreLike | null | undefined, overrides: Record<string, any> = {}) {
  const explicitCoords = overrides.coords && (overrides.coords.lat !== undefined || overrides.coords.lng !== undefined)
    ? { lat: Number(overrides.coords.lat), lng: Number(overrides.coords.lng) }
    : undefined;

  const coords = explicitCoords || normalizeCentreCoords(centre);

  return {
    ...overrides,
    nom: overrides.nom ?? centre?.nom,
    ville: overrides.ville ?? centre?.ville,
    region: overrides.region ?? centre?.region,
    adresse: overrides.adresse ?? centre?.adresse ?? centre?.code ?? '',
    salle: overrides.salle,
    numeroPlace: overrides.numeroPlace,
    coords,
    latitude: overrides.latitude ?? centre?.latitude,
    longitude: overrides.longitude ?? centre?.longitude,
    telephone: overrides.telephone ?? centre?.telephone,
    email: overrides.email ?? centre?.email,
    photo: overrides.photo ?? centre?.photo,
  };
}

export async function ensureCandidateCentreAffecte(candidat: any, fallbackCentre?: CentreLike | null) {
  const current = candidat?.centreAffecte || {};
  const hasCoords =
    (current.coords?.lat !== undefined && current.coords?.lng !== undefined) ||
    (current.latitude !== undefined && current.longitude !== undefined);

  if (hasCoords) {
    return buildCentreAffectePayload(null, current);
  }

  let centreDoc = fallbackCentre;
  if (!centreDoc && candidat?.centreExamen) {
    centreDoc = typeof candidat.centreExamen === 'object'
      ? candidat.centreExamen
      : await CentreExamen.findById(candidat.centreExamen).catch(() => null);
  }

  const payload = buildCentreAffectePayload(centreDoc, {
    ...current,
    salle: current.salle ?? 'AUTO',
    numeroPlace: current.numeroPlace ?? 'AUTO',
  });

  if (candidat?._id) {
    await Candidat.findByIdAndUpdate(candidat._id, { centreAffecte: payload });
    candidat.centreAffecte = payload;
  }

  return payload;
}