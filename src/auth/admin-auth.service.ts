import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { SignInDto } from './dto/sign-in.dto';
import { Admin } from './entities/admin.entity';
import { hashPassword, verifyPassword } from './passwords';

@Injectable()
export class AdminAuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
    private readonly config: ConfigService,
  ) {}

  // Crée le compte admin de ADMIN_EMAIL / ADMIN_PASSWORD s'il n'existe pas encore.
  // Un compte existant n'est jamais modifié : changer ADMIN_PASSWORD ensuite n'a pas d'effet.
  async onApplicationBootstrap() {
    const email = this.config.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) {
      this.logger.warn(
        'ADMIN_EMAIL / ADMIN_PASSWORD absents : aucun admin créé',
      );
      return;
    }
    if (await this.admins.existsBy({ email })) return;
    await this.admins.insert({
      email,
      passwordHash: await hashPassword(password),
    });
    this.logger.log(`Compte admin créé : ${email}`);
  }

  async signIn({ email, password }: SignInDto) {
    const admin = await this.admins.findOne({
      where: { email },
      select: { id: true, passwordHash: true },
    });
    if (!(await verifyPassword(admin?.passwordHash, password))) {
      throw new UnauthorizedException('E-mail ou mot de passe incorrect');
    }
    return this.findById(admin!.id);
  }

  async findById(id: string) {
    const admin = await this.admins.findOneBy({ id });
    if (!admin) throw new UnauthorizedException('Compte admin introuvable');
    return admin;
  }
}
