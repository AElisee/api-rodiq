import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThanOrEqual, Repository } from 'typeorm';
import { Reservation } from '../reservations/entities/reservation.entity';
import { ACTIVE_STATUTS } from '../reservations/reservations.rules';
import type {
  BookingRulesDto,
  LogoVariant,
  PlatformInfoDto,
  SettingsDto,
  ShippingDto,
} from './dto/settings.dto';
import type {
  AddClosedDateDto,
  CreateSettingsDto,
  UpdateHoursDto,
  UpdateLogoDto,
  UpdateSalonDto,
} from './dto/update-settings.dto';
import { ClosedDate } from './entities/closed-date.entity';
import { SETTINGS_ID, Settings } from './entities/settings.entity';
import {
  dataUrlBytes,
  duplicatePlaces,
  MAX_LOGO_BYTES,
  todayKey,
  weekErrors,
} from './settings.rules';

const LOGO_COLUMNS = {
  principal: 'logoPrincipal',
  clair: 'logoClair',
  icone: 'logoIcone',
} as const satisfies Record<LogoVariant, keyof Settings>;

// Champs vides normalisés en chaîne vide, pour une forme stable en lecture
const platformColumn = (platform: PlatformInfoDto): PlatformInfoDto => ({
  nom: platform.nom,
  slogan: platform.slogan,
  email: platform.email,
  telephone: platform.telephone,
  telephoneSecondaire: platform.telephoneSecondaire ?? '',
  whatsapp: platform.whatsapp ?? '',
  reseauxSociaux: {
    instagram: platform.reseauxSociaux.instagram ?? '',
    facebook: platform.reseauxSociaux.facebook ?? '',
    tiktok: platform.reseauxSociaux.tiktok ?? '',
  },
});

const shippingErrors = ({ domicile, expedition }: ShippingDto) => [
  ...duplicatePlaces(domicile).map(
    (place) => `Livraison à domicile : « ${place} » en double`,
  ),
  ...duplicatePlaces(expedition).map(
    (place) => `Expédition : « ${place} » en double`,
  ),
];

