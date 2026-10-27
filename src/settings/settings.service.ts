import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import type {
  BookingRulesDto,
  LogoVariant,
  PlatformInfoDto,
  SettingsDto,
} from './dto/settings.dto';
import type {
  AddClosedDateDto,
  UpdateHoursDto,
  UpdateLogoDto,
  UpdateSalonDto,
  UpdateShippingDto,
} from './dto/update-settings.dto';
import { ClosedDate } from './entities/closed-date.entity';
import { SETTINGS_ID, Settings } from './entities/settings.entity';
import { defaultSettings } from './settings.defaults';
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

// Chaque écriture renvoie l'ensemble des réglages, pour que le front remplace son état d'un coup
@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Settings)
    private readonly settings: Repository<Settings>,
    @InjectRepository(ClosedDate)
    private readonly closedDates: Repository<ClosedDate>,
  ) {}

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

  async setPlatform(platform: PlatformInfoDto) {
    const { nom, slogan, email, telephone, reseauxSociaux } = platform;
    return this.patch({
      plateforme: {
        nom,
        slogan,
        email,
        telephone,
        telephoneSecondaire: platform.telephoneSecondaire ?? '',
        whatsapp: platform.whatsapp ?? '',
        reseauxSociaux: {
          instagram: reseauxSociaux.instagram ?? '',
          facebook: reseauxSociaux.facebook ?? '',
          tiktok: reseauxSociaux.tiktok ?? '',
        },
      },
    });
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
    await this.closedDates.save({
      date,
      motif: motif || 'Fermeture exceptionnelle',
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

  async setShipping({ domicile, expedition }: UpdateShippingDto) {
    const errors = [
      ...duplicatePlaces(domicile).map(
        (place) => `Livraison à domicile : « ${place} » en double`,
      ),
      ...duplicatePlaces(expedition).map(
        (place) => `Expédition : « ${place} » en double`,
      ),
    ];
    if (errors.length) throw new BadRequestException(errors);
    return this.patch({ domicile, expedition });
  }

  // Valeurs par défaut, sans logo ni fermeture exceptionnelle
  async reset() {
    await this.settings.manager.transaction(async (manager) => {
      await manager.save(Settings, defaultSettings());
      await manager.createQueryBuilder().delete().from(ClosedDate).execute();
    });
    return this.get();
  }

  // Ligne unique des réglages, créée avec les valeurs par défaut si elle n'existe pas encore
  private async load() {
    return (
      (await this.settings.findOneBy({ id: SETTINGS_ID })) ??
      this.settings.save(defaultSettings())
    );
  }

  private async patch(changes: Partial<Omit<Settings, 'id' | 'modifieLe'>>) {
    await this.load();
    await this.settings.save({ id: SETTINGS_ID, ...changes });
    return this.get();
  }
}
