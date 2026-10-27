import type { DayHoursDto } from './dto/settings.dto';
import { SETTINGS_ID, type Settings } from './entities/settings.entity';

// Valeurs de départ, identiques à `defaultSettings` du front (lib/stores/settings-store.ts)

const weekday = (ouverture: string, fermeture: string): DayHoursDto => ({
  ouvert: true,
  ouverture,
  fermeture,
  debutPause: '13:00',
  finPause: '14:00',
});

export const defaultSettings = (): Omit<Settings, 'modifieLe'> => ({
  id: SETTINGS_ID,
  regles: {
    delaiAnnulationJours: 2,
    fenetreReservationJours: 30,
    delaiMinimumHeures: 12,
  },
  semaine: [
    { ouvert: false, ouverture: '09:00', fermeture: '17:00' },
    weekday('09:00', '19:00'),
    weekday('09:00', '19:00'),
    weekday('09:00', '19:00'),
    weekday('09:00', '19:00'),
    weekday('09:00', '19:00'),
    weekday('09:00', '17:00'),
  ],
  // Créneaux de 2 h, 2 places
  dureeCreneauMinutes: 120,
  placesParCreneau: 2,
  plateforme: {
    nom: 'Rodiq',
    slogan: '« Ne pas cacher. Prendre soin. »',
    email: 'contact@rodiq.com',
    telephone: '+225 00 00 00 00 44',
    telephoneSecondaire: '',
    whatsapp: '',
    reseauxSociaux: {
      instagram: 'https://instagram.com',
      facebook: 'https://facebook.com',
      tiktok: 'https://tiktok.com',
    },
  },
  logoPrincipal: null,
  logoClair: null,
  logoIcone: null,
  adresse: 'Adresse du salon',
  // Abidjan, en attendant la position réelle du salon
  latitude: 5.36,
  longitude: -4.0083,
  domicile: [
    { destination: 'Cocody', frais: 2000 },
    { destination: 'Riviera', frais: 2000 },
    { destination: 'Plateau', frais: 1500 },
    { destination: 'Marcory', frais: 1500 },
    { destination: 'Treichville', frais: 1500 },
    { destination: 'Yopougon', frais: 2500 },
    { destination: 'Bingerville', frais: 3000 },
  ],
  expedition: [
    { destination: 'Yamoussoukro', frais: 3500 },
    { destination: 'Bouaké', frais: 4000 },
    { destination: 'Daloa', frais: 4000 },
    { destination: 'San-Pédro', frais: 4500 },
    { destination: 'Korhogo', frais: 5000 },
  ],
});