// Chaque écriture renvoie l'ensemble des réglages, pour que le front remplace son état d'un coup
@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Settings)
    private readonly settings: Repository<Settings>,
    @InjectRepository(ClosedDate)
    private readonly closedDates: Repository<ClosedDate>,
  ) {}

  // Délai d'annulation enregistré en jours avant le passage en heures : le convertir une fois
  async onModuleInit() {
    const settings = await this.settings.findOneBy({ id: SETTINGS_ID });
    const { delaiAnnulationJours, ...regles } = (settings?.regles ??
      {}) as BookingRulesDto & { delaiAnnulationJours?: number };
    if (!settings || delaiAnnulationJours === undefined) return;
    await this.settings.update(SETTINGS_ID, {
      regles: {
        ...regles,
        delaiAnnulationHeures: delaiAnnulationJours * 24 || null,
      },
    });
  }

  async get(): Promise<SettingsDto> {
    const [settings, closedDates] = await Promise.all([
      this.load(),
      this.closedDates.find({
        where: { date: MoreThanOrEqual(todayKey()) },
        order: { date: 'ASC' },
      }),
    ]);
    return {
      regles: settings.regles,
      semaine: settings.semaine,
      dureeCreneauMinutes: settings.dureeCreneauMinutes,
      placesParCreneau: settings.placesParCreneau,
      fermetures: closedDates.map(({ date, motif }) => ({ date, motif })),
      plateforme: {
        ...settings.plateforme,
        logos: Object.fromEntries(
          Object.entries(LOGO_COLUMNS).flatMap(([variant, column]) =>
            settings[column] ? [[variant, settings[column]]] : [],
          ),
        ),
      },
      salon: { adresse: settings.adresse },
      position: { latitude: settings.latitude, longitude: settings.longitude },
      livraisons: {
        domicile: settings.domicile,
        expedition: settings.expedition,
      },
    };
  }

  // Première configuration du salon : une seule fois, les onglets prennent ensuite le relais
  async create(dto: CreateSettingsDto) {
    const errors = [
      ...weekErrors(dto.semaine),
      ...shippingErrors(dto.livraisons),
    ];
    if (errors.length) throw new BadRequestException(errors);
    if (await this.settings.existsBy({ id: SETTINGS_ID })) {
      throw new ConflictException(
        'Les réglages existent déjà : modifiez-les onglet par onglet',
      );
    }
    await this.settings.insert({
      id: SETTINGS_ID,
      regles: dto.regles,
      semaine: dto.semaine,
      dureeCreneauMinutes: dto.dureeCreneauMinutes,
      placesParCreneau: dto.placesParCreneau,
      plateforme: platformColumn(dto.plateforme),
      logoPrincipal: null,
      logoClair: null,
      logoIcone: null,
      adresse: dto.salon.adresse,
      latitude: dto.position.latitude,
      longitude: dto.position.longitude,
      domicile: dto.livraisons.domicile,
      expedition: dto.livraisons.expedition,
    });
    return this.get();
  }

  async setPlatform(platform: PlatformInfoDto) {
    return this.patch({ plateforme: platformColumn(platform) });
  }

  async setLogo(variant: LogoVariant, { image }: UpdateLogoDto) {
    if (dataUrlBytes(image) > MAX_LOGO_BYTES) {
      throw new BadRequestException(['Image trop lourde : 500 Ko maximum']);
    }
    return this.patch({ [LOGO_COLUMNS[variant]]: image });
  }

  async removeLogo(variant: LogoVariant) {
    return this.patch({ [LOGO_COLUMNS[variant]]: null });
  }

  async setHours({
    semaine,
    dureeCreneauMinutes,
    placesParCreneau,
  }: UpdateHoursDto) {
    const errors = weekErrors(semaine);
    if (errors.length) throw new BadRequestException(errors);
    return this.patch({ semaine, dureeCreneauMinutes, placesParCreneau });
  }

  async setRules(regles: BookingRulesDto) {
    return this.patch({ regles });
  }

  async addClosedDate({ date, motif }: AddClosedDateDto) {
    if (date < todayKey()) {
      throw new BadRequestException(['Cette date est déjà passée']);
    }
    await this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // Même verrou que la création d'une réservation : aucune ne peut se glisser ce jour-là
      const settings = await manager.findOne(Settings, {
        where: { id: SETTINGS_ID },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settings) {
        throw new NotFoundException("Le salon n'est pas encore configuré");
      }
      const active = await manager.find(Reservation, {
        select: { reference: true, debut: true },
        where: { date, statut: In(ACTIVE_STATUTS) },
        order: { debut: 'ASC' },
      });
      if (active.length) {
        throw new ConflictException(
          `Ce jour-là compte encore ${active.length} réservation${active.length > 1 ? 's' : ''} ` +
            `en attente ou confirmée${active.length > 1 ? 's' : ''} ` +
            `(${active.map((r) => `${r.reference} à ${r.debut}`).join(', ')}) : refusez-les avant de fermer`,
        );
      }
      await manager.save(ClosedDate, {
        date,
        motif: motif || 'Fermeture exceptionnelle',
      });
    });
    return this.get();
  }

  async removeClosedDate(date: string) {
    const { affected } = await this.closedDates.delete({ date });
    if (!affected) throw new NotFoundException('Aucune fermeture ce jour-là');
    return this.get();
  }

  async setSalon({ adresse, position }: UpdateSalonDto) {
    return this.patch({
      adresse,
      latitude: position.latitude,
      longitude: position.longitude,
    });
  }

  async setShipping(shipping: ShippingDto) {
    const errors = shippingErrors(shipping);
    if (errors.length) throw new BadRequestException(errors);
    const { domicile, expedition } = shipping;
    return this.patch({ domicile, expedition });
  }

  // Ligne unique des réglages : tant que l'admin ne l'a pas créée, rien n'est configuré
  private async load() {
    const settings = await this.settings.findOneBy({ id: SETTINGS_ID });
    if (!settings) {
      throw new NotFoundException("Le salon n'est pas encore configuré");
    }
    return settings;
  }

  private async patch(changes: Partial<Omit<Settings, 'id' | 'modifieLe'>>) {
    await this.load();
    await this.settings.save({ id: SETTINGS_ID, ...changes });
    return this.get();
  }
}
