import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { Between, DataSource, LessThan, Repository } from 'typeorm';
import { dayKey } from '../reservations/reservations.rules';
import { VisitesJourDto, VisitesQueryDto } from './dto/visites.dto';
import { EmpreinteVisiteur } from './entities/empreinte-visiteur.entity';
import { SelVisites } from './entities/sel-visites.entity';
import { VisitesJour } from './entities/visites-jour.entity';
import { empreinte, periodeErrors } from './visites.rules';

@Injectable()
export class VisitesService {
  // Sel du jour gardé en mémoire : une seule lecture en base par jour et par instance
  private sel: { jour: string; valeur: Promise<string> } | undefined;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(VisitesJour)
    private readonly jours: Repository<VisitesJour>,
    @InjectRepository(EmpreinteVisiteur)
    private readonly empreintes: Repository<EmpreinteVisiteur>,
    @InjectRepository(SelVisites)
    private readonly sels: Repository<SelVisites>,
  ) {}

  /** Compte le visiteur s'il n'a pas encore été vu aujourd'hui */
  async compter(ip: string, userAgent: string) {
    const jour = dayKey(new Date());
    const valeur = empreinte(await this.selDuJour(jour), ip, userAgent);

    // La clé primaire (jour, empreinte) garantit l'unicité, même pour deux requêtes simultanées ;
    // le compteur n'avance que si l'empreinte vient d'être ajoutée
    await this.dataSource.transaction(async (manager) => {
      const inserted: { affectedRows: number } = await manager.query(
        'INSERT IGNORE INTO empreintes_visiteurs (jour, empreinte) VALUES (?, ?)',
        [jour, valeur],
      );
      if (inserted.affectedRows === 0) return;
      await manager.query(
        'INSERT INTO visites_par_jour (jour, visiteurs) VALUES (?, 1) ' +
          'ON DUPLICATE KEY UPDATE visiteurs = visiteurs + 1',
        [jour],
      );
    });
  }

  /** Visiteurs par jour sur la période, seulement les jours qui en ont eu */
  async list({ du, au }: VisitesQueryDto): Promise<VisitesJourDto[]> {
    const errors = periodeErrors(du, au);
    if (errors.length > 0) throw new BadRequestException(errors);
    return this.jours.find({
      where: { jour: Between(du, au) },
      order: { jour: 'ASC' },
    });
  }

  private selDuJour(jour: string) {
    if (this.sel?.jour !== jour) {
      const valeur = this.ouvrirJour(jour);
      this.sel = { jour, valeur };
      // Base injoignable : l'appel suivant réessaie au lieu de garder l'échec en mémoire
      valeur.catch(() => {
        if (this.sel?.valeur === valeur) this.sel = undefined;
      });
    }
    return this.sel.valeur;
  }

  // Premier passage du jour sur cette instance : crée le sel s'il n'existe pas encore (une autre
  // instance a pu le faire), puis efface les sels et empreintes des jours passés
  private async ouvrirJour(jour: string) {
    await this.dataSource.query(
      'INSERT IGNORE INTO sels_visites (jour, sel) VALUES (?, ?)',
      [jour, randomBytes(32).toString('hex')],
    );
    const { sel } = await this.sels.findOneByOrFail({ jour });
    await this.sels.delete({ jour: LessThan(jour) });
    await this.empreintes.delete({ jour: LessThan(jour) });
    return sel;
  }
}
